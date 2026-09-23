import type { LiveSituation } from "./gameFlow";

export type KickoffOutOfBoundsChoice = "rekick" | "take_35";
export const KICKOFF_OUT_OF_BOUNDS = "Kickoff Out of Bounds";

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
    || data.kickoff_out_of_bounds_choice === "take_35"
    || data.kickoff_out_of_bounds_choice === "rekick"
    || /kickoff out of bounds/i.test(String(data.penalty_type ?? ""))) return true;
  if (data.kick_outcome != null || hasReturnCredit(play)) return false;
  return /out[ -]of[ -]bounds/i.test(play.description ?? "");
}

export function kickoffOutOfBoundsSituation(before: LiveSituation, choice: KickoffOutOfBoundsChoice, distance = 10): LiveSituation {
  return {
    possession: choice === "rekick" ? before.possession : before.possession === "us" ? "them" : "us",
    ballOn: choice === "rekick" ? Math.max(1, before.ballOn - Math.min(5, before.ballOn / 2)) : 35,
    down: 1,
    distance,
  };
}
