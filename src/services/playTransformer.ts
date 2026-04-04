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
  type PenaltySide,
} from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";
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

  for (const play of plays) {
    const possTeamId = play.possession === "us" ? ctx.programTeamId : otherTeam(ctx.programTeamId, ctx);
    const playContext = buildContext(play, ctx, possTeamId, homeScore, awayScore);

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

function buildContext(
  play: PlayWithPlayers,
  ctx: TransformContext,
  possTeamId: string,
  homeScore: number,
  awayScore: number,
): PlayContext {
  const q = clampQuarter(play.quarter);
  return {
    gameId: ctx.gameId,
    quarter: q,
    gameClock: play.clock ?? "0:00",
    down: clampDown(play.down),
    distance: play.distance ?? 10,
    yardLine: play.yard_line ?? 20,
    possessionTeam: possTeamId,
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

// Extract player IDs by role from play_players
function playersByRole(play: PlayWithPlayers, role: string): string[] {
  return play.play_players
    .filter((pp) => pp.role === role)
    .map((pp) => pp.player_id);
}

function firstPlayerByRole(play: PlayWithPlayers, role: string): string | undefined {
  return play.play_players.find((pp) => pp.role === role)?.player_id;
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

  return [{
    penaltyType: getPenaltyEngineCode(penaltyType) ?? penaltyType.toLowerCase().replace(/\s+/g, "_"),
    team: penTeam,
    yards: pd?.penalty_yards ?? 5,
    enforcement: PenaltyEnforcement.Accepted,
  }];
}

/** Build a FumbleEvent from play_players roles */
function buildFumble(play: PlayWithPlayers, ballCarrier: string, ctx: TransformContext): FumbleEvent | undefined {
  const recoverer = firstPlayerByRole(play, "fumble_recovery");
  const forcer = firstPlayerByRole(play, "forced_fumble");
  if (!recoverer && !forcer) return undefined;

  const possTeamId = play.possession === "us" ? ctx.programTeamId : otherTeam(ctx.programTeamId, ctx);
  return {
    fumbledBy: ballCarrier,
    forcedBy: forcer,
    recoveredBy: recoverer,
    recoveryTeam: play.is_turnover ? otherTeam(possTeamId, ctx) : possTeamId,
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
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
        fumble: buildFumble(play, rusher, ctx),
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
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
        fumble: buildFumble(play, receiver ?? passer, ctx),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "pass_inc": {
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
        description: play.description ?? undefined,
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
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }

    case "int": {
      const passer = firstPlayerByRole(play, "passer")
        ?? (isOurOffense ? play.primary_player_id ?? "opp_unknown" : getOppPlayerId(play));
      const interceptor = firstPlayerByRole(play, "interceptor");
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Interception,
        yardsGained: play.yards_gained,
        isTouchdown: play.is_touchdown,
        interceptedBy: interceptor,
        interceptionReturnYards: play.yards_gained > 0 ? play.yards_gained : undefined,
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
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
        fumble: buildFumble(play, rusher, ctx),
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
      let stResult: SpecialTeamsResult = SpecialTeamsResult.Normal;
      if (isTouchback) stResult = SpecialTeamsResult.Touchback;
      if (play.is_touchdown) stResult = SpecialTeamsResult.ReturnTouchdown;
      return {
        type: PlayType.Kickoff,
        kicker,
        returner,
        result: stResult,
        returnYards: returner ? play.yards_gained : undefined,
        isTouchback,
        isTouchdown: play.is_touchdown,
        tackledBy: playersByRole(play, "tackler"),
        penalties,
        description: play.description ?? undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }

    case "punt": {
      const punter = firstPlayerByRole(play, "punter");
      const returner = firstPlayerByRole(play, "returner");
      const isTouchback = !!(pd?.is_touchback);
      let stResult: SpecialTeamsResult = SpecialTeamsResult.Normal;
      if (isTouchback) stResult = SpecialTeamsResult.Touchback;
      if (play.is_touchdown) stResult = SpecialTeamsResult.ReturnTouchdown;
      return {
        type: PlayType.Punt,
        punter,
        returner,
        result: stResult,
        returnYards: returner ? play.yards_gained : undefined,
        isTouchback,
        isTouchdown: play.is_touchdown,
        tackledBy: playersByRole(play, "tackler"),
        penalties,
        description: play.description ?? undefined,
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
      // Two-point can be rush or pass — check for passer role
      const passer = firstPlayerByRole(play, "passer");
      const receiver = firstPlayerByRole(play, "receiver");
      const rusher = firstPlayerByRole(play, "rusher");
      const isGood = pd?.result === "Good";

      if (passer) {
        return {
          type: PlayType.Pass,
          passer,
          result: receiver && isGood ? PassResult.Complete : PassResult.Incomplete,
          target: receiver,
          receiver: isGood ? receiver : undefined,
          yardsGained: isGood ? 3 : 0, // 2pt is from 3-yard line
          isTouchdown: isGood,
          isTwoPointConversion: true,
          description: play.description ?? undefined,
          context,
        } satisfies PassPlay & { context: PlayContext } as Play;
      }
      // Rush 2pt
      return {
        type: PlayType.Rush,
        rusher: rusher ?? play.primary_player_id ?? "opp_unknown",
        result: isGood ? RushResult.Touchdown : RushResult.Normal,
        yardsGained: isGood ? 3 : 0,
        isTouchdown: isGood,
        isTwoPointConversion: true,
        description: play.description ?? undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
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
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
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
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
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
        tackledBy: playersByRole(play, "tackler"),
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
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
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

    default:
      // Unknown play type — skip
      console.warn(`[playTransformer] Unknown play_type: "${play.play_type}", skipping`);
      return null;
  }
}
