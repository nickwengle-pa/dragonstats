/**
 * IndexedDB-backed offline store for Dragon Stats.
 *
 * Two object stores:
 *   - plays_cache: full play records keyed by play.id (client UUID).
 *     This is what the UI reads while offline.
 *   - sync_queue:  pending insert/update/delete operations to push to Supabase.
 *     Drained when online; idempotent so retries are safe.
 *
 * Design invariants:
 *   - Every play has a stable id (UUID) generated at submit time. Same id is
 *     used locally and on the server, so a retried push can't create dupes
 *     (server-side upsert keys on id).
 *   - sync_queue items have monotonic createdAt; drain happens in order.
 *   - We never delete plays_cache rows on offline; only when the corresponding
 *     server-side delete succeeds.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PlayWithPlayers, PlayInsert } from "./gameService";

export type SyncOp = "insert" | "update" | "delete";
export type SyncStatus = "pending" | "syncing" | "failed";

export interface SyncQueueItem {
  /** Unique id for the queue entry (separate from play id). */
  id: string;
  op: SyncOp;
  gameId: string;
  /** Play id this op refers to. For insert+update, equal to payload.id. */
  playId: string;
  /** Operation payload:
   *    - insert: { play: PlayInsert, players: PlayerInsert[] }
   *    - update: { id, patch }
   *    - delete: { id }
   */
  payload: any;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

interface DragonStatsDB extends DBSchema {
  plays_cache: {
    key: string; // play.id
    value: PlayWithPlayers;
    indexes: { "by-game": string };
  };
  sync_queue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      "by-status": SyncStatus;
      "by-game": string;
      "by-createdAt": number;
    };
  };
  meta: {
    key: string;
    value: MetaEntry;
  };
}

let _dbPromise: Promise<IDBPDatabase<DragonStatsDB>> | null = null;

const DB_NAME = "dragonstats";
const DB_VERSION = 1;

function getDb(): Promise<IDBPDatabase<DragonStatsDB>> {
  if (!_dbPromise) {
    _dbPromise = openDB<DragonStatsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("plays_cache")) {
          const playsStore = db.createObjectStore("plays_cache", { keyPath: "id" });
          playsStore.createIndex("by-game", "game_id");
        }
        if (!db.objectStoreNames.contains("sync_queue")) {
          const queueStore = db.createObjectStore("sync_queue", { keyPath: "id" });
          queueStore.createIndex("by-status", "status");
          queueStore.createIndex("by-game", "gameId");
          queueStore.createIndex("by-createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return _dbPromise;
}

/** Browser support guard. SSR / very old browsers won't have IndexedDB. */
export function isOfflineSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

/* ── plays_cache ─────────────────────────────────────────────────────── */

export async function cachePlay(play: PlayWithPlayers): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  await db.put("plays_cache", play);
}

export async function cachePlays(plays: PlayWithPlayers[]): Promise<void> {
  if (!isOfflineSupported() || plays.length === 0) return;
  const db = await getDb();
  const tx = db.transaction("plays_cache", "readwrite");
  await Promise.all(plays.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function getCachedPlays(gameId: string): Promise<PlayWithPlayers[]> {
  if (!isOfflineSupported()) return [];
  const db = await getDb();
  const all = await db.getAllFromIndex("plays_cache", "by-game", gameId);
  // Sort by sequence so the consumer doesn't have to.
  return all.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export async function deleteCachedPlay(id: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  await db.delete("plays_cache", id);
}

export async function updateCachedPlay(
  id: string,
  patch: Partial<PlayWithPlayers>,
): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  const existing = await db.get("plays_cache", id);
  if (!existing) return;
  await db.put("plays_cache", { ...existing, ...patch });
}

/* ── sync_queue ──────────────────────────────────────────────────────── */

function newQueueId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface EnqueueInsertParams {
  gameId: string;
  playId: string;
  play: PlayInsert;
  players: Array<Record<string, unknown>>;
}

export async function enqueueInsert(p: EnqueueInsertParams): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: newQueueId(),
    op: "insert",
    gameId: p.gameId,
    playId: p.playId,
    payload: { play: p.play, players: p.players },
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  };
  if (!isOfflineSupported()) return item;
  const db = await getDb();
  await db.put("sync_queue", item);
  return item;
}

/**
 * Cache the play AND its sync intent in one transaction — write-ahead.
 *
 * The old order was: cache the play, attempt the network, and only queue if
 * that attempt failed. Everything between the cache write and the queue write
 * was a window in which the play existed on the device and nowhere else: close
 * the tab, reload, run out of memory, have iOS reclaim the tab, and the play
 * was on screen but had no route to the server and no record that it was owed
 * one. A later online refresh could then hide it behind the server's list.
 *
 * Writing both stores in a single IndexedDB transaction removes the window
 * entirely: either the play is cached AND owed to the server, or neither
 * happened. The intent is deleted once the server has actually taken it, which
 * is the only moment it stops being true.
 */
export async function cachePlayWithIntent(
  play: PlayWithPlayers,
  params: EnqueueInsertParams,
): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: newQueueId(),
    op: "insert",
    gameId: params.gameId,
    playId: params.playId,
    payload: { play: params.play, players: params.players },
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  };
  if (!isOfflineSupported()) return item;

  const db = await getDb();
  const tx = db.transaction(["plays_cache", "sync_queue"], "readwrite");
  await Promise.all([
    tx.objectStore("plays_cache").put(play),
    tx.objectStore("sync_queue").put(item),
  ]);
  await tx.done;
  return item;
}

export interface EnqueueUpdateParams {
  gameId: string;
  playId: string;
  patch: Record<string, unknown>;
  playData?: Record<string, unknown>;
  /** Full replacement set of play_players rows. Only supply this when the edit
   *  actually re-tagged players — omitting it leaves existing tags untouched,
   *  while an empty array explicitly clears them. */
  players?: Array<Record<string, unknown>>;
}

export async function enqueueUpdate(p: EnqueueUpdateParams): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: newQueueId(),
    op: "update",
    gameId: p.gameId,
    playId: p.playId,
    payload: { patch: p.patch, playData: p.playData, players: p.players },
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  };
  if (!isOfflineSupported()) return item;
  const db = await getDb();
  await db.put("sync_queue", item);
  return item;
}

export interface EnqueueDeleteParams {
  gameId: string;
  playId: string;
}

export async function enqueueDelete(p: EnqueueDeleteParams): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: newQueueId(),
    op: "delete",
    gameId: p.gameId,
    playId: p.playId,
    payload: { id: p.playId },
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  };
  if (!isOfflineSupported()) return item;
  const db = await getDb();
  await db.put("sync_queue", item);
  return item;
}

/** Attempts after which automatic retry gives up and a human has to look. */
export const MAX_AUTO_ATTEMPTS = 5;

/** True once the drain has stopped retrying this on its own. */
export function isStuck(item: SyncQueueItem): boolean {
  return item.status === "failed" && item.attempts >= MAX_AUTO_ATTEMPTS;
}

/**
 * EVERY item still owed to the server for this game, stuck ones included.
 *
 * This is the honest answer to "what has not synced", and it is what the local
 * overlay must be built from: a play the drain gave up on is still a play that
 * exists only on this device, and dropping it from the overlay is how it
 * disappears from the operator's screen on the next refresh — the one failure
 * mode worse than not syncing.
 */
export async function getUnsyncedForGame(gameId: string): Promise<SyncQueueItem[]> {
  if (!isOfflineSupported()) return [];
  const db = await getDb();
  const all = await db.getAllFromIndex("sync_queue", "by-game", gameId);
  // Play edits used to be filed under an empty gameId, which no per-game drain
  // could ever match. Ops are keyed by playId and idempotent, so sweep those
  // orphans along with whatever game is open.
  const orphaned = gameId ? await db.getAllFromIndex("sync_queue", "by-game", "") : [];
  return [...all, ...orphaned].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * What the drain is allowed to pick up.
 *
 * Same list minus the ones it has already given up on — unless `includeStuck`,
 * which is the operator explicitly asking. The Stuck badge used to call a drain
 * that could no longer select the very items it was complaining about, so
 * tapping it did nothing, forever.
 */
export async function getDrainableForGame(
  gameId: string,
  opts: { includeStuck?: boolean } = {},
): Promise<SyncQueueItem[]> {
  const all = await getUnsyncedForGame(gameId);
  return opts.includeStuck ? all : all.filter((i) => !isStuck(i));
}

/**
 * Which plays for this game still have unpushed work, split by intent.
 *
 * A server read is not the whole truth while the queue is non-empty: the
 * server has not seen a queued insert, still holds the pre-edit row for a
 * queued update, and still holds a row that was deleted offline. Callers
 * merging a server list with local state need to know which ids to override,
 * and in which direction. See `loadGamePlays`.
 */
export async function getQueuedPlayIds(
  gameId: string,
): Promise<{ upserts: Set<string>; deletes: Set<string> }> {
  const upserts = new Set<string>();
  const deletes = new Set<string>();
  if (!isOfflineSupported()) return { upserts, deletes };

  // Oldest first, so a delete queued after an edit wins — and an insert queued
  // after a delete (same id re-added) wins right back.
  for (const item of await getUnsyncedForGame(gameId)) {
    if (item.op === "delete") {
      deletes.add(item.playId);
      upserts.delete(item.playId);
    } else {
      upserts.add(item.playId);
      deletes.delete(item.playId);
    }
  }
  return { upserts, deletes };
}

/**
 * Outstanding work across all games, EXCLUDING the stuck ones (which are
 * reported separately by getStuckCount).
 *
 * This used to count only pending+syncing, so a single server rejection moved
 * an item to `failed` and it vanished: the badge went green, and the retry
 * timer — which stands down when this reaches zero — stopped. The play was
 * still on the device, still absent from the server, and nothing said so. A
 * failed item that has not exhausted its attempts is outstanding work and is
 * counted here.
 */
export async function getPendingCount(): Promise<number> {
  if (!isOfflineSupported()) return 0;
  const db = await getDb();
  const pending = await db.getAllFromIndex("sync_queue", "by-status", "pending");
  const syncing = await db.getAllFromIndex("sync_queue", "by-status", "syncing");
  const failed = await db.getAllFromIndex("sync_queue", "by-status", "failed");
  return pending.length + syncing.length + failed.filter((i) => !isStuck(i)).length;
}

/**
 * Hand the stuck items one more chance, as a fresh start rather than a sixth
 * attempt — the operator asking is new information (they may have just fixed
 * whatever the server was objecting to).
 */
export async function resetStuckForGame(gameId: string): Promise<number> {
  if (!isOfflineSupported()) return 0;
  const db = await getDb();
  const items = (await getUnsyncedForGame(gameId)).filter(isStuck);
  const tx = db.transaction("sync_queue", "readwrite");
  for (const item of items) {
    await tx.store.put({ ...item, status: "pending", attempts: 0 });
  }
  await tx.done;
  return items.length;
}

export async function markSyncing(queueId: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  const item = await db.get("sync_queue", queueId);
  if (!item) return;
  item.status = "syncing";
  item.attempts += 1;
  await db.put("sync_queue", item);
}

/** Successfully synced — remove from queue. */
export async function markSynced(queueId: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  await db.delete("sync_queue", queueId);
}

export async function markFailed(queueId: string, error: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  const item = await db.get("sync_queue", queueId);
  if (!item) return;
  item.status = "failed";
  item.lastError = error;
  await db.put("sync_queue", item);
}

/**
 * A push that failed for a reason retrying can fix — the network was down.
 *
 * Returns the item to `pending` and refunds the attempt `markSyncing` spent.
 * Without the refund a long dead spot burns through the five-attempt cap in a
 * couple of minutes, the drain stops selecting the item, and the play
 * never syncs again even once service is back.
 */
export async function markRetryable(queueId: string, error: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  const item = await db.get("sync_queue", queueId);
  if (!item) return;
  item.status = "pending";
  item.lastError = error;
  item.attempts = Math.max(0, item.attempts - 1);
  await db.put("sync_queue", item);
}

/**
 * Items the drain has given up on — rejected five times for a reason the
 * network can't explain. They are still on disk, but no drain will retry them,
 * so nothing else will ever tell the operator these plays are not on the
 * server. The badge has to.
 */
export async function getStuckCount(): Promise<number> {
  if (!isOfflineSupported()) return 0;
  const db = await getDb();
  const failed = await db.getAllFromIndex("sync_queue", "by-status", "failed");
  return failed.filter(isStuck).length;
}

/** Manual reset: clears all queue items for a game. Use sparingly — destructive. */
export async function clearQueueForGame(gameId: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  const tx = db.transaction("sync_queue", "readwrite");
  const items = await tx.store.index("by-game").getAll(gameId);
  await Promise.all(items.map((i) => tx.store.delete(i.id)));
  await tx.done;
}

/* ── purge helpers ───────────────────────────────────────────────────── */

/**
 * Drop every cached play AND every queued op for one game.
 *
 * Call this whenever a game is deleted server-side. Clearing the queue is the
 * important half: a leftover pending insert would otherwise replay against a
 * game that no longer exists and resurrect orphaned rows.
 */
export async function clearGameCache(gameId: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  const tx = db.transaction(["plays_cache", "sync_queue"], "readwrite");
  const playsStore = tx.objectStore("plays_cache");
  const queueStore = tx.objectStore("sync_queue");

  const [plays, queued] = await Promise.all([
    playsStore.index("by-game").getAll(gameId),
    queueStore.index("by-game").getAll(gameId),
  ]);

  await Promise.all([
    ...plays.map((p) => playsStore.delete(p.id)),
    ...queued.map((i) => queueStore.delete(i.id)),
  ]);
  await tx.done;
}

/** Wipe every offline store on this device. Destructive — unsynced work is lost. */
export async function clearAllOfflineData(): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  const tx = db.transaction(["plays_cache", "sync_queue", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("plays_cache").clear(),
    tx.objectStore("sync_queue").clear(),
    tx.objectStore("meta").clear(),
  ]);
  await tx.done;
}

/* ── meta ────────────────────────────────────────────────────────────── */

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  if (!isOfflineSupported()) return undefined;
  const db = await getDb();
  const row = await db.get("meta", key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  await db.put("meta", { key, value });
}

export async function deleteMeta(key: string): Promise<void> {
  if (!isOfflineSupported()) return;
  const db = await getDb();
  await db.delete("meta", key);
}
