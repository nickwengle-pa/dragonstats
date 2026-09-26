/**
 * What a flag does to the play it was thrown on, in the words the penalty
 * step shows - "the punt doesn't count", "the run stands, plus 15".
 *
 * The rules already lived in three places (penaltyWipesPlay for the kick and
 * the operator's override, the engine's replay-the-down rule for runs and
 * passes, and the holding-beyond-the-line rule in statAuditRules), and the
 * step said none of them. An operator deciding whether to override had to
 * guess what the app was about to do. This reads the same three rules, so the
 * sentence on screen is the one the stats will follow.
 */
import { lookupPenalty } from "football-stats-engine";
import {
  getPenaltyEngineCode,
  penaltyWipesPlay,
  type PenaltySide,
} from "@/components/game/types";
import { preservesAdvance } from "./statAuditRules";

/** App play types the engine scores as a run or a pass - the only ones its
 *  replay-the-down rule wipes. Mirrors the transformer's routing. */
const RUN_OR_PASS = new Set([
  "rush", "scramble", "kneel", "bad_snap", "fumble", "fum_rec", "safety", "tackle", "tfl",
  "pass_comp", "pass_inc", "sack", "int", "throwaway", "drop", "spike", "hurry", "pbu",
]);

export type PlayEffect =
  /** Accepted, and the snap is replaced by the penalty. */
  | "wiped"
  /** Accepted, and the play stands with the yards added on. */
  | "stands"
  /** Accepted holding beyond the line: the run counts up to the foul. */
  | "partial"
  | "declined"
  | "offset";

export function penaltyPlayEffect(i: {
  playTypeId: string;
  penalty: string | null;
  side: PenaltySide | null;
  enforcement: "accepted" | "declined" | "offset";
  /** play_data.penalty_play_counts - the operator's own call, if made. */
  override: boolean | null;
  foulSpotBallOn: number | null;
  ballOn: number;
}): PlayEffect {
  if (!i.penalty) return "stands";
  if (i.enforcement === "declined") return "declined";
  if (i.enforcement === "offset") return "offset";
  if (penaltyWipesPlay(i.playTypeId, i.penalty, i.side, i.enforcement, i.override)) return "wiped";
  if (i.override === true || !RUN_OR_PASS.has(i.playTypeId)) return "stands";
  if (preservesAdvance({ play_category: i.side, penalty_type: i.penalty, foul_spot_ball_on: i.foulSpotBallOn }, i.ballOn)) {
    return "partial";
  }
  const def = lookupPenalty(getPenaltyEngineCode(i.penalty) ?? i.penalty.toLowerCase().replace(/\s+/g, "_"));
  // An unknown (typed) foul wipes the play in the engine, so say so here.
  return (def ? def.replayDown : true) ? "wiped" : "stands";
}
