import { lookupPenalty } from "football-stats-engine";
import { getPenaltyEngineCode, isWipedByPenaltyRow } from "@/components/game/types";

/** A recorded foul beyond the line can preserve the legal advance before enforcement. */
export function preservesAdvance(pd: Record<string, any>, ballOn: number): boolean {
  if (["declined", "offset"].includes(pd.penalty_enforcement) || pd.penalty_play_counts === false) return false;
  if (pd.penalty_enforcement_from && !["auto", "spot_of_foul"].includes(pd.penalty_enforcement_from)) return false;
  return pd.play_category === "offense" && pd.penalty_type === "Holding-OFF"
    && typeof pd.foul_spot_ball_on === "number" && pd.foul_spot_ball_on > ballOn;
}

export function nullifiedStats(play: { play_type?: string; is_penalty: boolean; play_data: any; yard_line: number | null }): boolean {
  const pd = play.play_data ?? {};
  if (!play.is_penalty || pd.penalty_enforcement === "declined") return false;
  // The operator's call on the field outranks the rulebook guess below.
  if (typeof pd.penalty_play_counts === "boolean") return !pd.penalty_play_counts;
  if (pd.penalty_enforcement === "offset") return false;
  if (isWipedByPenaltyRow({ play_type: play.play_type ?? "", is_penalty: play.is_penalty, play_data: pd })) return true;
  if (!pd.penalty_type || preservesAdvance(pd, play.yard_line ?? 0)) return false;
  return lookupPenalty(getPenaltyEngineCode(pd.penalty_type) ?? pd.penalty_type)?.replayDown ?? true;
}

export function penaltyPlayCountsForEdit(play: {
  type?: string;
  penalty: string | null;
  penaltyCategory: string | null;
  penaltyEnforcement: string;
  foulSpotBallOn: number | null;
  penaltyEnforcementFrom: string;
  ballOn: number;
}): boolean {
  if (!play.penalty) return false;
  return !nullifiedStats({
    play_type: play.type,
    is_penalty: true,
    yard_line: play.ballOn,
    play_data: {
      penalty_type: play.penalty,
      play_category: play.penaltyCategory,
      penalty_enforcement: play.penaltyEnforcement,
      foul_spot_ball_on: play.foulSpotBallOn,
      penalty_enforcement_from: play.penaltyEnforcementFrom,
    },
  });
}
