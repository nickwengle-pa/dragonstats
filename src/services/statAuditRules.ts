import { lookupPenalty } from "football-stats-engine";
import { getPenaltyEngineCode } from "@/components/game/types";

/** A recorded foul beyond the line can preserve the legal advance before enforcement. */
export function preservesAdvance(pd: Record<string, any>, ballOn: number): boolean {
  return pd.play_category === "offense" && pd.penalty_type === "Holding-OFF"
    && typeof pd.foul_spot_ball_on === "number" && pd.foul_spot_ball_on > ballOn;
}

export function nullifiedStats(play: { is_penalty: boolean; play_data: any; yard_line: number | null }): boolean {
  const pd = play.play_data ?? {};
  if (!play.is_penalty || ["declined", "offset"].includes(pd.penalty_enforcement)) return false;
  if (!pd.penalty_type || preservesAdvance(pd, play.yard_line ?? 0)) return false;
  return lookupPenalty(getPenaltyEngineCode(pd.penalty_type) ?? pd.penalty_type)?.replayDown ?? true;
}
