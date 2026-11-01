/**
 * Stats computation service.
 *
 * Loads plays from Supabase, transforms them into engine format,
 * runs the football-stats-engine, and returns a GameSummary.
 */

import { supabase } from "@/lib/supabase";
import { loadGamePlays, calcDefenseStats, type PlayWithPlayers } from "./gameService";
import { transformPlays, collectOpponentPlayerIds, type TransformContext } from "./playTransformer";
import { opponentPlayerService } from "./opponentService";
import { getPregameConfig } from "./gameFlow";
import { resolveDriveResults } from "./driveResults";
import { runOutFinalClock } from "./finalClock";
import { isInsideTwenty, resolveKickSpots } from "./kickSpots";
import { applyLostMuffs, initDefStats } from "./lostMuffs";
import { TEAM_JERSEY, TEAM_PLAYER_ID, isWipedByPenaltyRow } from "@/components/game/types";
import {
  FootballStatsEngine,
  CoinTossChoice,
  type GameSummary,
  type TeamId,
  type DefensiveStats,
  type Play as EnginePlay,
} from "football-stats-engine";
import { inPeriod, type StatPeriod } from "./statPeriod";
import { playerScoringFromPlays, type PlayerScoring } from "./gameReport";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameRecord {
  id: string;
  season_id: string;
  opponent_id: string;
  is_home: boolean;
  our_score: number;
  opponent_score: number;
  status: string;
  rules_config: Record<string, unknown> | null;
  opening_kickoff_receiver: "us" | "them" | null;
  opponent: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
}

export interface RosterPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  position: string | null;
}

export interface ProgramInfo {
  id: string;
  name: string;
  abbreviation: string;
  game_config?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Load helpers
// ---------------------------------------------------------------------------

async function loadGame(gameId: string): Promise<GameRecord | null> {
  const { data, error } = await supabase
    .from("games")
    .select(`
      id, season_id, opponent_id, is_home, our_score, opponent_score, status, rules_config, opening_kickoff_receiver,
      opponent:opponents ( id, name, abbreviation )
    `)
    .eq("id", gameId)
    .single();

  if (error || !data) {
    console.error("Failed to load game:", error);
    return null;
  }
  return data as unknown as GameRecord;
}

async function loadRoster(seasonId: string): Promise<RosterPlayer[]> {
  const { data, error } = await supabase
    .from("season_rosters")
    .select(`
      player_id,
      jersey_number,
      position,
      player:players ( first_name, last_name )
    `)
    .eq("season_id", seasonId)
    .eq("is_active", true);

  if (error || !data) {
    console.error("Failed to load roster:", error);
    return [];
  }

  return (data as any[]).map((r) => ({
    player_id: r.player_id,
    first_name: r.player?.first_name ?? "",
    last_name: r.player?.last_name ?? "",
    jersey_number: r.jersey_number,
    position: r.position,
  }));
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Everything one pass over a game produces.
 *
 * The engine's GameSummary does not carry every number a printed stat sheet
 * asks for - rushing gain and loss are only kept as a net, an interception
 * return has no long, and a blocked kick has no defender credited. Those come
 * back out of the plays, so the report needs the plays that produced the
 * summary rather than a second round trip to fetch them again on press-box
 * wifi. Roster comes along for jersey numbers, which the engine has no use for.
 */
export interface GameStatsBundle {
  summary: GameSummary;
  /** The plays in the period the summary covers. */
  plays: PlayWithPlayers[];
  /** Every play in the game, for whatever needs the whole game's context. */
  allPlays: PlayWithPlayers[];
  period: StatPeriod;
  roster: RosterPlayer[];
  game: GameRecord;
}

/**
 * Compute full game stats by running all plays through the engine.
 * Returns the engine's GameSummary with defensive stats supplemented
 * for PBU/hurry counts that the engine doesn't natively track.
 */
export async function computeGameStats(
  gameId: string,
  program: ProgramInfo,
  period: StatPeriod = "game",
): Promise<GameSummary | null> {
  const bundle = await computeGameStatsBundle(gameId, program, period);
  return bundle?.summary ?? null;
}

/**
 * As computeGameStats, but keeps the inputs the summary was built from.
 * `period` narrows the stats to one quarter or half; see statPeriod.ts.
 */
export async function computeGameStatsBundle(
  gameId: string,
  program: ProgramInfo,
  period: StatPeriod = "game",
): Promise<GameStatsBundle | null> {
  const inputs = await loadGameStatsInputs(gameId);
  if (!inputs) return null;
  return computeGameStatsBundles(inputs, program, [period])?.get(period) ?? null;
}

/**
 * Everything a game's stats are computed from, fetched once.
 *
 * Split from the computation so a screen that wants several periods of the
 * same game - the season book prints every quarter and half of every game -
 * pays for the network once instead of once per period.
 */
export interface GameStatsInputs {
  game: GameRecord;
  plays: PlayWithPlayers[];
  roster: RosterPlayer[];
  opponentPlayers: Array<{ id: string; name: string; jersey_number: number | null; position: string | null }>;
}

/** Rosters by season, shared by the games of one season so a ten-game load
 *  asks for the roster once rather than ten times. */
export type RosterCache = Map<string, Promise<RosterPlayer[]>>;

export async function loadGameStatsInputs(gameId: string, rosters?: RosterCache): Promise<GameStatsInputs | null> {
  // 1. Load game, plays, roster in parallel
  const [game, plays] = await Promise.all([
    loadGame(gameId),
    loadGamePlays(gameId),
  ]);

  if (!game) return null;

  // Load roster + opponent players in parallel
  let rosterRead = rosters?.get(game.season_id);
  if (!rosterRead) {
    rosterRead = loadRoster(game.season_id);
    rosters?.set(game.season_id, rosterRead);
  }
  const [roster, opponentPlayers] = await Promise.all([
    rosterRead,
    opponentPlayerService.getByOpponent(game.opponent_id),
  ]);
  return { game, plays, roster, opponentPlayers };
}

/**
 * The stats for each requested period of one game, off inputs already
 * loaded. Null when the game has no plays to count, as computeGameStatsBundle
 * has always answered.
 */
export function computeGameStatsBundles(
  inputs: GameStatsInputs,
  program: ProgramInfo,
  periods: StatPeriod[],
): Map<StatPeriod, GameStatsBundle> | null {
  const { game, plays, roster, opponentPlayers: realOppPlayers } = inputs;
  const gameId = game.id;

  if (plays.length === 0) return null;

  // 2. Resolve home/away
  const homeTeamId = game.is_home ? program.id : game.opponent.id;
  const awayTeamId = game.is_home ? game.opponent.id : program.id;
  const homeTeamName = game.is_home ? program.name : game.opponent.name;
  const awayTeamName = game.is_home ? game.opponent.name : program.name;

  const transformCtx: TransformContext = {
    gameId,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    programTeamId: program.id,
    fgSnapAdd: Number(program.game_config?.fg_snap_add) > 0 ? Number(program.game_config?.fg_snap_add) : undefined,
  };

  // 3. Transform plays
  const enginePlays = transformPlays(plays, transformCtx);

  if (enginePlays.length === 0) return null;

  const rulesConfig = (game.rules_config ?? {}) as Record<string, unknown>;
  const level = rulesConfig.level === "nfl" || rulesConfig.level === "college" || rulesConfig.level === "high_school"
    ? rulesConfig.level
    : "high_school";
  const quarterLengthMinutes = Number(rulesConfig.quarterLengthMinutes);
  const customRules = Number.isFinite(quarterLengthMinutes) && quarterLengthMinutes > 0
    ? { quarterLengthSeconds: Math.round(quarterLengthMinutes * 60) }
    : undefined;
  const pregame = getPregameConfig({
    rules_config: game.rules_config,
    opening_kickoff_receiver: game.opening_kickoff_receiver,
    direction: null,
  });

  // 4. Teams and players, shared by every engine pass below
  const homeTeam: TeamId = {
    id: homeTeamId,
    name: homeTeamName,
    abbreviation: game.is_home ? program.abbreviation : (game.opponent.abbreviation ?? "OPP"),
  };

  const awayTeam: TeamId = {
    id: awayTeamId,
    name: awayTeamName,
    abbreviation: game.is_home ? (game.opponent.abbreviation ?? "OPP") : program.abbreviation,
  };

  const rosterPlayers = roster.map((r) => ({
    id: r.player_id,
    name: `${r.first_name} ${r.last_name}`.trim(),
  }));
  const oppPlayers = collectOpponentPlayerIds(plays, realOppPlayers);
  /* The placeholders hold real stats and need real names, or every TEAM
     tackle comes back as "Unknown". Jersey 100 is the convention the printed
     sheets already use for a team-credited stop. */
  const placeholders = collectPlaceholderPlayers(plays);
  const allPlayers = [...rosterPlayers, ...oppPlayers, ...placeholders];

  /* One engine pass over a run of plays: the whole game, or one period of it. */
  const summarize = (subset: EnginePlay[], subsetPlays: PlayWithPlayers[]): GameSummary => {
    const engine = new FootballStatsEngine({
      enableGameState: true,
      rules: level,
      ...(customRules ? { customRules } : {}),
      trackSituationalSplits: true,
      trackDrives: true,
      computePasserRating: true,
    });

    engine.setTeams(homeTeam, awayTeam);

    if (pregame) {
      const openingKickoffReceiver = pregame.openingKickoffReceiver === "us" ? program.id : game.opponent.id;
      const secondHalfKickoffReceiver = openingKickoffReceiver === program.id ? game.opponent.id : program.id;
      const coinTossWinner = pregame.tossWinner === "us" ? program.id : game.opponent.id;
      const coinTossChoiceMap: Record<string, CoinTossChoice> = {
        receive: CoinTossChoice.Receive,
        kick: CoinTossChoice.Kick,
        defer: CoinTossChoice.Defer,
        defend_goal: CoinTossChoice.DefendGoal,
      };

      engine.configureKickoffReceivers(
        openingKickoffReceiver,
        secondHalfKickoffReceiver,
        coinTossWinner,
        coinTossChoiceMap[pregame.tossChoice],
      );
    }

    engine.registerPlayers(allPlayers);
    engine.processPlays(subset);
    const summary = engine.getGameSummary();

    // Supplement defensive stats with PBU/hurry from app's own calculator
    supplementDefenseStats(summary, subsetPlays, rosterPlayers);

    // Punts inside the 20. The engine has no logic for this at all - its own
    // comment says it would need the landing spot, which it was never given -
    // so the column read zero however well anyone punted.
    supplementPuntsInside20(summary, subsetPlays);

    // A muff or return fumble the kicking team recovered is a fumble lost
    // for the receiving team. The engine charges fumbles to the team in possession,
    // which on a kick is the wrong one. See lostMuffs.ts.
    applyLostMuffs(summary, subset, new Map(allPlayers.map(p => [p.id, p.name])));
    return summary;
  };

  // 5. The whole game
  const full = summarize(enginePlays, plays);

  // Correct drive results — the engine labels every non-touchdown drive a
  // punt, field goals and turnovers included. See driveResults.ts.
  full.drives = resolveDriveResults(full.drives, plays.map(p => ({
    possession: p.possession,
    playType: p.play_type,
    quarter: p.quarter,
    down: p.down,
    isTouchdown: p.is_touchdown,
    isTurnover: p.is_turnover,
    result: String(p.play_data?.result ?? ""),
  })));

  const out = new Map<StatPeriod, GameStatsBundle>();
  for (const period of new Set(periods)) {
    // 6. One period of it. The plays were transformed as a whole game first, so
    //    each keeps its real score and drive number; only the stat pass is cut
    //    down. Drives come from the whole game - a period's drives are the ones
    //    that started in it - so a drive across a quarter break is not cut in
    //    two and given a result it never had.
    let summary = full;
    let periodPlays = plays;
    if (period !== "game") {
      periodPlays = plays.filter(p => inPeriod(Number(p.quarter), period));
      summary = summarize(enginePlays.filter(p => inPeriod(p.context.quarter, period)), periodPlays);
      summary.drives = full.drives.filter(d => inPeriod(d.startQuarter, period));
    }

    // 7. A final game ran its clock out, set to 0:00 or not. The time left
    //    after the last snap goes to whoever had the ball. See finalClock.ts.
    //    Only a slice holding the game's last drive has a clock to run out. A
    //    3rd quarter whose last drive carried into the 4th also "ends in the
    //    4th", and was handed the whole 4th quarter left after that drive.
    const lastDrive = full.drives[full.drives.length - 1];
    if (game.status === "completed" && summary.drives[summary.drives.length - 1] === lastDrive) {
      const last = plays[plays.length - 1];
      const side = last.play_data?.next_possession ?? last.possession;
      const holder = side === "us" ? program.id : side === "them" ? game.opponent.id : null;
      summary = runOutFinalClock(summary, holder);
    }

    out.set(period, { summary, plays: periodPlays, allPlays: plays, period, roster, game });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Defense stat supplement
// ---------------------------------------------------------------------------

/**
 * Names for the tags that have no players row.
 *
 * TEAM is our own "somebody made that, I could not see who"; the unrostered
 * jerseys are ours too, by number. Without a registration the engine files
 * their stats under an id with no name and the reports print "Unknown".
 */
function collectPlaceholderPlayers(
  plays: PlayWithPlayers[],
): Array<{ id: string; name: string }> {
  const found = new Map<string, string>();
  for (const play of plays) {
    const pd = play.play_data as Record<string, unknown> | null | undefined;
    if (Array.isArray(pd?.team_tagged) && pd.team_tagged.length > 0) {
      found.set(TEAM_PLAYER_ID, `#${TEAM_JERSEY} TEAM`);
    }
    for (const raw of (Array.isArray(pd?.pending_tagged) ? pd.pending_tagged : []) as Array<{
      id?: string; jersey_number?: number | null;
    }>) {
      if (!raw.id) continue;
      found.set(String(raw.id), `#${raw.jersey_number ?? "?"} (unrostered)`);
    }
  }
  return [...found].map(([id, name]) => ({ id, name }));
}

/**
 * Count the punts that pinned them inside their own 20.
 *
 * Attributed to the punter who kicked it, which is why it cannot simply be
 * counted off the play list at the point of display: the stat belongs on his
 * line, beside his average.
 */
function supplementPuntsInside20(
  summary: GameSummary,
  plays: PlayWithPlayers[],
): void {
  for (const stat of Object.values(summary.punting)) stat.puntsInside20 = 0;

  for (const play of plays) {
    if (play.play_type !== "punt" && play.play_type !== "fair_catch") continue;
    // Wiped out by roughing the kicker: not a punt, so not one inside the 20.
    if (isWipedByPenaltyRow(play)) continue;
    const punter = play.play_players?.find(p => p.role === "punter" || p.role === "kicker");
    if (!punter) continue;
    const stat = summary.punting[punter.player_id];
    if (!stat) continue;
    const spots = resolveKickSpots({
      ballOn: play.yard_line ?? 0,
      playData: play.play_data,
      description: play.description,
      isTouchdown: play.is_touchdown,
    });
    if (!spots) continue;
    if (isInsideTwenty(spots, Boolean(play.play_data?.is_touchback))) {
      stat.puntsInside20 += 1;
    }
  }
}

/**
 * Merge PBU and hurry counts from the app's own calcDefenseStats into
 * the engine's defense output, since the engine can't attribute those directly.
 */
function supplementDefenseStats(
  summary: GameSummary,
  plays: Parameters<typeof calcDefenseStats>[0],
  rosterPlayers: Array<{ id: string; name: string }>,
): void {
  const appDefense = calcDefenseStats(plays);
  const playerNameMap = new Map(rosterPlayers.map((p) => [p.id, p.name]));

  for (const [playerId, appStats] of appDefense) {
    let engineStats = summary.defense[playerId];
    if (!engineStats) {
      const name = playerNameMap.get(playerId) ?? "Unknown";
      engineStats = initDefStats(playerId, name);
      summary.defense[playerId] = engineStats;
    }

    /* Tackles for loss.
       The engine credits a TFL only inside its tackledBy loop, and a shared
       tackle now travels in assistedTackle so the engine can give it the half
       credit it is worth - which would otherwise cost both players the TFL
       they were both in on. The app calculator credits it to tacklers and
       assisters alike, and applies the stricter test: a stop AT the line is
       not a loss, where the engine counts any gain of zero or less. */
    engineStats.tacklesForLoss = appStats.tfl;

    // PBUs → passesDefended
    if (appStats.pbus > 0) {
      engineStats.passesDefended = Math.max(engineStats.passesDefended, appStats.pbus);
    }
    // Hurries → pressures / qbHits
    if (appStats.hurries > 0) {
      engineStats.pressures = Math.max(engineStats.pressures, appStats.hurries);
      engineStats.qbHits = Math.max(engineStats.qbHits, appStats.hurries);
    }
  }
}

// ---------------------------------------------------------------------------
// Season-level aggregation
// ---------------------------------------------------------------------------

export interface PlayerGameLine {
  gameId: string;
  opponentName: string;
  gameDate: string;
  passing: GameSummary["passing"][string] | null;
  rushing: GameSummary["rushing"][string] | null;
  receiving: GameSummary["receiving"][string] | null;
  defense: GameSummary["defense"][string] | null;
  kicking: GameSummary["kicking"][string] | null;
  punting: GameSummary["punting"][string] | null;
  returns: GameSummary["returns"][string] | null;
  /** Points, touchdowns and conversions, counted off the plays. */
  scoring: PlayerScoring | null;
}

/** One season's worth of game lines for a player (career view). */
export interface PlayerSeasonBlock {
  seasonId: string;
  year: number;
  level: string | null;
  lines: PlayerGameLine[];
}

/**
 * Career stats: every season this player was rostered for the program,
 * oldest first, each with its per-game stat lines.
 */
export async function computePlayerCareerStats(
  playerId: string,
  program: ProgramInfo,
  period: StatPeriod = "game",
): Promise<PlayerSeasonBlock[]> {
  const { data: rosterRows, error } = await supabase
    .from("season_rosters")
    .select("season:seasons(id, year, level, program_id)")
    .eq("player_id", playerId);

  if (error || !rosterRows) return [];

  const seasons = rosterRows
    .map((r: any) => r.season)
    .filter((s: any) => s && s.program_id === program.id)
    .sort((a: any, b: any) => a.year - b.year);

  const blocks: PlayerSeasonBlock[] = [];
  for (const s of seasons) {
    const lines = await computePlayerSeasonStats(playerId, s.id, program, period);
    blocks.push({ seasonId: s.id, year: s.year, level: s.level ?? null, lines });
  }
  return blocks;
}

/**
 * Load all completed games for a season and extract one player's stats from each.
 */
export async function computePlayerSeasonStats(
  playerId: string,
  seasonId: string,
  program: ProgramInfo,
  period: StatPeriod = "game",
): Promise<PlayerGameLine[]> {
  // Load all completed (or live) games for the season
  const { data: games, error } = await supabase
    .from("games")
    .select("id, opponent:opponents(name), game_date, status")
    .eq("season_id", seasonId)
    .in("status", ["completed", "live"])
    .order("game_date", { ascending: true });

  if (error || !games) return [];

  const lines: PlayerGameLine[] = [];

  for (const game of games) {
    const bundle = await computeGameStatsBundle(game.id, program, period);
    if (!bundle) continue;
    const { summary } = bundle;

    const opp = game.opponent as any;
    lines.push({
      gameId: game.id,
      opponentName: opp?.name ?? "Unknown",
      gameDate: game.game_date,
      passing: summary.passing[playerId] ?? null,
      rushing: summary.rushing[playerId] ?? null,
      receiving: summary.receiving[playerId] ?? null,
      defense: summary.defense[playerId] ?? null,
      kicking: summary.kicking[playerId] ?? null,
      punting: summary.punting[playerId] ?? null,
      returns: summary.returns[playerId] ?? null,
      scoring: playerScoringFromPlays(bundle.plays).get(playerId) ?? null,
    });
  }

  return lines;
}
