import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X, Trash2, UserRound } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";

interface RosterPlayer {
  id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  classification: string | null;
  is_active: boolean;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    graduation_year: number | null;
  };
}

const POSITIONS = ["QB","RB","FB","WR","TE","OL","OT","OG","C","DL","DE","DT","NT","LB","ILB","OLB","CB","S","FS","SS","K","P","LS","KR","PR","ATH"];
const CLASSIFICATIONS = ["FR","SO","JR","SR"];

export default function RosterScreen() {
  const navigate = useNavigate();
  const { program, season } = useProgramContext();
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add player form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");
  const [classification, setClassification] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRoster = useCallback(async () => {
    if (!season) return;
    setLoading(true);
    const { data } = await supabase
      .from("season_rosters")
      .select("*, player:players(*)")
      .eq("season_id", season.id)
      .eq("is_active", true)
      .order("jersey_number", { ascending: true, nullsFirst: false });
    setRoster(data ?? []);
    setLoading(false);
  }, [season]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  const handleAdd = async () => {
    if (!program || !season || !firstName || !lastName) return;
    setSaving(true);

    // Create player record (program-level)
    const { data: player } = await supabase.from("players").insert({
      program_id: program.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      graduation_year: gradYear ? Number(gradYear) : null,
    }).select().single();

    if (player) {
      // Add to season roster
      await supabase.from("season_rosters").insert({
        season_id: season.id,
        player_id: player.id,
        jersey_number: jersey ? Number(jersey) : null,
        position: position || null,
        classification: classification || null,
        is_active: true,
      });
    }

    // Reset form
    setFirstName(""); setLastName(""); setJersey("");
    setPosition(""); setClassification(""); setGradYear("");
    setSaving(false);
    setShowAdd(false);
    loadRoster();
  };

  const handleDelete = async (entry: RosterPlayer) => {
    if (!confirm(`Remove ${entry.player.first_name} ${entry.player.last_name} from the roster?`)) return;
    await supabase.from("season_rosters").update({ is_active: false }).eq("id", entry.id);
    loadRoster();
  };

  return (
    <div className="screen safe-top safe-bottom lg:max-w-tablet lg:mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate("/")} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Roster</h1>
        <span className="text-xs text-neutral-500 font-bold">{roster.length} players</span>
        <button onClick={() => setShowAdd(true)} className="btn-ghost p-2 text-dragon-primary">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Season label */}
      {season && (
        <div className="px-5 pb-3">
          <span className="text-xs font-bold text-neutral-600">
            {season.name ?? `${season.year} ${season.level}`}
          </span>
        </div>
      )}

      {/* Roster list */}
      <div className="flex-1 px-5 overflow-y-auto pb-4">
        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-12 animate-pulse">Loading roster...</div>
        ) : roster.length === 0 ? (
          <div className="card p-8 text-center">
            <UserRound className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm font-semibold mb-1">No players yet</p>
            <p className="text-neutral-600 text-xs">Tap + to add players to this season's roster.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {roster.map(entry => (
              <div key={entry.id} className="card flex items-center gap-3 p-3 active:bg-surface-hover transition-colors"
                onClick={() => navigate(`/player/${entry.player_id}`)}>
                <div className="w-11 h-11 rounded-xl bg-surface-bg flex items-center justify-center font-black text-sm shrink-0"
                  style={{ color: program?.primary_color }}>
                  {entry.jersey_number ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {entry.player.first_name} {entry.player.last_name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {[entry.position, entry.classification].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(entry); }}
                  className="btn-ghost p-1.5 text-neutral-700 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Player Modal */}
      {showAdd && (
        <div className="sheet bg-black/70">
          <div className="sheet-panel max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h2 className="text-lg font-black">Add Player</h2>
              <button onClick={() => setShowAdd(false)} className="btn-ghost p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block mb-1.5">First Name *</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Marcus" className="input" />
                </div>
                <div>
                  <label className="label block mb-1.5">Last Name *</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Johnson" className="input" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label block mb-1.5">Jersey #</label>
                  <input type="number" value={jersey} onChange={e => setJersey(e.target.value)} placeholder="22" className="input text-center" />
                </div>
                <div>
                  <label className="label block mb-1.5">Position</label>
                  <select value={position} onChange={e => setPosition(e.target.value)} className="input appearance-none text-sm">
                    <option value="">—</option>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1.5">Class</label>
                  <select value={classification} onChange={e => setClassification(e.target.value)} className="input appearance-none text-sm">
                    <option value="">—</option>
                    {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label block mb-1.5">Graduation Year</label>
                <input type="number" value={gradYear} onChange={e => setGradYear(e.target.value)}
                  placeholder={String(new Date().getFullYear() + 1)} className="input" />
              </div>

              <button onClick={handleAdd} disabled={!firstName || !lastName || saving} className="btn-primary w-full mt-2">
                {saving ? "Adding..." : "Add Player"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
