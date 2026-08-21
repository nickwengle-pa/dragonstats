/**
 * Destructive maintenance operations — deleting games, purging a season,
 * clearing test data. Everything in here is irreversible, so it all lives in
 * one file that's easy to audit.
 *
 * Two rules every function in here follows:
 *
 *   1. Confirm the server actually deleted something. A Supabase `.delete()`
 *      that matches zero rows (RLS, bad id) reports no error, so every delete
 *      here chains `.select("id")` and reports the real row count back.
 *
 *   2. Clear the local IndexedDB cache for anything removed server-side.
 *      A leftover pending sync op would otherwise replay later and push
 *      orphaned plays back up — see clearGameCache in offlineDb.
 *
 * Cascade map (from supabase/schema.sql), which is why these are so short:
 *
 *   season → games → plays → play_players
 *          ↘ season_rosters      ↘ game_stats_cache
 *          ↘ coaches
 *
 * Players and opponents are program-level and deliberately survive a season
 * purge; use deleteUnrosteredPlayers for the leftovers.
 */

import { supabase } from "@/lib/supabase";
import { clearAllOfflineData, clearGameCache } from "./offlineDb";
import { invalidateCache, cacheKeys } from "./offlineCache";

export interface PurgeResult {
  ok: boolean;
  /** Rows actually removed on the server. */
  count: number;
  error?: string;
  /** Set when part of the work succeeded but some rows were blocked. */
  warning?: string;
}

export interface SeasonDataCounts {
  games: number;
  plays: number;
  rosterEntries: number;
}

const ok = (count: number, warning?: string): PurgeResult => ({ ok: true, count, warning });
const fail = (error: string): PurgeResult => ({ ok: false, count: 0, error });

/* ─────────────────────────────────────────────
   Inspection — show the damage before doing it
   ───────────────────────────────────────────── */

async function getSeasonGameIds(seasonId: string): Promise<string[]> {
  const { data } = await supabase.from("games").select("id").eq("season_id", seasonId);
  return (data ?? []).map((row) => row.id as string);
}

/** Row counts for a season, so the UI can say exactly what's about to be lost. */
export async function countSeasonData(seasonId: string): Promise<SeasonDataCounts> {
  const gameIds = await getSeasonGameIds(seasonId);

  const [playsRes, rosterRes] = await Promise.all([
    gameIds.length
      ? supabase.from("plays").select("id", { count: "exact", head: true }).in("game_id", gameIds)
      : Promise.resolve({ count: 0 }),
    supabase.from("season_rosters").select("id", { count: "exact", head: true }).eq("season_id", seasonId),
  ]);

  return {
    games: gameIds.length,
    plays: playsRes.count ?? 0,
    rosterEntries: rosterRes.count ?? 0,
  };
}

/* ─────────────────────────────────────────────
   Games
   ───────────────────────────────────────────── */

/**
 * Delete one game and everything under it (plays, play_players, stats cache).
 * Also clears this device's offline cache + pending sync ops for that game.
 */
export async function deleteGame(gameId: string): Promise<PurgeResult> {
  const { data, error } = await supabase
    .from("games")
    .delete()
    .eq("id", gameId)
    .select("id");

  if (error) return fail(error.message);
  if (!data?.length) return fail("Nothing was deleted — the game may already be gone.");

  await clearGameCache(gameId);
  // The cached game row would otherwise let a deleted game still be opened
  // offline. The cached schedule self-heals: deleting happens from the
  // schedule screen, which reloads online right afterwards.
  await invalidateCache(cacheKeys.game(gameId));
  return ok(data.length);
}

/**
 * Delete every game in a season but keep the season itself, its roster, and
 * its coaching staff. This is the "wipe my test games, keep my setup" button.
 */
export async function purgeSeasonGames(seasonId: string): Promise<PurgeResult> {
  const gameIds = await getSeasonGameIds(seasonId);
  if (!gameIds.length) return ok(0);

  const { data, error } = await supabase
    .from("games")
    .delete()
    .in("id", gameIds)
    .select("id");

  if (error) return fail(error.message);

  await Promise.all([
    ...gameIds.map(clearGameCache),
    ...gameIds.map((id) => invalidateCache(cacheKeys.game(id))),
    invalidateCache(cacheKeys.schedule(seasonId)),
  ]);
  return ok(data?.length ?? 0);
}

/* ─────────────────────────────────────────────
   Rosters
   ───────────────────────────────────────────── */

/**
 * Remove every player from a season's roster. The player records themselves
 * are program-level and survive — this only cuts the season link.
 */
export async function purgeSeasonRoster(seasonId: string): Promise<PurgeResult> {
  const { data, error } = await supabase
    .from("season_rosters")
    .delete()
    .eq("season_id", seasonId)
    .select("id");

  if (error) return fail(error.message);
  return ok(data?.length ?? 0);
}

/**
 * Delete program players who aren't on any season's roster — the debris left
 * behind after purging a test season.
 *
 * plays.primary_player_id references players WITHOUT a cascade, so a player
 * still credited on a recorded play can't be deleted. Rather than failing the
 * whole batch on one such row, we retry individually and report how many were
 * blocked.
 */
export async function deleteUnrosteredPlayers(programId: string): Promise<PurgeResult> {
  const { data: seasons } = await supabase.from("seasons").select("id").eq("program_id", programId);
  const seasonIds = (seasons ?? []).map((row) => row.id as string);

  const { data: rostered } = seasonIds.length
    ? await supabase.from("season_rosters").select("player_id").in("season_id", seasonIds)
    : { data: [] as Array<{ player_id: string }> };
  const rosteredIds = new Set((rostered ?? []).map((row) => row.player_id as string));

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id")
    .eq("program_id", programId);
  if (playersError) return fail(playersError.message);

  const orphanIds = (players ?? [])
    .map((row) => row.id as string)
    .filter((id) => !rosteredIds.has(id));

  if (!orphanIds.length) return ok(0);

  const { data: deleted, error } = await supabase
    .from("players")
    .delete()
    .in("id", orphanIds)
    .select("id");

  if (!error) return ok(deleted?.length ?? 0);

  // Batch hit a foreign-key block. Fall back to one-at-a-time so the players
  // that CAN go still go, and count the ones pinned by recorded plays.
  let removed = 0;
  let blocked = 0;
  for (const id of orphanIds) {
    const { data: row, error: rowError } = await supabase
      .from("players")
      .delete()
      .eq("id", id)
      .select("id");
    if (rowError) blocked += 1;
    else removed += row?.length ?? 0;
  }

  return ok(
    removed,
    blocked
      ? `${blocked} player${blocked === 1 ? "" : "s"} kept — still credited on recorded plays.`
      : undefined,
  );
}

/* ─────────────────────────────────────────────
   Seasons
   ───────────────────────────────────────────── */

/**
 * Delete a season and everything under it: games, plays, play_players, stats
 * cache, roster links, and coaches. Players and opponents survive.
 *
 * Callers must not delete the active season — the app expects one to exist.
 */
export async function deleteSeason(seasonId: string): Promise<PurgeResult> {
  // Grab the game ids BEFORE the cascade removes them; we need them to know
  // which local caches to clear.
  const gameIds = await getSeasonGameIds(seasonId);

  const { data, error } = await supabase
    .from("seasons")
    .delete()
    .eq("id", seasonId)
    .select("id");

  if (error) return fail(error.message);
  if (!data?.length) return fail("Nothing was deleted — the season may already be gone.");

  await Promise.all([
    ...gameIds.map(clearGameCache),
    ...gameIds.map((id) => invalidateCache(cacheKeys.game(id))),
    invalidateCache(cacheKeys.schedule(seasonId)),
    invalidateCache(cacheKeys.roster(seasonId)),
  ]);
  return ok(data.length);
}

/* ─────────────────────────────────────────────
   Device
   ───────────────────────────────────────────── */

/**
 * Wipe this device's offline store. Server data is untouched — but anything
 * recorded offline and not yet synced is gone for good.
 */
export async function wipeDeviceCache(): Promise<PurgeResult> {
  try {
    await clearAllOfflineData();
    return ok(0);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not clear offline storage.");
  }
}
