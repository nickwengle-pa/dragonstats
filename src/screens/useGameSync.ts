/* Keeping one game's screen in step with the server and the sync queue.
 * Moved out of GameScreen unchanged; the effects run in the same order. */
import { useEffect, useState, type MutableRefObject } from "react";
import { supabase } from "@/lib/supabase";
import { getUnsyncedForGame } from "@/services/offlineDb";
import { drainQueue, subscribeSyncStatus } from "@/services/syncWorker";

export function useGameSync({
  gameId,
  reload,
  knownPlayIds,
  isSubmitting,
}: {
  gameId: string | undefined;
  /** Reload the whole game from the server and the local cache. */
  reload: () => unknown;
  /** Plays this device already has, to ignore realtime echoes of its own writes. */
  knownPlayIds: MutableRefObject<Set<string>>;
  /** True while a play is being saved here; realtime refetches wait for it. */
  isSubmitting: MutableRefObject<boolean>;
}): { pendingPlayIds: Set<string> } {
  /* A queued edit the server rejected and the operator chose to discard:
     reload, so the screen stops showing what will never be saved. */
  useEffect(() => {
    const onDiscarded = (event: Event) => {
      const changedGame = (event as CustomEvent<{ gameId: string }>).detail.gameId;
      if (!changedGame || changedGame === gameId) void reload();
    };
    window.addEventListener("app:sync-discarded", onDiscarded);
    return () => window.removeEventListener("app:sync-discarded", onDiscarded);
  }, [gameId, reload]);

  /* One push on entry for this game. The online/visible triggers and the
     retry timer live at the app root now, so the queue keeps draining after
     the operator leaves this screen — marking a game final and walking away
     used to strand it until they wandered back in. */
  useEffect(() => {
    if (gameId && navigator.onLine) {
      void drainQueue(gameId);
    }
  }, [gameId]);

  /* Which plays are still pending in the queue (for per-row icons). */
  const [pendingPlayIds, setPendingPlayIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        // Unsynced, not merely drainable: a play the drain gave up on is
        // still only on this device and must keep its marker.
        const queue = await getUnsyncedForGame(gameId);
        if (cancelled) return;
        setPendingPlayIds(new Set(queue.map((i) => i.playId)));
      } catch { /* ignore */ }
    };
    void refresh();
    const unsub = subscribeSyncStatus(() => { void refresh(); });
    return () => { cancelled = true; unsub(); };
  }, [gameId]);

  /* Realtime — listen for plays changes from other devices.
     Requires the `plays` table to be in the supabase_realtime publication:
       ALTER PUBLICATION supabase_realtime ADD TABLE plays;
     If realtime isn't enabled, the subscription quietly does nothing and
     local-only entry still works. */
  useEffect(() => {
    if (!gameId) return;
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel(`game-plays:${gameId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "plays", filter: `game_id=eq.${gameId}` },
        (payload: { eventType?: string; new?: { id?: string }; old?: { id?: string } }) => {
          // Skip echoes of this device's own writes — refetching on our own
          // INSERT reloads live state from the (lagging) games row right after
          // every play, desyncing the situation panel mid-drive.
          const eventType = payload?.eventType;
          const newId = payload?.new?.id;
          const oldId = payload?.old?.id;
          if (eventType === "INSERT" && newId && knownPlayIds.current.has(newId)) return;
          if (eventType === "DELETE" && oldId && !knownPlayIds.current.has(oldId)) return;
          // Coalesce bursts (e.g. an UPDATE followed by linked INSERTs) into
          // one refetch — and skip while we're mid-submit on this device.
          if (isSubmitting.current) return;
          if (refetchTimer) clearTimeout(refetchTimer);
          refetchTimer = setTimeout(() => { reload(); }, 250);
        },
      )
      .subscribe();
    return () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      supabase.removeChannel(channel);
    };
  }, [gameId, reload, knownPlayIds, isSubmitting]);

  return { pendingPlayIds };
}
