/**
 * Where a kick came down, and how far it was brought back.
 *
 * These two numbers are the whole of special-teams yardage — gross kick
 * distance is the kick spot to the landing spot, and return yardage is the
 * landing spot to wherever he was brought down — and neither survives in
 * yards_gained, which stores only their difference. One number, two facts.
 *
 * Plays recorded from now on store both outright. Plays recorded before that
 * carry them in the description, which buildDescription has always written out
 * in full ("Punt #21 Smith 38 yds to UV 12, ret #3 Jones 10 yds"), so both
 * come back for a game charted months ago as well as one charted tonight.
 *
 * Deliberately dependency-free and framework-free: the play editor's seed, the
 * engine transformer and the stats supplement all need the same answer, and
 * they each hold a play in a different shape.
 */

export interface KickSpots {
  /** Kick spot to landing spot. GROSS — the return is not subtracted. */
  kickDistance: number;
  /** Landing spot as the RECEIVING team's own yard line. 0 is their goal line. */
  kickedToYard: number;
  /** Landing spot to where he was brought down. Zero when there was no return. */
  returnYards: number;
  /** True when these came from stored numbers rather than parsed from prose. */
  exact: boolean;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Kick distance and return yardage as written into the description.
 *
 * Both are printed immediately before the word "yds", and a jersey in a player
 * label cannot be mistaken for either: labels read "#21 Smith", so the number
 * is followed by a name rather than by "yds".
 */
export function kickInfoFromDescription(
  description: string,
): { kickDistance: number; returnYards: number } | null {
  const distance = /(\d+)\s+yds\s+(?:to\b|Touchback\b)/.exec(description);
  if (!distance) return null;
  const returnClause = /,\s*ret\b([^]*?)(-?\d+)\s+yds/.exec(description);
  return {
    kickDistance: Number(distance[1]),
    returnYards: returnClause ? Number(returnClause[2]) : 0,
  };
}

/**
 * Resolve both spots for one kick.
 *
 * `ballOn` is where it was kicked from, offense-relative — and on a kick the
 * "offense" is the kicking team, so it counts up from their own goal line.
 * Returns null when the play carries neither the stored numbers nor a
 * description old enough to hold them; callers leave the stat unrecorded
 * rather than reporting a guess as fact.
 */
export function resolveKickSpots(args: {
  ballOn: number;
  playData: Record<string, unknown> | null | undefined;
  description: string | null | undefined;
}): KickSpots | null {
  const pd = args.playData ?? {};
  const storedKickedTo = num(pd.kicked_to_yard);

  if (storedKickedTo != null) {
    const storedReturnTo = num(pd.return_to_ball_on);
    /* kickedToYard counts from the RECEIVING team's goal line and
       return_to_ball_on counts from the KICKING team's, so they are
       complements — the return is the difference between them. */
    const returnYards = storedReturnTo != null
      ? (100 - storedReturnTo) - storedKickedTo
      : 0;
    return {
      kickDistance: Math.max(0, (100 - storedKickedTo) - args.ballOn),
      kickedToYard: storedKickedTo,
      returnYards,
      exact: true,
    };
  }

  const parsed = kickInfoFromDescription(args.description ?? "");
  if (!parsed) return null;
  return {
    kickDistance: parsed.kickDistance,
    kickedToYard: Math.max(0, Math.min(100, 100 - args.ballOn - parsed.kickDistance)),
    returnYards: parsed.returnYards,
    exact: false,
  };
}

/**
 * Did the punt pin them inside their own 20.
 *
 * A touchback is explicitly not inside the 20 — it is the opposite result —
 * and neither is a kick that reached the end zone.
 */
export function isInsideTwenty(spots: KickSpots, isTouchback: boolean): boolean {
  if (isTouchback) return false;
  return spots.kickedToYard > 0 && spots.kickedToYard <= 20;
}

/**
 * Net yardage: kick spot to where the receiving team actually starts.
 *
 * Gross minus the return, except on a touchback, where the return never
 * happened and the ball is placed on the touchback line by rule. That is what
 * makes a touchback a bad kickoff rather than a 65-yard one.
 */
export function netKickYards(
  spots: KickSpots,
  ballOn: number,
  isTouchback: boolean,
  touchbackYardLine: number,
): number {
  if (isTouchback) return Math.max(0, (100 - touchbackYardLine) - ballOn);
  return spots.kickDistance - spots.returnYards;
}
