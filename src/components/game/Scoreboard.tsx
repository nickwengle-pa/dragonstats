import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { fmtClock, quarterLabel, type GameState } from "./types";

interface Props {
  state: GameState;
  progName: string;
  oppName: string;
  progAbbr: string;
  oppAbbr: string;
  primaryColor: string;
  progLogoUrl?: string | null;
  oppLogoUrl?: string | null;
  oppColor?: string;
  ballLabel: string;
  onPreviousQuarter: () => void;
  onNextQuarter: () => void;
  canPreviousQuarter: boolean;
  canNextQuarter: boolean;
  onEditClock: () => void;
  onEndGame: () => void;
  onSetDown: (down: number) => void;
  onAdjustDistance: (delta: number) => void;
  onAdjustBall: (delta: number) => void;
  onEditBall: () => void;
}

function downLabel(down: number) {
  return `${down}${down === 1 ? "st" : down === 2 ? "nd" : down === 3 ? "rd" : "th"}`;
}

export default function Scoreboard({
  state,
  progName,
  oppName,
  progAbbr,
  oppAbbr,
  primaryColor,
  progLogoUrl,
  oppLogoUrl,
  oppColor,
  ballLabel,
  onPreviousQuarter,
  onNextQuarter,
  canPreviousQuarter,
  canNextQuarter,
  onEditClock,
  onEndGame,
  onSetDown,
  onAdjustDistance,
  onAdjustBall,
  onEditBall,
}: Props) {
  const effOppColor = oppColor ?? "#6b7280";
  const possessionLabel = state.possession === "us" ? `${progAbbr} BALL` : `${oppAbbr} BALL`;

  return (
    <div
      className="rounded-2xl border border-surface-border overflow-hidden"
      style={{ boxShadow: "0 2px 24px rgba(0,0,0,0.4)" }}
    >
      <div
        className="h-1"
        style={{ background: `linear-gradient(90deg, ${primaryColor}, #f59e0b 50%, ${effOppColor})` }}
      />

      <div className="px-3 py-3" style={{ background: "linear-gradient(180deg, #111820, #0d1117)" }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2.5 min-w-0">
            {progLogoUrl ? (
              <img src={progLogoUrl} alt={progName} className="w-9 h-9 object-contain rounded-lg shrink-0" />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-display font-black text-white italic shrink-0"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}aa)` }}
              >
                {progAbbr}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[9px] font-display font-bold text-surface-muted uppercase tracking-widest truncate">
                {progName}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-3xl font-display font-extrabold tabular-nums leading-none score-glow"
                  style={{ color: primaryColor }}
                >
                  {state.ourScore}
                </span>
                {state.possession === "us" && (
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[7px] border-l-amber-400" />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 px-1.5 shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={onPreviousQuarter}
                disabled={!canPreviousQuarter}
                className="border border-surface-border rounded-md p-1 text-surface-muted active:bg-surface-hover cursor-pointer transition-colors disabled:cursor-default disabled:opacity-35"
                title="Previous quarter"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <div className="text-[10px] font-display font-bold text-surface-muted border border-surface-border rounded-md px-2 py-1 min-w-[58px] text-center uppercase tracking-wider">
                {quarterLabel(state.quarter)}
              </div>
              <button
                onClick={onNextQuarter}
                disabled={!canNextQuarter}
                className="border border-surface-border rounded-md p-1 text-surface-muted active:bg-surface-hover cursor-pointer transition-colors disabled:cursor-default disabled:opacity-35"
                title="Next quarter"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <button
              onClick={onEditClock}
              className="text-xl font-mono font-bold tabular-nums text-amber-400 active:opacity-60 cursor-pointer leading-tight"
              style={{ textShadow: "0 0 12px rgba(245, 158, 11, 0.4)" }}
            >
              {fmtClock(state.clock)}
            </button>
            <div
              className="text-[8px] font-display font-bold uppercase tracking-[0.18em]"
              style={{ color: state.possession === "us" ? primaryColor : effOppColor }}
            >
              {possessionLabel}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-end gap-2.5 min-w-0">
            <div className="min-w-0 text-right">
              <div className="text-[9px] font-display font-bold text-surface-muted uppercase tracking-widest truncate">
                {oppName}
              </div>
              <div className="flex items-center justify-end gap-2">
                {state.possession === "them" && (
                  <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-r-[7px] border-r-amber-400" />
                )}
                <span
                  className="text-3xl font-display font-extrabold tabular-nums leading-none"
                  style={{ color: effOppColor }}
                >
                  {state.theirScore}
                </span>
              </div>
            </div>
            {oppLogoUrl ? (
              <img src={oppLogoUrl} alt={oppName} className="w-9 h-9 object-contain rounded-lg shrink-0" />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-display font-black text-white italic shrink-0"
                style={{ background: `linear-gradient(135deg, ${effOppColor}, ${effOppColor}aa)` }}
              >
                {oppAbbr}
              </div>
            )}
          </div>

          <button
            onClick={onEndGame}
            className="p-1.5 text-amber-500/60 hover:text-amber-400 transition-colors shrink-0 cursor-pointer ml-1"
            title="End Game"
          >
            <Trophy className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <div className="flex-1 min-w-[116px] rounded-xl border border-surface-border bg-black/20 px-2.5 py-2">
            <div className="text-[8px] font-display font-bold text-surface-muted uppercase tracking-[0.18em]">Down</div>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((down) => (
                <button
                  key={down}
                  onClick={() => onSetDown(down)}
                  className={`h-8 rounded-lg text-[11px] font-display font-bold transition-colors cursor-pointer ${
                    state.down === down
                      ? "bg-amber-500 text-black"
                      : "bg-surface-bg text-surface-muted active:bg-surface-hover"
                  }`}
                >
                  {downLabel(down)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-[104px] rounded-xl border border-surface-border bg-black/20 px-2.5 py-2">
            <div className="text-[8px] font-display font-bold text-surface-muted uppercase tracking-[0.18em]">To Go</div>
            <div className="mt-1 flex items-center gap-1">
              <button
                onClick={() => onAdjustDistance(-1)}
                className="btn-ghost h-8 w-8 text-sm font-display font-bold cursor-pointer"
                title="Decrease distance"
              >
                -
              </button>
              <div className="flex-1 h-8 rounded-lg bg-surface-bg flex items-center justify-center text-sm font-display font-extrabold text-amber-400 tabular-nums">
                {state.distance}
              </div>
              <button
                onClick={() => onAdjustDistance(1)}
                className="btn-ghost h-8 w-8 text-sm font-display font-bold cursor-pointer"
                title="Increase distance"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex-[1.2] min-w-[176px] rounded-xl border border-surface-border bg-black/20 px-2.5 py-2">
            <div className="text-[8px] font-display font-bold text-surface-muted uppercase tracking-[0.18em]">Ball On</div>
            <div className="mt-1 flex items-center gap-1">
              <button
                onClick={() => onAdjustBall(-5)}
                className="btn-ghost h-8 px-1.5 text-[10px] font-display font-bold text-surface-muted cursor-pointer"
                title="Move ball back 5 yards"
              >
                -5
              </button>
              <button
                onClick={() => onAdjustBall(-1)}
                className="btn-ghost h-8 w-8 text-sm font-display font-bold cursor-pointer"
                title="Move ball back 1 yard"
              >
                -
              </button>
              <button
                onClick={onEditBall}
                className="flex-1 min-w-[72px] h-8 rounded-lg bg-surface-bg flex items-center justify-center text-[11px] font-display font-extrabold text-emerald-400 tabular-nums px-2 cursor-pointer active:bg-surface-hover"
                title="Set ball spot"
              >
                {ballLabel}
              </button>
              <button
                onClick={() => onAdjustBall(1)}
                className="btn-ghost h-8 w-8 text-sm font-display font-bold cursor-pointer"
                title="Move ball forward 1 yard"
              >
                +
              </button>
              <button
                onClick={() => onAdjustBall(5)}
                className="btn-ghost h-8 px-1.5 text-[10px] font-display font-bold text-surface-muted cursor-pointer"
                title="Move ball forward 5 yards"
              >
                +5
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
