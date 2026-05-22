/**
 * Sync worker — drains the pending queue against Supabase.
 *
 * Triggered:
 *   - on browser "online" event
 *   - on tab focus / visibilitychange → visible
 *   - manually via drainQueue() called from a Sync Now button
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
  getPendingCount,
  isOfflineSupported,
  type SyncQueueItem,
} from "./offlineDb";

export interface SyncResult {
  drained: number;
  failed: number;
  remaining: number;
}

let _draining = false;
const _listeners = new Set<(status: SyncStatus) => void>();

export interface SyncStatus {
  online: boolean;
  draining: boolean;
  pending: number;
  lastError?: string;
}

let _status: SyncStatus = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  draining: false,
  pending: 0,
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
  _status.pending = await getPendingCount();
  emit();
}

/** Push a single queue item to Supabase. Returns true if it succeeded
 *  (and should be removed from the queue), false otherwise. */
async function pushItem(item: SyncQueueItem): Promise<boolean> {
  try {
    await markSyncing(item.id);

    if (item.op === "insert") {
      const { play, players } = item.payload;
      // Upsert by id — duplicates from retries become no-ops.
      const { error: playErr } = await supabase
        .from("plays")
        .upsert(play, { onConflict: "id" });
      if (playErr) {
        await markFailed(item.id, playErr.message);
        return false;
      }
      if (Array.isArray(players) && players.length > 0) {
        // play_players: composite (play_id, role, player_id) is generally unique.
        // We delete existing rows for this play first to avoid stale tags from a
        // previous half-synced state, then insert fresh.
        await supabase.from("play_players").delete().eq("play_id", item.playId);
        const { error: ppErr } = await supabase.from("play_players").insert(players);
        if (ppErr) {
          await markFailed(item.id, ppErr.message);
          return false;
        }
      }
      await markSynced(item.id);
      return true;
    }

    if (item.op === "update") {
      const { patch, playData } = item.payload;
      const update: Record<string, unknown> = { ...patch };
      if (playData !== undefined) update.play_data = playData;
      const { error } = await supabase.from("plays").update(update).eq("id", item.playId);
      if (error) {
        await markFailed(item.id, error.message);
        return false;
      }
      await markSynced(item.id);
      return true;
    }

    if (item.op === "delete") {
      await supabase.from("play_players").delete().eq("play_id", item.playId);
      const { error } = await supabase.from("plays").delete().eq("id", item.playId);
      if (error) {
        await markFailed(item.id, error.message);
        return false;
      }
      await markSynced(item.id);
      return true;
    }

    await markFailed(item.id, `Unknown op: ${item.op}`);
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(item.id, msg);
    return false;
  }
}

/**
 * Drain pending ops for a specific game. Returns when the queue is empty or
 * a network error stops progress.
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
    let items = await getQueueForGame(gameId);
    while (items.length > 0 && navigator.onLine) {
      const item = items[0];
      const ok = await pushItem(item);
      if (ok) drained++;
      else {
        failed++;
        // Stop on first failure — likely a network or schema problem affects
        // the rest of the queue too. Operator can retry via Sync Now.
        break;
      }
      items = await getQueueForGame(gameId);
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
  const trigger = () => {
    const gid = getGameId();
    if (gid) void drainQueue(gid);
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

  // Initial pending count
  void refreshPendingCount();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Public helper so any code that just wrote to the queue can update the
 *  badge count without forcing a full drain. */
export async function refreshSyncStatus(): Promise<void> {
  _status.online = typeof navigator !== "undefined" ? navigator.onLine : true;
  await refreshPendingCount();
}
