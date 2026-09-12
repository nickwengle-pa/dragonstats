import type { LiveSituation } from "./gameFlow";

export type KickoffOutOfBoundsChoice = "rekick" | "take_35";
export const KICKOFF_OUT_OF_BOUNDS = "Kickoff Out of Bounds";

export function kickoffOutOfBoundsSituation(before: LiveSituation, choice: KickoffOutOfBoundsChoice, distance = 10): LiveSituation {
  return {
    possession: choice === "rekick" ? before.possession : before.possession === "us" ? "them" : "us",
    ballOn: choice === "rekick" ? Math.max(1, before.ballOn - Math.min(5, before.ballOn / 2)) : 35,
    down: 1,
    distance,
  };
}
