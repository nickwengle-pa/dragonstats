import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, X, Trash2, UserRound, Upload, Edit2,
  Check, AlertTriangle, Loader2,
} from "lucide-react";
import { TabBar } from "@/screens/DashboardScreen";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { readSeasonRoster } from "@/services/offlineCache";
import { parseCSVRoster, parseMaxPrepsRoster, type ParsedPlayer } from "@/utils/rosterImport";
import PendingPlayersSheet from "@/components/roster/PendingPlayersSheet";
import { loadPendingPlayers, type PendingPlayerSummary } from "@/services/pendingPlayerService";

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
  onClose, onImport, seasonYear, importing, failures = [],
}: {
  onClose: () => void;
  onImport: (players: ParsedPlayer[]) => void;
  seasonYear?: number;
  importing: boolean;
  /** Players the import could not add. Named, because a count is not
   *  something an operator can act on. */
  failures?: string[];
}) {
  const [mode, setMode] = useState<"csv" | "maxpreps">("maxpreps");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedPlayer[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [parsed, setParsed] = useState(false);
  const [reading, setReading] = useState(false);

  // The parse itself is synchronous and blocks the main thread on a big paste,
  // so flip the button into its busy state and let a frame paint before running it.
  const handleRead = () => {
    if (reading) return;
    setReading(true);
    setTimeout(() => {
      const result = mode === "maxpreps"
        ? parseMaxPrepsRoster(text, seasonYear)
        : parseCSVRoster(text, seasonYear);
      setPreview(result.players);
      setIssues(result.issues);
      setParsed(true);
      setReading(false);
    }, 60);
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

          {/* Import button */}
          {!parsed && (
            <>
              <button onClick={handleRead} disabled={!text.trim() || reading} className="btn-primary w-full text-sm">
                {reading ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" /> Reading roster...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-1.5 inline" /> Import Roster</>
                )}
              </button>
              {reading && (
                <p className="text-xs text-neutral-500 text-center animate-pulse">
                  Working through your pasted roster...
                </p>
              )}
            </>
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
              {failures.length > 0 && (
                <div className="card p-3 mb-2 border border-red-500/40 bg-red-500/10">
                  <p className="text-xs font-bold text-red-400 mb-1">
                    {failures.length} of {preview.length} could not be added:
                  </p>
                  <p className="text-[11px] text-red-300/90 leading-5">{failures.join(", ")}</p>
                  <p className="text-[11px] text-surface-muted mt-1.5">
                    The rest are on the roster. Add these by hand, or fix the list and import again —
                    importing the whole list a second time would duplicate everyone who did save.
                  </p>
                </div>
              )}
              <button onClick={() => onImport(preview)} disabled={importing} className="btn-primary w-full text-sm">
                {importing ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" /> Adding {preview.length} player{preview.length !== 1 && "s"}...</>
                ) : (
                  <><Check className="w-4 h-4 mr-1.5 inline" /> Confirm &mdash; Add {preview.length} Player{preview.length !== 1 && "s"}</>
                )}
              </button>
            </>
          )}

          {parsed && preview.length === 0 && (
            <p className="text-sm text-red-400 text-center py-4">No players found in that paste. Check your data and try again.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Add / Edit Player Modal ─── */

function PlayerFormModal({
  editing, onClose, onSave, saveError,
}: {
  editing: RosterPlayer | null;
  onClose: () => void;
  /** Set when the save was refused. The form stays open so the operator can
   *  retry rather than losing what they typed. */
  saveError?: string | null;
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

          {saveError && (
            <p className="text-sm text-red-400 text-center font-medium">{saveError}</p>
          )}

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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importFailures, setImportFailures] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RosterPlayer | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [pending, setPending] = useState<PendingPlayerSummary[]>([]);
  const [showPending, setShowPending] = useState(false);

  const loadRoster = useCallback(async () => {
    if (!season) return;
    setLoading(true);
    const rosterRead = await readSeasonRoster<RosterPlayer>(season.id);
    setRoster(rosterRead.value ?? []);
    setLoading(false);
  }, [season]);

  /* Recomputed from the plays every time rather than cached — deleting a game
     removes its pending tags via cascade, and a stale count would linger. */
  const loadPending = useCallback(async () => {
    if (!season) {
      setPending([]);
      return;
    }
    setPending(await loadPendingPlayers(season.id));
  }, [season]);

  useEffect(() => { loadRoster(); }, [loadRoster]);
  useEffect(() => { loadPending(); }, [loadPending]);

  /* ── Add single player ── */
  const handleSave = async (data: {
    firstName: string; lastName: string; preferredName: string;
    jersey: string; positions: string[]; classification: string;
    gradYear: string; heightInches: string; weightLbs: string;
  }) => {
    if (!program || !season) return;

    /* Every one of these writes used to be fire-and-forget, and the form closed
       whatever happened. A refused edit looked identical to a saved one, and a
       failed player insert silently skipped the roster row after it — leaving a
       player who exists but is on nobody's roster, with nothing said. */
    setSaveError(null);

    if (editingEntry) {
      const { error: playerErr } = await supabase.from("players").update({
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        preferred_name: data.preferredName.trim() || null,
        graduation_year: data.gradYear ? Number(data.gradYear) : null,
      }).eq("id", editingEntry.player_id);
      if (playerErr) { setSaveError(playerErr.message); return; }

      const { error: rosterErr } = await supabase.from("season_rosters").update({
        jersey_number: data.jersey ? Number(data.jersey) : null,
        position: data.positions[0] ?? null,
        positions: data.positions.length ? data.positions : null,
        classification: data.classification || null,
        height_inches: data.heightInches ? Number(data.heightInches) : null,
        weight_lbs: data.weightLbs ? Number(data.weightLbs) : null,
      }).eq("id", editingEntry.id);
      if (rosterErr) { setSaveError(rosterErr.message); return; }
    } else {
      const { data: player, error: createErr } = await supabase.from("players").insert({
        program_id: program.id,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        preferred_name: data.preferredName.trim() || null,
        graduation_year: data.gradYear ? Number(data.gradYear) : null,
      }).select().single();

      if (createErr || !player) {
        setSaveError(createErr?.message ?? "Could not create the player.");
        return;
      }

      const { error: addErr } = await supabase.from("season_rosters").insert({
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
      if (addErr) {
        /* The player row landed but the roster row did not. Say so precisely:
           re-saving would otherwise create a SECOND player with the same name,
           and the roster would still be missing one. */
        setSaveError(
          `${data.firstName} ${data.lastName} was created but could not be added to this season's roster: ${addErr.message}`,
        );
        return;
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
    setImportProgress({ done: 0, total: players.length });

    /* Per-row accounting. This loop discarded every error and then announced
       completion, so importing forty players and getting thirty-one was
       indistinguishable from importing forty — until somebody counted the
       roster. The ones that failed are named, because "9 failed" is not
       something you can act on. */
    const failed: string[] = [];

    for (const [i, p] of players.entries()) {
      setImportProgress({ done: i, total: players.length });
      const who = `${p.firstName} ${p.lastName}`.trim() || "(unnamed)";

      const { data: player, error: createErr } = await supabase.from("players").insert({
        program_id: program.id,
        first_name: p.firstName,
        last_name: p.lastName,
        graduation_year: p.graduationYear,
      }).select().single();

      if (createErr || !player) {
        failed.push(who);
        continue;
      }

      const { error: addErr } = await supabase.from("season_rosters").insert({
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
      if (addErr) failed.push(who);
    }

    setImportProgress({ done: players.length, total: players.length });
    setImporting(false);
    loadRoster();

    if (failed.length > 0) {
      /* The import sheet stays open holding the list, so the operator can see
         who is missing before deciding what to do about it. */
      setImportFailures(failed);
      return;
    }
    setShowImport(false);
  };

  /* ── Delete (soft) ── */
  const handleDelete = async (entry: RosterPlayer) => {
    if (!confirm(`Remove ${entry.player.first_name} ${entry.player.last_name} from the roster?`)) return;
    await supabase.from("season_rosters").update({ is_active: false }).eq("id", entry.id);
    loadRoster();
  };

  return (
    <div className="screen safe-top lg:max-w-tablet lg:mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate("/")} className="btn-ghost p-2 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] flex-1">Roster</h1>
        <span className="text-[11px] font-display font-bold text-surface-muted uppercase tracking-wider">{roster.length} players</span>
        <button onClick={() => setShowImport(true)} className="btn-ghost p-2 text-surface-muted cursor-pointer" title="Import roster">
          <Upload className="w-5 h-5" />
        </button>
        <button onClick={() => { setEditingEntry(null); setShowAdd(true); }} className="btn-ghost p-2 text-dragon-primary cursor-pointer">
          <Plus className="w-5 h-5" />
        </button>
      </div>
      <div className="mx-5 mt-1 mb-3 accent-line" />

      {/* Season label */}
      {season && (
        <div className="px-5 pb-3">
          <span className="text-[11px] font-display font-semibold text-surface-muted uppercase tracking-wider">
            {season.name ?? `${season.year} ${season.level}`}
          </span>
        </div>
      )}

      {/* Jerseys recorded during a game with nobody rostered under them. */}
      {pending.length > 0 && (
        <div className="px-5 pb-3">
          <button
            onClick={() => setShowPending(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-left active:bg-amber-500/15 transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-amber-400">
                {pending.length} unresolved player{pending.length === 1 ? "" : "s"}
              </div>
              <div className="text-[11px] text-amber-400/70 truncate">
                {pending.map((p) => (p.jersey != null ? `#${p.jersey}` : "#?")).join(", ")} recorded without a roster spot
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-400 shrink-0">Resolve</span>
          </button>
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
        <div className="fixed inset-0 bg-black/75 z-[60] flex items-center justify-center">
          <div className="card p-6 text-center flex flex-col items-center gap-2 min-w-[220px]">
            <Loader2 className="w-6 h-6 text-dragon-primary animate-spin" />
            <div className="text-sm font-bold">Importing players...</div>
            <p className="text-xs text-neutral-400">
              {importProgress.total > 0
                ? `${importProgress.done} of ${importProgress.total} added`
                : "This may take a moment."}
            </p>
            {importProgress.total > 0 && (
              <div className="w-full h-1.5 rounded-full bg-surface-bg overflow-hidden">
                <div
                  className="h-full bg-dragon-primary transition-[width] duration-200"
                  style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Player Modal */}
      {showAdd && (
        <PlayerFormModal
          editing={editingEntry}
          onClose={() => { setShowAdd(false); setEditingEntry(null); setSaveError(null); }}
          onSave={handleSave}
          saveError={saveError}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          failures={importFailures}
          onClose={() => { setShowImport(false); setImportFailures([]); }}
          onImport={handleBulkImport}
          seasonYear={season?.year}
          importing={importing}
        />
      )}
      {showPending && season && program && (
        <PendingPlayersSheet
          seasonId={season.id}
          programId={program.id}
          pending={pending}
          roster={roster}
          onClose={() => setShowPending(false)}
          onResolved={async () => {
            // A merge or promote can add a roster spot, so reload both.
            await Promise.all([loadRoster(), loadPending()]);
          }}
        />
      )}
      <TabBar />
    </div>
  );
}
