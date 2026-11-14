import { EnforcementSpot, lookupPenalty } from "football-stats-engine";
import { getPenaltyEngineCode, isSpotFoul, isWipedByPenaltyRow } from "@/components/game/types";
import { receiverFoulSpot } from "./kickSpots";
import { readFumbleSpots } from "./fumbleSpots";

/** Kicks a return-team foul leaves standing. See receiverFoulSpot. */
const KICK_TYPES = new Set(["punt", "kickoff", "onside_kick", "fair_catch"]);

/** A pass that fell incomplete: nothing was gained for a flag to be added to. */
const INCOMPLETE_TYPES = new Set(["pass_inc", "throwaway", "drop"]);

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

/** What a stat rule needs from a stored play. `possession` and `down` are
 *  optional because a few callers hold a play in a thinner shape; the rules
 *  that read the next snap simply do not fire without them. */
export interface AuditedPlay {
  play_type?: string;
  is_penalty: boolean;
  play_data: any;
  yard_line: number | null;
  possession?: string | null;
  down?: number | null;
}

/**
 * Was the next snap taken from where this play STARTED, moved only by the
 * flag - the mark of a penalty enforced from the previous spot. Null when the
 * row cannot say: no next spot, the ball changed hands, or no side on the flag.
 *
 * The catalog can only guess at a ruling from the foul's name; the next snap
 * is what the officials actually did.
 */
function marchedFromPreviousSpot(play: AuditedPlay): boolean | null {
  const pd = play.play_data ?? {};
  const next = Number(pd.next_yard_line);
  const yards = Number(pd.penalty_yards);
  if (play.yard_line == null || pd.next_yard_line == null || !Number.isFinite(next) || !Number.isFinite(yards)) return null;
  if (!play.possession || pd.next_possession !== play.possession) return null;
  const toward = pd.play_category === "offense" ? -1 : pd.play_category === "defense" ? 1 : 0;
  if (!toward) return null;
  return next === play.yard_line + toward * yards;
}

export function nullifiedStats(play: AuditedPlay): boolean {
  const pd = play.play_data ?? {};
  const type = play.play_type ?? "";
  if (!play.is_penalty || pd.penalty_enforcement === "declined") return false;
  if (keepsGainToFoulSpot(play)) return false;
  // The operator's call on the field outranks the rulebook guess below.
  if (typeof pd.penalty_play_counts === "boolean") return !pd.penalty_play_counts;
  if (pd.penalty_enforcement === "offset") return false;
  if (isWipedByPenaltyRow({ play_type: type, is_penalty: play.is_penalty, play_data: pd })) return true;
  if (KICK_TYPES.has(type)) {
    // The return team fouled during the return: the kick happened and counts.
    if (receiverFoulSpot(pd) != null) return false;
    /* The receiving team snapped it next, so the kick was not kicked again.
       A hold on our kickoff return at Penns Manor was read off the catalog as
       "replay the down" and their 49-yard kickoff left the kickoff table,
       while the engine still counted the kick and the return. */
    if (play.possession && pd.next_possession && pd.next_possession !== play.possession) return false;
  }
  if (!pd.penalty_type || preservesAdvance(pd, play.yard_line ?? 0)) return false;
  // Looked up the way the engine is handed it: the picker's code, else the name as typed.
  const def = lookupPenalty(getPenaltyEngineCode(pd.penalty_type) ?? pd.penalty_type)
    ?? lookupPenalty(String(pd.penalty_type).toLowerCase().replace(/\s+/g, "_"));
  /* An incomplete pass with a live-ball foul on the defense is marched from
     the previous spot: the pass is no play and no attempt. The catalog calls
     roughing, targeting and the other personal fouls tack-ons, which is right
     after a gain and wrong here - there is no gain to tack them on to. A
     dead-ball foul after the pass leaves the down, and the attempt, standing. */
  if (INCOMPLETE_TYPES.has(type) && pd.play_category === "defense"
    && def?.enforcementSpot !== EnforcementSpot.DeadBall && def?.enforcementSpot !== EnforcementSpot.SucceedingSpot) return true;
  const marched = marchedFromPreviousSpot(play);
  /* A hand-typed foul the catalog has never heard of ("facemask 5yd") used
     to wipe the play outright. If the ball was not put back at the previous
     spot the play stood: West Shamokin lost a 10-yard Johnston carry and a
     Davis tackle this way. Still wiped when the row cannot say. */
  if (!def) return marched ?? true;
  /* A foul the catalog adds to the end of the play, called on the OFFENSE
     and marched from where the play started with the down played again
     (Northern Cambria, 1st & 10 run for 10, facemask, next snap 1st & 20):
     the run never counted. Only when the row says all of that. */
  if (!def.replayDown && pd.play_category === "offense" && marched === true
    && play.down != null && Number(pd.next_down) === Number(play.down)) return true;
  return def.replayDown;
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
