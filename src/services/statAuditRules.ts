import { lookupPenalty } from "football-stats-engine";
import { getPenaltyEngineCode, isWipedByPenaltyRow } from "@/components/game/types";

/** A recorded foul beyond the line can preserve the legal advance before enforcement. */
export function preservesAdvance(pd: Record<string, any>, ballOn: number): boolean {
  return pd.play_category === "offense" && pd.penalty_type === "Holding-OFF"
    && typeof pd.foul_spot_ball_on === "number" && pd.foul_spot_ball_on > ballOn;
}

export function nullifiedStats(play: { play_type?: string; is_penalty: boolean; play_data: any; yard_line: number | null }): boolean {
  const pd = play.play_data ?? {};
  if (!play.is_penalty || ["declined", "offset"].includes(pd.penalty_enforcement)) return false;
  // The operator's call on the field outranks the rulebook guess below.
  if (pd.penalty_play_counts === true) return false;
  if (isWipedByPenaltyRow({ play_type: play.play_type ?? "", is_penalty: play.is_penalty, play_data: pd })) return true;
  if (!pd.penalty_type || preservesAdvance(pd, play.yard_line ?? 0)) return false;
  return lookupPenalty(getPenaltyEngineCode(pd.penalty_type) ?? pd.penalty_type)?.replayDown ?? true;
}
