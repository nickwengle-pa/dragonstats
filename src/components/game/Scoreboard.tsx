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
  return (
    <div className="card p-3">
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
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider truncate max-w-full">{progName}</div>
          <div className="text-3xl font-black tabular-nums" style={{ color: primaryColor }}>
            {state.ourScore}
          </div>
          {state.possession === "us" && <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto" />}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={onCycleQuarter}
            className="text-[10px] font-bold text-neutral-500 border border-surface-border rounded px-2 py-0.5 active:bg-surface-hover"
          >
            {quarterLabel(state.quarter)}
          </button>
          <button
            onClick={onEditClock}
            className="text-xl font-black tabular-nums text-amber-400 active:opacity-60"
          >
            {fmtClock(state.clock)}
          </button>
          <div className="text-[10px] font-bold text-neutral-600">
            {state.possession === "us" ? "OUR BALL" : "THEIR BALL"}
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
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider truncate max-w-full">{oppName}</div>
          <div className="text-3xl font-black tabular-nums" style={{ color: oppColor ?? "#9ca3af" }}>
            {state.theirScore}
          </div>
          {state.possession === "them" && <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto" />}
        </div>

        <button onClick={onEndGame} className="btn-ghost p-1.5 text-amber-500 shrink-0" title="End Game">
          <Trophy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
