import { Trophy } from "lucide-react";
import { fmtClock, QUARTER_LABELS, type GameState } from "./types";

interface Props {
  state: GameState;
  progName: string;
  oppName: string;
  primaryColor: string;
  onCycleQuarter: () => void;
  onEditClock: () => void;
  onTogglePossession: () => void;
  onEndGame: () => void;
}

export default function Scoreboard({
  state, progName, oppName, primaryColor,
  onCycleQuarter, onEditClock, onTogglePossession, onEndGame,
}: Props) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 text-center">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider truncate">{progName}</div>
          <div className="text-3xl font-black tabular-nums" style={{ color: primaryColor }}>
            {state.ourScore}
          </div>
          {state.possession === "us" && <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto mt-1" />}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <button onClick={onCycleQuarter}
            className="text-[10px] font-bold text-neutral-500 border border-surface-border rounded px-2 py-0.5 active:bg-surface-hover">
            {QUARTER_LABELS[state.quarter]}
          </button>
          <button onClick={onEditClock}
            className="text-xl font-black tabular-nums text-amber-400 active:opacity-60">
            {fmtClock(state.clock)}
          </button>
          <button onClick={onTogglePossession}
            className="text-[10px] font-bold text-neutral-600 active:text-neutral-400">
            POSS
          </button>
        </div>

        <div className="flex-1 text-center">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider truncate">{oppName}</div>
          <div className="text-3xl font-black tabular-nums text-neutral-300">
            {state.theirScore}
          </div>
          {state.possession === "them" && <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto mt-1" />}
        </div>

        <button onClick={onEndGame} className="btn-ghost p-1.5 text-amber-500 shrink-0" title="End Game">
          <Trophy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
