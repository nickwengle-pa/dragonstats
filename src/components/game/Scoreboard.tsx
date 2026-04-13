import { Trophy } from "lucide-react";
import { fmtClock, quarterLabel, type GameState } from "./types";

interface Props {
  state: GameState;
  progName: string;
  oppName: string;
  primaryColor: string;
  progLogoUrl?: string | null;
  oppLogoUrl?: string | null;
  oppColor?: string;
  onCycleQuarter: () => void;
  onEditClock: () => void;
  onEndGame: () => void;
}

export default function Scoreboard({
  state,
  progName,
  oppName,
  primaryColor,
  progLogoUrl,
  oppLogoUrl,
  oppColor,
  onCycleQuarter,
  onEditClock,
  onEndGame,
}: Props) {
  const effOppColor = oppColor ?? "#6b7280";

  return (
    <div className="rounded-2xl border border-surface-border overflow-hidden" style={{ boxShadow: "0 2px 24px rgba(0,0,0,0.4)" }}>
      {/* Top gradient bar */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${primaryColor}, #f59e0b 50%, ${effOppColor})` }} />

      <div className="px-3 py-3" style={{ background: "linear-gradient(180deg, #111820, #0d1117)" }}>
        <div className="flex items-center gap-2">
          {/* Home team */}
          <div className="flex-1 flex items-center gap-2.5">
            {progLogoUrl ? (
              <img src={progLogoUrl} alt={progName} className="w-9 h-9 object-contain rounded-lg" />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-display font-black text-white italic shrink-0"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}aa)` }}
              >
                {progName.slice(0, 3).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[9px] font-display font-bold text-surface-muted uppercase tracking-widest truncate">
                {progName}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-display font-extrabold tabular-nums leading-none score-glow" style={{ color: primaryColor }}>
                  {state.ourScore}
                </span>
                {state.possession === "us" && (
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[7px] border-l-amber-400" />
                )}
              </div>
            </div>
          </div>

          {/* Center: Quarter & Clock */}
          <div className="flex flex-col items-center gap-0.5 px-2">
            <button
              onClick={onCycleQuarter}
              className="text-[9px] font-display font-bold text-surface-muted border border-surface-border rounded-md px-2.5 py-0.5 active:bg-surface-hover cursor-pointer uppercase tracking-wider"
            >
              {quarterLabel(state.quarter)}
            </button>
            <button
              onClick={onEditClock}
              className="text-xl font-mono font-bold tabular-nums text-amber-400 active:opacity-60 cursor-pointer leading-tight"
              style={{ textShadow: "0 0 12px rgba(245, 158, 11, 0.4)" }}
            >
              {fmtClock(state.clock)}
            </button>
            <div className="text-[8px] font-display font-bold uppercase tracking-widest"
              style={{ color: state.possession === "us" ? primaryColor : effOppColor }}>
              {state.possession === "us" ? "Our Ball" : "Their Ball"}
            </div>
          </div>

          {/* Away team */}
          <div className="flex-1 flex items-center justify-end gap-2.5">
            <div className="min-w-0 text-right">
              <div className="text-[9px] font-display font-bold text-surface-muted uppercase tracking-widest truncate">
                {oppName}
              </div>
              <div className="flex items-center justify-end gap-2">
                {state.possession === "them" && (
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[7px] border-r-amber-400" />
                )}
                <span className="text-3xl font-display font-extrabold tabular-nums leading-none" style={{ color: effOppColor }}>
                  {state.theirScore}
                </span>
              </div>
            </div>
            {oppLogoUrl ? (
              <img src={oppLogoUrl} alt={oppName} className="w-9 h-9 object-contain rounded-lg" />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-display font-black text-white italic shrink-0"
                style={{ background: `linear-gradient(135deg, ${effOppColor}, ${effOppColor}aa)` }}
              >
                {oppName.slice(0, 3).toUpperCase()}
              </div>
            )}
          </div>

          {/* End Game */}
          <button onClick={onEndGame} className="p-1.5 text-amber-500/60 hover:text-amber-400 transition-colors shrink-0 cursor-pointer ml-1" title="End Game">
            <Trophy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
