/* The clock, field-side, timeout and score helpers the live game screen runs
   on, kept out of GameScreen so they can be read and tested on their own.
   Moved here unchanged. */
import { scoringEventsForPlay } from "@/services/scoringLedger";
import { getOurDriveDirectionForQuarter, normalizeQuarter } from "@/services/gameFlow";
import type { LiveSessionPlayResult } from "@/services/liveGameSession";
import type { PlayRecord } from "@/components/game/types";

export interface LiveSituationSnapshot {
  goalToGo?: boolean;
  possession: "us" | "them";
  down: number;
  distance: number;
  ballOn: number;
}

export interface ScoreSnapshot {
  us: number;
  them: number;
}

export interface PendingClockCapture {
  play: PlayRecord;
  before: LiveSituationSnapshot;
  scoreBefore: ScoreSnapshot;
  resolved?: Pick<LiveSessionPlayResult, "afterSituation" | "scoreAfter" | "events" | "engineSnapshot">;
  reason: string;
  patGatePossession?: "us" | "them";
}

export const LIVE_STATE_PERSIST_DELAY_MS = 250;
export const MAX_TIMEOUTS_PER_HALF = 3;
export type FieldSide = "program" | "opponent";
export type TimeoutTeam = "us" | "them";

export function toTeamTag(name: string | null | undefined, explicitAbbreviation?: string | null) {
  if (typeof explicitAbbreviation === "string" && explicitAbbreviation.trim().length > 0) {
    return explicitAbbreviation.trim().toUpperCase();
  }

  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TEAM";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

export function formatTeamYardLabel(
  ballOn: number,
  possession: "us" | "them",
  programAbbr: string,
  opponentAbbr: string,
) {
  if (ballOn === 50) return "50";
  const offenseTag = possession === "us" ? programAbbr : opponentAbbr;
  const defenseTag = possession === "us" ? opponentAbbr : programAbbr;
  return ballOn <= 50 ? `${offenseTag} ${ballOn}` : `${defenseTag} ${100 - ballOn}`;
}

/**
 * The manual field flip, remembered per game.
 *
 * It was plain state reset to false on every load, so a refresh threw it away
 * and the field snapped back to the derived direction. For the second half
 * that direction is a guess: the kicking team picks its goal at the half and
 * we don't ask, so getOurDriveDirectionForQuarter just continues Q1's
 * alternation. Keeping the operator's correction is what makes the guess
 * survivable — otherwise every reload re-imposes the wrong end.
 *
 * localStorage rather than the game row, on purpose. It is a per-viewer
 * choice (two people charting from opposite sidelines want opposite views),
 * and it has to hold on press-box wifi where a write may never land.
 */
export const fieldFlipKey = (gameId: string) => `dragonstats:fieldFlip:${gameId}`;

export function readFieldFlip(gameId: string | undefined): boolean {
  if (!gameId) return false;
  try {
    return localStorage.getItem(fieldFlipKey(gameId)) === "1";
  } catch {
    return false;
  }
}

export function writeFieldFlip(gameId: string | undefined, flipped: boolean): void {
  if (!gameId) return;
  try {
    if (flipped) localStorage.setItem(fieldFlipKey(gameId), "1");
    else localStorage.removeItem(fieldFlipKey(gameId));
  } catch {
    /* Private mode or quota. The toggle still works for this session; only
       the memory of it is lost, which is where we were before. */
  }
}

export function getFieldSideForSpot(ballOn: number, possession: "us" | "them"): FieldSide {
  if (possession === "us") {
    return ballOn <= 50 ? "program" : "opponent";
  }

  return ballOn <= 50 ? "opponent" : "program";
}

export function toBallOnFromFieldSide(fieldSide: FieldSide, yardLine: number, possession: "us" | "them") {
  if (possession === "us") {
    return fieldSide === "program" ? yardLine : 100 - yardLine;
  }

  return fieldSide === "opponent" ? yardLine : 100 - yardLine;
}

export function parseClockText(clockText: unknown, fallback: number): number {
  if (typeof clockText !== "string") return fallback;
  const [mins, secs] = clockText.split(":").map(Number);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return fallback;
  return mins * 60 + secs;
}

/**
 * Returns the "timeout period" a quarter belongs to. NFHS:
 *  - Regulation: 3 TOs per half (Q1+Q2 share, Q3+Q4 share)
 *  - Overtime: 1 TO per OT period per team — each OT is its own bucket
 *
 * Buckets: 1 = first half, 2 = second half, 3 = OT1, 4 = OT2, 5 = OT3
 */
export function timeoutHalfForQuarter(quarter: number): number {
  const q = normalizeQuarter(quarter);
  if (q <= 2) return 1;
  if (q <= 4) return 2;
  return q - 2; // OT1 → 3, OT2 → 4, OT3 → 5
}

export function maxTimeoutsForQuarter(quarter: number): number {
  return normalizeQuarter(quarter) <= 4 ? MAX_TIMEOUTS_PER_HALF : 1;
}

export function getTimeoutTeam(play: PlayRecord): TimeoutTeam | null {
  const timeoutTeam = play.playData?.timeout_team;
  return timeoutTeam === "us" || timeoutTeam === "them" ? timeoutTeam : null;
}

export function readStoredClock(play: Pick<PlayRecord, "clock" | "playData">, key: string): number | null {
  const value = play.playData?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getStoredStartClock(play: Pick<PlayRecord, "clock" | "playData">): number {
  return readStoredClock(play, "recorded_start_clock_seconds") ?? play.clock;
}

export function getStoredEndClock(play: Pick<PlayRecord, "clock" | "playData">): number | null {
  return readStoredClock(play, "recorded_end_clock_seconds");
}

/**
 * Plays after which the game clock is stopped and the operator can read a real
 * number off the scoreboard. Prompting on exactly these keeps the recorded
 * clock honest without interrupting between ordinary in-bounds snaps.
 *
 * NFHS clock stops: incomplete pass, out of bounds, any score, change of
 * possession, penalty, and every kick.
 */
export const CLOCK_STOPPING_PLAY_TYPES = new Set([
  // Kicks — the clock stops on the change of possession that follows.
  "punt", "kickoff", "onside_kick", "fair_catch", "blocked_kick",
  // Incompletions stop the clock.
  "pass_inc", "throwaway", "drop", "spike",
  // Scoring plays. (Not the try after a touchdown - see below.)
  "fg", "safety",
  // Turnovers.
  "int", "fumble",
  // A flag stops the clock while it's marked off.
  "penalty_only",
]);

export function shouldPromptForClockCapture(
  play: Pick<PlayRecord, "type" | "result" | "isTouchdown" | "penalty">,
  before: LiveSituationSnapshot,
  after: LiveSituationSnapshot,
): boolean {
  // The timeout flow captures its own clock, so prompting again would double up.
  if (play.type === "timeout") return false;
  // A try is an untimed down: no time comes off, flag or not, so the clock
  // the operator entered after the touchdown is still the clock. Asking
  // again after the PAT was a second entry of the same number.
  if (play.type === "pat" || play.type === "two_pt") return false;
  if (play.isTouchdown) return true;
  if (CLOCK_STOPPING_PLAY_TYPES.has(play.type)) return true;
  // A flag on any play stops the clock too.
  if (play.penalty) return true;
  return after.possession !== before.possession;
}

export function getClockCaptureReason(
  play: Pick<PlayRecord, "type" | "result" | "isTouchdown">,
  before: LiveSituationSnapshot,
  after: LiveSituationSnapshot,
): string {
  if (play.isTouchdown) return "after scoring play";
  if (play.type === "fg" && play.result === "Good") return "after field goal";
  if (play.type === "safety") return "after safety";
  if (play.type === "spike") return "after spike";
  if (play.type === "kickoff") return "after kickoff";
  if (play.type === "punt") return "after punt";
  if (play.type === "int") return "after interception return";
  if (play.type === "fumble") return "after turnover return";
  if (after.possession !== before.possession) return "after change of possession";
  return "after play";
}

export function serializeEngineSnapshot(snapshot: Record<string, any> | null | undefined) {
  if (!snapshot) return null;

  return {
    ...snapshot,
    overtime: snapshot.overtime ? {
      ...snapshot.overtime,
      teamsThatHavePossessed: Array.isArray(snapshot.overtime.teamsThatHavePossessed)
        ? snapshot.overtime.teamsThatHavePossessed
        : Array.from(snapshot.overtime.teamsThatHavePossessed ?? []),
    } : null,
  };
}

export function applyScoreDelta(
  play: PlayRecord,
  before: ScoreSnapshot,
): ScoreSnapshot {
  const next = { ...before };
  for (const event of scoringEventsForPlay({
    quarter: play.quarter,
    type: play.type,
    possession: play.possession,
    result: play.result,
    isTouchdown: play.isTouchdown,
    turnover: play.turnover,
    ballOn: play.ballOn,
    playData: {
      ...play.playData,
      penalty_type: play.penalty,
      play_category: play.penaltyCategory,
      penalty_enforcement: play.penaltyEnforcement ?? (play.penalty ? "accepted" : null),
    },
  })) {
    if (event.side === "us") next.us = Math.max(0, next.us + event.points);
    else next.them = Math.max(0, next.them + event.points);
  }
  return next;
}
