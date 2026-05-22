import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { subscribeSyncStatus, drainQueue, type SyncStatus } from "@/services/syncWorker";

interface Props {
  gameId: string | null;
}

/**
 * Compact sync indicator + manual "Sync Now" trigger.
 * - Green cloud  → online and queue is empty
 * - Spinning     → currently draining
 * - Red cloud-off → offline OR pending items
 */
export default function SyncBadge({ gameId }: Props) {
  const [status, setStatus] = useState<SyncStatus>({ online: navigator.onLine, draining: false, pending: 0 });

  useEffect(() => {
    const unsub = subscribeSyncStatus(setStatus);
    return () => { unsub(); };
  }, []);

  const onClick = async () => {
    if (!gameId) return;
    if (!navigator.onLine) return;
    await drainQueue(gameId);
  };

  const isOffline = !status.online;
  const hasPending = status.pending > 0;

  let icon = <Cloud className="w-3.5 h-3.5" />;
  let label = "Synced";
  let cls = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  let title = "All plays synced to the server.";

  if (status.draining) {
    icon = <RefreshCw className="w-3.5 h-3.5 animate-spin" />;
    label = `Sync ${status.pending}`;
    cls = "text-amber-400 bg-amber-500/10 border-amber-500/30";
    title = `Syncing ${status.pending} pending operations...`;
  } else if (isOffline) {
    icon = <CloudOff className="w-3.5 h-3.5" />;
    label = hasPending ? `Off · ${status.pending}` : "Offline";
    cls = "text-red-400 bg-red-500/10 border-red-500/30";
    title = hasPending
      ? `Offline. ${status.pending} plays queued — will sync when you reconnect.`
      : "Offline. Plays save locally and sync when you reconnect.";
  } else if (hasPending) {
    icon = <RefreshCw className="w-3.5 h-3.5" />;
    label = `${status.pending} pending`;
    cls = "text-amber-400 bg-amber-500/10 border-amber-500/30";
    title = `${status.pending} plays waiting to sync. Tap to sync now.`;
  }

  return (
    <button
      onClick={onClick}
      disabled={status.draining || (!status.online && !hasPending)}
      title={title}
      className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-display font-bold uppercase tracking-wider transition-colors ${cls} ${
        status.draining || (!status.online && !hasPending) ? "" : "cursor-pointer"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
