/**
 * Whether a finished game's stats are actually finished.
 *
 * "Completed" only means the clock ran out. The work after that - confirming
 * the spots the officials gave on penalties and turnovers, matching unrostered
 * jersey numbers to players - is what a coach logging in on Monday wants to
 * know the state of, and the app had no way to say.
 *
 * There are two signals and they are not the same kind of thing:
 *
 *   The MARK is a human statement: someone went through post-game review and
 *   called it done. It rides in games.tags, which already exists, so this
 *   needs no migration and works on games recorded months ago.
 *
 *   The COUNT is a fact: plays whose next situation was never confirmed, still
 *   carrying next_situation_source "pending_review". Penalties, turnovers and
 *   blocked kicks all pop the Adjust Next Situation sheet, and a play where
 *   that sheet was dismissed rather than applied is genuinely unfinished.
 *
 * The count outranks the mark. A game must not show green while something is
 * demonstrably outstanding, or the label is worse than no label - it would
 * make "final" mean "somebody once tapped a button", which is exactly the
 * failure mode of a flag that can go stale behind later edits.
 *
 * A null count means "not known" - offline, or the query has not landed yet -
 * and must NOT read as zero. Treating unknown as clean would flip every game
 * to green on a cold start; treating it as dirty would flip them all to amber
 * on a plane. Unknown falls back to whatever the mark says.
 */

/** The marker stored in games.tags. A plain string, because that column is a
 *  TEXT[] shared with whatever else anyone tags a game with. */
export const STATS_FINAL_TAG = "stats_final";

export type StatsState =
  /** Marked done, nothing outstanding. */
  | "final"
  /** Plays still need their spot confirmed. */
  | "review"
  /** Nothing outstanding, but nobody has said it is done. */
  | "open";

/** Reads the mark off a game row's tags, tolerating null and non-arrays. */
export function isMarkedStatsFinal(tags: unknown): boolean {
  return Array.isArray(tags) && tags.includes(STATS_FINAL_TAG);
}

export function statsState(o: { tags: unknown; toReview: number | null }): StatsState {
  if (o.toReview != null && o.toReview > 0) return "review";
  return isMarkedStatsFinal(o.tags) ? "final" : "open";
}

/** The chip's words. Kept next to the state so the two cannot drift. */
export function statsStateLabel(state: StatsState, toReview: number | null): string {
  if (state === "review") return `${toReview ?? 0} to review`;
  return state === "final" ? "Stats final" : "Stats open";
}
