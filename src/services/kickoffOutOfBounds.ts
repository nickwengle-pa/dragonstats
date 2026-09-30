import type { LiveSituation } from "./gameFlow";

/** The receiving team's answers to a free kick out of bounds (NFHS 6-1-9).
 *
 *  - take_35: the ball 25 yards beyond the previous spot. The stored name is
 *    older than the rule it now follows: it placed the ball on the receiving
 *    35 whatever the kick, which is only right from the usual K-40. A kickoff
 *    moved back by a penalty put the ball in the wrong place.
 *  - succeeding_spot: 5 yards from where it went out.
 *  - rekick: 5 yards from the previous spot, and the kicking team kicks again.
 *  - decline: the ball where it went out, no penalty.
 *
 *  Only the re-kick and the 25-yard choice existed before; a crew that took
 *  either of the other two had no way to say so. */
export type KickoffOutOfBoundsChoice = "take_35" | "succeeding_spot" | "rekick" | "decline";
export const KICKOFF_OUT_OF_BOUNDS_CHOICES: readonly KickoffOutOfBoundsChoice[] = ["take_35", "succeeding_spot", "rekick", "decline"];
export const KICKOFF_OUT_OF_BOUNDS = "Kickoff Out of Bounds";

export function isKickoffOutOfBoundsChoice(value: unknown): value is KickoffOutOfBoundsChoice {
  return typeof value === "string" && (KICKOFF_OUT_OF_BOUNDS_CHOICES as readonly string[]).includes(value);
}

/** How each choice reads on the button and in the play description. */
export const KICKOFF_OUT_OF_BOUNDS_LABELS: Record<KickoffOutOfBoundsChoice, string> = {
  take_35: "25 yds beyond the kick",
  succeeding_spot: "5 yds from where it went out",
  rekick: "Re-kick · 5-yard penalty",
  decline: "Decline · ball where it went out",
};

const RETURN_ROLES = new Set(["returner", "recoverer"]);
const LOOSE_TAG_KEYS = ["team_tagged", "opp_tagged", "pending_tagged"];

/** Somebody is credited with fielding the kick, in play_players or in the
 *  play_data tags that cannot be foreign keys. */
function hasReturnCredit(play: { play_data?: Record<string, unknown> | null; play_players?: Array<{ role: string }> | null }): boolean {
  if (play.play_players?.some(pp => RETURN_ROLES.has(pp.role))) return true;
  return LOOSE_TAG_KEYS.some(key => {
    const tags = play.play_data?.[key];
    return Array.isArray(tags) && tags.some(t => RETURN_ROLES.has((t as { role?: string } | null)?.role ?? ""));
  });
}

/** Older games may carry only the outcome or the written penalty.
 *
 *  The written description is the weakest signal: "returner pushed out of
 *  bounds" says the same words about a kick that counts. Getting it wrong
 *  costs the kicker his distance and the returner his return, so the words
 *  are trusted only on a play recorded before kick_outcome existed
 *  (2026-08-16) that nobody returned. */
export function isOutOfBoundsKickoff(play: {
  play_type: string;
  play_data?: Record<string, unknown> | null;
  description?: string | null;
  play_players?: Array<{ role: string }> | null;
}): boolean {
  if (!["kickoff", "onside_kick"].includes(play.play_type)) return false;
  const data = play.play_data ?? {};
  if (data.kick_outcome === "out_of_bounds"
    || isKickoffOutOfBoundsChoice(data.kickoff_out_of_bounds_choice)
    || /kickoff out of bounds/i.test(String(data.penalty_type ?? ""))) return true;
  if (data.kick_outcome != null || hasReturnCredit(play)) return false;
  return /out[ -]of[ -]bounds/i.test(play.description ?? "");
}

/**
 * Where the ball goes next. `before` is the kickoff, in the kicking team's
 * frame; the result is in the frame of whoever has the ball next.
 *
 * `wentOutAt` is where the kick crossed the sideline, counted from the
 * receiving team's goal line - the landing spot the kick step records as
 * kicked_to_yard. Without one, the two choices that need it fall back to the
 * 25-yard spot rather than invent a place.
 */
export function kickoffOutOfBoundsSituation(
  before: LiveSituation,
  choice: KickoffOutOfBoundsChoice,
  distance = 10,
  wentOutAt: number | null = null,
): LiveSituation {
  if (choice === "rekick") {
    // Five yards from the previous spot, half the distance near the goal.
    return { ...before, ballOn: Math.max(1, before.ballOn - Math.min(5, before.ballOn / 2)), down: 1, distance };
  }
  const receiver = before.possession === "us" ? "them" : "us";
  const inbounds = (ballOn: number) => Math.max(1, Math.min(99, ballOn));
  // 25 yards beyond the previous spot: from the K-40, the R-35.
  let ballOn = inbounds(100 - (before.ballOn + 25));
  if (wentOutAt != null && Number.isFinite(wentOutAt)) {
    if (choice === "succeeding_spot") {
      // A foul on the kicking team, so the ball moves toward THEIR goal.
      ballOn = inbounds(wentOutAt + Math.min(5, (100 - wentOutAt) / 2));
    } else if (choice === "decline") {
      ballOn = inbounds(wentOutAt);
    }
  }
  return { possession: receiver, ballOn, down: 1, distance: Math.min(distance, 100 - ballOn) };
}
