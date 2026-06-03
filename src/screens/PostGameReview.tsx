import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, X, Check, Film, Pencil } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  loadGamePlays,
  updatePlayFull,
  updatePlaySituation,
  deletePlay,
  type PlayWithPlayers,
} from "@/services/gameService";
import { opponentPlayerService } from "@/services/opponentService";
import {
  loadGameCharting,
  saveCharting,
  describePersonnel,
  hasChartingDetail,
  type PlayCharting,
  type PlayChartingDraft,
} from "@/services/chartingService";
import PlayEditModal, { type PlayEditResult } from "@/components/game/PlayEditModal";
import {
  findPlayTypeDef,
  yardLabel,
  quarterLabel,
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  type PlayRecord,
  type RosterPlayer,
  type OpponentPlayerRef,
  type TaggedPlayer,
  type BlockedKickType,
} from "@/components/game/types";

// ---------------------------------------------------------------------------
// Per-play derivations (read from the live `plays` row)
// ---------------------------------------------------------------------------

type Unit = "O" | "D" | "K";

function unitFor(play: PlayWithPlayers): Unit {
  const def = findPlayTypeDef(play.play_type);
  if (def?.category === "kicking") return "K";
  return play.possession === "us" ? "O" : "D";
}

function runPassFor(play: PlayWithPlayers): string {
  const def = findPlayTypeDef(play.play_type);
  if (def?.category === "run") return "R";
  if (def?.category === "pass") return "P";
  return "—";
}

function typeLabel(play: PlayWithPlayers): string {
  return findPlayTypeDef(play.play_type)?.label ?? play.play_type;
}

function downDistance(play: PlayWithPlayers): string {
  if (!play.down || play.down < 1) return "—";
  return `${play.down} & ${play.distance ?? 0}`;
}

function gainLabel(play: PlayWithPlayers): string {
  const y = play.yards_gained ?? 0;
  return `${y > 0 ? "+" : ""}${y}`;
}

function shortName(p?: { first_name: string; last_name: string }): string {
  if (!p) return "";
  const f = p.first_name?.[0] ? `${p.first_name[0]}.` : "";
  return `${f}${p.last_name ?? ""}`.trim();
}

function taggedSummary(play: PlayWithPlayers): { role: string; name: string }[] {
  return (play.play_players ?? []).map((pp) => ({
    role: pp.role,
    name: shortName(pp.player),
  }));
}

const UNIT_COLOR: Record<Unit, string> = {
  O: "#3b82f6",
  D: "#ef4444",
  K: "#a855f7",
};

// ---------------------------------------------------------------------------
// DB row → PlayRecord (the shape PlayEditModal expects). Mirrors the converter
// used by the live GameScreen so editing behaves identically.
// ---------------------------------------------------------------------------

function parseClockText(clockText: unknown, fallback: number): number {
  if (typeof clockText !== "string") return fallback;
  const [mins, secs] = clockText.split(":").map(Number);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return fallback;
  return mins * 60 + secs;
}

function rowToPlayRecord(p: PlayWithPlayers): PlayRecord {
  const pd = (p.play_data ?? {}) as Record<string, any>;
  const tagged: TaggedPlayer[] = (p.play_players ?? []).map((pp: any) => ({
    id: pp.player_id,
    player_id: pp.player_id,
    jersey_number: null,
    name: pp.player ? `${pp.player.first_name} ${pp.player.last_name}` : "?",
    role: pp.role,
    credit: pp.credit ?? undefined,
  }));
  return {
    id: p.id,
    sequence: p.sequence,
    quarter: p.quarter,
    clock: parseClockText(p.clock, 0),
    type: p.play_type,
    yards: p.yards_gained,
    result: pd.result ?? "",
    penalty: pd.penalty_type ?? null,
    flagYards: pd.penalty_yards ?? 0,
    isTouchdown: p.is_touchdown,
    firstDown: pd.is_first_down ?? false,
    turnover: p.is_turnover,
    isTouchback: !!pd.is_touchback,
    penaltyCategory:
      pd.play_category === "offense" || pd.play_category === "defense" ? pd.play_category : null,
    penaltyEnforcement:
      pd.penalty_enforcement === "declined" || pd.penalty_enforcement === "offset"
        ? pd.penalty_enforcement
        : "accepted",
    blockedKickType: (
      pd.blocked_kick_type === "field_goal" ||
      pd.blocked_kick_type === "extra_point" ||
      pd.blocked_kick_type === "punt" ||
      pd.blocked_kick_type === "kickoff"
    )
      ? (pd.blocked_kick_type as BlockedKickType)
      : null,
    tagged,
    ballOn: p.yard_line,
    down: p.down,
    distance: p.distance,
    description: p.description,
    possession: p.possession,
    offensiveFormation: (p as any).offensive_formation ?? null,
    defensiveFormation: (p as any).defensive_formation ?? null,
    hashMark: (p as any).hash_mark ?? null,
    playData: { ...pd },
  };
}

// ---------------------------------------------------------------------------
// CSV export (one row per play, Hudl-breakdown friendly)
// ---------------------------------------------------------------------------

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportChartingCsv(
  plays: PlayWithPlayers[],
  charting: Record<string, PlayCharting>,
  filename: string,
) {
  const header = [
    "Seq", "Quarter", "Clock", "Unit", "Down", "Distance", "BallOn",
    "Hash", "Personnel", "OffFormation", "DefFormation", "Motion", "PlayCall",
    "Passer", "Receiver", "Type", "R/P", "Gain", "TD", "Turnover", "Penalty",
    "Tags", "Notes", "Description",
  ];

  const rows = plays.map((p) => {
    const c = charting[p.id];
    return [
      p.sequence,
      quarterLabel(p.quarter),
      p.clock ?? "",
      unitFor(p),
      p.down ?? "",
      p.distance ?? "",
      yardLabel(p.yard_line ?? 0),
      c?.hash_mark ?? p.hash_mark ?? "",
      c?.personnel ?? "",
      c?.offensive_formation ?? p.offensive_formation ?? "",
      c?.defensive_formation ?? p.defensive_formation ?? "",
      c?.motion ?? "",
      c?.play_call ?? "",
      c?.passer ?? "",
      c?.receiver ?? "",
      typeLabel(p),
      runPassFor(p),
      p.yards_gained ?? 0,
      p.is_touchdown ? "Y" : "",
      p.is_turnover ? "Y" : "",
      p.is_penalty ? "Y" : "",
      (c?.tags ?? p.tags ?? []).join("; "),
      c?.notes ?? "",
      p.description ?? "",
    ];
  });

  const content = [header, ...rows]
    .map((r) => r.map(csvEscape).join(","))
    .join("\r\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Edit sheet — the "detailed card" for one play
// ---------------------------------------------------------------------------

function emptyDraft(play: PlayWithPlayers, gameId: string, existing?: PlayCharting): PlayChartingDraft {
  return {
    play_id: play.id,
    game_id: gameId,
    hash_mark: existing?.hash_mark ?? play.hash_mark ?? null,
    personnel: existing?.personnel ?? null,
    offensive_formation: existing?.offensive_formation ?? play.offensive_formation ?? null,
    defensive_formation: existing?.defensive_formation ?? play.defensive_formation ?? null,
    motion: existing?.motion ?? null,
    play_call: existing?.play_call ?? null,
    passer: existing?.passer ?? null,
    receiver: existing?.receiver ?? null,
    tags: existing?.tags ?? play.tags ?? null,
    notes: existing?.notes ?? null,
  };
}

function ChartingSheet({
  play,
  draft,
  saving,
  onChange,
  onClose,
  onSave,
  onEditPlay,
  sitDraft,
  onSitChange,
  onSaveSituation,
  savingSit,
}: {
  play: PlayWithPlayers;
  draft: PlayChartingDraft;
  saving: boolean;
  onChange: (patch: Partial<PlayChartingDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  onEditPlay: () => void;
  sitDraft: SituationDraft | null;
  onSitChange: (patch: Partial<SituationDraft>) => void;
  onSaveSituation: () => void;
  savingSit: boolean;
}) {
  const personnelHint = describePersonnel(draft.personnel);
  const tagsText = (draft.tags ?? []).join(", ");
  const tagged = taggedSummary(play);
  const [showSit, setShowSit] = useState(false);

  // Ball-spot helpers (yard_line is 0–100; <=50 = own side, >50 = opponent side)
  const ballSide: "own" | "opp" = sitDraft && sitDraft.yard_line > 50 ? "opp" : "own";
  const ballYard = sitDraft ? (sitDraft.yard_line > 50 ? 100 - sitDraft.yard_line : sitDraft.yard_line) : 0;
  const toYardLine = (side: "own" | "opp", yard: number) => (side === "opp" ? 100 - yard : yard);

  return (
    <div className="sheet bg-black/70" onClick={onClose}>
      <div className="sheet-panel max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <div>
            <div className="text-[10px] font-bold text-surface-muted uppercase tracking-widest">
              Play #{play.sequence} · {quarterLabel(play.quarter)} {play.clock ?? ""}
            </div>
            <h2 className="text-lg font-display font-black">{typeLabel(play)}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* ── Recorded stats (editable — feeds official game & season stats) ── */}
          <div className="card p-4 bg-surface-raised">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-surface-muted uppercase tracking-widest">
                Recorded stats
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSit((s) => !s)}
                  className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                    showSit
                      ? "text-amber-400 border-amber-500/50 bg-amber-500/10"
                      : "text-amber-400 border-amber-500/40 hover:bg-amber-500/10"
                  }`}
                  title="Fix down & distance for this play"
                >
                  Down &amp; Dist
                </button>
                <button
                  onClick={onEditPlay}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-dragon-primary px-2 py-1 rounded-lg border border-dragon-primary/40 hover:bg-dragon-primary/10 transition-colors cursor-pointer"
                  title="Edit play — updates game & season stats"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-y-2 gap-x-3 text-sm">
              <Field label="Unit" value={unitFor(play)} color={UNIT_COLOR[unitFor(play)]} />
              <Field label="Down" value={downDistance(play)} />
              <Field label="Ball On" value={yardLabel(play.yard_line ?? 0)} />
              <Field label="Type" value={typeLabel(play)} />
              <Field label="R/P" value={runPassFor(play)} />
              <Field label="Gain" value={gainLabel(play)} />
            </div>
            {(play.is_touchdown || play.is_turnover || play.is_penalty) && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {play.is_touchdown && <Flag text="TD" cls="bg-emerald-900/50 text-emerald-400" />}
                {play.is_turnover && <Flag text="TURNOVER" cls="bg-red-900/50 text-red-400" />}
                {play.is_penalty && <Flag text="PENALTY" cls="bg-yellow-900/40 text-yellow-400" />}
              </div>
            )}
            {tagged.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {tagged.map((t, i) => (
                  <span key={i} className="text-[10px] font-bold bg-surface-card border border-surface-border px-2 py-0.5 rounded">
                    <span className="text-surface-muted">{t.role}</span>{t.name ? ` · ${t.name}` : ""}
                  </span>
                ))}
              </div>
            )}
            {play.description && (
              <div className="text-xs text-slate-400 mt-3">{play.description}</div>
            )}

            {/* ── Quick Situation editor: down / distance / ball / possession ── */}
            {showSit && sitDraft && (
              <div className="mt-3 pt-3 border-t border-surface-border space-y-3">
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                  Fix down &amp; distance (this play only)
                </div>

                {/* Down */}
                <div>
                  <label className="label block mb-1.5">Down</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((d) => (
                      <button
                        key={d}
                        onClick={() => onSitChange({ down: d })}
                        className={`flex-1 h-10 rounded-xl font-bold text-sm border transition-colors ${
                          sitDraft.down === d
                            ? "bg-amber-500 border-amber-500 text-black"
                            : "bg-surface-bg border-surface-border text-neutral-400"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Distance + Possession */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label block mb-1.5">Distance (to go)</label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={sitDraft.distance}
                      onChange={(e) => onSitChange({ distance: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })}
                      className="input"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="label block mb-1.5">Possession</label>
                    <div className="flex gap-2">
                      {(["us", "them"] as const).map((side) => (
                        <button
                          key={side}
                          onClick={() => onSitChange({ possession: side })}
                          className={`flex-1 h-12 rounded-xl font-bold text-sm border transition-colors ${
                            sitDraft.possession === side
                              ? "bg-amber-500 border-amber-500 text-black"
                              : "bg-surface-bg border-surface-border text-neutral-400"
                          }`}
                        >
                          {side === "us" ? "Us" : "Them"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Ball spot */}
                <div>
                  <label className="label block mb-1.5">Ball on</label>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-2">
                      {(["own", "opp"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => onSitChange({ yard_line: toYardLine(s, ballYard || 1) })}
                          className={`px-3 h-12 rounded-xl font-bold text-xs uppercase border transition-colors ${
                            ballSide === s
                              ? "bg-amber-500 border-amber-500 text-black"
                              : "bg-surface-bg border-surface-border text-neutral-400"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={ballYard}
                      onChange={(e) =>
                        onSitChange({ yard_line: toYardLine(ballSide, Math.max(1, Math.min(50, Number(e.target.value) || 1))) })
                      }
                      className="input flex-1"
                      inputMode="numeric"
                    />
                    <span className="text-xs font-bold text-surface-muted w-16 text-right">{yardLabel(sitDraft.yard_line)}</span>
                  </div>
                </div>

                <button onClick={onSaveSituation} disabled={savingSit} className="btn-primary w-full gap-2">
                  <Check className="w-4 h-4" />
                  {savingSit ? "Saving…" : "Save down & distance"}
                </button>
              </div>
            )}
          </div>

          {/* ── Editable: film-charting detail ── */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold text-dragon-primary uppercase tracking-widest">
              Film charting
            </div>

            {/* Hash */}
            <div>
              <label className="label block mb-1.5">Hash</label>
              <div className="flex gap-2">
                {(["left", "middle", "right"] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => onChange({ hash_mark: draft.hash_mark === h ? null : h })}
                    className={`flex-1 h-10 rounded-xl font-bold text-sm border capitalize transition-colors ${
                      draft.hash_mark === h
                        ? "bg-dragon-primary border-dragon-primary text-white"
                        : "bg-surface-bg border-surface-border text-neutral-400"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Personnel */}
            <div>
              <label className="label block mb-1.5">Personnel</label>
              <input
                value={draft.personnel ?? ""}
                onChange={(e) => onChange({ personnel: e.target.value })}
                placeholder='e.g. "11", "21", "12"'
                className="input"
                inputMode="numeric"
              />
              {personnelHint && (
                <div className="text-[11px] text-surface-muted mt-1 font-medium">{personnelHint}</div>
              )}
            </div>

            {/* Formations */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Off. Formation</label>
                <input
                  list="off-formations"
                  value={draft.offensive_formation ?? ""}
                  onChange={(e) => onChange({ offensive_formation: e.target.value })}
                  placeholder="Shotgun"
                  className="input"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Def. Front</label>
                <input
                  list="def-formations"
                  value={draft.defensive_formation ?? ""}
                  onChange={(e) => onChange({ defensive_formation: e.target.value })}
                  placeholder="4-3"
                  className="input"
                />
              </div>
            </div>

            {/* Motion + Play call */}
            <div>
              <label className="label block mb-1.5">Shift / Trade / Motion</label>
              <input
                value={draft.motion ?? ""}
                onChange={(e) => onChange({ motion: e.target.value })}
                placeholder="Jet motion right, trade TE"
                className="input"
              />
            </div>
            <div>
              <label className="label block mb-1.5">Play Call</label>
              <input
                value={draft.play_call ?? ""}
                onChange={(e) => onChange({ play_call: e.target.value })}
                placeholder="Power Right / Y-Cross"
                className="input"
              />
            </div>

            {/* Passer / Receiver */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Passer</label>
                <input
                  value={draft.passer ?? ""}
                  onChange={(e) => onChange({ passer: e.target.value })}
                  placeholder="#7 QB"
                  className="input"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Receiver / Target</label>
                <input
                  value={draft.receiver ?? ""}
                  onChange={(e) => onChange({ receiver: e.target.value })}
                  placeholder="#11 X"
                  className="input"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="label block mb-1.5">Tags</label>
              <input
                value={tagsText}
                onChange={(e) =>
                  onChange({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="explosive, RPO, blitz beater"
                className="input"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="label block mb-1.5">Notes</label>
              <textarea
                value={draft.notes ?? ""}
                onChange={(e) => onChange({ notes: e.target.value })}
                rows={3}
                placeholder="Coaching notes for film room…"
                className="input resize-none py-3"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 pt-3 shrink-0 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onSave} disabled={saving} className="btn-primary flex-1 gap-2">
            <Check className="w-4 h-4" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold text-surface-muted uppercase tracking-wider">{label}</div>
      <div className="font-bold font-mono" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function Flag({ text, cls }: { text: string; cls: string }) {
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${cls}`}>{text}</span>;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface GameMeta {
  season_id: string | null;
  opponent_id: string | null;
  opponent_name: string;
  game_date: string;
}

type SituationDraft = {
  possession: "us" | "them";
  down: number;
  distance: number;
  yard_line: number;
};

function situationFromPlay(p: PlayWithPlayers): SituationDraft {
  return {
    possession: p.possession,
    down: p.down ?? 1,
    distance: p.distance ?? 10,
    yard_line: p.yard_line ?? 0,
  };
}

export default function PostGameReview() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { program } = useProgramContext();

  const [plays, setPlays] = useState<PlayWithPlayers[]>([]);
  const [charting, setCharting] = useState<Record<string, PlayCharting>>({});
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [oppPlayers, setOppPlayers] = useState<OpponentPlayerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charting sheet state
  const [editingPlay, setEditingPlay] = useState<PlayWithPlayers | null>(null);
  const [draft, setDraft] = useState<PlayChartingDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // Quick situation editor (down / distance / ball / possession)
  const [sitDraft, setSitDraft] = useState<SituationDraft | null>(null);
  const [savingSit, setSavingSit] = useState(false);

  // Play-data editor (reuses the live PlayEditModal)
  const [editRecord, setEditRecord] = useState<PlayRecord | null>(null);

  const load = useCallback(async (): Promise<PlayWithPlayers[]> => {
    if (!gameId) return [];
    setLoading(true);
    setError(null);
    try {
      const [rawPlays, chart, gRes] = await Promise.all([
        loadGamePlays(gameId),
        loadGameCharting(gameId),
        supabase
          .from("games")
          .select("season_id, opponent_id, is_home, game_date, opponent:opponents(*)")
          .eq("id", gameId)
          .single(),
      ]);

      setPlays(rawPlays);
      setCharting(chart);

      const g = gRes.data as any;
      const opp = g?.opponent;
      setMeta({
        season_id: g?.season_id ?? null,
        opponent_id: g?.opponent_id ?? null,
        opponent_name: opp?.name ?? "Opponent",
        game_date: g?.game_date ?? "",
      });

      // Roster + opponent players (needed by the play editor)
      if (g?.season_id) {
        const rRes = await supabase
          .from("season_rosters")
          .select("*, player:players(*)")
          .eq("season_id", g.season_id)
          .eq("is_active", true)
          .order("jersey_number", { ascending: true, nullsFirst: false });
        setRoster(rRes.data ?? []);
      }
      if (g?.opponent_id) {
        setOppPlayers(await opponentPlayerService.getByOpponent(g.opponent_id));
      }

      return rawPlays;
    } catch (e) {
      setError("Failed to load plays");
      console.error(e);
      return [];
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  const openCharting = useCallback((play: PlayWithPlayers) => {
    setEditingPlay(play);
    setDraft(emptyDraft(play, gameId!, charting[play.id]));
    setSitDraft(situationFromPlay(play));
  }, [gameId, charting]);

  // ── Save the play's situation (down/distance/ball/possession) — one play ──
  const handleSaveSituation = useCallback(async () => {
    if (!editingPlay || !sitDraft) return;
    setSavingSit(true);
    const ok = await updatePlaySituation(editingPlay.id, {
      possession: sitDraft.possession,
      down: sitDraft.down,
      distance: sitDraft.distance,
      yard_line: sitDraft.yard_line,
    });
    setSavingSit(false);
    if (!ok) {
      setError("Couldn't save the situation — check your connection and try again.");
      return;
    }
    const refreshed = await load();
    const row = refreshed.find((p) => p.id === editingPlay.id) ?? null;
    setEditingPlay(row);
    if (row) setSitDraft(situationFromPlay(row));
  }, [editingPlay, sitDraft, load]);

  const handleSaveCharting = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    const saved = await saveCharting(draft);
    setSaving(false);
    if (saved) {
      setCharting((prev) => ({ ...prev, [saved.play_id]: saved }));
      setEditingPlay(null);
      setDraft(null);
    } else {
      setError("Couldn't save charting — check your connection and try again.");
    }
  }, [draft]);

  // ── Edit the play's recorded stats (writes to `plays`; stats recompute) ──
  const handleSavePlayEdit = useCallback(async (playId: string, result: PlayEditResult) => {
    const original = plays.find((p) => p.id === playId);
    const pd = (original?.play_data ?? {}) as Record<string, any>;

    const ok = await updatePlayFull(
      playId,
      {
        play_type: result.playType.id,
        yards_gained: result.yards,
        is_touchdown: result.isTouchdown,
        is_turnover: ["int", "fumble"].includes(result.playType.id),
        is_penalty: !!result.penalty,
        primary_player_id: result.tagged.find((t) => !t.isOpponent)?.player_id ?? null,
        description: result.description,
        ...(result.offensiveFormation != null ? { offensive_formation: result.offensiveFormation } : {}),
        ...(result.defensiveFormation != null ? { defensive_formation: result.defensiveFormation } : {}),
        ...(result.hashMark != null ? { hash_mark: result.hashMark } : {}),
        play_data: {
          ...pd,
          result: result.result || null,
          is_first_down: result.isFirstDown,
          is_touchback: result.isTouchback,
          penalty_type: result.penalty,
          play_category: result.penaltyCategory,
          penalty_yards: result.flagYards,
          blocked_kick_type: result.blockedKickType,
          next_possession: null,
          next_down: null,
          next_distance: null,
          next_yard_line: null,
          next_situation_source:
            result.penalty || result.playType.id === "blocked_kick" ? "pending_review" : "auto",
        },
      },
      result.tagged
        .filter((t) => !t.isOpponent)
        .map((t) => ({ player_id: t.player_id, role: t.role, credit: t.credit ?? null })),
    );

    if (!ok) {
      setError("Couldn't save the play edit — check your connection and try again.");
      return;
    }

    setEditRecord(null);
    const refreshed = await load();
    const row = refreshed.find((p) => p.id === playId) ?? null;
    setEditingPlay(row);
    if (row) setSitDraft(situationFromPlay(row));
  }, [plays, load]);

  const handleDeletePlayEdit = useCallback(async (playId: string) => {
    if (!window.confirm("Delete this play? Game and season stats will update to match.")) return;
    await deletePlay(playId, gameId);
    setEditRecord(null);
    setEditingPlay(null);
    setDraft(null);
    await load();
  }, [gameId, load]);

  const chartedCount = useMemo(
    () => plays.filter((p) => hasChartingDetail(charting[p.id])).length,
    [plays, charting],
  );

  const handleExport = useCallback(() => {
    if (plays.length === 0) return;
    const safeOpp = (meta?.opponent_name || "opponent").replace(/[^a-z0-9-_]+/gi, "_");
    const safeDate = (meta?.game_date || "").slice(0, 10) || "game";
    const abbr = program?.abbreviation ?? "DRAGON";
    exportChartingCsv(plays, charting, `${abbr}_film_chart_vs_${safeOpp}_${safeDate}.csv`);
  }, [plays, charting, meta, program]);

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate(`/game/${gameId}/summary`)} className="btn-ghost p-2 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] leading-none">Film Chart</h1>
          {meta && (
            <div className="text-[11px] text-surface-muted font-semibold mt-1">vs {meta.opponent_name}</div>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={plays.length === 0}
          className="btn-ghost p-2 cursor-pointer"
          title="Export CSV for Hudl"
        >
          <Download className="w-5 h-5" />
        </button>
      </div>
      <div className="mx-5 mt-1 mb-3 accent-line" />

      {/* Summary strip */}
      {!loading && plays.length > 0 && (
        <div className="px-5 pb-2 flex items-center gap-2 text-[11px] font-semibold text-surface-muted">
          <Film className="w-3.5 h-3.5" />
          <span>{plays.length} plays</span>
          <span className="text-surface-border">·</span>
          <span className="text-emerald-400">{chartedCount} charted</span>
          <span className="ml-auto text-surface-muted/70">Tap a row to chart</span>
        </div>
      )}

      <div className="flex-1 px-2 overflow-auto pb-8">
        {loading && (
          <div className="text-slate-500 text-sm text-center py-12 animate-pulse">Loading plays…</div>
        )}

        {error && (
          <div className="card p-4 mx-3 border border-red-500/30 text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && plays.length === 0 && (
          <div className="card p-8 mx-3 text-center text-slate-500 text-sm">No plays recorded for this game.</div>
        )}

        {!loading && plays.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-surface-muted border-b border-surface-border">
                  <Th className="w-6"> </Th>
                  <Th className="w-8 text-right">#</Th>
                  <Th className="w-10">Q</Th>
                  <Th className="w-12">Time</Th>
                  <Th className="w-8">U</Th>
                  <Th className="w-12">Dn</Th>
                  <Th className="w-14">Ball</Th>
                  <Th className="w-12">Hash</Th>
                  <Th className="w-10">Pers</Th>
                  <Th className="w-20">Form</Th>
                  <Th>Play</Th>
                  <Th className="w-8">R/P</Th>
                  <Th className="w-10 text-right">Gn</Th>
                  <Th className="w-14">Flags</Th>
                </tr>
              </thead>
              <tbody>
                {plays.map((p) => {
                  const c = charting[p.id];
                  const charted = hasChartingDetail(c);
                  const unit = unitFor(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openCharting(p)}
                      className="border-b border-surface-border/40 cursor-pointer hover:bg-surface-cardHover active:bg-surface-cardHover"
                    >
                      <Td>
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${charted ? "bg-emerald-500" : "bg-surface-border"}`}
                          title={charted ? "Charted" : "Not charted"}
                        />
                      </Td>
                      <Td className="text-right font-mono text-surface-muted">{p.sequence}</Td>
                      <Td className="font-mono">{quarterLabel(p.quarter)}</Td>
                      <Td className="font-mono text-surface-muted">{p.clock ?? "—"}</Td>
                      <Td>
                        <span className="font-black" style={{ color: UNIT_COLOR[unit] }}>{unit}</span>
                      </Td>
                      <Td className="font-mono">{downDistance(p)}</Td>
                      <Td className="font-mono text-surface-muted">{yardLabel(p.yard_line ?? 0)}</Td>
                      <Td className="capitalize">{c?.hash_mark ?? p.hash_mark ?? "—"}</Td>
                      <Td className="font-mono">{c?.personnel ?? "—"}</Td>
                      <Td className="truncate max-w-[80px]">{c?.offensive_formation ?? p.offensive_formation ?? "—"}</Td>
                      <Td className="text-slate-300 truncate max-w-[180px]">{p.description ?? typeLabel(p)}</Td>
                      <Td className="font-bold">{runPassFor(p)}</Td>
                      <Td className="text-right font-mono font-bold">{gainLabel(p)}</Td>
                      <Td>
                        <span className="flex gap-1">
                          {p.is_touchdown && <Flag text="TD" cls="bg-emerald-900/50 text-emerald-400" />}
                          {p.is_turnover && <Flag text="TO" cls="bg-red-900/50 text-red-400" />}
                          {p.is_penalty && <Flag text="PEN" cls="bg-yellow-900/40 text-yellow-400" />}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Datalists for formation autocomplete */}
      <datalist id="off-formations">
        {OFFENSIVE_FORMATIONS.map((f) => <option key={f} value={f} />)}
      </datalist>
      <datalist id="def-formations">
        {DEFENSIVE_FORMATIONS.map((f) => <option key={f} value={f} />)}
      </datalist>

      {/* Charting sheet */}
      {editingPlay && draft && (
        <ChartingSheet
          play={editingPlay}
          draft={draft}
          saving={saving}
          onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          onClose={() => { setEditingPlay(null); setDraft(null); setSitDraft(null); }}
          onSave={handleSaveCharting}
          onEditPlay={() => editingPlay && setEditRecord(rowToPlayRecord(editingPlay))}
          sitDraft={sitDraft}
          onSitChange={(patch) => setSitDraft((d) => (d ? { ...d, ...patch } : d))}
          onSaveSituation={handleSaveSituation}
          savingSit={savingSit}
        />
      )}

      {/* Play-data editor (same component the live screen uses) */}
      {editRecord && (
        <PlayEditModal
          play={editRecord}
          roster={roster}
          opponentPlayers={oppPlayers}
          progName={program?.name ?? "Team"}
          oppName={meta?.opponent_name ?? "Opponent"}
          ballOnBefore={editRecord.ballOn}
          downBefore={editRecord.down}
          distanceBefore={editRecord.distance}
          onSave={handleSavePlayEdit}
          onDelete={handleDeletePlayEdit}
          onClose={() => setEditRecord(null)}
        />
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left py-2 px-1.5 font-bold whitespace-nowrap ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2 px-1.5 whitespace-nowrap ${className}`}>{children}</td>;
}
