/**
 * Stats computation service.
 *
 * Loads plays from Supabase, transforms them into engine format,
 * runs the football-stats-engine, and returns a GameSummary.
 */

import { supabase } from "@/lib/supabase";
import { loadGamePlays, calcDefenseStats } from "./gameService";
import { transformPlays, collectOpponentPlayerIds, type TransformContext } from "./playTransformer";
import {
  FootballStatsEngine,
  type GameSummary,
  type TeamId,
  type DefensiveStats,
} from "football-stats-engine";

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
}

// ---------------------------------------------------------------------------
// Load helpers
// ---------------------------------------------------------------------------

async function loadGame(gameId: string): Promise<GameRecord | null> {
  const { data, error } = await supabase
    .from("games")
    .select(`
      id, season_id, opponent_id, is_home, our_score, opponent_score, status,
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
 * Compute full game stats by running all plays through the engine.
 * Returns the engine's GameSummary with defensive stats supplemented
 * for PBU/hurry counts that the engine doesn't natively track.
 */
export async function computeGameStats(
  gameId: string,
  program: ProgramInfo,
): Promise<GameSummary | null> {
  // 1. Load game, plays, roster in parallel
  const [game, plays] = await Promise.all([
    loadGame(gameId),
    loadGamePlays(gameId),
  ]);

  if (!game) return null;

  const roster = await loadRoster(game.season_id);

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
  };

  // 3. Transform plays
  const enginePlays = transformPlays(plays, transformCtx);

  if (enginePlays.length === 0) return null;

  // 4. Set up engine
  const engine = new FootballStatsEngine({
    enableGameState: false,
    rules: "high_school",
    trackSituationalSplits: true,
    trackDrives: true,
    computePasserRating: true,
  });

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

  engine.setTeams(homeTeam, awayTeam);

  // 5. Register players
  const rosterPlayers = roster.map((r) => ({
    id: r.player_id,
    name: `${r.first_name} ${r.last_name}`.trim(),
  }));
  const oppPlayers = collectOpponentPlayerIds(plays);
  engine.registerPlayers([...rosterPlayers, ...oppPlayers]);

  // 6. Process plays
  engine.processPlays(enginePlays);

  // 7. Get summary
  const summary = engine.getGameSummary();

  // 8. Supplement defensive stats with PBU/hurry from app's own calculator
  supplementDefenseStats(summary, plays, rosterPlayers);

  return summary;
}

// ---------------------------------------------------------------------------
// Defense stat supplement
// ---------------------------------------------------------------------------

function initDefStats(playerId: string, playerName: string): DefensiveStats {
  return {
    playerId,
    playerName,
    totalTackles: 0,
    soloTackles: 0,
    assistedTackles: 0,
    tacklesForLoss: 0,
    sacks: 0,
    halfSacks: 0,
    sackYards: 0,
    qbHits: 0,
    pressures: 0,
    interceptions: 0,
    interceptionYards: 0,
    interceptionTouchdowns: 0,
    passesDefended: 0,
    forcedFumbles: 0,
    fumbleRecoveries: 0,
    fumbleRecoveryYards: 0,
    fumbleRecoveryTouchdowns: 0,
    safeties: 0,
    stuffs: 0,
    missedTackles: 0,
    targetedInCoverage: 0,
    completionsAllowed: 0,
    yardsAllowedInCoverage: 0,
    touchdownsAllowedInCoverage: 0,
  };
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
}

/**
 * Load all completed games for a season and extract one player's stats from each.
 */
export async function computePlayerSeasonStats(
  playerId: string,
  seasonId: string,
  program: ProgramInfo,
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
    const summary = await computeGameStats(game.id, program);
    if (!summary) continue;

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
    });
  }

  return lines;
}
