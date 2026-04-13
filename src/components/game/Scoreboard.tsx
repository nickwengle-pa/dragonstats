import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { fmtClock, quarterLabel, type GameState } from "./types";

interface Props {
  state: GameState;
  progName: string;
  oppName: string;
  primaryColor: string;
  progLogoUrl?: string | null;
  oppLogoUrl?: string | null;
  oppColor?: string;
  onPreviousQuarter: () => void;
  onNextQuarter: () => void;
  canPreviousQuarter: boolean;
  canNextQuarter: boolean;
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
  onPreviousQuarter,
  onNextQuarter,
  canPreviousQuarter,
  canNextQuarter,
  onEditClock,
  onEndGame,
}: Props) {
  return (
    <div className="card p-3"
      style={{ background: `linear-gradient(135deg, ${primaryColor}08, transparent 60%)` }}>
      <div className="flex items-center gap-3">
        <div className="flex-1 flex flex-col items-center gap-1">
          {progLogoUrl ? (
            <img src={progLogoUrl} alt={progName} className="w-8 h-8 object-contain rounded" />
          ) : (
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-black text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {progName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-full">{progName}</div>
          <div className="text-3xl font-black font-mono tabular-nums" style={{ color: primaryColor }}>
            {state.ourScore}
          </div>
          {state.possession === "us" && <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto shadow-glow-gold" />}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <button
              onClick={onPreviousQuarter}
              disabled={!canPreviousQuarter}
              className="border border-surface-border rounded p-1 text-slate-500 active:bg-surface-hover cursor-pointer transition-colors hover:border-slate-600 disabled:cursor-default disabled:opacity-35"
              title="Previous quarter"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <div className="text-[10px] font-bold text-slate-500 border border-surface-border rounded px-2 py-1 min-w-[52px] text-center">
              {quarterLabel(state.quarter)}
            </div>
            <button
              onClick={onNextQuarter}
              disabled={!canNextQuarter}
              className="border border-surface-border rounded p-1 text-slate-500 active:bg-surface-hover cursor-pointer transition-colors hover:border-slate-600 disabled:cursor-default disabled:opacity-35"
              title="Next quarter"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={onEditClock}
            className="text-xl font-black font-mono tabular-nums text-amber-400 active:opacity-60 cursor-pointer"
            style={{ textShadow: "0 0 12px rgba(245,158,11,0.3)" }}
          >
            {fmtClock(state.clock)}
          </button>
          <div className="text-[10px] font-bold text-slate-600 font-mono">
            <span className="block max-w-[110px] truncate text-center">
              {state.possession === "us" ? `${progName} BALL` : `${oppName} BALL`}
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center gap-1">
          {oppLogoUrl ? (
            <img src={oppLogoUrl} alt={oppName} className="w-8 h-8 object-contain rounded" />
          ) : (
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-black text-white"
              style={{ backgroundColor: oppColor ?? "#6b7280" }}
            >
              {oppName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-full">{oppName}</div>
          <div className="text-3xl font-black font-mono tabular-nums" style={{ color: oppColor ?? "#9ca3af" }}>
            {state.theirScore}
          </div>
          {state.possession === "them" && <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto shadow-glow-gold" />}
        </div>

        <button onClick={onEndGame} className="btn-ghost p-1.5 text-amber-500 shrink-0 cursor-pointer" title="End Game">
          <Trophy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
