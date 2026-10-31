import { lookupPenalty } from "football-stats-engine";
import { getPenaltyEngineCode, isSpotFoul, isWipedByPenaltyRow } from "@/components/game/types";
import { receiverFoulSpot } from "./kickSpots";
import { readFumbleSpots } from "./fumbleSpots";

/** Kicks a return-team foul leaves standing. See receiverFoulSpot. */
const KICK_TYPES = new Set(["punt", "kickoff", "onside_kick", "fair_catch"]);

/** The plays whose gain can stand up to a foul spot past the line. */
const GAIN_TO_FOUL_SPOT_TYPES = new Set(["rush", "pass_comp"]);

/**
 * An offensive foul past the line, marked off from where it happened: the gain
 * up to the foul spot is a real gain (NFHS/NCAA stat rules), even though the
 * down is replayed.
 *
 * It used to cover offensive holding only, and only on a row with no
 * play-counts flag - but the play-entry modal writes penalty_play_counts=false
 * on every flag that replays the down, so a block in the back behind a 26-yard
 * catch (Portage, Oct 23) dropped the whole catch from the passer and the
 * receiver. false means "the down does not count", which is true here too; it
 * does not mean the yards before the foul never happened. Only true - the whole
 * play stands - turns this off.
 *
 * "auto" counts only for the fouls whose automatic enforcement is the foul spot
 * (holding beyond the line, and the spot fouls), because anything else with
 * "auto" kept the line of scrimmage as its prefilled foul spot.
 */
export function preservesAdvance(pd: Record<string, any>, ballOn: number): boolean {
  if (["declined", "offset"].includes(pd.penalty_enforcement) || pd.penalty_play_counts === true) return false;
  if (pd.play_category !== "offense" || typeof pd.foul_spot_ball_on !== "number" || pd.foul_spot_ball_on <= ballOn) return false;
  const from = pd.penalty_enforcement_from ?? "auto";
  if (from === "spot_of_foul") return true;
  return from === "auto" && (pd.penalty_type === "Holding-OFF" || isSpotFoul(pd.penalty_type));
}

/** preservesAdvance for a stored row, limited to the play types it applies to. */
export function keepsGainToFoulSpot(play: { play_type?: string; is_penalty: boolean; play_data: any; yard_line: number | null }): boolean {
  return play.is_penalty && GAIN_TO_FOUL_SPOT_TYPES.has(play.play_type ?? "")
    && preservesAdvance(play.play_data ?? {}, play.yard_line ?? 0);
}

/**
 * The play with its yards cut off at the foul spot when only the gain up to
 * the foul counts. Everything that sums yards off stored rows goes through
 * this, or it disagrees with the engine: the Game Report's rushing Gain read
 * the whole 20-yard run behind a holding call that stats as +2, and printed
 * the difference as a 29-yard Loss.
 */
export function withStatYards<T extends { play_type?: string; is_penalty: boolean; play_data: any; yard_line: number | null; yards_gained: number }>(play: T): T {
  play = withFumbleYards(play);
  if (!keepsGainToFoulSpot(play)) return play;
  const toFoul = play.play_data.foul_spot_ball_on - (play.yard_line ?? 0);
  return play.yards_gained > toFoul ? { ...play, yards_gained: toFoul } : play;
}

/**
 * A fumbled run or catch credits the ball carrier to the RECOVERY spot,
 * whichever team recovers: the stat manual credits the fumbler "to the point
 * of recovery ... regardless of which team recovers". It was cut to the fumble
 * spot for a morning (Oct 24) and Nick put it back to the book.
 *
 * It used to apply to lost fumbles only, so a run the offense fell on kept the
 * yards to where the ball came loose: Lotson ran 11 at United Valley, fumbled
 * backward and was recovered 4 yards back at the PL 52, and stat as +11.
 * Read through readFumbleSpots: a stored 0 is a leftover, not the goal line.
 */
export function withFumbleYards<T extends { play_type?: string; play_data: any; yard_line: number | null; yards_gained: number }>(play: T): T {
  const recoveredAt = readFumbleSpots(play.play_data).fumbleRecoveredAt;
  if (recoveredAt == null || !["rush", "pass_comp", "sack", "fum_rec"].includes(play.play_type ?? "")) return play;
  const yards = recoveredAt - (play.yard_line ?? 0);
  return yards === play.yards_gained ? play : { ...play, yards_gained: yards };
}

export function nullifiedStats(play: { play_type?: string; is_penalty: boolean; play_data: any; yard_line: number | null }): boolean {
  const pd = play.play_data ?? {};
  if (!play.is_penalty || pd.penalty_enforcement === "declined") return false;
  if (keepsGainToFoulSpot(play)) return false;
  // The operator's call on the field outranks the rulebook guess below.
  if (typeof pd.penalty_play_counts === "boolean") return !pd.penalty_play_counts;
  if (pd.penalty_enforcement === "offset") return false;
  if (isWipedByPenaltyRow({ play_type: play.play_type ?? "", is_penalty: play.is_penalty, play_data: pd })) return true;
  // The return team fouled during the return: the kick happened and counts.
  if (KICK_TYPES.has(play.play_type ?? "") && receiverFoulSpot(pd) != null) return false;
  if (!pd.penalty_type || preservesAdvance(pd, play.yard_line ?? 0)) return false;
  return lookupPenalty(getPenaltyEngineCode(pd.penalty_type) ?? pd.penalty_type)?.replayDown ?? true;
}

/**
 * Whether the edit modal should open with "Play counts" on. A foul whose gain
 * stands only up to the foul spot opens with it off: the down is replayed, and
 * "Play counts" on would advance it.
 */
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
  const pd = {
    penalty_type: play.penalty,
    play_category: play.penaltyCategory,
    penalty_enforcement: play.penaltyEnforcement,
    foul_spot_ball_on: play.foulSpotBallOn,
    penalty_enforcement_from: play.penaltyEnforcementFrom,
  };
  if (preservesAdvance(pd, play.ballOn)) return false;
  return !nullifiedStats({ play_type: play.type, is_penalty: true, yard_line: play.ballOn, play_data: pd });
}
