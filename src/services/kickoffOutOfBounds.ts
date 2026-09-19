import type { LiveSituation } from "./gameFlow";

export type KickoffOutOfBoundsChoice = "rekick" | "take_35";
export const KICKOFF_OUT_OF_BOUNDS = "Kickoff Out of Bounds";

/** Older games may carry only the outcome or the written penalty. */
export function isOutOfBoundsKickoff(play: { play_type: string; play_data?: Record<string, unknown> | null; description?: string | null }): boolean {
  if (!["kickoff", "onside_kick"].includes(play.play_type)) return false;
  const data = play.play_data ?? {};
  return data.kick_outcome === "out_of_bounds"
    || data.kickoff_out_of_bounds_choice === "take_35"
    || data.kickoff_out_of_bounds_choice === "rekick"
    || /kickoff out of bounds/i.test(String(data.penalty_type ?? ""))
    || /out[ -]of[ -]bounds/i.test(play.description ?? "");
}

export function kickoffOutOfBoundsSituation(before: LiveSituation, choice: KickoffOutOfBoundsChoice, distance = 10): LiveSituation {
  return {
    possession: choice === "rekick" ? before.possession : before.possession === "us" ? "them" : "us",
    ballOn: choice === "rekick" ? Math.max(1, before.ballOn - Math.min(5, before.ballOn / 2)) : 35,
    down: 1,
    distance,
  };
}
