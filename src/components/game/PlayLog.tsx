import { X, Pencil, RotateCcw } from "lucide-react";
import { fmtClock, quarterLabel, yardLabel, type PlayRecord } from "./types";

interface Props {
  plays: PlayRecord[];
  onEdit: (play: PlayRecord) => void;
  onUndo: () => void;
  onClose: () => void;
}

const PLAY_ICONS: Record<string, string> = {
  rush: "\u25B6",
  pass_comp: "\u2714",
  pass_inc: "\u2718",
  sack: "\u2193",
  fumble: "\u21BB",
  int: "\u25CF",
  kickoff: "\u26A1",
  punt: "\u2191",
  fg: "\u2605",
  pat: "\u2713",
  two_pt: "\u2161",
  safety: "\u25B2",
  penalty_only: "\u2691",
  timeout: "TO",
};

const PLAY_ICON_COLORS: Record<string, string> = {
  rush: "text-emerald-400",
  pass_comp: "text-blue-400",
  pass_inc: "text-red-400",
  sack: "text-red-400",
  fumble: "text-orange-400",
  int: "text-red-500",
  kickoff: "text-amber-400",
  punt: "text-purple-400",
  fg: "text-amber-400",
  pat: "text-emerald-400",
  two_pt: "text-blue-400",
  safety: "text-amber-500",
  penalty_only: "text-orange-400",
  timeout: "text-amber-300",
};

export default function PlayLog({ plays, onEdit, onUndo, onClose }: Props) {
  return (
    <div className="sheet bg-black/80">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <h2 className="text-lg font-display font-extrabold uppercase tracking-[0.1em]">Play Log <span className="text-surface-muted font-semibold text-sm">({plays.length})</span></h2>
          <div className="flex items-center gap-2">
            {plays.length > 0 && (
              <button onClick={onUndo} className="text-[10px] font-display font-bold text-red-400 flex items-center gap-1 uppercase tracking-wider cursor-pointer">
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
            )}
            <button onClick={onClose} className="btn-ghost p-1.5 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {plays.length === 0 ? (
            <div className="text-sm text-surface-muted text-center py-8 font-body">No plays recorded yet.</div>
          ) : (
            [...plays].reverse().map((play, i) => {
              const isLast = i === 0;
              return (
                <div
                  key={play.id}
                  className={`flex items-start gap-2 rounded-xl px-3 py-2 border transition-colors ${
                    isLast ? "border-dragon-primary/30 bg-dragon-primary/5" : "border-surface-border bg-surface-card"
                  }`}
                >
                  <span className={`text-xs mt-1 font-bold ${PLAY_ICON_COLORS[play.type] ?? "text-surface-muted"}`}>
                    {PLAY_ICONS[play.type] ?? "\u25B8"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-body font-semibold truncate">{play.description}</div>
                    <div className="text-[10px] text-surface-muted mt-0.5 font-body">
                      {quarterLabel(play.quarter)} · {fmtClock(play.clock)} · {play.down}{play.down === 1 ? "st" : play.down === 2 ? "nd" : play.down === 3 ? "rd" : "th"}&{play.distance} · {yardLabel(play.ballOn)}
                      {play.possession === "them" && " (DEF)"}
                    </div>
                    {play.offensiveFormation && (
                      <div className="text-[10px] text-blue-500/70 mt-0.5 font-body">{play.offensiveFormation} vs {play.defensiveFormation ?? "\u2014"}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <div className={`text-xs font-display font-extrabold tabular-nums ${
                      play.type === "timeout"
                        ? "text-amber-300"
                        : play.yards > 0
                          ? "text-emerald-400"
                          : play.yards < 0
                            ? "text-red-400"
                            : "text-surface-muted"
                    }`}>
                      {play.type === "timeout" ? "TO" : play.yards > 0 ? `+${play.yards}` : play.yards === 0 ? "0" : play.yards}
                    </div>
                    {play.isTouchdown && <span className="text-[10px] font-display font-bold text-amber-400 uppercase tracking-wider">TD</span>}
                    {play.penalty && <span className="text-[10px] font-display font-bold text-orange-400 uppercase tracking-wider">PEN</span>}
                  </div>
                  {play.type !== "timeout" && (
                    <button onClick={() => onEdit(play)} className="btn-ghost p-1 text-surface-muted/40 mt-0.5 cursor-pointer">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
