import { fmtClock, type PlayRecord } from "./types";

export default function QuarterChangeRow({ play, pending }: { play: PlayRecord; pending?: boolean }) {
  return <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3" role="note">
    <span className="text-xs font-bold text-amber-400">PERIOD</span>
    <strong className="flex-1 text-sm">{play.description}</strong>
    <span className="text-xs text-surface-muted">{fmtClock(play.clock)}{pending ? " · queued" : ""}</span>
  </div>;
}
