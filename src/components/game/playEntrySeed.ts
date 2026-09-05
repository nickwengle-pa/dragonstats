/**
 * Rebuild play-entry state from a play that was already recorded.
 *
 * The editor used to be its own screen with its own controls, which is why
 * editing a kickoff or a punt could not reach half of what entering one had
 * asked for, and why the ball spot came back wrong: the two were separate
 * implementations of the same idea and only one of them was ever finished.
 *
 * So editing now runs through the entry modal itself, and this is the piece
 * that makes that possible — the exact inverse of the modal's handleSubmit.
 * Whatever submit wrote to the play, this reads back into the state submit
 * wrote it from, so the edit opens on the same controls, in the same order,
 * showing what was entered.
 *
 * Where a play predates a field, the seed falls back to what the modal would
 * have defaulted to. A game charted before play direction existed opens with
 * no direction rather than refusing to open.
 */

// A type-only import so this module has no runtime dependency at all, which
// keeps playEntrySeed.test.ts runnable under plain node.
import type {
  BlockedKickType,
  PenaltySide,
  PlayRecord,
  TaggedPlayer,
} from "./types";
// The parser lives in a service: the engine transformer and the stats
// supplement need the same two numbers, and none of them should own a
// private copy of how to read them back.
import { kickInfoFromDescription } from "../../services/kickSpots.ts";

export type FieldTeam = "program" | "opponent";
export type KickOutcome = "returned" | "fair_catch" | "downed" | "out_of_bounds" | "touchback";
export type PenaltyEnforcement = "accepted" | "declined" | "offset";

/** Roles that live in the modal's separate `tacklers` state, not in `tagged`. */
const TACKLE_ROLES = new Set(["tackler", "sacker"]);

/** Play types the modal offers the fumble modifier on. */
const FUMBLE_MODIFIER_TYPES = new Set(["rush", "scramble", "pass_comp", "sack", "kneel"]);

export interface EditSeed {
  tagged: TaggedPlayer[];
  tacklers: TaggedPlayer[];
  /** Offense-relative spot where the play ended. */
  resultSide: "our" | "opp";
  resultYardLine: number;
  isTD: boolean;
  isFirstDown: boolean;
  result: "Good" | "No Good" | "Returned" | "";
  hasFumble: boolean;
  fumbleRecoveredByUs: boolean;
  fumbleReturnRaw: string;
  fumbleRecoveredAt: number | null;
  onsideRecoveredByKicker: boolean;
  blockedRecoveredByKicking: boolean;
  blockedKickType: BlockedKickType | null;
  kickOutcome: KickOutcome;
  kickedToYard: number;
  returnToTeam: FieldTeam;
  returnToYardLine: number;
  intCaughtTeam: FieldTeam;
  intCaughtYardLine: number;
  intReturnTeam: FieldTeam;
  intReturnYardLine: number;
  penalty: string | null;
  penaltyCategory: PenaltySide | null;
  penaltyEnforcement: PenaltyEnforcement;
  flagYards: number;
  offFormation: string | null;
  defFormation: string | null;
  hashMark: string | null;
  playDirection: "left" | "right" | null;
  wristbandCall: string;
  /** Where the foul happened, offense-relative. Null when none was recorded,
   *  which is every play charted before the field existed. */
  foulSpotBallOn: number | null;
  twoPointStyle: "pass" | "run";
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Offense-relative ball position to the program-perspective side + yard line. */
function toFieldSpot(possession: "us" | "them", offenseBallOn: number): {
  side: FieldTeam;
  yardLine: number;
} {
  const programBallOn = possession === "us" ? offenseBallOn : 100 - offenseBallOn;
  return programBallOn <= 50
    ? { side: "program", yardLine: Math.max(1, Math.min(50, programBallOn)) }
    : { side: "opponent", yardLine: Math.max(1, Math.min(50, 100 - programBallOn)) };
}

/** The same "our side / their side" pair the yards step edits. */
function toResultSpot(possession: "us" | "them", offenseBallOn: number): {
  side: "our" | "opp";
  yardLine: number;
} {
  const programBallOn = possession === "us" ? offenseBallOn : 100 - offenseBallOn;
  return programBallOn <= 50
    ? { side: "our", yardLine: Math.max(1, Math.min(50, programBallOn)) }
    : { side: "opp", yardLine: Math.max(1, Math.min(50, 100 - programBallOn)) };
}

export function buildEditSeed(play: PlayRecord): EditSeed {
  const pd = (play.playData ?? {}) as Record<string, unknown>;
  const possession = play.possession;

  /* Where the play ended, offense-relative. A touchdown has no spot to hold —
     the ball is in the end zone — so the picker seeds to the line of scrimmage
     and the TD flag carries the yardage, exactly as it does on entry. */
  const endBallOn = play.isTouchdown
    ? play.ballOn
    : Math.max(1, Math.min(99, play.ballOn + play.yards));
  const resultSpot = toResultSpot(possession, endBallOn);

  /* Kick plays store the landing spot as the receiving team's yard line, and
     the return as an absolute spot. Both are recoverable from the recorded
     yardage when they were not stored outright. */
  const receivingFieldSide: FieldTeam = possession === "us" ? "opponent" : "program";
  const storedKickedTo = num(pd.kicked_to_yard);
  const fromDescription = storedKickedTo == null
    ? kickInfoFromDescription(play.description ?? "")
    : null;
  /* kickedToYard counts up from the RECEIVING team's goal line, and the kick
     travelled from the kicking team's own yard line, so the two are
     complements around the length of the kick. This is the exact inverse of
     how the modal computes the distance it printed. */
  const kickedToYard = storedKickedTo
    ?? (fromDescription
      ? Math.max(0, Math.min(100, 100 - play.ballOn - fromDescription.kickDistance))
      : 5);

  const storedReturnTo = num(pd.return_to_ball_on);
  /* Where the return ended, in the receiving team's own numbers: caught on the
     10 and brought out 10 is their 20. Over midfield it flips sides, exactly
     as the return picker does. */
  const returnedToReceiverYard = fromDescription
    ? kickedToYard + fromDescription.returnYards
    : kickedToYard;
  const returnSpot = storedReturnTo != null
    ? toFieldSpot(possession, storedReturnTo)
    : returnedToReceiverYard <= 50
      ? { side: receivingFieldSide, yardLine: Math.max(1, returnedToReceiverYard) }
      : {
          side: (receivingFieldSide === "program" ? "opponent" : "program") as FieldTeam,
          yardLine: Math.max(1, 100 - returnedToReceiverYard),
        };

  /* Interceptions store both spots outright — they always have. */
  const intSpot = (pd.interception_spot ?? null) as Record<string, unknown> | null;
  const intReturn = (pd.interception_return_to ?? null) as Record<string, unknown> | null;
  const fallbackInt = toFieldSpot(possession, Math.max(1, Math.min(99, play.ballOn + 10)));
  const intCaughtSide = (str(intSpot?.field_side) as FieldTeam | null) ?? fallbackInt.side;
  const intCaughtYard = num(intSpot?.yard_line) ?? fallbackInt.yardLine;

  /* A fumble is either the play type or the modifier, and the modifier is only
     offered on the types that can carry it. */
  const taggedRoles = new Set(play.tagged.map(t => t.role));
  const hasFumble = FUMBLE_MODIFIER_TYPES.has(play.type)
    && (taggedRoles.has("forced_fumble") || taggedRoles.has("fumble_recovery") || play.turnover);

  const enforcement = str(pd.penalty_enforcement);

  return {
    tagged: play.tagged.filter(t => !TACKLE_ROLES.has(t.role)),
    tacklers: play.tagged.filter(t => TACKLE_ROLES.has(t.role)),
    resultSide: resultSpot.side,
    resultYardLine: resultSpot.yardLine,
    isTD: play.isTouchdown,
    isFirstDown: play.firstDown,
    result: (["Good", "No Good", "Returned"].includes(play.result)
      ? play.result
      : "") as EditSeed["result"],
    hasFumble,
    // turnover means the other team came up with it, so "kept" is its inverse.
    fumbleRecoveredByUs: !play.turnover,
    fumbleReturnRaw: play.fumbleReturnYards != null ? String(play.fumbleReturnYards) : "",
    fumbleRecoveredAt: play.fumbleRecoveredAt ?? null,
    onsideRecoveredByKicker: pd.onside_recovered_by_kicker === true,
    blockedRecoveredByKicking: pd.blocked_recovered_by_kicking === true,
    blockedKickType: (play.blockedKickType ?? null) as BlockedKickType | null,
    kickOutcome: ((): KickOutcome => {
      const stored = str(pd.kick_outcome);
      if (stored && ["returned", "fair_catch", "downed", "out_of_bounds", "touchback"].includes(stored)) {
        return stored as KickOutcome;
      }
      if (play.isTouchback) return "touchback";
      if (play.type === "fair_catch") return "fair_catch";
      return "returned";
    })(),
    kickedToYard,
    returnToTeam: returnSpot.side,
    returnToYardLine: returnSpot.yardLine,
    intCaughtTeam: intCaughtSide,
    intCaughtYardLine: intCaughtYard,
    intReturnTeam: (str(intReturn?.field_side) as FieldTeam | null) ?? intCaughtSide,
    intReturnYardLine: num(intReturn?.yard_line) ?? intCaughtYard,
    penalty: play.penalty,
    penaltyCategory: play.penaltyCategory ?? null,
    penaltyEnforcement: (enforcement === "declined" || enforcement === "offset"
      ? enforcement
      : play.penaltyEnforcement ?? "accepted") as PenaltyEnforcement,
    flagYards: play.flagYards || 5,
    offFormation: play.offensiveFormation ?? null,
    defFormation: play.defensiveFormation ?? null,
    hashMark: play.hashMark ?? null,
    foulSpotBallOn: num(pd.foul_spot_ball_on),
    playDirection: ((): "left" | "right" | null => {
      const d = str(pd.play_direction);
      return d === "left" || d === "right" ? d : null;
    })(),
    wristbandCall: str(pd.wristband_call) ?? "",
    // Which roles were tagged says how a two-point try was run.
    twoPointStyle: taggedRoles.has("rusher") ? "run" : "pass",
  };
}
