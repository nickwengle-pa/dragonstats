/**
 * What a blocked punt is worth to the team that blocked it.
 *
 * The stat manuals (NFHS Football Section 10, NCAA Section 7 Article 1) score
 * a blocked punt as a TEAM punt for no yards, and the yards the ball goes
 * BACK from the line as punt return yards for the other side: to the player
 * who blocked it for the roll back, to whoever picks it up for the run after,
 * and a score on it is a punt return touchdown. The reports already charged
 * the punt to TEAM, and then counted nothing for the return - so four blocked
 * punts cost us no return yards at all, and the net punting average left the
 * four of them out.
 *
 * A blocked kick stores where the play ended. That is the whole return (line
 * of scrimmage to there), which is exact for the team and for a man who
 * blocks it and picks it up himself. The entry screen can also say where the
 * ball was picked up (`blocked_pickup_ball_on`, in the kicking team's frame
 * like the row's own yard line), which splits the return between the two:
 * the roll back from the line to the pickup is the blocker's, the run after
 * it the runner's. Without that spot (older rows, or one man did both) it all
 * goes to the one who ended up with the ball, as before.
 */

import { normalizeBlockedTouchdown } from "./blockedKickOutcome";

interface BlockedRow {
  play_type: string;
  possession?: string | null;
  yard_line: number | null;
  yards_gained: number | null;
  is_touchdown?: boolean | null;
  is_penalty?: boolean | null;
  play_data?: unknown;
}

export function isBlockedPunt(play: { play_type: string; play_data?: unknown }): boolean {
  return play.play_type === "blocked_kick"
    && (play.play_data as Record<string, unknown> | null | undefined)?.blocked_kick_type === "punt";
}

export interface BlockedPuntReturn {
  /** Line of scrimmage back to where the play ended. Never negative. */
  yards: number;
  /** The blocking team scored on it. */
  touchdown: boolean;
  /** The part of `yards` that is the blocker's: line of scrimmage back to
   *  where the ball was picked up. Null when the pickup spot was not
   *  recorded, which leaves the whole return to whoever ended up with it.
   *  The runner's share is the rest. */
  blockerYards: number | null;
}

/**
 * The return on a blocked punt, or null when the play is not one. Zero yards
 * when the ball ended at or beyond the line: a block that still crossed it,
 * or one the kicking team picked up and ran forward.
 */
export function blockedPuntReturn(play: BlockedRow): BlockedPuntReturn | null {
  if (!isBlockedPunt(play)) return null;
  const pd = (play.play_data ?? {}) as Record<string, unknown>;
  const recoveredByKicking = pd.blocked_recovered_by_kicking === true;
  const row = normalizeBlockedTouchdown({
    play_type: play.play_type,
    is_touchdown: Boolean(play.is_touchdown),
    is_penalty: Boolean(play.is_penalty),
    play_data: play.play_data,
    yard_line: play.yard_line ?? 0,
    yards_gained: Number(play.yards_gained ?? 0),
  });
  const yards = Math.max(0, -row.yards_gained);
  const pickup = pd.blocked_pickup_ball_on;
  const line = play.yard_line;
  /* The roll back can't be more than the whole return: a pickup typed beyond
     where the play ended would hand the blocker yards the team never got. */
  const blockerYards = !recoveredByKicking && typeof pickup === "number" && Number.isFinite(pickup) && line != null
    ? Math.min(yards, Math.max(0, line - pickup))
    : null;
  return {
    yards,
    touchdown: Boolean(play.is_touchdown) && !recoveredByKicking,
    blockerYards,
  };
}
