/**
 * Read-through cache for the reference data a game needs.
 *
 * Plays have been offline-safe for a while; everything *around* them was not.
 * Program, season, roster, opponents and the game row were all straight
 * network reads, so a cold start with no service came up with an empty roster
 * — or worse, no program, which the router read as "new user" and answered
 * with the first-time setup screen. At a field with no signal that is the
 * whole app, gone.
 *
 * The shape here is deliberately the same as `loadGamePlays`: try the server,
 * fall back to the last good copy on the device. It never decides who is
 * allowed in and never changes what gets written — the worst it can do is
 * show yesterday's roster.
 *
 * The `offline` flag is the important part of the return. A null value from a
 * *successful* read means the row genuinely does not exist (a real new user);
 * a null value from a *failed* read means we simply could not look. Callers
 * must not confuse the two, so the difference is in the type rather than left
 * to a comment.
 */

import { getMeta, setMeta, deleteMeta, isOfflineSupported } from "./offlineDb";

export const cacheKeys = {
  program: (userId: string) => `cache:program:${userId}`,
  seasons: (programId: string) => `cache:seasons:${programId}`,
  roster: (seasonId: string) => `cache:roster:${seasonId}`,
  schedule: (seasonId: string) => `cache:schedule:${seasonId}`,
  game: (gameId: string) => `cache:game:${gameId}`,
  opponentPlayers: (opponentId: string) => `cache:opp-players:${opponentId}`,
} as const;

export interface CachedRead<T> {
  value: T | null;
  /** The value came off the device, not the server. */
  fromCache: boolean;
  /** The server could not be reached. `value` is cached or missing — never
   *  treat it as proof the row does not exist. */
  offline: boolean;
}

/**
 * Fetch with a device-side fallback.
 *
 * `fetchFresh` must THROW when the request fails and RESOLVE (possibly to
 * null) when the server answered. Supabase hands back `{ data, error }`
 * without throwing, so call sites have to rethrow the error themselves —
 * otherwise a network failure is indistinguishable from an empty table and
 * this whole thing quietly caches nothing.
 */
export async function cachedRead<T>(
  key: string,
  fetchFresh: () => Promise<T | null>,
): Promise<CachedRead<T>> {
  const supported = isOfflineSupported();
  const believedOnline = typeof navigator === "undefined" || navigator.onLine;

  // Known-offline with something cached: answer instantly. Skipping the
  // doomed request matters on a cold start, where half a dozen of these run
  // and each one would otherwise sit out the client's 10s timeout.
  if (supported && !believedOnline) {
    const cached = await getMeta<T>(key);
    if (cached !== undefined) return { value: cached, fromCache: true, offline: true };
  }

  try {
    const fresh = await fetchFresh();
    if (supported && fresh !== null && fresh !== undefined) await setMeta(key, fresh);
    return { value: fresh ?? null, fromCache: false, offline: false };
  } catch (err) {
    console.warn(`cachedRead(${key}) failed, falling back to cache:`, err);
    if (!supported) return { value: null, fromCache: false, offline: true };
    const cached = await getMeta<T>(key);
    return {
      value: cached ?? null,
      fromCache: cached !== undefined,
      offline: true,
    };
  }
}

/** Drop one cached entry — for when the underlying row is deleted. */
export async function invalidateCache(key: string): Promise<void> {
  await deleteMeta(key);
}
