/**
 * Sync worker — drains the pending queue against Supabase.
 *
 * Triggered:
 *   - on browser "online" event
 *   - on tab focus / visibilitychange → visible
 *   - on a self-rescheduling retry timer, while anything is pending
 *   - manually via drainQueue() called from a Sync Now button
 *
 * The timer is the one that matters in a press box. `navigator.onLine` means
 * "there is a network interface", not "the internet is reachable", so on one
 * bar of service it frequently never flips to false — no "offline" event, and
 * therefore no "online" event when service actually returns. Without a timer
 * the queue then sits untouched until the operator happens to lock and unlock
 * the tablet, which can be a whole quarter.
 *
 * Idempotency: insert ops carry a client-generated UUID. Supabase will
 * upsert on that id (see schema note in Phase 4 commit message). If the
 * row already exists, the upsert is a no-op and we mark the queue entry
 * synced. Update / delete ops are also idempotent against id.
 */

import { supabase } from "@/lib/supabase";
import {
  getQueueForGame,
  markSyncing,
  markSynced,
  markFailed,
  markRetryable,
  getPendingCount,
  getStuckCount,
  isOfflineSupported,
  type SyncQueueItem,
} from "./offlineDb";

export interface SyncResult {
  drained: number;
  failed: number;
  remaining: number;
}

/** Why a single push stopped.
 *  - ok        → server took it, drop it from the queue
 *  - network   → nothing wrong with the row; the network is. Stop the drain.
 *  - rejected  → the server refused this specific row. Skip it, keep going. */
type PushOutcome = "ok" | "network" | "rejected";

let _draining = false;
const _listeners = new Set<(status: SyncStatus) => void>();

export interface SyncStatus {
  online: boolean;
  draining: boolean;
  pending: number;
  /** Ops the drain has given up on. Never zero-out silently — these are plays
   *  that are not on the server and never will be without intervention. */
  stuck: number;
  /** When the queue last went from empty to non-empty. Lets the UI escalate
   *  from "syncing, relax" to "this has been stuck a while, look at me". */
  pendingSince: number | null;
  lastError?: string;
}

let _status: SyncStatus = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  draining: false,
  pending: 0,
  stuck: 0,
  pendingSince: null,
};

function emit() {
  for (const fn of _listeners) {
    try { fn({ ..._status }); } catch (err) { console.warn("sync listener threw", err); }
  }
}

export function subscribeSyncStatus(fn: (status: SyncStatus) => void): () => void {
  _listeners.add(fn);
  // Fire immediately with current state.
  fn({ ..._status });
  return () => { _listeners.delete(fn); };
}

export function getSyncStatus(): SyncStatus {
  return { ..._status };
}

async function refreshPendingCount() {
  const previous = _status.pending;
  _status.pending = await getPendingCount();
  _status.stuck = await getStuckCount();
  if (_status.pending === 0) _status.pendingSince = null;
  else if (previous === 0) _status.pendingSince = Date.now();
  emit();
  scheduleRetry();
}

/* ── retry timer ─────────────────────────────────────────────────────── */

const RETRY_BASE_MS = 20_000;
const RETRY_MAX_MS = 2 * 60_000;

let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _retryDelay = RETRY_BASE_MS;
/** Set by setupAutoDrain — the timer has no other way to know which game is
 *  open, and drains are per-game. */
let _getGameId: (() => string | null) | null = null;

function clearRetry() {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
}

/** (Re)arm the retry while work is outstanding; stand down when it is not. */
function scheduleRetry() {
  clearRetry();
  if (!_getGameId || _status.pending === 0) {
    _retryDelay = RETRY_BASE_MS;
    return;
  }
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    void (async () => {
      const gameId = _getGameId?.() ?? null;
      if (gameId) {
        const before = _status.pending;
        const result = await drainQueue(gameId);
        // Progress resets the cadence; a stall backs it off, so a long dead
        // spot is not a doomed request every 20s for an entire quarter.
        _retryDelay = result.drained > 0 || result.remaining < before
          ? RETRY_BASE_MS
          : Math.min(_retryDelay * 2, RETRY_MAX_MS);
      }
      // Always re-arm: drainQueue bails early when it believes it is offline,
      // and that early return must not be what ends the retry chain.
      scheduleRetry();
    })();
  }, _retryDelay);
}

/**
 * Did this fail because the network is unreachable, or because the server
 * looked at the row and said no?
 *
 * It decides whether the drain stops (and retries the same item later) or
 * skips ahead. Fetch failures surface as a thrown TypeError, as an abort from
 * the client's request timeout, or as a PostgREST error whose message carries
 * the underlying fetch text — so match on the message rather than the shape.
 */
function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    message.includes("failed to fetch")
    || message.includes("fetch failed")
    || message.includes("networkerror")
    || message.includes("network request failed")
    || message.includes("load failed")
    || message.includes("aborted")
    || message.includes("timeout")
    || message.includes("timed out")
    || message.includes("gateway")
    || message.includes("service unavailable")
  );
}

/** Record a failed push and classify it. */
async function failItem(item: SyncQueueItem, err: unknown): Promise<PushOutcome> {
  const message = err instanceof Error ? err.message : String(err);
  _status.lastError = message;
  if (isNetworkFailure(err)) {
    await markRetryable(item.id, message);
    return "network";
  }
  await markFailed(item.id, message);
  return "rejected";
}

/** Push a single queue item to Supabase. */
async function pushItem(item: SyncQueueItem): Promise<PushOutcome> {
  try {
    await markSyncing(item.id);

    if (item.op === "insert") {
      const { play, players } = item.payload;
      // Upsert by id — duplicates from retries become no-ops.
      const { error: playErr } = await supabase
        .from("plays")
        .upsert(play, { onConflict: "id" });
      if (playErr) return await failItem(item, playErr);
      if (Array.isArray(players) && players.length > 0) {
        // play_players: composite (play_id, role, player_id) is generally unique.
        // We delete existing rows for this play first to avoid stale tags from a
        // previous half-synced state, then insert fresh.
        await supabase.from("play_players").delete().eq("play_id", item.playId);
        const { error: ppErr } = await supabase.from("play_players").insert(players);
        if (ppErr) return await failItem(item, ppErr);
      }
      await markSynced(item.id);
      return "ok";
    }

    if (item.op === "update") {
      const { patch, playData, players } = item.payload;
      const update: Record<string, unknown> = { ...patch };
      if (playData !== undefined) update.play_data = playData;
      const { error } = await supabase.from("plays").update(update).eq("id", item.playId);
      if (error) return await failItem(item, error);
      // A full play edit can re-tag who was involved, so the queued update
      // carries the replacement roster. Absent `players` this was a
      // situation-only patch and existing tags must survive untouched.
      if (Array.isArray(players)) {
        await supabase.from("play_players").delete().eq("play_id", item.playId);
        if (players.length > 0) {
          const { error: ppErr } = await supabase.from("play_players").insert(players);
          if (ppErr) return await failItem(item, ppErr);
        }
      }
      await markSynced(item.id);
      return "ok";
    }

    if (item.op === "delete") {
      await supabase.from("play_players").delete().eq("play_id", item.playId);
      const { error } = await supabase.from("plays").delete().eq("id", item.playId);
      if (error) return await failItem(item, error);
      await markSynced(item.id);
      return "ok";
    }

    await markFailed(item.id, `Unknown op: ${item.op}`);
    return "rejected";
  } catch (err) {
    return await failItem(item, err);
  }
}

/**
 * Drain pending ops for a specific game. Returns when the queue is empty or
 * the network stops us.
 */
export async function drainQueue(gameId: string): Promise<SyncResult> {
  if (!isOfflineSupported() || _draining) {
    return { drained: 0, failed: 0, remaining: await getPendingCount() };
  }
  if (!navigator.onLine) {
    return { drained: 0, failed: 0, remaining: await getPendingCount() };
  }

  _draining = true;
  _status.draining = true;
  emit();

  let drained = 0;
  let failed = 0;
  try {
    // A row the server rejects is no reason to strand every play behind it, so
    // skip past it and keep pushing. It stays queued, and `stuck` surfaces it.
    const skipped = new Set<string>();
    while (navigator.onLine) {
      const queue = await getQueueForGame(gameId);
      const item = queue.find((i) => !skipped.has(i.id));
      if (!item) break;

      const outcome = await pushItem(item);
      if (outcome === "ok") {
        drained++;
      } else {
        failed++;
        // The network is down: everything behind this fails the same way, and
        // hammering it just burns battery. Stop; the retry timer picks it up.
        if (outcome === "network") break;
        skipped.add(item.id);
      }
    }
  } finally {
    _draining = false;
    _status.draining = false;
    await refreshPendingCount();
  }

  return { drained, failed, remaining: _status.pending };
}

/** Wire up automatic drain triggers. Call once from a top-level effect. */
export function setupAutoDrain(getGameId: () => string | null) {
  _getGameId = getGameId;

  const trigger = () => {
    const gameId = getGameId();
    if (gameId) void drainQueue(gameId);
  };

  const onOnline = () => {
    _status.online = true;
    emit();
    trigger();
  };
  const onOffline = () => {
    _status.online = false;
    emit();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible" && navigator.onLine) trigger();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibility);

  // Initial pending count — also arms the retry timer if the last session left
  // work behind.
  void refreshPendingCount();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibility);
    clearRetry();
    _getGameId = null;
  };
}

/** Public helper so any code that just wrote to the queue can update the
 *  badge count without forcing a full drain. */
export async function refreshSyncStatus(): Promise<void> {
  _status.online = typeof navigator !== "undefined" ? navigator.onLine : true;
  await refreshPendingCount();
}
