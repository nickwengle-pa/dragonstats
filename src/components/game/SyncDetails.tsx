import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw } from "lucide-react";
import { getSyncDetails, isStuck } from "@/services/offlineDb";
import { drainQueue, subscribeSyncStatus } from "@/services/syncWorker";
import { syncOperationLabel, syncPlayDetails } from "@/services/syncDetails";
import { quarterLabel } from "./types";

export default function SyncDetails({ gameId, onClose }: { gameId: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getSyncDetails>>>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [draining, setDraining] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const load = async () => {
      const current = ++revision;
      try {
        const details = await getSyncDetails();
        if (alive && current === revision) { setRows(details); setError(""); setLoading(false); }
      } catch { if (alive) { setError("Could not read saved sync details. Close and try again."); setLoading(false); } }
    };
    const unsubscribe = subscribeSyncStatus(status => {
      setOnline(status.online);
      setDraining(status.draining);
      void load();
    });
    void load();
    const guard = (event: Event) => event.preventDefault();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("app:before-refresh", guard);
    window.addEventListener("keydown", key);
    return () => { alive = false; unsubscribe(); window.removeEventListener("app:before-refresh", guard); window.removeEventListener("keydown", key); };
  }, [onClose]);

  const retry = async () => {
    setRetrying(true);
    setError("");
    try {
      for (const id of new Set(rows.map(row => row.item.gameId))) await drainQueue(id, { includeStuck: true });
      setRows(await getSyncDetails());
    } catch { setError("Retry could not finish. Your queued changes are still on this device."); }
    finally { setRetrying(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black/75 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="sync-details-title" className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-2xl border border-slate-600 bg-slate-950 text-slate-100 shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex items-center gap-3 p-4 border-b border-slate-700">
          <h2 id="sync-details-title" className="font-bold flex-1">Pending & stuck changes</h2>
          <button onClick={onClose} aria-label="Close sync details" className="p-2"><X className="w-5 h-5" /></button>
        </header>
        <div className="overflow-y-auto p-4 space-y-3">
          <p className="text-sm text-slate-300">These changes are saved on this device. Retry sync first—entering a play again could create a duplicate when the original syncs.</p>
          {loading && <p role="status">Loading saved changes…</p>}
          {!loading && !rows.length && !error && <p className="text-emerald-400" role="status">All changes are synced.</p>}
          {error && <p role="alert" className="text-red-300">{error}</p>}
          {[...rows].sort((a, b) => Number(b.item.gameId === gameId) - Number(a.item.gameId === gameId)).map(({ item, play: cached, opponent, date }) => {
            const play = syncPlayDetails(item, cached);
            const stuck = isStuck(item);
            return <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-2">
              <div className="flex justify-between gap-2 text-xs font-bold">
                <span>{syncOperationLabel[item.op]}</span>
                <span className={stuck ? "text-red-300" : "text-amber-300"}>{stuck ? "Stuck" : item.status === "syncing" ? "Syncing" : "Pending"}</span>
              </div>
              <div className="text-xs text-slate-400">{item.gameId === gameId ? "This game" : opponent ? `vs ${opponent}` : "Other game"}{date ? ` · ${date}` : ""}</div>
              {play ? <>
                <div className="text-sm font-bold">{play.sequence != null ? `Play #${play.sequence} · ` : ""}{play.quarter != null ? `${quarterLabel(play.quarter)} · ` : ""}{play.clock ?? "Clock not available"}</div>
                <p className="text-sm">{play.description || play.play_type?.replace(/_/g, " ") || "Play details unavailable"}</p>
                <p className="text-xs text-slate-300">
                  {play.possession ? (play.possession === "us" ? "Our possession · " : "Opponent possession · ") : ""}
                  {play.down != null ? `Down ${play.down} & ${play.distance ?? "?"} · ` : ""}
                  {play.yard_line != null ? `Spot ${play.yard_line <= 50 ? `Own ${play.yard_line}` : `Opp ${100 - play.yard_line}`} · ` : ""}
                  {play.yards_gained != null ? `${play.yards_gained} yards` : ""}
                </p>
              </> : <p className="text-sm">A score, clock, situation, or game-status update—not a missing play.</p>}
              {item.lastError && <p className="text-xs text-red-300 break-words">Last sync error: {item.lastError}</p>}
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer">Full saved details · {item.attempts} sync attempts</summary>
                <p className="break-all mt-2">{play ? `Play ID: ${item.playId}` : `Game ID: ${item.gameId}`}</p>
                <pre className="mt-2 whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(play ? { ...play, players: item.payload?.players ?? cached?.play_players } : item.payload?.patch, null, 2)}</pre>
              </details>
            </article>;
          })}
        </div>
        <footer className="p-4 border-t border-slate-700">
          <button onClick={retry} disabled={!online || retrying || draining || !rows.length} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${retrying || draining ? "animate-spin" : ""}`} />
            {!online ? "Offline — retry when connected" : retrying || draining ? "Syncing…" : "Retry sync"}
          </button>
        </footer>
      </section>
    </div>, document.body,
  );
}
