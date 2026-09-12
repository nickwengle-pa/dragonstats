import type { GameConfig } from "@/services/programService";

interface Situation { down: number; distance: number; ballOn: number; quarter: number; }
interface PreviousPlay { type: string; result: string; isTouchdown: boolean; quarter: number; playData?: Record<string, unknown>; }

/** A yard line alone cannot distinguish a kickoff from an ordinary snap. */
export function isKickoffDue(situation: Situation, previous: PreviousPlay | undefined, config: GameConfig): boolean {
  if (situation.down !== 1 || situation.distance !== config.first_down_distance) return false;
  if (["kickoff", "onside_kick"].includes(previous?.type ?? "") && previous?.playData?.kickoff_out_of_bounds_choice === "rekick") return true;
  const onKickLine = situation.ballOn === config.kickoff_yard_line || situation.ballOn === config.safety_kick_yard_line;
  if (!onKickLine) return false;
  if (!previous) return true;
  if (situation.quarter === 3 && previous.quarter < 3) return true;
  return previous.type === "pat" || previous.type === "two_pt" || previous.type === "safety"
    || (previous.type === "fg" && previous.result === "Good")
    // Skipping the conversion explicitly moves the situation to the kick line.
    || previous.isTouchdown;
}
