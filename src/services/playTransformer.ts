/**
 * Transforms dragonstats PlayWithPlayers records into football-stats-engine Play objects.
 *
 * The app stores plays as generic play_type strings with player roles in a junction
 * table. The engine expects typed union objects (PassPlay, RushPlay, SpecialTeamsPlay)
 * with players as direct fields. This module bridges the two formats.
 */

import {
  getPenaltyDefaultSide,
  getPenaltyEngineCode,
  grantsAutoFirstDown,
  type PenaltySide,
} from "@/components/game/types";
import { TEAM_PLAYER_ID } from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";
import { resolveKickSpots } from "./kickSpots";
import {
  type Play,
  type PassPlay,
  type RushPlay,
  type SpecialTeamsPlay,
  type PenaltyPlay,
  type PlayContext,
  type FumbleEvent,
  type PenaltyEvent,
  PlayType,
  PassResult,
  RushResult,
  SpecialTeamsResult,
  KickResult,
  PenaltyEnforcement,
  Down,
  Quarter,
} from "football-stats-engine";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TransformContext {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  /** The program's team ID — maps to possession="us" */
  programTeamId: string;
  fgSnapAdd?: number;
}

/**
 * Convert an ordered array of app plays into engine-compatible Play objects.
 * Maintains a running score to populate each PlayContext correctly.
 */
export function transformPlays(
  plays: PlayWithPlayers[],
  ctx: TransformContext,
): Play[] {
  const result: Play[] = [];
  let homeScore = 0;
  let awayScore = 0;
  // The engine segments drives on possession change but numbers them from
  // context.driveNumber, which nothing here was setting. Every drive came
  // back as #0 — indistinguishable in the drive list, and enough to cap
  // red-zone trips at one per game (the engine dedupes those by drive number).
  let driveNumber = 0;
  let lastPossTeamId: string | null = null;

  for (const play of plays) {
    const possTeamId = play.possession === "us" ? ctx.programTeamId : otherTeam(ctx.programTeamId, ctx);
    if (possTeamId !== lastPossTeamId) {
      driveNumber += 1;
      lastPossTeamId = possTeamId;
    }
    const playContext = buildContext(play, ctx, possTeamId, homeScore, awayScore, driveNumber);

    const enginePlay = convertPlay(play, playContext, ctx);
    if (enginePlay) {
      result.push(enginePlay);
    }

    // Advance running score AFTER building context (context reflects score at time of snap)
    const scoreDelta = scoreForPlay(play);
    if (play.possession === "us") {
      if (ctx.programTeamId === ctx.homeTeamId) homeScore += scoreDelta;
      else awayScore += scoreDelta;
    } else {
      if (ctx.programTeamId === ctx.homeTeamId) awayScore += scoreDelta;
      else homeScore += scoreDelta;
    }
    // Safety scores for the OTHER team
    if (play.play_type === "safety") {
      if (play.possession === "us") {
        if (ctx.programTeamId === ctx.homeTeamId) awayScore += 2;
        else homeScore += 2;
      } else {
        if (ctx.programTeamId === ctx.homeTeamId) homeScore += 2;
        else awayScore += 2;
      }
    }
  }

  return result;
}

/**
 * Collect opponent player IDs referenced in plays.
 * Uses real opponent_players when available (from play_players with isOpponent flag
 * or matching opp_player entries), falls back to synthetic IDs for legacy data.
 */
export function collectOpponentPlayerIds(
  plays: PlayWithPlayers[],
  realOpponentPlayers?: Array<{ id: string; name: string; jersey_number: number | null; position: string | null }>,
): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();

  // Register all real opponent players if provided
  if (realOpponentPlayers) {
    for (const op of realOpponentPlayers) {
      seen.set(op.id, `#${op.jersey_number ?? "?"} ${op.name}`);
    }
  }

  // Also scan plays for legacy synthetic opponent refs
  for (const play of plays) {
    const opp = (play.play_data as Record<string, any>)?.opp_player;
    if (opp) {
      const id = `opp_${opp.position ?? "UNK"}_${opp.jersey ?? "0"}`;
      if (!seen.has(id)) {
        seen.set(id, `#${opp.jersey ?? "?"} ${opp.position ?? "OPP"}`);
      }
    }
  }

  // Always include a generic unknown opponent
  if (!seen.has("opp_unknown")) {
    seen.set("opp_unknown", "Opponent");
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function otherTeam(teamId: string, ctx: TransformContext): string {
  return teamId === ctx.homeTeamId ? ctx.awayTeamId : ctx.homeTeamId;
}

/**
 * The clock the play was snapped on, as the engine wants it ("9:42").
 *
 * This used to read `play.clock`, a text column the app never writes — the
 * snap clock is stored in `play_start_time` as seconds. So every play arrived
 * at the engine reading "0:00", every drive measured zero, and time of
 * possession has been 0:00 for both teams in every game ever charted. The
 * text column is still honoured first in case an older row has one.
 */
function snapClock(play: PlayWithPlayers): string {
  if (play.clock) return play.clock;
  const secs = play.play_start_time;
  if (typeof secs !== "number" || !Number.isFinite(secs) || secs < 0) return "0:00";
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
}

function buildContext(
  play: PlayWithPlayers,
  ctx: TransformContext,
  possTeamId: string,
  homeScore: number,
  awayScore: number,
  driveNumber: number,
): PlayContext {
  const q = clampQuarter(play.quarter);
  return {
    gameId: ctx.gameId,
    quarter: q,
    gameClock: snapClock(play),
    down: clampDown(play.down),
    distance: play.distance ?? 10,
    yardLine: play.yard_line ?? 20,
    possessionTeam: possTeamId,
    driveNumber,
    homeTeam: ctx.homeTeamId,
    awayTeam: ctx.awayTeamId,
    homeScore,
    awayScore,
    isRedZone: (play.yard_line ?? 0) >= 80,
  };
}

function clampDown(d: number | null): Down {
  if (!d || d < 1) return Down.First;
  if (d > 4) return Down.Fourth;
  return d as Down;
}

function clampQuarter(q: number | null): Quarter {
  if (!q || q < 1) return Quarter.First;
  if (q > 4) return Quarter.OT1; // treat OT as OT1
  return q as Quarter;
}

/**
 * Defenders who stopped the ball carrier on a turnover return.
 *
 * Its own engine field rather than tackledBy: on a strip-sack tackledBy is the
 * sackers, and merging the two would hand the man who tackled the recoverer a
 * share of the sack.
 */
function returnTacklers(play: PlayWithPlayers): string[] | undefined {
  const ids = playersByRole(play, "recovery_tackler");
  return ids.length > 0 ? ids : undefined;
}

// Extract player IDs by role from play_players
/**
 * The two numbers special-teams stats are made of.
 *
 * Gross kick distance and return yardage were never passed to the engine. It
 * guards on kickDistance being present, so punt yards, punt long, punt
 * average, net punt average and average kickoff distance sat at zero for every
 * game ever recorded. returnYards was passed play.yards_gained, which on a
 * kick is the NET - distance minus return - so return yardage was the wrong
 * quantity rather than a missing one, and it fed netPuntAverage as well.
 *
 * Both come back off the play now; see kickSpots.ts for where from. Null when
 * the play carries neither, in which case the fields stay undefined and the
 * engine leaves the stat alone rather than recording a guess.
 */
function kickSpotsFor(play: PlayWithPlayers) {
  return resolveKickSpots({
    ballOn: play.yard_line ?? 0,
    playData: play.play_data,
    description: play.description,
  });
}

/**
 * Who made the tackle, and who shared it.
 *
 * The modal records a shared tackle as several "tackler" tags carrying
 * credit 0.5 each - tapping a second name is what splits it. It has never
 * written the role "assist", which is the role this file used to read, so
 * assistedTackle was always empty and the engine scored every shared tackle
 * as a set of full solo tackles: two names came out 0 solo, 0 assists,
 * 2.0 total instead of 0 solo, 2 assists, 1.0 total.
 *
 * Credit is the fact, so credit decides. Full credit is a solo and goes in
 * tackledBy; anything less is a share and goes in assistedTackle, where the
 * engine gives it the half-tackle it is worth. An explicitly tagged assist
 * still counts, in case any play anywhere carries one.
 */
function tackleCredits(play: PlayWithPlayers): {
  tackledBy: string[];
  assistedTackle: string[];
} {
  const tags = allTagsForRole(play, "tackler");
  const isShared = (t: { credit: number | null }) => (t.credit ?? 1) < 1;
  return {
    tackledBy: tags.filter(t => !isShared(t)).map(t => t.id),
    assistedTackle: [
      ...playersByRole(play, "assist"),
      ...tags.filter(isShared).map(t => t.id),
    ],
  };
}
/**
 * Every tag on a play, with its credit — including the ones that cannot be
 * foreign keys.
 *
 * play_players only holds our own rostered players. The TEAM placeholder, the
 * opponent's players and unrostered jerseys have no players row, so they ride
 * in play_data (see CLAUDE.md). Nothing here ever read those lists, which
 * meant the engine never saw them: a tackle credited to TEAM, a catch by an
 * opponent, a carry by a jersey nobody had added yet — all of it was recorded
 * faithfully, rebuilt into the play log, shown in the editor, and then
 * silently dropped on the way to every stat in the app.
 *
 * They are stats about somebody. Whether we know his name is a separate
 * question from whether the tackle happened.
 */
function allTagsForRole(
  play: PlayWithPlayers,
  role: string,
): Array<{ id: string; credit: number | null }> {
  const pd = play.play_data as Record<string, unknown> | null | undefined;
  const loose = (key: string) => (Array.isArray(pd?.[key]) ? pd?.[key] : []) as Array<{
    id?: string; role?: string; credit?: number | null;
  }>;

  return [
    ...play.play_players
      .filter((pp) => pp.role === role)
      .map((pp) => ({ id: pp.player_id, credit: pp.credit ?? null })),
    // Our side's "somebody did this, I could not see who".
    ...loose("team_tagged")
      .filter((t) => t.role === role)
      .map(() => ({ id: TEAM_PLAYER_ID, credit: null as number | null })),
    ...loose("opp_tagged")
      .filter((t) => t.role === role && t.id)
      .map((t) => ({ id: String(t.id), credit: t.credit ?? null })),
    ...loose("pending_tagged")
      .filter((t) => t.role === role && t.id)
      .map((t) => ({ id: String(t.id), credit: t.credit ?? null })),
  ];
}

function playersByRole(play: PlayWithPlayers, role: string): string[] {
  return allTagsForRole(play, role).map((t) => t.id);
}

function firstPlayerByRole(play: PlayWithPlayers, role: string): string | undefined {
  return allTagsForRole(play, role)[0]?.id;
}

function getOppPlayerId(play: PlayWithPlayers): string {
  const opp = (play.play_data as Record<string, any>)?.opp_player;
  if (opp) return `opp_${opp.position ?? "UNK"}_${opp.jersey ?? "0"}`;
  return "opp_unknown";
}

/** Build penalty events from play_data if the play has a penalty */
function buildPenalties(play: PlayWithPlayers, ctx: TransformContext): PenaltyEvent[] | undefined {
  if (!play.is_penalty) return undefined;
  const pd = play.play_data as Record<string, any>;
  const penaltyType = pd?.penalty_type;
  if (!penaltyType) return undefined;

  const possTeamId = play.possession === "us" ? ctx.programTeamId : otherTeam(ctx.programTeamId, ctx);
  const explicitSide = pd?.play_category === "offense" || pd?.play_category === "defense"
    ? pd.play_category as PenaltySide
    : null;
  const penCategory = explicitSide ?? getPenaltyDefaultSide(penaltyType);
  const penTeam = penCategory === "defense"
    ? otherTeam(possTeamId, ctx)
    : possTeamId;

  const enforcementRaw = pd?.penalty_enforcement;
  const enforcement: PenaltyEnforcement =
    enforcementRaw === "declined" ? PenaltyEnforcement.Declined
    : enforcementRaw === "offset" ? PenaltyEnforcement.Offset
    : PenaltyEnforcement.Accepted;

  return [{
    penaltyType: getPenaltyEngineCode(penaltyType) ?? penaltyType.toLowerCase().replace(/\s+/g, "_"),
    team: penTeam,
    yards: enforcement === PenaltyEnforcement.Accepted ? (pd?.penalty_yards ?? 5) : 0,
    enforcement,
    isAutoFirstDown: grantsAutoFirstDown(penaltyType, penCategory),
  }];
}

/** Build a FumbleEvent from play_players roles */
function buildFumble(play: PlayWithPlayers, ballCarrier: string, ctx: TransformContext): FumbleEvent | undefined {
  const recoverer = firstPlayerByRole(play, "fumble_recovery");
  const forcer = firstPlayerByRole(play, "forced_fumble");
  if (!recoverer && !forcer) return undefined;

  const possTeamId = play.possession === "us" ? ctx.programTeamId : otherTeam(ctx.programTeamId, ctx);
  // recoveryYards has been on FumbleEvent all along with nothing filling it,
  // so a scoop-and-return credited the recoverer no yardage at all.
  const returnYards = Number((play.play_data as Record<string, any>)?.fumble_return_yards);

  return {
    fumbledBy: ballCarrier,
    forcedBy: forcer,
    recoveredBy: recoverer,
    recoveryTeam: play.is_turnover ? otherTeam(possTeamId, ctx) : possTeamId,
    recoveryYards: Number.isFinite(returnYards) ? returnYards : undefined,
  };
}

// ---------------------------------------------------------------------------
// Score calculation (mirrors GameScreen scoring logic)
// ---------------------------------------------------------------------------

function scoreForPlay(play: PlayWithPlayers): number {
  const pd = play.play_data as Record<string, any>;
  let pts = 0;
  if (play.is_touchdown) pts += 6;
  if (play.play_type === "pat" && pd?.result === "Good") pts += 1;
  if (play.play_type === "fg" && pd?.result === "Good") pts += 3;
  if (play.play_type === "two_pt" && pd?.result === "Good") pts += 2;
  // Safety is handled separately in transformPlays
  return pts;
}

// ---------------------------------------------------------------------------
// Play conversion — route each play_type to the correct engine type
// ---------------------------------------------------------------------------

function convertPlay(
  play: PlayWithPlayers,
  context: PlayContext,
  ctx: TransformContext,
): Play | null {
  const pd = play.play_data as Record<string, any>;
  const penalties = buildPenalties(play, ctx);
  const isOurOffense = play.possession === "us";

  switch (play.play_type) {
    // ── OFFENSIVE PLAYS (typically possession="us") ──────────────────────

    case "rush": {
      const rusher = firstPlayerByRole(play, "rusher")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const result = play.is_touchdown ? RushResult.Touchdown : RushResult.Normal;
      return {
        type: PlayType.Rush,
        rusher,
        result,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        fumble: buildFumble(play, rusher, ctx),
        returnTackledBy: returnTacklers(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    case "scramble": {
      // QB scramble — counts as a rush but the runner is the passer, and the
      // engine flags it as a designed-pass-turned-run for split passing/rushing stats.
      const rusher = firstPlayerByRole(play, "passer")
        ?? firstPlayerByRole(play, "rusher")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const result = play.is_touchdown ? RushResult.Touchdown : RushResult.Normal;
      return {
        type: PlayType.Rush,
        rusher,
        result,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        isQBScramble: true,
        ...tackleCredits(play),
        fumble: buildFumble(play, rusher, ctx),
        returnTackledBy: returnTacklers(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    case "pass_comp": {
      const passer = firstPlayerByRole(play, "passer")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const receiver = firstPlayerByRole(play, "receiver");
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Complete,
        target: receiver,
        receiver,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        fumble: buildFumble(play, receiver ?? passer, ctx),
        returnTackledBy: returnTacklers(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "pass_inc": {
      const passer = firstPlayerByRole(play, "passer")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const target = firstPlayerByRole(play, "target") ?? firstPlayerByRole(play, "receiver");
      // Derived credit: a defender/tackler tagged on an incompletion is a
      // pass breakup, not a tackle — nobody got tackled on an incomplete pass.
      const breakups = [...playersByRole(play, "defender"), ...playersByRole(play, "tackler")];
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Incomplete,
        target,
        yardsGained: 0,
        isTouchdown: false,
        defendedBy: breakups.length > 0 ? breakups : undefined,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "throwaway": {
      const passer = firstPlayerByRole(play, "passer")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.ThrowAway,
        yardsGained: 0,
        isTouchdown: false,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "drop": {
      // Drop is recorded as an incomplete pass; the target's drop count is
      // derived downstream from result=Incomplete + target tagged.
      const passer = firstPlayerByRole(play, "passer")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const target = firstPlayerByRole(play, "target") ?? firstPlayerByRole(play, "receiver");
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Incomplete,
        target,
        yardsGained: 0,
        isTouchdown: false,
        penalties,
        description: play.description ?? "Drop",
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "sack": {
      const passer = firstPlayerByRole(play, "passer")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const sackers = playersByRole(play, "sacker");
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Sack,
        yardsGained: play.yards_gained, // negative
        isTouchdown: false,
        tackledBy: sackers.length > 0 ? sackers : playersByRole(play, "tackler"),
        // A strip-sack is a sack AND a fumble. buildFumble returns undefined
        // when neither fumble role is tagged, so an ordinary sack is
        // unaffected. Rush and completed passes already did this.
        fumble: buildFumble(play, passer, ctx),
        returnTackledBy: returnTacklers(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "int": {
      const passer = firstPlayerByRole(play, "passer")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const interceptor = firstPlayerByRole(play, "interceptor");
      const interceptionReturnYards = typeof pd?.interception_return_yards === "number"
        ? pd.interception_return_yards
        : play.yards_gained > 0 ? play.yards_gained : undefined;
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Interception,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        interceptedBy: interceptor,
        interceptionReturnYards,
        returnTackledBy: returnTacklers(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "fumble": {
      const rusher = firstPlayerByRole(play, "rusher")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      return {
        type: PlayType.Rush,
        rusher,
        result: RushResult.Fumble,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        fumble: buildFumble(play, rusher, ctx),
        returnTackledBy: returnTacklers(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    case "kneel": {
      const rusher = firstPlayerByRole(play, "rusher") ?? play.primary_player_id ?? "opp_unknown";
      return {
        type: PlayType.Rush,
        rusher,
        result: RushResult.Kneel,
        yardsGained: play.yards_gained,
        isTouchdown: false,
        isKneel: true,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    case "spike": {
      const passer = firstPlayerByRole(play, "passer") ?? play.primary_player_id ?? "opp_unknown";
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.SpikeBall,
        yardsGained: 0,
        isTouchdown: false,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    // ── SPECIAL TEAMS ────────────────────────────────────────────────────

    case "kickoff": {
      const kicker = firstPlayerByRole(play, "kicker");
      const returner = firstPlayerByRole(play, "returner");
      const isTouchback = !!(pd?.is_touchback);
      const spots = kickSpotsFor(play);
      let stResult: SpecialTeamsResult = SpecialTeamsResult.Normal;
      if (isTouchback) stResult = SpecialTeamsResult.Touchback;
      if (play.is_touchdown) stResult = SpecialTeamsResult.ReturnTouchdown;
      return {
        type: PlayType.Kickoff,
        kicker,
        returner,
        result: stResult,
        kickDistance: spots?.kickDistance,
        returnYards: returner ? spots?.returnYards : undefined,
        isTouchback,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    case "punt": {
      const punter = firstPlayerByRole(play, "punter");
      const returner = firstPlayerByRole(play, "returner");
      const isTouchback = !!(pd?.is_touchback);
      const spots = kickSpotsFor(play);
      let stResult: SpecialTeamsResult = SpecialTeamsResult.Normal;
      if (isTouchback) stResult = SpecialTeamsResult.Touchback;
      if (play.is_touchdown) stResult = SpecialTeamsResult.ReturnTouchdown;
      return {
        type: PlayType.Punt,
        punter,
        returner,
        result: stResult,
        kickDistance: spots?.kickDistance,
        returnYards: returner ? spots?.returnYards : undefined,
        isTouchback,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    case "onside_kick": {
      const kicker = firstPlayerByRole(play, "kicker");
      const recoverer = firstPlayerByRole(play, "recoverer") ?? firstPlayerByRole(play, "returner");
      const spots = kickSpotsFor(play);
      return {
        type: PlayType.Kickoff,
        kicker,
        returner: recoverer,
        result: SpecialTeamsResult.Normal,
        kickDistance: spots?.kickDistance,
        returnYards: recoverer ? spots?.returnYards : undefined,
        isOnsideKick: true,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        penalties,
        description: play.description ?? "Onside kick",
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    case "fair_catch": {
      // Treat as a punt with no return; returner caught and signaled. The
      // distance still counts - a fair catch is a punt that travelled.
      const punter = firstPlayerByRole(play, "punter") ?? firstPlayerByRole(play, "kicker");
      const returner = firstPlayerByRole(play, "returner");
      const spots = kickSpotsFor(play);
      return {
        type: PlayType.Punt,
        punter,
        returner,
        result: SpecialTeamsResult.FairCatch,
        kickDistance: spots?.kickDistance,
        returnYards: 0,
        isFairCatch: true,
        isTouchdown: false,
        penalties,
        description: play.description ?? "Fair catch",
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    case "fg": {
      const kicker = firstPlayerByRole(play, "kicker");
      const kickResult = pd?.result === "Good" ? KickResult.Good : KickResult.NoGood;
      return {
        type: PlayType.FieldGoal,
        kicker,
        result: kickResult,
        isTouchdown: false,
        fieldGoalDistance: play.yard_line ? (100 - play.yard_line + (ctx.fgSnapAdd ?? 17)) : undefined,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    case "pat": {
      const kicker = firstPlayerByRole(play, "kicker");
      const kickResult = pd?.result === "Good" ? KickResult.Good : KickResult.NoGood;
      return {
        type: PlayType.ExtraPoint,
        kicker,
        result: kickResult,
        isTouchdown: false,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    case "two_pt": {
      /* A conversion attempt is not a scrimmage play and is kept out of
         passing and rushing statistics by every rule set there is - NFHS,
         NCAA and the NFL all record conversions separately.

         The engine does not know that. It declares twoPointConversionAttempts
         and twoPointConversionsMade and never increments either, and its
         passing calculator never looks at isTwoPointConversion - so a
         two-point pass was landing in a quarterback's line as an attempt, a
         completion, three yards and a PASSING TOUCHDOWN, and a two-point run
         as a carry and a rushing touchdown. That is where a passer's attempts
         came out one higher than the number of passing plays he actually
         threw on.

         So it does not go to the engine at all. Conversions are reported from
         the plays themselves - the PAT Kicks and Field Goals rows and points
         by player in gameReport.ts all read them directly, which is also why
         nothing is lost by leaving them out here. */
      return null;
    }

    case "blocked_kick": {
      const blockedKickType = pd?.blocked_kick_type;
      const blockedBy = firstPlayerByRole(play, "blocker")
        ?? firstPlayerByRole(play, "defender");
      if (blockedKickType === "punt") {
        return {
          type: PlayType.Punt,
          punter: firstPlayerByRole(play, "punter"),
          returner: firstPlayerByRole(play, "returner"),
          result: SpecialTeamsResult.Block,
          isBlocked: true,
          blockedBy,
          isTouchdown: play.is_touchdown,
          penalties,
          description: play.description ?? undefined,
          context,
        } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
      }
      if (blockedKickType === "kickoff") {
        return {
          type: PlayType.Kickoff,
          kicker: firstPlayerByRole(play, "kicker"),
          returner: firstPlayerByRole(play, "returner"),
          result: SpecialTeamsResult.Block,
          isBlocked: true,
          blockedBy,
          isTouchdown: play.is_touchdown,
          penalties,
          description: play.description ?? undefined,
          context,
        } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
      }
      return {
        type: blockedKickType === "extra_point" ? PlayType.ExtraPoint : PlayType.FieldGoal,
        result: KickResult.Blocked,
        isBlocked: true,
        blockedBy,
        isTouchdown: play.is_touchdown,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    // ── DEFENSIVE PLAYS (typically possession="them") ────────────────────
    // These represent the opponent's offensive play from our defensive POV.
    // We construct a minimal opponent play and credit our defenders.

    case "tackle": {
      const oppRusher = getOppPlayerId(play);
      return {
        type: PlayType.Rush,
        rusher: oppRusher,
        result: play.is_touchdown ? RushResult.Touchdown : RushResult.Normal,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    case "tfl": {
      const oppRusher = getOppPlayerId(play);
      return {
        type: PlayType.Rush,
        rusher: oppRusher,
        result: RushResult.Normal,
        yardsGained: play.yards_gained, // negative
        isTouchdown: false,
        ...tackleCredits(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    case "fum_rec": {
      const oppRusher = getOppPlayerId(play);
      const recoverer = firstPlayerByRole(play, "fumble_recovery");
      const forcer = firstPlayerByRole(play, "forced_fumble");
      return {
        type: PlayType.Rush,
        rusher: oppRusher,
        result: RushResult.Fumble,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        ...tackleCredits(play),
        fumble: {
          fumbledBy: oppRusher,
          forcedBy: forcer,
          recoveredBy: recoverer,
          recoveryTeam: ctx.programTeamId, // we recovered it
        },
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    case "safety": {
      // Safety = opponent tackled in their own end zone.
      // Model as a rush for negative yards.
      const oppRusher = getOppPlayerId(play);
      return {
        type: PlayType.Rush,
        rusher: oppRusher,
        result: RushResult.Normal,
        yardsGained: play.yards_gained,
        isTouchdown: false,
        ...tackleCredits(play),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }

    // PBU and hurry: the engine has limited support for these.
    // Convert to incomplete passes so the play is at least counted,
    // but real PBU/hurry credit comes from calcDefenseStats supplement.
    case "pbu": {
      const oppPasser = getOppPlayerId(play);
      return {
        type: PlayType.Pass,
        passer: oppPasser,
        result: PassResult.Incomplete,
        yardsGained: 0,
        isTouchdown: false,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "hurry": {
      const oppPasser = getOppPlayerId(play);
      return {
        type: PlayType.Pass,
        passer: oppPasser,
        result: PassResult.Incomplete,
        yardsGained: 0,
        isTouchdown: false,
        isUnderPressure: true,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    // ── PENALTY-ONLY PLAY ────────────────────────────────────────────────

    case "penalty":
    case "penalty_only": {
      if (!penalties || penalties.length === 0) return null;
      return {
        type: PlayType.Penalty,
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PenaltyPlay & { context: PlayContext } as Play;
    }

    case "timeout":
    case "score_correction":
      // Bookkeeping plays — the engine ignores them; score derivation handles
      // the delta in gameService.deriveGameState.
      return null;

    default:
      // Unknown play type — skip
      console.warn(`[playTransformer] Unknown play_type: "${play.play_type}", skipping`);
      return null;
  }
}
