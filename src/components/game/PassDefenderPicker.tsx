import PlayerPicker from "./PlayerPicker";
import type { TaggedPlayer } from "./types";

export default function PassDefenderPicker({ team, players, selected, onSelect, onClear }: {
  team: string;
  players: TaggedPlayer[];
  selected: TaggedPlayer[];
  onSelect: (player: TaggedPlayer | null) => void;
  onClear: () => void;
}) {
  return <div className="space-y-2">
    <PlayerPicker label="Pass defender / breakup (optional)" team={team} players={players}
      role="defender" selected={selected} onSelect={onSelect} />
    <p className="text-xs text-slate-400">Select the defender who broke up the pass. Leave blank if no breakup occurred.</p>
    {selected.length > 0 && <button type="button" onClick={onClear}
      className="min-h-11 px-3 py-2 rounded-lg border border-surface-border text-sm font-bold text-slate-200">Clear pass defender</button>}
  </div>;
}
