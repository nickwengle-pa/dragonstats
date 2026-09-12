import { useState } from "react";
import PlayerPicker from "./PlayerPicker";
import { quickKneel } from "./quickKneel";
import type { GameState, PlayTypeDef, TaggedPlayer } from "./types";
import type { PlaySubmitData } from "./PlayEntryModal";
import type { PlayerUsage } from "./playerUsage";

export default function KneelEntry({ playType, situation, players, team, usage, inline, onSubmit, onClose }: {
  playType: PlayTypeDef; situation: GameState; players: TaggedPlayer[]; team: string;
  usage?: PlayerUsage; inline?: boolean; onSubmit: (data: PlaySubmitData) => void | Promise<void>; onClose: () => void;
}) {
  const [quarterback, setQuarterback] = useState<TaggedPlayer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <div className={inline ? "live-inline-entry" : "sheet bg-black/60 backdrop-blur-sm"}>
    <div className={inline ? "card fast-entry" : "sheet-panel sm:!max-w-lg fast-entry"} role={inline ? "region" : "dialog"} aria-label="Kneel">
      <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-xl">Kneel · {team}</h2><button onClick={onClose} disabled={saving}>Cancel</button></div>
      <p className="text-sm text-slate-400 mb-4">Select the quarterback or Team. Records one rush for −1 yard.</p>
      <PlayerPicker label="Quarterback" team={team} players={players} selected={quarterback ? [quarterback] : []} usage={usage} role="passer"
        onSelect={setQuarterback} onSelectTeam={() => setQuarterback(quickKneel(playType, situation).tagged[0])} />
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <button className="btn-primary w-full mt-4 disabled:opacity-40" disabled={!quarterback || saving} onClick={async () => {
        if (!quarterback) return;
        setSaving(true); setError("");
        try { await onSubmit(quickKneel(playType, situation, quarterback)); }
        catch { setError("Could not save. Try again."); }
        finally { setSaving(false); }
      }}>{saving ? "Saving…" : "Save Kneel · −1 yd"}</button>
    </div>
  </div>;
}
