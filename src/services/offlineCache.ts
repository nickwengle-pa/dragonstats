import { needsNextSpotReview } from "./blockedKickOutcome";
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

import { supabase } from "@/lib/supabase";
import { getMeta, setMeta, deleteMeta, isOfflineSupported } from "./offlineDb";

export const cacheKeys = {
  program: (userId: string) => `cache:program:${userId}`,
  seasons: (programId: string) => `cache:seasons:${programId}`,
  roster: (seasonId: string) => `cache:roster:${seasonId}`,
  schedule: (seasonId: string) => `cache:schedule:${seasonId}`,
  game: (gameId: string) => `cache:game:${gameId}`,
  opponentPlayers: (opponentId: string) => `cache:opp-players:${opponentId}`,
  reviewCounts: (seasonId: string) => `cache:review-counts:v2:${seasonId}`,
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

/* ── canonical game-day queries ──────────────────────────────────────────
   Four screens want the roster and three want the season's games. They each
   used to run their own slightly different select, which is how the first
   version of this cache shipped broken: the dashboard asked for
   `season_rosters(id)` just to count them, and had it been cached under the
   shared key those id-only rows would have overwritten the full records the
   game screen needs to name a tackler.

   So there is exactly one query per thing, and every screen calls it. One
   shape, one cache entry — and warming it anywhere warms it everywhere.
   If a screen needs less, it takes less from the same full result; do not
   add a narrower select under these keys. */

/** Active roster for a season, jersey order. */
export async function readSeasonRoster<T = unknown>(seasonId: string): Promise<CachedRead<T[]>> {
  return cachedRead<T[]>(cacheKeys.roster(seasonId), async () => {
    const { data, error } = await supabase
      .from("season_rosters").select("*, player:players(*)")
      .eq("season_id", seasonId).eq("is_active", true)
      .order("jersey_number", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as T[];
  });
}

/** Every game in a season, by date, with the full opponent record. */
export async function readSeasonGames<T = unknown>(seasonId: string): Promise<CachedRead<T[]>> {
  return cachedRead<T[]>(cacheKeys.schedule(seasonId), async () => {
    const { data, error } = await supabase
      .from("games").select("*, opponent:opponents(*)")
      .eq("season_id", seasonId).order("game_date");
    if (error) throw error;
    return (data ?? []) as T[];
  });
}

/**
 * How many plays in each game still need their next spot confirmed.
 *
 * Penalties, turnovers and blocked kicks all pop the Adjust Next Situation
 * sheet and stay stored as next_situation_source "pending_review" until it is
 * applied, so this is a direct count of unfinished post-game work rather than
 * a proxy for it.
 *
 * Only the rows that need attention come back - the filter runs server-side -
 * so this is a handful of ids on a healthy season, not every play.
 *
 * Cached like everything else the dashboard reads. That screen once ran its
 * own uncached queries and reported "0 games and 0 players" offline; a count
 * that silently returned zero would be the same bug in a new hat, which is why
 * the caller treats a missing value as UNKNOWN rather than as clean.
 */
export async function readSeasonReviewCounts(
  seasonId: string,
  gameIds: string[],
): Promise<CachedRead<Record<string, number>>> {
  return cachedRead<Record<string, number>>(cacheKeys.reviewCounts(seasonId), async () => {
    if (!gameIds.length) return {};
    const { data, error } = await supabase
      .from("plays")
      .select("game_id, play_type, is_touchdown, is_penalty, play_data")
      .in("game_id", gameIds)
      .eq("play_data->>next_situation_source", "pending_review");
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of (data ?? [])) {
      if (!needsNextSpotReview(row)) continue;
      counts[row.game_id] = (counts[row.game_id] ?? 0) + 1;
    }
    return counts;
  });
}

/**
 * Pull the roster and schedule into the cache in the background.
 *
 * The first cut of this feature only cached what a screen happened to load,
 * so seeding the device meant remembering to visit the schedule AND open a
 * game while still in signal. That is a ritual, and rituals get skipped — the
 * first real test of it came back "0 games and 0 players". Now merely opening
 * the app with service is enough.
 *
 * Fire-and-forget: nothing renders off it, and a failure just means the cache
 * stays as cold as it already was.
 */
export function warmGamedayCache(seasonId: string): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  void readSeasonRoster(seasonId).catch(() => {});
  void readSeasonGames(seasonId).catch(() => {});
}

/** Drop one cached entry — for when the underlying row is deleted. */
export async function invalidateCache(key: string): Promise<void> {
  await deleteMeta(key);
}
