import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import ClockInput from "./ClockInput";
import type { PlayRecord } from "./types";

/**
 * Edit a recorded timeout.
 *
 * A timeout is not a play type — it has no roles, no yardage, no spot, and it
 * is not in PLAY_TYPES — so it cannot go through the play entry modal, which
 * is built entirely around those things. It carries exactly two facts worth
 * correcting: when it was called and who called it. This is that, and nothing
 * else.
 *
 * Both were previously uncorrectable. The play log hid its pencil on timeouts
 * and the film chart's editor could not resolve a play type for one, so a
 * timeout charged to the wrong side stayed charged to the wrong side — and
 * because the remaining-timeout counts are derived by counting these plays,
 * one wrong team silently misreported both teams' timeouts for the rest of
 * the half.
 */
export interface TimeoutEdit {
  clock: number;
  team: "us" | "them";
}

export default function TimeoutEditModal({
  play,
  progName,
  oppName,
  quarterLengthSecs,
  onSave,
  onDelete,
  onClose,
}: {
  play: PlayRecord;
  progName: string;
  oppName: string;
  quarterLengthSecs: number;
  onSave: (edit: TimeoutEdit) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const storedTeam = play.playData?.timeout_team;
  const [team, setTeam] = useState<"us" | "them">(
    storedTeam === "them" ? "them" : "us",
  );
  const [clock, setClock] = useState(play.clock);

  return (
    <div className="sheet bg-black/70" onClick={onClose}>
      <div
        className="sheet-panel max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 pb-2 shrink-0 border-b border-surface-border">
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="text-sm font-black">
              Timeout
              <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                Editing
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              Q{play.quarter} · who called it and when
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="label block mb-1.5">Called By</label>
            <div className="grid grid-cols-2 gap-2">
              {(["us", "them"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setTeam(side)}
                  className={`py-3 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                    team === side
                      ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary"
                      : "border-surface-border bg-surface-bg text-slate-500"
                  }`}
                >
                  {side === "us" ? progName : oppName}
                </button>
              ))}
            </div>
            {/* The counts on the scoreboard are derived by counting these
                plays, so this is the control that fixes them. */}
            <div className="text-[10px] text-slate-600 mt-1.5">
              Timeouts remaining are counted from these, so changing the team
              corrects both sides.
            </div>
          </div>

          <div>
            <label className="label block mb-1.5">Clock</label>
            <ClockInput
              seconds={clock}
              onChange={setClock}
              maxSeconds={quarterLengthSecs}
            />
          </div>
        </div>

        <div className="p-4 pt-2 border-t border-surface-border shrink-0 flex gap-2">
          {onDelete && (
            <button
              onClick={() => {
                if (window.confirm("Delete this timeout?")) onDelete();
              }}
              className="px-4 py-3 rounded-xl border-2 border-red-500/50 bg-red-500/10 text-red-400 text-sm font-black shrink-0"
              title="Delete timeout"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onSave({ clock, team })}
            className="btn-primary flex-1 py-3 text-sm font-black"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
