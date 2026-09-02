/**
 * How a tackle is split between the players who made it.
 *
 * This rule lived only in `playTransformer`, so the box score applied it and
 * the Live Stats panel — a separate converter — did not. During a game a
 * shared tackle was scored as two full solo tackles; after the game the same
 * play was scored correctly as one tackle split two ways. Two different
 * defensive stat lines from one snap, and the operator watching the screen was
 * seeing the wrong one.
 *
 * Extracting it is the first piece of collapsing those two converters into
 * one: shared rule, two callers, until there is one caller.
 */

export interface CreditTag {
  id: string;
  role: string;
  credit?: number | null;
}

export interface TackleCredit {
  /** Full credit — the engine scores these as solo tackles. */
  tackledBy: string[];
  /** A share — the engine gives each of these half a tackle. */
  assistedTackle: string[];
}

/**
 * Credit is the fact, so credit decides.
 *
 * The play-entry modal records a shared tackle as several "tackler" tags
 * carrying 0.5 each — tapping a second name is what splits it. It has never
 * written the role "assist", so any code reading that role found nothing and
 * scored every share as a full solo: two names came out 0 solo / 0 assists /
 * 2.0 total instead of 0 solo / 2 assists / 1.0 total.
 *
 * An explicitly tagged "assist" is still honoured, in case a play anywhere
 * carries one.
 */
export function splitTackleCredit(tags: CreditTag[]): TackleCredit {
  const tacklers = tags.filter((t) => t.role === "tackler");
  const isShared = (t: CreditTag) => (t.credit ?? 1) < 1;

  return {
    tackledBy: tacklers.filter((t) => !isShared(t)).map((t) => t.id),
    assistedTackle: [
      ...tags.filter((t) => t.role === "assist").map((t) => t.id),
      ...tacklers.filter(isShared).map((t) => t.id),
    ],
  };
}
