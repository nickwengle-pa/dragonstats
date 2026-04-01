import { useState } from "react";
import { X } from "lucide-react";
import {
  type PlayRecord,
  type RosterPlayer,
  PENALTIES,
  PENALTY_DEFAULT_YARDS,
  yardLabel,
} from "./types";

interface Props {
  play: PlayRecord;
  roster: RosterPlayer[];
  onSave: (playId: string, updates: {
    yards: number;
    isTouchdown: boolean;
    penalty: string | null;
    flagYards: number;
  }) => void;
  onClose: () => void;
}

export default function PlayEditModal({ play, roster, onSave, onClose }: Props) {
  const [tab, setTab] = useState<"offense" | "situation" | "defense">("offense");
  const [yards, setYards] = useState(play.yards);
  const [isTD, setIsTD] = useState(play.isTouchdown);
  const [penalty, setPenalty] = useState(play.penalty ?? "");
  const [flagYards, setFlagYards] = useState(play.flagYards || 5);

  const handleSave = () => {
    onSave(play.id, {
      yards,
      isTouchdown: isTD,
      penalty: penalty || null,
      flagYards: penalty ? flagYards : 0,
    });
    onClose();
  };

  return (
    <div className="sheet bg-black/80">
      <div className="sheet-panel max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <h2 className="text-lg font-black">Edit Play</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 px-4 pb-2">
          {(["offense", "situation", "defense"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                tab === t ? "bg-dragon-primary/15 text-dragon-primary border border-dragon-primary/30" : "bg-surface-bg text-neutral-500"
              }`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">

          {/* ── Offense Tab ── */}
          {tab === "offense" && (
            <>
              <div className="card p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-500">Play Type</span>
                  <span className="font-bold capitalize">{play.type.replace(/_/g, " ")}</span>
                </div>
                {play.tagged.map(t => (
                  <div key={`${t.role}-${t.player_id}`} className="flex justify-between">
                    <span className="text-neutral-500 capitalize">{t.role}</span>
                    <span className="font-bold">#{t.jersey_number} {t.name}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-neutral-600">
                To change players, delete this play and re-enter it.
              </div>
            </>
          )}

          {/* ── Situation Tab ── */}
          {tab === "situation" && (
            <>
              <div>
                <label className="label block mb-1.5">Yards Gained</label>
                <div className="flex items-center gap-1.5">
                  {[-10, -5, -1].map(n => (
                    <button key={n} onClick={() => setYards(y => y + n)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">{n}</button>
                  ))}
                  <div className={`w-14 h-10 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums ${
                    yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : "text-neutral-300"
                  }`}>{yards}</div>
                  {[1, 5, 10].map(n => (
                    <button key={n} onClick={() => setYards(y => y + n)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                  ))}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Ball: {yardLabel(play.ballOn)} → {yardLabel(Math.min(99, Math.max(1, play.ballOn + yards)))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setIsTD(t => !t)}
                  className={`py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                    isTD ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-neutral-500"
                  }`}>TD</button>
                <div className="card p-2.5 text-center text-xs text-neutral-500">
                  Q{play.quarter + 1} · {play.down}{play.down === 1 ? "st" : play.down === 2 ? "nd" : play.down === 3 ? "rd" : "th"}&{play.distance}
                </div>
              </div>

              <div>
                <label className="label block mb-1.5">Penalty</label>
                <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
                  <button onClick={() => { setPenalty(""); setFlagYards(5); }}
                    className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border text-left ${
                      !penalty ? "border-emerald-500 bg-emerald-500/15 text-emerald-400" : "border-surface-border text-neutral-500"
                    }`}>None</button>
                  {PENALTIES.map(p => (
                    <button key={p} onClick={() => { setPenalty(p); setFlagYards(PENALTY_DEFAULT_YARDS[p] ?? 5); }}
                      className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border text-left transition-colors ${
                        penalty === p ? "border-orange-500 bg-orange-500/15 text-orange-400" : "border-surface-border text-neutral-400"
                      }`}>{p}</button>
                  ))}
                </div>
                {penalty && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-neutral-500">Penalty yards:</span>
                    <input type="number" value={flagYards} onChange={e => setFlagYards(Number(e.target.value))}
                      className="input w-16 text-center text-sm" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Defense Tab ── */}
          {tab === "defense" && (
            <>
              <div className="text-xs text-neutral-400 mb-2">
                Tackle credit for this play. To change tacklers, delete and re-enter the play.
              </div>
              {play.tagged.filter(t => t.role === "tackler").length > 0 ? (
                <div className="space-y-1">
                  {play.tagged.filter(t => t.role === "tackler").map(t => (
                    <div key={t.player_id} className="card p-2 flex items-center gap-2">
                      <span className="font-bold text-sm">#{t.jersey_number}</span>
                      <span className="text-sm flex-1">{t.name}</span>
                      <span className="text-xs text-neutral-500">credit: {t.credit ?? 1.0}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-neutral-600 text-center py-4">No tacklers recorded for this play.</div>
              )}
            </>
          )}
        </div>

        {/* Save */}
        <div className="p-4 pt-2 border-t border-surface-border shrink-0">
          <button onClick={handleSave} className="btn-primary w-full py-2.5 text-sm font-black">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
