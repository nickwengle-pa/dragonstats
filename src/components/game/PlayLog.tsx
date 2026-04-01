import { X, Pencil, RotateCcw } from "lucide-react";
import { fmtClock, yardLabel, QUARTER_LABELS, type PlayRecord } from "./types";

interface Props {
  plays: PlayRecord[];
  onEdit: (play: PlayRecord) => void;
  onUndo: () => void;
  onClose: () => void;
}

function playIcon(type: string): string {
  switch (type) {
    case "rush": return "🏃";
    case "pass_comp": return "🎯";
    case "pass_inc": return "❌";
    case "sack": return "🛡️";
    case "fumble": return "🔄";
    case "int": return "🔴";
    case "kickoff": return "⚡";
    case "punt": return "📤";
    case "fg": return "🏆";
    case "pat": return "✓";
    case "two_pt": return "②";
    case "safety": return "⚠️";
    case "penalty_only": return "🚩";
    default: return "▸";
  }
}

export default function PlayLog({ plays, onEdit, onUndo, onClose }: Props) {
  return (
    <div className="sheet bg-black/80">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <h2 className="text-lg font-black">Play Log ({plays.length})</h2>
          <div className="flex items-center gap-2">
            {plays.length > 0 && (
              <button onClick={onUndo} className="text-xs font-bold text-red-400 flex items-center gap-0.5">
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
            )}
            <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {plays.length === 0 ? (
            <div className="text-sm text-neutral-600 text-center py-8">No plays recorded yet.</div>
          ) : (
            [...plays].reverse().map((play, i) => {
              const isLast = i === 0;
              return (
                <div key={play.id}
                  className={`flex items-start gap-2 rounded-xl px-3 py-2 border transition-colors ${
                    isLast ? "border-dragon-primary/30 bg-dragon-primary/5" : "border-surface-border bg-surface-card"
                  }`}
                >
                  <span className="text-sm mt-0.5">{playIcon(play.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{play.description}</div>
                    <div className="text-[10px] text-neutral-600 mt-0.5">
                      {QUARTER_LABELS[play.quarter]} · {fmtClock(play.clock)} · {play.down}{play.down === 1 ? "st" : play.down === 2 ? "nd" : play.down === 3 ? "rd" : "th"}&{play.distance} · {yardLabel(play.ballOn)}
                      {play.possession === "them" && " (DEF)"}
                    </div>
                    {play.offensiveFormation && (
                      <div className="text-[10px] text-blue-500/70 mt-0.5">{play.offensiveFormation} vs {play.defensiveFormation ?? "—"}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <div className={`text-xs font-black tabular-nums ${
                      play.yards > 0 ? "text-emerald-400" : play.yards < 0 ? "text-red-400" : "text-neutral-500"
                    }`}>
                      {play.yards > 0 ? `+${play.yards}` : play.yards === 0 ? "0" : play.yards}
                    </div>
                    {play.isTouchdown && <span className="text-[10px] font-bold text-amber-400">TD</span>}
                    {play.penalty && <span className="text-[10px] font-bold text-orange-400">PEN</span>}
                  </div>
                  <button onClick={() => onEdit(play)} className="btn-ghost p-1 text-neutral-600 mt-0.5">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
