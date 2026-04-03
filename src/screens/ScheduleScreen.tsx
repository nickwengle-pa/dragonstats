import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, X, MapPin, Play, Calendar as CalIcon,
  Users, ChevronDown, ChevronUp, Trash2, Shield, Upload, Image,
} from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  opponentPlayerService,
  type Opponent,
  type OpponentPlayer,
} from "@/services/opponentService";
import { parseMaxPrepsRoster, parseCSVRoster, type ParsedPlayer } from "@/utils/rosterImport";

/* ─── Types ─── */

interface GameRow {
  id: string;
  game_date: string;
  location: string | null;
  is_home: boolean;
  site: string | null;
  status: string;
  our_score: number;
  opponent_score: number;
  is_playoff: boolean;
  playoff_round: string | null;
  kickoff_time: string | null;
  rules_config: Record<string, unknown> | null;
  notes: string | null;
  tags: string[] | null;
  opponent: Opponent;
}

type Site = "home" | "away" | "neutral";

/* ─── Opponent Player Row (inline add/list) ─── */

function OpponentRosterSection({ opponentId, startExpanded }: { opponentId: string; startExpanded?: boolean }) {
  const [players, setPlayers] = useState<OpponentPlayer[]>([]);
  const [expanded, setExpanded] = useState(startExpanded ?? false);
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [pos, setPos] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"csv" | "maxpreps">("maxpreps");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<ParsedPlayer[]>([]);
  const [importParsed, setImportParsed] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    opponentPlayerService.getByOpponent(opponentId).then(setPlayers);
  }, [opponentId]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    const p = await opponentPlayerService.create({
      opponent_id: opponentId,
      name: name.trim(),
      jersey_number: jersey ? Number(jersey) : null,
      position: pos.toUpperCase() || null,
    });
    if (p) setPlayers(prev => [...prev, p]);
    setName(""); setJersey(""); setPos("");
  };

  const handleDelete = async (id: string) => {
    if (await opponentPlayerService.remove(id)) {
      setPlayers(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleParse = () => {
    const result = importMode === "maxpreps"
      ? parseMaxPrepsRoster(importText)
      : parseCSVRoster(importText);
    setImportPreview(result.players);
    setImportParsed(true);
  };

  const handleBulkImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    const rows = importPreview.map(p => ({
      opponent_id: opponentId,
      name: `${p.firstName} ${p.lastName}`,
      jersey_number: p.jerseyNumber ?? null,
      position: p.position ?? null,
    }));
    const created = await opponentPlayerService.bulkCreate(rows);
    if (created) setPlayers(prev => [...prev, ...created]);
    setShowImport(false);
    setImportText("");
    setImportPreview([]);
    setImportParsed(false);
    setImporting(false);
  };

  return (
    <div className="mt-3 border border-surface-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-neutral-400 hover:bg-surface-hover"
      >
        <Users className="w-3.5 h-3.5" />
        Opponent Roster ({players.length})
        {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>

      {expanded && (
        <div className="border-t border-surface-border">
          {/* Import button */}
          <div className="px-3 py-2 flex gap-2">
            <button onClick={() => setShowImport(s => !s)}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                showImport ? "border-dragon-primary text-dragon-primary" : "border-surface-border text-neutral-500"
              }`}>
              {showImport ? "Hide Import" : "Import from MaxPreps / CSV"}
            </button>
          </div>

          {/* Import panel */}
          {showImport && (
            <div className="px-3 pb-3 space-y-2 border-b border-surface-border">
              <div className="flex gap-2">
                <button onClick={() => { setImportMode("maxpreps"); setImportParsed(false); }}
                  className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border ${
                    importMode === "maxpreps" ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border text-neutral-400"
                  }`}>MaxPreps</button>
                <button onClick={() => { setImportMode("csv"); setImportParsed(false); }}
                  className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border ${
                    importMode === "csv" ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border text-neutral-400"
                  }`}>CSV / Tab</button>
              </div>
              <p className="text-[10px] text-neutral-500">
                {importMode === "maxpreps"
                  ? 'Copy the roster from MaxPreps.com (# Player Grade Pos Height Weight) and paste below.'
                  : "Paste comma or tab-separated: Jersey#, Name, Position"}
              </p>
              <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportParsed(false); }}
                rows={4} placeholder="Paste roster here..." className="input text-xs resize-none" />
              {!importParsed ? (
                <button onClick={handleParse} disabled={!importText.trim()}
                  className="btn-primary text-xs w-full py-1.5">Parse</button>
              ) : (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-emerald-400">{importPreview.length} players parsed</div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-surface-border rounded-lg bg-surface-bg">
                    {importPreview.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 text-[10px]">
                        <span className="font-mono w-5 text-center text-neutral-500">{p.jerseyNumber ?? "—"}</span>
                        <span className="flex-1 truncate">{p.firstName} {p.lastName}</span>
                        <span className="text-neutral-500">{p.position ?? ""}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleBulkImport} disabled={importing || importPreview.length === 0}
                    className="btn-primary text-xs w-full py-1.5">
                    {importing ? "Importing..." : `Import ${importPreview.length} Players`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Player list */}
          {players.length > 0 && (
            <div className="max-h-40 overflow-y-auto divide-y divide-surface-border">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="font-mono w-6 text-center text-neutral-500">{p.jersey_number ?? "—"}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-neutral-500 w-8">{p.position ?? ""}</span>
                  <button onClick={() => handleDelete(p.id)} className="text-neutral-600 hover:text-red-400">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Manual add */}
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-bg">
            <input value={jersey} onChange={e => setJersey(e.target.value)}
              placeholder="#" className="input text-xs w-10 text-center py-1" />
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Player name" className="input text-xs flex-1 py-1" />
            <input value={pos} onChange={e => setPos(e.target.value)}
              placeholder="Pos" className="input text-xs w-12 text-center py-1" />
            <button onClick={handleAdd} disabled={!name.trim()}
              className="btn-primary text-[10px] px-2 py-1 shrink-0">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Add / Edit Opponent Modal ─── */

function OpponentLogoUpload({
  currentUrl, onUploaded, opponentId,
}: {
  currentUrl: string | null;
  onUploaded: (url: string | null) => void;
  opponentId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2 MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `opponents/${opponentId}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) { console.error("Upload error:", error); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
    onUploaded(pub.publicUrl);
    setUploading(false);
  };

  return (
    <div>
      <label className="label block mb-1.5">Team Logo</label>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          <div className="relative">
            <img src={currentUrl} alt="Logo" className="w-14 h-14 rounded-lg object-contain bg-surface-card border border-surface-border" />
            <button onClick={() => onUploaded(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="w-14 h-14 rounded-lg bg-surface-card border border-dashed border-surface-border flex items-center justify-center text-neutral-500">
            <Image className="w-6 h-6" />
          </div>
        )}
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="btn-ghost text-sm px-3 py-1.5">
          {uploading ? "Uploading..." : <span className="flex items-center gap-1.5"><Upload className="w-4 h-4" /> Choose File</span>}
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function OpponentModal({
  existing, programId, onClose, onSaved,
}: {
  existing: Opponent | null;
  programId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [abbrev, setAbbrev] = useState(existing?.abbreviation ?? "");
  const [mascot, setMascot] = useState(existing?.mascot ?? "");
  const [primary, setPrimary] = useState(existing?.primary_color ?? "#6b7280");
  const [secondary, setSecondary] = useState(existing?.secondary_color ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [state, setState] = useState(existing?.state ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [logoUrl, setLogoUrl] = useState(existing?.logo_url ?? null);
  const [saving, setSaving] = useState(false);
  // For new opponents: save first to get an ID, then allow roster/logo
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);

  const handleSave = async () => {
    if (!name) return;
    setSaving(true);
    const payload = {
      program_id: programId,
      name: name.trim(),
      abbreviation: abbrev.toUpperCase() || null,
      mascot: mascot || null,
      primary_color: primary,
      secondary_color: secondary || null,
      logo_url: logoUrl,
      city: city || null,
      state: state.toUpperCase() || null,
      notes: notes || null,
    };

    if (savedId) {
      await supabase.from("opponents").update(payload).eq("id", savedId);
    } else {
      const { data } = await supabase.from("opponents").insert(payload).select("id").single();
      if (data) setSavedId(data.id);
    }

    setSaving(false);
    onSaved();
    // If creating new, don't close — let user add roster
    if (existing || savedId) onClose();
  };

  const handleLogoChange = async (url: string | null) => {
    setLogoUrl(url);
    if (savedId) {
      await supabase.from("opponents").update({ logo_url: url }).eq("id", savedId);
    }
  };

  return (
    <div className="sheet bg-black/70">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <h2 className="text-lg font-black">{existing ? "Edit Opponent" : savedId ? "New Opponent" : "Add Opponent"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
          <div>
            <label className="label block mb-1.5">School Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Central High School" className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">Abbreviation</label>
              <input value={abbrev} onChange={e => setAbbrev(e.target.value.toUpperCase())} placeholder="CHS" maxLength={5} className="input" />
            </div>
            <div>
              <label className="label block mb-1.5">Mascot</label>
              <input value={mascot} onChange={e => setMascot(e.target.value)} placeholder="Tigers" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Pittsburgh" className="input" />
            </div>
            <div>
              <label className="label block mb-1.5">State</label>
              <input value={state} onChange={e => setState(e.target.value.toUpperCase())} placeholder="PA" maxLength={2} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primary} onChange={e => setPrimary(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer bg-transparent" />
                <input value={primary} onChange={e => setPrimary(e.target.value)} className="input flex-1 font-mono text-sm" />
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={secondary || "#333333"} onChange={e => setSecondary(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer bg-transparent" />
                <input value={secondary} onChange={e => setSecondary(e.target.value)} placeholder="#333333" className="input flex-1 font-mono text-sm" />
              </div>
            </div>
          </div>

          {/* Logo upload (needs savedId for storage path) */}
          {savedId ? (
            <OpponentLogoUpload currentUrl={logoUrl} onUploaded={handleLogoChange} opponentId={savedId} />
          ) : (
            <div className="text-[10px] text-neutral-500 italic">Save the opponent first to upload a logo and add roster.</div>
          )}

          <div>
            <label className="label block mb-1.5">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Conference rival, etc." className="input resize-none" />
          </div>

          {/* Opponent roster */}
          {savedId && <OpponentRosterSection opponentId={savedId} startExpanded={!existing} />}

          {!savedId ? (
            <button onClick={handleSave} disabled={!name || saving} className="btn-primary w-full mt-2">
              {saving ? "Saving..." : "Save & Add Roster"}
            </button>
          ) : (
            <button onClick={handleSave} disabled={!name || saving} className="btn-primary w-full mt-2">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Add Game Modal ─── */

function AddGameModal({
  opponents, seasonId, onClose, onSaved, onAddOpp,
}: {
  opponents: Opponent[];
  seasonId: string;
  onClose: () => void;
  onSaved: () => void;
  onAddOpp: () => void;
}) {
  const [oppId, setOppId] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [kickoff, setKickoff] = useState("19:00");
  const [site, setSite] = useState<Site>("home");
  const [location, setLocation] = useState("");
  const [isPlayoff, setIsPlayoff] = useState(false);
  const [playoffRound, setPlayoffRound] = useState("");
  const [quarterLength, setQuarterLength] = useState(12);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!oppId || !gameDate) return;
    setSaving(true);

    const dateStr = kickoff ? `${gameDate}T${kickoff}:00` : `${gameDate}T19:00:00`;
    await supabase.from("games").insert({
      season_id: seasonId,
      opponent_id: oppId,
      game_date: new Date(dateStr).toISOString(),
      location: location || null,
      is_home: site === "home",
      site,
      kickoff_time: kickoff || null,
      is_playoff: isPlayoff,
      playoff_round: isPlayoff && playoffRound ? playoffRound : null,
      rules_config: { quarterLengthMinutes: quarterLength, level: "high_school" },
      notes: notes || null,
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="sheet bg-black/70">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <h2 className="text-lg font-black">Add Game</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
          {opponents.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-neutral-500 text-sm mb-3">You need to add an opponent first.</p>
              <button onClick={() => { onClose(); onAddOpp(); }} className="btn-primary text-sm">Add Opponent</button>
            </div>
          ) : (
            <>
              <div>
                <label className="label block mb-1.5">Opponent *</label>
                <select value={oppId} onChange={e => setOppId(e.target.value)} className="input appearance-none">
                  <option value="">Select opponent...</option>
                  {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button onClick={() => { onClose(); onAddOpp(); }}
                  className="text-xs text-dragon-primary font-bold mt-1.5 ml-1">+ New Opponent</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block mb-1.5">Date *</label>
                  <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label block mb-1.5">Kickoff</label>
                  <input type="time" value={kickoff} onChange={e => setKickoff(e.target.value)} className="input" />
                </div>
              </div>

              {/* Site selector (3-way) */}
              <div>
                <label className="label block mb-1.5">Site</label>
                <div className="flex gap-2">
                  {(["home", "away", "neutral"] as Site[]).map(s => (
                    <button key={s} onClick={() => setSite(s)}
                      className={`flex-1 h-10 rounded-xl font-bold text-sm border transition-colors capitalize ${
                        site === s ? "bg-dragon-primary border-dragon-primary text-white" : "bg-surface-bg border-surface-border text-neutral-400"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label block mb-1.5">Location / Venue</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Dragon Field" className="input" />
              </div>

              {/* Game rules */}
              <div>
                <label className="label block mb-1.5">Quarter Length (min)</label>
                <select value={quarterLength} onChange={e => setQuarterLength(Number(e.target.value))} className="input appearance-none w-24">
                  <option value={6}>6</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                  <option value={12}>12</option>
                </select>
              </div>

              {/* Playoff */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isPlayoff} onChange={e => setIsPlayoff(e.target.checked)}
                    className="w-4 h-4 rounded accent-dragon-primary" />
                  <span className="text-sm font-bold">Playoff Game</span>
                </label>
                {isPlayoff && (
                  <input value={playoffRound} onChange={e => setPlayoffRound(e.target.value)}
                    placeholder="Round (e.g. Quarterfinal)" className="input text-sm flex-1" />
                )}
              </div>

              <div>
                <label className="label block mb-1.5">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Homecoming, Senior night, etc." className="input resize-none" />
              </div>

              <button onClick={handleSave} disabled={!oppId || !gameDate || saving} className="btn-primary w-full mt-2">
                {saving ? "Adding..." : "Add Game"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Schedule Screen
   ───────────────────────────────────────────── */

export default function ScheduleScreen() {
  const navigate = useNavigate();
  const { program, season } = useProgramContext();
  const [games, setGames] = useState<GameRow[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddGame, setShowAddGame] = useState(false);
  const [oppModal, setOppModal] = useState<{ open: boolean; editing: Opponent | null }>({ open: false, editing: null });

  const loadData = useCallback(async () => {
    if (!season || !program) return;
    setLoading(true);
    const [gamesRes, oppsRes] = await Promise.all([
      supabase.from("games").select("*, opponent:opponents(*)").eq("season_id", season.id).order("game_date"),
      supabase.from("opponents").select("*").eq("program_id", program.id).order("name"),
    ]);
    setGames(gamesRes.data ?? []);
    setOpponents(oppsRes.data ?? []);
    setLoading(false);
  }, [season, program]);

  useEffect(() => { loadData(); }, [loadData]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const getStatusBadge = (game: GameRow) => {
    if (game.is_playoff) {
      const label = game.playoff_round ?? "PLAYOFF";
      if (game.status === "completed") return (
        <div className="flex items-center gap-1">
          <Shield className="w-3 h-3 text-yellow-500" />
          <span className="text-[10px] font-bold bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">{label.toUpperCase()}</span>
        </div>
      );
      return <span className="text-[10px] font-bold bg-yellow-900/30 text-yellow-500 px-1.5 py-0.5 rounded">{label.toUpperCase()}</span>;
    }
    if (game.status === "completed") return <span className="text-[10px] font-bold bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">FINAL</span>;
    if (game.status === "live") return <span className="text-[10px] font-bold bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded animate-pulse">LIVE</span>;
    return null;
  };

  const getSiteLabel = (game: GameRow) => {
    const site = game.site ?? (game.is_home ? "home" : "away");
    if (site === "home") return "vs";
    if (site === "away") return "@";
    return "vs"; // neutral
  };

  return (
    <div className="screen safe-top safe-bottom lg:max-w-tablet lg:mx-auto">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 lg:px-8">
        <button onClick={() => navigate("/")} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Schedule</h1>
        <button onClick={() => setOppModal({ open: true, editing: null })} className="btn-ghost p-2 text-neutral-400" title="Manage opponents">
          <Users className="w-5 h-5" />
        </button>
        <button onClick={() => setShowAddGame(true)} className="btn-ghost p-2 text-dragon-primary">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {season && (
        <div className="px-5 pb-3">
          <span className="text-xs font-bold text-neutral-600">
            {season.name ?? `${season.year} ${season.level}`}
          </span>
        </div>
      )}

      {/* Games list */}
      <div className="flex-1 px-5 lg:px-8 overflow-y-auto pb-4">
        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-12 animate-pulse">Loading schedule...</div>
        ) : games.length === 0 ? (
          <div className="card p-8 text-center">
            <CalIcon className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm font-semibold mb-1">No games scheduled</p>
            <p className="text-neutral-600 text-xs mb-4">Tap + to add a game. You'll need to add an opponent first.</p>
            {opponents.length === 0 && (
              <button onClick={() => setOppModal({ open: true, editing: null })} className="btn-secondary text-sm mx-auto">
                Add First Opponent
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {games.map(game => (
              <button key={game.id}
                onClick={() => navigate(game.status === "completed" ? `/game/${game.id}/summary` : `/game/${game.id}`)}
                className="card w-full p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-neutral-500">{formatDate(game.game_date)}</span>
                  {getStatusBadge(game)}
                </div>
                <div className="flex items-center gap-3">
                  {game.opponent.logo_url ? (
                    <img src={game.opponent.logo_url} alt={game.opponent.name} className="w-8 h-8 object-contain rounded-lg shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                      style={{ backgroundColor: game.opponent.primary_color + "30", color: game.opponent.primary_color }}>
                      {(game.opponent.abbreviation ?? game.opponent.name.substring(0, 3)).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-bold text-sm" style={{ color: game.opponent.primary_color }}>
                      {getSiteLabel(game)} {game.opponent.name}
                    </div>
                    {game.location && (
                      <div className="text-xs text-neutral-600 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {game.location}
                      </div>
                    )}
                  </div>
                  {game.status === "completed" ? (
                    <div className="text-right">
                      <div className="font-black text-sm">
                        {game.our_score} – {game.opponent_score}
                      </div>
                      <div className="text-[10px] font-bold" style={{
                        color: game.our_score > game.opponent_score ? "#22c55e" :
                          game.our_score < game.opponent_score ? "#ef4444" : "#a3a3a3"
                      }}>
                        {game.our_score > game.opponent_score ? "W" : game.our_score < game.opponent_score ? "L" : "T"}
                      </div>
                    </div>
                  ) : game.status === "live" ? (
                    <Play className="w-5 h-5 text-dragon-primary" />
                  ) : (
                    <span className="text-xs text-neutral-600 font-semibold">
                      {game.kickoff_time
                        ? game.kickoff_time
                        : new Date(game.game_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Opponents section (below schedule) */}
        {opponents.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-black text-neutral-500 mb-3">OPPONENTS</h2>
            <div className="space-y-1.5">
              {opponents.map(opp => (
                <button
                  key={opp.id}
                  onClick={() => setOppModal({ open: true, editing: opp })}
                  className="card w-full flex items-center gap-3 p-3 text-left active:bg-surface-hover transition-colors"
                >
                  {opp.logo_url ? (
                    <img src={opp.logo_url} alt={opp.name} className="w-7 h-7 object-contain rounded-lg shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                      style={{ backgroundColor: opp.primary_color + "30", color: opp.primary_color }}>
                      {(opp.abbreviation ?? opp.name.substring(0, 3)).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold truncate block" style={{ color: opp.primary_color }}>{opp.name}</span>
                    {opp.mascot && <span className="text-xs" style={{ color: opp.secondary_color ?? opp.primary_color, opacity: 0.7 }}>{opp.mascot}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Game Modal */}
      {showAddGame && season && (
        <AddGameModal
          opponents={opponents}
          seasonId={season.id}
          onClose={() => setShowAddGame(false)}
          onSaved={loadData}
          onAddOpp={() => setOppModal({ open: true, editing: null })}
        />
      )}

      {/* Opponent Modal (add/edit) */}
      {oppModal.open && program && (
        <OpponentModal
          existing={oppModal.editing}
          programId={program.id}
          onClose={() => setOppModal({ open: false, editing: null })}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
