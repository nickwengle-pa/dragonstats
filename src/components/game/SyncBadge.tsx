import { useCallback, useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { subscribeSyncStatus, type SyncStatus } from "@/services/syncWorker";
import SyncDetails from "./SyncDetails";

interface Props {
  gameId: string | null;
}

/** How long a play may sit unsynced before the badge stops being polite.
 *  Under this, a red badge would cry wolf on every ordinary hiccup; over it,
 *  something is actually wrong and the operator needs to know before the
 *  drive ends, not after the game. */
const NAG_AFTER_MS = 60_000;

/**
 * Compact sync indicator. Opens details before the operator chooses to retry.
 * - Green cloud    → online and queue is empty
 * - Amber spinning → currently draining
 * - Amber          → pending, but recently so
 * - Red            → offline, or pending long enough to worry about
 * - Red triangle   → the drain gave up; these plays are not on the server
 */
export default function SyncBadge({ gameId }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const closeDetails = useCallback(() => setShowDetails(false), []);
  const [status, setStatus] = useState<SyncStatus>({
    online: navigator.onLine,
    draining: false,
    pending: 0,
    stuck: 0,
    pendingSince: null,
  });
  /* `pendingSince` is a timestamp, so nothing re-renders as it ages. Tick
     while something is outstanding so the badge can escalate on its own. */
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeSyncStatus(setStatus);
    return () => { unsub(); };
  }, []);

  const waiting = status.pendingSince !== null;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, [waiting]);

  const onClick = () => setShowDetails(true);

  const isOffline = !status.online;
  const hasPending = status.pending > 0;
  const hasStuck = status.stuck > 0;
  const overdue =
    status.pendingSince !== null && Date.now() - status.pendingSince > NAG_AFTER_MS;

  const GREEN = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  const AMBER = "text-amber-400 bg-amber-500/10 border-amber-500/30";
  const RED = "text-red-400 bg-red-500/10 border-red-500/30";

  let icon = <Cloud className="w-3.5 h-3.5" />;
  let label = "Synced";
  let cls = GREEN;
  let title = "All plays synced to the server.";
  let pulse = false;

  if (hasStuck) {
    /* Ranked above everything else, including offline. A stuck op is the only
       state that will not fix itself, and the badge is the sole place it
       surfaces — `pending` does not count these. */
    icon = <AlertTriangle className="w-3.5 h-3.5" />;
    label = `Stuck ${status.stuck}`;
    cls = RED;
    pulse = true;
    title =
      `${status.stuck} saved ${status.stuck === 1 ? "change needs" : "changes need"} attention. ` +
      `They are still saved on this device. ` +
      (status.lastError ? `Last error: ${status.lastError}` : "");
  } else if (status.draining) {
    icon = <RefreshCw className="w-3.5 h-3.5 animate-spin" />;
    label = `Sync ${status.pending}`;
    cls = AMBER;
    title = `Syncing ${status.pending} pending operations...`;
  } else if (isOffline) {
    icon = <CloudOff className="w-3.5 h-3.5" />;
    label = hasPending ? `Off · ${status.pending}` : "Offline";
    cls = RED;
    title = hasPending
      ? `Offline. ${status.pending} changes queued — will sync when you reconnect.`
      : "Offline. Plays save locally and sync when you reconnect.";
  } else if (hasPending) {
    icon = overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />;
    label = `${status.pending} pending`;
    cls = overdue ? RED : AMBER;
    pulse = overdue;
    title = overdue
      ? `${status.pending} changes have been waiting over a minute. They are saved on this device.`
      : `${status.pending} changes waiting to sync.`;
  }

  /* "Synced" says nothing the green cloud does not, and it costs ~40px of a
     375px header. Every other state carries a COUNT, which the icon cannot
     show, so those keep their label at every width. */
  const labelEarnsItsWidth = status.draining || isOffline || hasPending || hasStuck;

  return (
    <>
    <button
      onClick={onClick}
      title={`${title} Tap to view sync details.`}
      aria-label={`${label}. View sync details`}
      className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-display font-bold uppercase tracking-wider transition-colors cursor-pointer ${cls} ${pulse ? "animate-pulse" : ""}`}
    >
      {icon}
      <span className={labelEarnsItsWidth ? undefined : "hidden lg:inline"}>{label}</span>
    </button>
    {showDetails && <SyncDetails gameId={gameId} onClose={closeDetails} />}
    </>
  );
}
