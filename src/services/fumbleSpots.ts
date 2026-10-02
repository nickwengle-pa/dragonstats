/**
 * Read a stored play's fumble recovery spot and return yards.
 *
 * Builds before mid-September saved `fumble_recovered_at: 0` and
 * `fumble_return_yards: 0` on EVERY play, fumble or not. Nothing else says a
 * play had a fumble, and the replay takes a recovery spot as the end of the
 * play - so every 0 read back as "loose ball recovered on the offense's own
 * goal line". From the first snap the chain put the ball on the 0 at 2nd and
 * 37, possessions drifted off the recorded ones, and a finalized 35-14 game
 * reopened on the game screen as 28-21. The box score never noticed because it
 * scores the stored spots, which were recorded correctly.
 *
 * A recovery on the 0 is not a spot a drive continues from: a loose ball
 * downed in the offense's own end zone is a safety or a touchdown, and those
 * are recorded as their own outcome. So 0 means "never set". A return with no
 * recovery behind it is the same leftover, and keeping it would decide the
 * play's first down from yardage instead of the recorded flag.
 *
 * Every reader of these two fields goes through here - the game screen, film
 * review and the stored-spot re-chain all replay the same rows, and they have
 * to agree about where each play ended.
 */
const finiteOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface FumbleSpots {
  fumbleRecoveredAt: number | null;
  fumbleReturnYards: number | null;
}

export function readFumbleSpots(playData: Record<string, unknown> | null | undefined): FumbleSpots {
  const recovered = finiteOrNull(playData?.fumble_recovered_at);
  const returned = finiteOrNull(playData?.fumble_return_yards);
  const fumbleRecoveredAt = recovered != null && recovered > 0 ? recovered : null;
  const fumbleReturnYards = fumbleRecoveredAt == null && returned === 0 ? null : returned;
  return { fumbleRecoveredAt, fumbleReturnYards };
}
