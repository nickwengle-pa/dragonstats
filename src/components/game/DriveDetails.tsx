import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { fmtClock, quarterLabel, type PlayRecord } from "./types";
import type { LiveDriveRow } from "@/services/liveDriveRows";
import { OffensivePlayBadge, PlayTacklers } from "./PlayRowDetails";

export default function DriveDetails({ drive, plays, team, onClose }: {
  drive: LiveDriveRow; plays: PlayRecord[]; team: string; onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // Close is the only interactive control in this read-only popup.
      if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); previous?.focus(); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/75 p-2" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="drive-details-title" onClick={event => event.stopPropagation()} className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-2xl border border-slate-600 bg-slate-950 text-slate-100 shadow-2xl">
        <header className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <h2 id="drive-details-title" className="font-bold flex-1">{team} drive</h2>
            <button ref={closeButton} onClick={onClose} aria-label="Close drive details" className="p-2"><X className="h-5 w-5" /></button>
          </div>
          <p className="text-sm font-semibold tabular-nums">{drive.plays} {drive.plays === 1 ? "play" : "plays"} · {drive.yards} yards · TOP {fmtClock(drive.seconds)}</p>
        </header>
        <div className="p-4 space-y-2 overflow-y-auto">
          <p className="text-xs text-slate-400">Plays in game order</p>
          {plays.map(play => <article key={play.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
            <p className="text-xs text-slate-400 tabular-nums">{quarterLabel(play.quarter)} · {fmtClock(play.clock)}{play.type !== "timeout" ? ` · Down ${play.down} & ${play.distance}` : ""}</p>
            <p className="mt-1 text-sm font-semibold">{play.description}</p>
            <div className="mt-1 text-xs text-slate-300"><OffensivePlayBadge play={play} /><PlayTacklers play={play} /></div>
          </article>)}
        </div>
      </section>
    </div>, document.body,
  );
}
