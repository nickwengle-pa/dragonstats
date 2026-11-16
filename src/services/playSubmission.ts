/* What a play entry becomes when it is saved: the play record, the database
 * row, its player credits, and whether the spot needs the operator's review.
 *
 * These are the decisions that settle who gets credited and where the ball
 * goes next, so they live here as plain functions with their own tests
 * (playSubmission.spec.ts) instead of inside GameScreen's submit handler, where
 * they could only be exercised by driving the whole screen. Moved out of
 * GameScreen unchanged; the screen still does the replay, the official-final
 * check, the write and the prompts. */
import type { PlaySubmitData } from "@/components/game/PlayEntryModal";
import { fmtClock, isRosterTag, type PlayRecord, type TaggedPlayer } from "@/components/game/types";
import { withHandSetStart, type PregameConfig } from "./gameFlow";
import type { PlayInsert } from "./gameService";
import type { GameConfig } from "./programService";

/** The scoreboard as it stands when Record Play is tapped. */
export interface LiveScoreboard {
  quarter: number;
  /** Running clock, in seconds. */
  clock: number;
  possession: "us" | "them";
  down: number;
  distance: number;
  ballOn: number;
}

/** Recording into the middle of the game: the play goes after plays[index],
 *  at the situation the game was in at that point. */
export interface InsertPoint {
  index: number;
  quarter: number;
  possession: "us" | "them";
  down: number;
  distance: number;
  ballOn: number;
}

export interface SubmissionContext {
  seasonId: string;
  plays: PlayRecord[];
  live: LiveScoreboard;
  insertAt: InsertPoint | null;
  pregame: PregameConfig | null;
  config: GameConfig;
}

/** Interceptions always change possession; fumbles only when not recovered by
 *  the offense (the modal sends an explicit flag). */
export function submittedTurnover(data: Pick<PlaySubmitData, "turnover" | "playType">): boolean {
  return data.turnover ?? ["int", "fumble"].includes(data.playType.id);
}

/** How the next spot was arrived at, stored as play_data.next_situation_source.
 *
 *  "manual_override" means the recorder stated what the officials did;
 *  "penalty_enforced" means the app worked it out from the foul spot. Both
 *  outrank the replay, but only one of them is a human claim, and conflating
 *  them would misreport how the spot was arrived at. A flag, a blocked kick or
 *  a turnover with no stated spot waits for review; a turnover returned for a
 *  score has no spot to confirm, because the try comes next. */
export function nextSituationSourceFor(
  data: Pick<PlaySubmitData, "nextSituation" | "penalty" | "playType" | "isTouchdown">,
  isTurnover: boolean,
): string {
  if (data.nextSituation) return data.nextSituation.source;
  return data.penalty || (data.playType.id === "blocked_kick" && !data.isTouchdown) || (isTurnover && !data.isTouchdown)
    ? "pending_review"
    : "auto";
}

/** Whether saving opens the "Adjust Next Situation" review instead of
 *  advancing on its own. Penalties, blocked kicks and turnovers need the spot
 *  and possession confirmed; a touchdown skips it, because the next situation
 *  is the mechanical try spot and the PAT gate has to fire. */
export function needsSituationReview(
  data: Pick<PlaySubmitData, "nextSituation" | "penalty" | "playType" | "isTouchdown">,
  isTurnover: boolean,
): boolean {
  return !data.nextSituation && !!(data.penalty || data.playType.id === "blocked_kick" || isTurnover) && !data.isTouchdown;
}

/** The play as the app holds it, before the replay resolves what came of it.
 *
 *  Stamped with the clock the modal returned, which can correct the snap time,
 *  rather than whatever the running clock reads by the time Save is tapped.
 *  Recorded from wherever the scoreboard says the ball is; if that is not where
 *  the previous play left it, somebody moved it by hand and withHandSetStart
 *  flags it, or the next replay would put the ball back. */
export function buildSubmittedPlay(data: PlaySubmitData, ctx: SubmissionContext): PlayRecord {
  const { live, insertAt, plays } = ctx;
  const isTurnover = submittedTurnover(data);
  const playClock = data.clock ?? live.clock;
  return withHandSetStart({
    id: "pending",
    sequence: insertAt ? insertAt.index + 2 : plays.length + 1,
    quarter: insertAt ? insertAt.quarter : live.quarter,
    clock: playClock,
    type: data.playType.id,
    yards: data.yards,
    result: data.result,
    penalty: data.penalty,
    penaltyCategory: data.penaltyCategory,
    penaltyEnforcement: data.penaltyEnforcement,
    flagYards: data.flagYards,
    isTouchdown: data.isTouchdown,
    firstDown: data.isFirstDown,
    turnover: isTurnover,
    isTouchback: data.isTouchback,
    blockedKickType: data.blockedKickType,
    fumbleReturnYards: data.fumbleReturnYards ?? null,
    fumbleRecoveredAt: data.fumbleRecoveredAt ?? null,
    tagged: data.tagged,
    ballOn: insertAt ? insertAt.ballOn : live.ballOn,
    down: insertAt ? insertAt.down : live.down,
    distance: insertAt ? insertAt.distance : live.distance,
    description: data.description,
    possession: insertAt ? insertAt.possession : live.possession,
    // Onside recovered by the kicking team: keep possession (the situation
    // engine reads nextPossession to decide flip vs. keep).
    nextPossession: data.playType.id === "onside_kick" && data.onsideRecoveredByKicker
      ? live.possession
      // A flag on a kick or a turnover changes who has the ball, and the
      // modal has already worked out which team and complemented ballOn into
      // their frame. Without this the spot was stored against the team that
      // just lost possession.
      : data.nextSituation?.possession,
    // Penalty spot the recorder set by hand — wins over computed enforcement.
    nextDown: data.nextSituation?.down,
    nextDistance: data.nextSituation?.distance,
    nextBallOn: data.nextSituation?.ballOn,
    offensiveFormation: data.offensiveFormation,
    defensiveFormation: data.defensiveFormation,
    hashMark: data.hashMark,
    playData: {
      season_id: ctx.seasonId,
      recorded_start_clock: fmtClock(playClock),
      recorded_start_clock_seconds: playClock,
      ...(data.playData ?? {}),
      next_situation_source: nextSituationSourceFor(data, isTurnover),
    },
  }, insertAt ? plays[insertAt.index] : plays[plays.length - 1], ctx.pregame, ctx.config);
}

/** The game's play list with the new play in place: appended, or after the
 *  play it was inserted behind. What the official-final check runs against. */
export function playsWithSubmitted(plays: PlayRecord[], play: PlayRecord, insertAt: Pick<InsertPoint, "index"> | null): PlayRecord[] {
  return insertAt
    ? [...plays.slice(0, insertAt.index + 1), play, ...plays.slice(insertAt.index + 1)]
    : [...plays, play];
}

/** The plays row. Its situation columns are the live scoreboard's even on a
 *  mid-game insert. That is safe only because an insert is followed at once by
 *  recalcScoreAndState, whose persistPlaySituations writes the new play's row
 *  again from the play record (it has no stored signature yet), at the point
 *  it was inserted. Anything that inserts without that re-chain must pass the
 *  insert point's situation here instead. */
export function buildPlayInsert(
  data: PlaySubmitData,
  gameId: string,
  live: LiveScoreboard,
  storedPlayData: Record<string, unknown>,
  endBallOn: number,
): PlayInsert {
  const playClock = data.clock ?? live.clock;
  return {
    game_id: gameId,
    quarter: live.quarter,
    clock: fmtClock(playClock),
    possession: live.possession,
    down: live.down,
    distance: live.distance,
    yard_line: live.ballOn,
    play_type: data.playType.id,
    play_data: storedPlayData,
    yards_gained: data.yards,
    is_touchdown: data.isTouchdown,
    is_turnover: submittedTurnover(data),
    is_penalty: !!data.penalty,
    primary_player_id: data.tagged.find(isRosterTag)?.player_id ?? null,
    description: data.description,
    end_yard_line: endBallOn,
    play_start_time: live.clock,
    play_end_time: null,
    // Extended fields — only include if non-null to avoid missing-column errors
    ...(data.offensiveFormation ? { offensive_formation: data.offensiveFormation } : {}),
    ...(data.defensiveFormation ? { defensive_formation: data.defensiveFormation } : {}),
    ...(data.hashMark ? { hash_mark: data.hashMark } : {}),
  };
}

/** The play_players rows. Only our rostered players have a players row to
 *  point at; opponents, unrostered jerseys and TEAM ride in play_data instead
 *  (see CLAUDE.md), and one reaching this insert would fail the whole save. */
export function buildPlayerCredits(tagged: TaggedPlayer[]): Array<{ player_id: string; role: string; credit: number | null }> {
  return tagged.filter(isRosterTag).map(t => ({
    player_id: t.player_id,
    role: t.role,
    credit: t.credit ?? null,
  }));
}
