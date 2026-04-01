import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, X, Trash2, UserRound, Upload, Edit2,
  Check, AlertTriangle, FileText,
} from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { parseCSVRoster, parseMaxPrepsRoster, type ParsedPlayer } from "@/utils/rosterImport";

/* ─── Types ─── */

interface RosterPlayer {
  id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  positions: string[] | null;
  classification: string | null;
  is_active: boolean;
  height_inches: number | null;
  weight_lbs: number | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    graduation_year: number | null;
  };
}

const POSITIONS = [
  "QB","RB","FB","WR","TE","OL","OT","OG","C",
  "DL","DE","DT","NT","LB","ILB","OLB","CB","S","FS","SS",
  "K","P","LS","KR","PR","ATH",
];
const CLASSIFICATIONS = ["FR","SO","JR","SR"];

/* ─── Position Tag Component ─── */

function PosTags({ positions, primary }: { positions: string[]; primary?: string }) {
  if (!positions.length) return <span className="text-neutral-600">—</span>;
  return (
    <span className="flex gap-1 flex-wrap">
      {positions.map(p => (
        <span key={p} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          p === primary ? "bg-dragon-primary/20 text-dragon-primary" : "bg-surface-bg text-neutral-400"
        }`}>{p}</span>
      ))}
    </span>
  );
}

/* ─── Import Modal ─── */

function ImportModal({
  onClose, onImport, seasonYear,
}: {
  onClose: () => void;
  onImport: (players: ParsedPlayer[]) => void;
  seasonYear?: number;
}) {
  const [mode, setMode] = useState<"csv" | "maxpreps">("maxpreps");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedPlayer[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [parsed, setParsed] = useState(false);

  const handleParse = () => {
    const result = mode === "maxpreps"
      ? parseMaxPrepsRoster(text, seasonYear)
      : parseCSVRoster(text, seasonYear);
    setPreview(result.players);
    setIssues(result.issues);
    setParsed(true);
  };

  return (
    <div className="sheet bg-black/70">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <h2 className="text-lg font-black">Import Roster</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setMode("maxpreps"); setParsed(false); }}
              className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                mode === "maxpreps" ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border text-neutral-400"
              }`}
            >
              MaxPreps Paste
            </button>
            <button
              onClick={() => { setMode("csv"); setParsed(false); }}
              className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-colors ${
                mode === "csv" ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border text-neutral-400"
              }`}
            >
              CSV / Tab
            </button>
          </div>

          {/* Instructions */}
          <p className="text-xs text-neutral-400 leading-relaxed">
            {mode === "maxpreps"
              ? 'Copy the roster table from MaxPreps.com (including the "# Player Grade Position Height Weight" header row) and paste it below.'
              : "Paste comma or tab-separated data. Expected columns: Jersey#, Name, Position, Class, GradYear. A header row is auto-detected."}
          </p>

          {/* Text area */}
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setParsed(false); }}
            rows={8}
            placeholder={mode === "maxpreps"
              ? "# Player Grade Position Height Weight\n1\nMarcus Johnson\nSr.\tQB\t6'1\"\t185"
              : "22, Marcus Johnson, QB, SR, 2026\n5, John Smith, WR/RB, JR"}
            className="input font-mono text-xs w-full resize-none"
          />

          {/* Parse button */}
          {!parsed && (
            <button onClick={handleParse} disabled={!text.trim()} className="btn-primary w-full text-sm">
              <FileText className="w-4 h-4 mr-1.5 inline" /> Parse Roster
            </button>
          )}

          {/* Issues */}
          {parsed && issues.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-bold text-yellow-500">{issues.length} issue{issues.length !== 1 && "s"}</span>
              </div>
              <ul className="text-xs text-yellow-400/80 space-y-0.5 list-disc list-inside">
                {issues.map((iss, i) => <li key={i}>{iss}</li>)}
              </ul>
            </div>
          )}

          {/* Preview */}
          {parsed && preview.length > 0 && (
            <>
              <div className="text-xs font-bold text-neutral-300 mb-1">{preview.length} player{preview.length !== 1 && "s"} found:</div>
              <div className="max-h-52 overflow-y-auto border border-surface-border rounded-lg divide-y divide-surface-border">
                {preview.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="font-mono w-7 text-center text-neutral-500">{p.jerseyNumber ?? "—"}</span>
                    <span className="flex-1 truncate">{p.firstName} {p.lastName}</span>
                    <span className="text-neutral-400">{p.positions.join("/") || "—"}</span>
                    <span className="text-neutral-500 w-6 text-center">{p.classification ?? ""}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => onImport(preview)} className="btn-primary w-full text-sm">
                <Upload className="w-4 h-4 mr-1.5 inline" /> Import {preview.length} Player{preview.length !== 1 && "s"}
              </button>
            </>
          )}

          {parsed && preview.length === 0 && (
            <p className="text-sm text-red-400 text-center py-4">No players parsed. Check your data and try again.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Add / Edit Player Modal ─── */

function PlayerFormModal({
  editing, onClose, onSave,
}: {
  editing: RosterPlayer | null;
  onClose: () => void;
  onSave: (data: {
    firstName: string; lastName: string; preferredName: string;
    jersey: string; positions: string[]; classification: string;
    gradYear: string; heightInches: string; weightLbs: string;
  }) => void;
}) {
  const [firstName, setFirstName] = useState(editing?.player.first_name ?? "");
  const [lastName, setLastName] = useState(editing?.player.last_name ?? "");
  const [preferredName, setPreferredName] = useState(editing?.player.preferred_name ?? "");
  const [jersey, setJersey] = useState(editing?.jersey_number?.toString() ?? "");
  const [positions, setPositions] = useState<string[]>(editing?.positions ?? (editing?.position ? [editing.position] : []));
  const [classification, setClassification] = useState(editing?.classification ?? "");
  const [gradYear, setGradYear] = useState(editing?.player.graduation_year?.toString() ?? "");
  const [heightInches, setHeightInches] = useState(editing?.height_inches?.toString() ?? "");
  const [weightLbs, setWeightLbs] = useState(editing?.weight_lbs?.toString() ?? "");

  const togglePosition = (pos: string) => {
    setPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    );
  };

  return (
    <div className="sheet bg-black/70">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <h2 className="text-lg font-black">{editing ? "Edit Player" : "Add Player"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">Preferred Name</label>
              <input value={preferredName} onChange={e => setPreferredName(e.target.value)} placeholder="MJ" className="input" />
            </div>
            <div>
              <label className="label block mb-1.5">Jersey #</label>
              <input type="number" value={jersey} onChange={e => setJersey(e.target.value)} placeholder="22" className="input text-center" />
            </div>
          </div>

          {/* Multi-position selector */}
          <div>
            <label className="label block mb-1.5">
              Positions {positions.length > 0 && <span className="text-neutral-500">({positions.join(", ")})</span>}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => togglePosition(pos)}
                  className={`text-[11px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                    positions.includes(pos)
                      ? "border-dragon-primary bg-dragon-primary/15 text-dragon-primary"
                      : "border-surface-border text-neutral-500 hover:border-neutral-500"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label block mb-1.5">Class</label>
              <select value={classification} onChange={e => setClassification(e.target.value)} className="input appearance-none text-sm">
                <option value="">—</option>
                {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label block mb-1.5">Grad Year</label>
              <input type="number" value={gradYear} onChange={e => setGradYear(e.target.value)} placeholder="2027" className="input text-sm" />
            </div>
            <div>
              <label className="label block mb-1.5">Height (in)</label>
              <input type="number" value={heightInches} onChange={e => setHeightInches(e.target.value)} placeholder="72" className="input text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">Weight (lbs)</label>
              <input type="number" value={weightLbs} onChange={e => setWeightLbs(e.target.value)} placeholder="185" className="input text-sm" />
            </div>
          </div>

          <button
            onClick={() => onSave({ firstName, lastName, preferredName, jersey, positions, classification, gradYear, heightInches, weightLbs })}
            disabled={!firstName || !lastName}
            className="btn-primary w-full mt-2"
          >
            {editing ? "Save Changes" : "Add Player"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Roster Screen
   ───────────────────────────────────────────── */

export default function RosterScreen() {
  const navigate = useNavigate();
  const { program, season } = useProgramContext();
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RosterPlayer | null>(null);
  const [importing, setImporting] = useState(false);

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

  /* ── Add single player ── */
  const handleSave = async (data: {
    firstName: string; lastName: string; preferredName: string;
    jersey: string; positions: string[]; classification: string;
    gradYear: string; heightInches: string; weightLbs: string;
  }) => {
    if (!program || !season) return;

    if (editingEntry) {
      // Update existing
      await supabase.from("players").update({
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        preferred_name: data.preferredName.trim() || null,
        graduation_year: data.gradYear ? Number(data.gradYear) : null,
      }).eq("id", editingEntry.player_id);

      await supabase.from("season_rosters").update({
        jersey_number: data.jersey ? Number(data.jersey) : null,
        position: data.positions[0] ?? null,
        positions: data.positions.length ? data.positions : null,
        classification: data.classification || null,
        height_inches: data.heightInches ? Number(data.heightInches) : null,
        weight_lbs: data.weightLbs ? Number(data.weightLbs) : null,
      }).eq("id", editingEntry.id);
    } else {
      // Create new player
      const { data: player } = await supabase.from("players").insert({
        program_id: program.id,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        preferred_name: data.preferredName.trim() || null,
        graduation_year: data.gradYear ? Number(data.gradYear) : null,
      }).select().single();

      if (player) {
        await supabase.from("season_rosters").insert({
          season_id: season.id,
          player_id: player.id,
          jersey_number: data.jersey ? Number(data.jersey) : null,
          position: data.positions[0] ?? null,
          positions: data.positions.length ? data.positions : null,
          classification: data.classification || null,
          is_active: true,
          height_inches: data.heightInches ? Number(data.heightInches) : null,
          weight_lbs: data.weightLbs ? Number(data.weightLbs) : null,
        });
      }
    }

    setShowAdd(false);
    setEditingEntry(null);
    loadRoster();
  };

  /* ── Bulk import ── */
  const handleBulkImport = async (players: ParsedPlayer[]) => {
    if (!program || !season || !players.length) return;
    setImporting(true);

    for (const p of players) {
      const { data: player } = await supabase.from("players").insert({
        program_id: program.id,
        first_name: p.firstName,
        last_name: p.lastName,
        graduation_year: p.graduationYear,
      }).select().single();

      if (player) {
        await supabase.from("season_rosters").insert({
          season_id: season.id,
          player_id: player.id,
          jersey_number: p.jerseyNumber,
          position: p.position,
          positions: p.positions.length ? p.positions : null,
          classification: p.classification,
          is_active: true,
          height_inches: p.heightInches,
          weight_lbs: p.weightLbs,
        });
      }
    }

    setImporting(false);
    setShowImport(false);
    loadRoster();
  };

  /* ── Delete (soft) ── */
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
        <button onClick={() => setShowImport(true)} className="btn-ghost p-2 text-neutral-400" title="Import roster">
          <Upload className="w-5 h-5" />
        </button>
        <button onClick={() => { setEditingEntry(null); setShowAdd(true); }} className="btn-ghost p-2 text-dragon-primary">
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
            <p className="text-neutral-600 text-xs mb-4">Tap + to add players or import a roster from MaxPreps.</p>
            <button onClick={() => setShowImport(true)} className="btn-ghost text-sm text-dragon-primary">
              <Upload className="w-4 h-4 mr-1.5 inline" /> Import Roster
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {roster.map(entry => (
              <div
                key={entry.id}
                className="card flex items-center gap-3 p-3 active:bg-surface-hover transition-colors"
                onClick={() => navigate(`/player/${entry.player_id}`)}
              >
                <div
                  className="w-11 h-11 rounded-xl bg-surface-bg flex items-center justify-center font-black text-sm shrink-0"
                  style={{ color: program?.primary_color }}
                >
                  {entry.jersey_number ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">
                    {entry.player.preferred_name || entry.player.first_name} {entry.player.last_name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PosTags
                      positions={entry.positions ?? (entry.position ? [entry.position] : [])}
                      primary={entry.position ?? undefined}
                    />
                    {entry.classification && (
                      <span className="text-[10px] text-neutral-500 font-bold">{entry.classification}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setEditingEntry(entry); setShowAdd(true); }}
                  className="btn-ghost p-1.5 text-neutral-600"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
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

      {/* Importing overlay */}
      {importing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="card p-6 text-center">
            <div className="animate-pulse text-sm font-bold mb-2">Importing players...</div>
            <p className="text-xs text-neutral-500">This may take a moment.</p>
          </div>
        </div>
      )}

      {/* Add / Edit Player Modal */}
      {showAdd && (
        <PlayerFormModal
          editing={editingEntry}
          onClose={() => { setShowAdd(false); setEditingEntry(null); }}
          onSave={handleSave}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={handleBulkImport}
          seasonYear={season?.year}
        />
      )}
    </div>
  );
}
