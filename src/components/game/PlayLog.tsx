import { X, Pencil, RotateCcw, Footprints, Target, XCircle, Shield, RefreshCw, CircleDot, Zap, ArrowUpFromLine, Trophy, Check, Hash, AlertTriangle, Flag, Play } from "lucide-react";
import { fmtClock, quarterLabel, yardLabel, type PlayRecord } from "./types";

interface Props {
  plays: PlayRecord[];
  onEdit: (play: PlayRecord) => void;
  onUndo: () => void;
  onClose: () => void;
}

const PLAY_ICON_MAP: Record<string, { icon: typeof Play; color: string }> = {
  rush: { icon: Footprints, color: "text-emerald-400" },
  pass_comp: { icon: Target, color: "text-blue-400" },
  pass_inc: { icon: XCircle, color: "text-red-400" },
  sack: { icon: Shield, color: "text-orange-400" },
  fumble: { icon: RefreshCw, color: "text-amber-400" },
  int: { icon: CircleDot, color: "text-red-500" },
  kickoff: { icon: Zap, color: "text-cyan-400" },
  punt: { icon: ArrowUpFromLine, color: "text-purple-400" },
  fg: { icon: Trophy, color: "text-yellow-400" },
  pat: { icon: Check, color: "text-green-400" },
  two_pt: { icon: Hash, color: "text-blue-400" },
  safety: { icon: AlertTriangle, color: "text-amber-500" },
  penalty_only: { icon: Flag, color: "text-orange-400" },
};

function PlayIcon({ type }: { type: string }) {
  const entry = PLAY_ICON_MAP[type];
  if (!entry) return <Play className="w-3.5 h-3.5 text-slate-500" />;
  const Icon = entry.icon;
  return <Icon className={`w-3.5 h-3.5 ${entry.color}`} />;
}

export default function PlayLog({ plays, onEdit, onUndo, onClose }: Props) {
  return (
    <div className="sheet bg-black/60 backdrop-blur-sm">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <h2 className="text-lg font-black">Play Log ({plays.length})</h2>
          <div className="flex items-center gap-2">
            {plays.length > 0 && (
              <button onClick={onUndo} className="text-xs font-bold text-red-400 flex items-center gap-0.5">
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
            )}
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {plays.length === 0 ? (
            <div className="text-sm text-slate-600 text-center py-8">No plays recorded yet.</div>
          ) : (
            [...plays].reverse().map((play, i) => {
              const isLast = i === 0;
              return (
                <div
                  key={play.id}
                  className={`flex items-start gap-2 rounded-xl px-3 py-2 border transition-all duration-200 ${
                    isLast ? "border-dragon-primary/30 bg-dragon-primary/5 shadow-glow-sm" : "border-surface-border bg-surface-card"
                  }`}
                >
                  <PlayIcon type={play.type} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate text-slate-200">{play.description}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5 font-mono">
                      {quarterLabel(play.quarter)} · {fmtClock(play.clock)} · {play.down}{play.down === 1 ? "st" : play.down === 2 ? "nd" : play.down === 3 ? "rd" : "th"}&{play.distance} · {yardLabel(play.ballOn)}
                      {play.possession === "them" && " (DEF)"}
                    </div>
                    {play.offensiveFormation && (
                      <div className="text-[10px] text-blue-500/70 mt-0.5">{play.offensiveFormation} vs {play.defensiveFormation ?? "—"}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <div className={`text-xs font-black font-mono tabular-nums ${
                      play.yards > 0 ? "text-emerald-400" : play.yards < 0 ? "text-red-400" : "text-slate-500"
                    }`}>
                      {play.yards > 0 ? `+${play.yards}` : play.yards === 0 ? "0" : play.yards}
                    </div>
                    {play.isTouchdown && <span className="text-[10px] font-bold text-amber-400">TD</span>}
                    {play.penalty && <span className="text-[10px] font-bold text-orange-400">PEN</span>}
                  </div>
                  <button onClick={() => onEdit(play)} className="btn-ghost p-1 text-slate-600 mt-0.5 cursor-pointer hover:text-slate-400">
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
