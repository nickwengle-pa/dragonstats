/* The rules and shapes play entry is built on, kept out of PlayEntryModal so
   they can be read, tested and reused without the 5,000-line component. Moved
   here unchanged. PlayEntryModal re-exports the two types it always exported. */
import type {
  BlockedKickType, GameState, OpponentPlayerRef, PenaltySide, PlayTypeDef, TaggedPlayer,
} from "./types";

/* Plays where nobody ever possessed the ball, which under NFHS makes them
   loose-ball plays and puts the basic spot back at the previous spot. Anything
   else - a run, a catch, any kind of return - ended with somebody carrying it,
   so the basic spot is where that run ended. */
export const LOOSE_BALL_TYPES = new Set(["pass_inc", "throwaway", "drop", "spike", "fg", "pat"]);

export const otherSide = (p: "us" | "them"): "us" | "them" => (p === "us" ? "them" : "us");

export type PenaltyEnforcement = "accepted" | "declined" | "offset";

export interface PlaySubmitData {
  playType: PlayTypeDef;
  tagged: TaggedPlayer[];
  yards: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  isTouchback: boolean;
  /** Whether possession changed. Defaults to play-type behavior; set explicitly
   *  for fumbles (false = offense recovered, true = lost). */
  turnover?: boolean;
  /** Yards the recoverer carried it after a fumble. The engine's FumbleEvent
   *  has always had a recoveryYards field; nothing ever filled it. */
  fumbleReturnYards?: number;
  /** Where the ball was picked up, offense-relative. The next situation is
   *  measured from here, not from where the play ended. */
  fumbleRecoveredAt?: number;
  /** Onside kicks only: true when the kicking team recovered its own kick. */
  onsideRecoveredByKicker?: boolean;
  /** Scoreboard time at the snap, in seconds. */
  clock: number;
  result: string; // "Good" | "No Good" | "Returned" | "Complete" | "Incomplete" | ""
  penalty: string | null;
  penaltyCategory: PenaltySide | null;
  penaltyEnforcement: PenaltyEnforcement;
  flagYards: number;
  blockedKickType: BlockedKickType | null;
  offensiveFormation: string | null;
  defensiveFormation: string | null;
  hashMark: string | null;
  description: string;
  playData?: Record<string, unknown>;
  /** Manual next-situation override — set when the recorder spots the ball
   *  themselves instead of trusting the computed penalty enforcement. */
  nextSituation?: {
    goalToGo?: boolean;
    ballOn: number;
    down: number;
    distance: number;
    /* Whose frame ballOn is in, and who has the ball next. Set because a flag
       on a kick or a turnover flips possession, and gameFlow stores the
       after-situation in the NEW team's frame. */
    possession: "us" | "them";
    source: "manual_override" | "penalty_enforced";
  } | null;
  /** Whether this pass offered "set the spot myself". When it did, nextSituation
   *  is the operator's final word on the spot; when it did not, an edit has no
   *  opinion on a spot typed into the Adjust sheet, and the saving screen keeps
   *  it (see handSpotSurvivingEdit). */
  spotOverrideOffered?: boolean;
}

export type Step = "players" | "yards" | "penalty" | "formations" | "defense" | "review"
  | "kick_kicker" | "kick_location" | "kick_returner" | "kick_return_yards"
  | "fumble_return";
export type FieldTeam = "program" | "opponent";
export type KickOutcome = "returned" | "fair_catch" | "muffed" | "fumbled" | "downed" | "out_of_bounds" | "touchback";

export const KICK_OUTCOMES: Array<{ value: KickOutcome; label: string }> = [
  { value: "returned", label: "Returned" },
  { value: "fair_catch", label: "Fair Catch" },
  { value: "muffed", label: "Muffed" },
  { value: "fumbled", label: "Fumble" },
  { value: "downed", label: "Downed" },
  { value: "touchback", label: "Touchback" },
  { value: "out_of_bounds", label: "Out of Bounds" },
];

/** Roles that belong to the team WITHOUT the ball. */
export const DEFENSIVE_ROLES = new Set([
  "tackler", "assist", "sacker", "interceptor", "forced_fumble", "defender", "blocker",
]);

/**
 * Which roster a role is picked from: true = the opponent's.
 *
 * Single source of truth — this rule used to be written out three separate
 * times (player step, carry-forward seed, submit auto-fill) and they disagreed
 * about `returner`, which pre-filled one of OUR players as the returner on our
 * own punt.
 *
 * The subtle ones:
 *   returner        — the team WITHOUT the ball fields the kick, so it's the
 *                     opposite of possession. Reverses only when the kicking
 *                     team recovers its own onside kick.
 *   fumble_recovery — whoever ends up with it; follows the "recovered by" flag
 *                     (on a muffed or fumbled kick, the kick's own one).
 */
export function roleUsesOpponentRoster(
  role: string,
  isTheirBall: boolean,
  opts: {
    playTypeId?: string;
    fumbleRecoveredByUs?: boolean;
    onsideRecoveredByKicker?: boolean;
    blockedRecoveredByKicking?: boolean;
    /** A muffed or fumbled punt/kickoff: true when the kickers fell on it. */
    kickRecoveredByKicking?: boolean;
  } = {},
): boolean {
  if (role === "fumble_recovery") {
    // On a loose kick the kicking team is the offense, so their recovery is
    // the "offense kept it" case.
    if (opts.kickRecoveredByKicking !== undefined) return opts.kickRecoveredByKicking ? isTheirBall : !isTheirBall;
    return opts.fumbleRecoveredByUs ? isTheirBall : !isTheirBall;
  }
  if (role === "returner" || role === "recoverer") {
    // A blocked kick is a live ball either team can fall on, so the recoverer's
    // roster follows the toggle rather than a fixed side.
    if (opts.playTypeId === "blocked_kick") {
      return opts.blockedRecoveredByKicking ? isTheirBall : !isTheirBall;
    }
    return opts.playTypeId === "onside_kick" && opts.onsideRecoveredByKicker
      ? isTheirBall
      : !isTheirBall;
  }
  if (DEFENSIVE_ROLES.has(role)) return !isTheirBall;
  return isTheirBall; // offensive roles, incl. kicker/punter
}

/** Catch-all opponent placeholder — collects stats when no jersey was caught.
 *  Not a real roster row; persisted per-play via play_data.opp_tagged. */
export const OPP_TEAM_PLAYER: OpponentPlayerRef = {
  id: "opp_team",
  name: "TEAM",
  jersey_number: null,
  position: null,
};

export function defaultBlockedKickType(gameState: GameState): BlockedKickType {
  if (gameState.ballOn >= 95) return "extra_point";
  if (gameState.down === 4 && gameState.ballOn >= 60) return "field_goal";
  if (gameState.down === 4) return "punt";
  return "field_goal";
}

/** "2nd", "3rd" — matches the readout in the possession band. */
export function ordinalDown(down: number): string {
  if (down === 1) return "1st";
  if (down === 2) return "2nd";
  if (down === 3) return "3rd";
  return `${down}th`;
}

/* The team's own abbreviation when it has one, as the scorebug uses: the
   initials alone turned "Dragons" into DRA under a scorebug reading DRG. */
export function teamTag(name: string, abbreviation?: string | null): string {
  if (abbreviation?.trim()) return abbreviation.trim().toUpperCase();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TEAM";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

/**
 * What the operator's keystrokes point at — a suggestion, never a commitment.
 *
 * Typing a jersey number used to tag the player and advance the step outright.
 * That guessed wrong in the case that matters: the opponent grid only knows the
 * opponents quick-added so far, so with #2 on the list and #21 not yet added,
 * "2" looked unambiguous and fired. No guard can fix that — the candidate list
 * cannot know a longer number is still being typed. So nothing selects itself
 * any more; typing narrows, and the operator confirms.
 */
export type SoftTarget<T> =
  | { kind: "player"; item: T }
  | { kind: "pending"; jersey: number };

/**
 * Resolve what a search points at. A pure derivation of (search, candidates) —
 * deliberately not an effect. The previous hook needed a ref guard and an
 * "already tagged" escape hatch only because it fired side effects; deriving
 * the highlight instead makes every one of those cases disappear.
 *
 * `pendingJersey` is the unrostered/quick-add number this grid would offer, or
 * null when the grid has no such affordance.
 */
export function resolveSoftTarget<T>(
  search: string,
  candidates: Array<{ jersey: number | null; item: T }>,
  pendingJersey: number | null,
): SoftTarget<T> | null {
  if (!search) return null;
  if (!/^\d+$/.test(search)) return null;

  const exact = candidates.filter(c => c.jersey != null && String(c.jersey) === search);
  if (exact.length === 1) return { kind: "player", item: exact[0].item };
  // Two players wearing the same number (opponent quick-add allows it): never
  // guess which one, make the operator tap.
  if (exact.length > 1) return null;

  const prefix = candidates.filter(c => c.jersey != null && String(c.jersey).startsWith(search));
  if (prefix.length === 1) return { kind: "player", item: prefix[0].item };
  // Only offer to invent a player once no rostered number could still be meant.
  if (prefix.length === 0 && pendingJersey != null) return { kind: "pending", jersey: pendingJersey };
  return null;
}
