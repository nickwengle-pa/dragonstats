import PlayerPicker from "./PlayerPicker";
import type { TaggedPlayer } from "./types";
import type { CSSProperties } from "react";

export default function PassDefenderPicker({ team, players, selected, onSelect, onClear, accentColor }: {
  accentColor: string;
  team: string;
  players: TaggedPlayer[];
  selected: TaggedPlayer[];
  onSelect: (player: TaggedPlayer | null) => void;
  onClear: () => void;
}) {
  return <div className="defense-selection space-y-2" style={{ "--defense-accent": accentColor } as CSSProperties}>
    <PlayerPicker label="Pass defender / breakup (optional)" team={team} players={players}
      role="defender" selected={selected} onSelect={onSelect} accentColor={accentColor} />
    <p className="text-xs text-slate-400">Select the defender who broke up the pass. Leave blank if no breakup occurred.</p>
    {selected.length > 0 && <button type="button" onClick={onClear}
      className="min-h-11 px-3 py-2 rounded-lg border border-surface-border text-sm font-bold text-slate-200">Clear pass defender</button>}
  </div>;
}
