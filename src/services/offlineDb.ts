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

/** Read all pending+syncing items for a game, oldest first. */
export async function getQueueForGame(gameId: string): Promise<SyncQueueItem[]> {
  if (!isOfflineSupported()) return [];
  const db = await getDb();
  const all = await db.getAllFromIndex("sync_queue", "by-game", gameId);
  // Play edits used to be filed under an empty gameId, which no per-game drain
  // could ever match. Ops are keyed by playId and idempotent, so sweep those
  // orphans along with whatever game is open.
  const orphaned = gameId ? await db.getAllFromIndex("sync_queue", "by-game", "") : [];
  return [...all, ...orphaned]
    .filter((i) => i.status !== "failed" || i.attempts < 5)
    .sort((a, b) => a.createdAt - b.createdAt);
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
  for (const item of await getQueueForGame(gameId)) {
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

/** Count pending/syncing items across all games. */
export async function getPendingCount(): Promise<number> {
  if (!isOfflineSupported()) return 0;
  const db = await getDb();
  const pending = await db.getAllFromIndex("sync_queue", "by-status", "pending");
  const syncing = await db.getAllFromIndex("sync_queue", "by-status", "syncing");
  return pending.length + syncing.length;
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
 * couple of minutes, `getQueueForGame` stops returning the item, and the play
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
  return failed.filter((i) => i.attempts >= 5).length;
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
