import { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import {
  type PlayTypeDef,
  type RosterPlayer,
  type OpponentPlayerRef,
  type TaggedPlayer,
  type GameState,
  PENALTIES,
  PENALTY_DEFAULT_YARDS,
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  yardLabel,
  buildDescription,
} from "./types";

interface Props {
  playType: PlayTypeDef;
  gameState: GameState;
  roster: RosterPlayer[];
  opponentPlayers: OpponentPlayerRef[];
  onSubmit: (data: PlaySubmitData) => void;
  onClose: () => void;
}

export interface PlaySubmitData {
  playType: PlayTypeDef;
  tagged: TaggedPlayer[];
  yards: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  isTouchback: boolean;
  result: string; // "Good" | "No Good" | "Complete" | "Incomplete" | ""
  penalty: string | null;
  flagYards: number;
  offensiveFormation: string | null;
  defensiveFormation: string | null;
  hashMark: string | null;
  description: string;
}

type Step = "players" | "yards" | "formations" | "defense" | "review";

/* ── Player selector grid ── */
function PlayerGrid({
  roster, label, onSelect, selectedId, search, onSearch,
}: {
  roster: RosterPlayer[];
  label: string;
  onSelect: (p: RosterPlayer) => void;
  selectedId: string | null;
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search) return roster;
    const q = search.toLowerCase();
    return roster.filter(p =>
      String(p.jersey_number).includes(q) ||
      p.player.first_name.toLowerCase().includes(q) ||
      p.player.last_name.toLowerCase().includes(q) ||
      (p.position ?? "").toLowerCase().includes(q)
    );
  }, [roster, search]);

  return (
    <div>
      <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">{label}</div>
      <input
        type="text"
        placeholder="# or name..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        className="input mb-2 text-sm"
        autoFocus
      />
      <div className="grid grid-cols-5 gap-1.5 max-h-56 overflow-y-auto">
        {filtered.map(p => (
          <button
            key={p.player_id}
            onClick={() => onSelect(p)}
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-colors ${
              selectedId === p.player_id
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : "border-transparent bg-surface-bg text-neutral-400 active:bg-surface-hover"
            }`}
          >
            <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
            <span className="text-[8px] font-bold text-neutral-500 truncate w-full text-center">
              {p.player.preferred_name || p.player.first_name}
            </span>
            <span className="text-[7px] font-bold text-neutral-600">{p.position ?? ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Opponent player selector ── */
function OpponentPlayerGrid({
  players, label, onSelect, selectedId, search, onSearch,
}: {
  players: OpponentPlayerRef[];
  label: string;
  onSelect: (p: OpponentPlayerRef) => void;
  selectedId: string | null;
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    if (!search) return players;
    const q = search.toLowerCase();
    return players.filter(p =>
      String(p.jersey_number).includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.position ?? "").toLowerCase().includes(q)
    );
  }, [players, search]);

  return (
    <div>
      <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">{label}</div>
      <input
        type="text"
        placeholder="# or name..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        className="input mb-2 text-sm"
      />
      <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto">
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-colors ${
              selectedId === p.id
                ? "border-red-500 bg-red-500/10 text-red-400"
                : "border-transparent bg-surface-bg text-neutral-400 active:bg-surface-hover"
            }`}
          >
            <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
            <span className="text-[8px] font-bold text-neutral-500 truncate w-full text-center">{p.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-5 text-xs text-neutral-600 text-center py-4">
            No opponent players found. You can skip this step.
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PLAY ENTRY MODAL (Progressive, FSA-style)
   ═══════════════════════════════════════════════ */

export default function PlayEntryModal({ playType, gameState, roster, opponentPlayers, onSubmit, onClose }: Props) {
  // Tagged players for this play
  const [tagged, setTagged] = useState<TaggedPlayer[]>([]);
  const [currentRoleIdx, setCurrentRoleIdx] = useState(0);
  const [searches, setSearches] = useState<Record<string, string>>({});

  // Yards
  const [yards, setYards] = useState(0);
  const [yardMode, setYardMode] = useState<"stepper" | "exact">("stepper");
  const [yardRaw, setYardRaw] = useState("");

  // Toggles
  const [isTD, setIsTD] = useState(false);
  const [isFirstDown, setIsFirstDown] = useState(false);
  const [isTouchback, setIsTouchback] = useState(false);
  const [result, setResult] = useState<"Good" | "No Good" | "">("");

  // Penalty
  const [penalty, setPenalty] = useState<string | null>(null);
  const [flagYards, setFlagYards] = useState(5);
  const [showPenalties, setShowPenalties] = useState(false);

  // Formations
  const [offFormation, setOffFormation] = useState<string | null>(null);
  const [defFormation, setDefFormation] = useState<string | null>(null);
  const [hashMark, setHashMark] = useState<string | null>(null);

  // Defensive credit (tacklers)
  const [tacklers, setTacklers] = useState<TaggedPlayer[]>([]);
  const [tacklerSearch, setTacklerSearch] = useState("");

  // Step management
  const roles = playType.roles;
  const needsYards = !["pass_inc", "spike", "penalty_only", "pat", "two_pt"].includes(playType.id);
  const needsResult = ["pat", "fg", "two_pt"].includes(playType.id);
  const needsTouchback = ["kickoff", "punt"].includes(playType.id);

  const steps: Step[] = [];
  if (roles.length > 0) steps.push("players");
  if (needsYards || needsResult) steps.push("yards");
  steps.push("formations");
  if (gameState.possession === "us") steps.push("defense"); // Capture tacklers on our offensive plays
  steps.push("review");

  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx] ?? "review";

  const canGoNext = (): boolean => {
    if (currentStep === "players") {
      // At minimum first role should be filled (unless no roles)
      return roles.length === 0 || tagged.length > 0;
    }
    return true;
  };

  const goNext = () => { if (stepIdx < steps.length - 1 && canGoNext()) setStepIdx(s => s + 1); };
  const goBack = () => { if (stepIdx > 0) setStepIdx(s => s - 1); };

  const handlePlayerSelect = (p: RosterPlayer) => {
    const role = roles[currentRoleIdx];
    if (!role) return;
    const tp: TaggedPlayer = {
      id: p.player_id,
      player_id: p.player_id,
      jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`,
      role,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    // Advance to next role or next step
    if (currentRoleIdx < roles.length - 1) {
      setCurrentRoleIdx(i => i + 1);
    } else {
      goNext();
    }
  };

  const handleOpponentSelect = (p: OpponentPlayerRef) => {
    const role = roles[currentRoleIdx];
    if (!role) return;
    const tp: TaggedPlayer = {
      id: p.id,
      player_id: p.id,
      jersey_number: p.jersey_number,
      name: p.name,
      role,
      isOpponent: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    if (currentRoleIdx < roles.length - 1) {
      setCurrentRoleIdx(i => i + 1);
    } else {
      goNext();
    }
  };

  const handleAddTackler = (p: RosterPlayer) => {
    if (tacklers.length >= 3) return;
    if (tacklers.some(t => t.player_id === p.player_id)) {
      setTacklers(prev => prev.filter(t => t.player_id !== p.player_id));
      return;
    }
    const credit = tacklers.length === 0 ? 1 : 0.5;
    const tp: TaggedPlayer = {
      id: p.player_id,
      player_id: p.player_id,
      jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`,
      role: "tackler",
      credit,
    };
    setTacklers(prev => {
      const updated = [...prev, tp];
      // Recalculate credits: 1 player = 1.0, 2+ = 0.5 each
      if (updated.length > 1) {
        return updated.map(t => ({ ...t, credit: 0.5 }));
      }
      return updated;
    });
    setTacklerSearch("");
  };

  const handleSubmit = () => {
    const allTagged = [...tagged, ...tacklers];
    const passResult = playType.id === "pass_comp" ? "Complete" : playType.id === "pass_inc" ? "Incomplete" : "";
    const finalResult = result || passResult;

    const isZeroYard = ["pass_inc", "spike", "penalty_only"].includes(playType.id) || needsResult;
    const playYards = isZeroYard ? 0 : yards;
    const newBallOn = Math.min(100, Math.max(0, gameState.ballOn + playYards));
    const earnedFirst = isFirstDown || (playYards >= gameState.distance && gameState.down <= 4);
    const scored = isTD || newBallOn >= 100;

    const desc = buildDescription(playType, allTagged, playYards, scored, penalty, finalResult);

    onSubmit({
      playType,
      tagged: allTagged,
      yards: playYards,
      isTouchdown: scored,
      isFirstDown: earnedFirst,
      isTouchback,
      result: finalResult,
      penalty,
      flagYards: penalty ? flagYards : 0,
      offensiveFormation: offFormation,
      defensiveFormation: defFormation,
      hashMark,
      description: desc,
    });
  };

  /* ── Determine which players to show for current role ── */
  const currentRole = roles[currentRoleIdx];
  const isOpponentRole = ["interceptor", "returner"].includes(currentRole) && gameState.possession === "us"
    ? false // For our plays, interceptor/returner are opponent — but we only have them for turnovers
    : ["interceptor"].includes(currentRole); // Interceptor is opponent player

  return (
    <div className="sheet bg-black/80">
      <div className="sheet-panel max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-2 shrink-0 border-b border-surface-border">
          {stepIdx > 0 ? (
            <button onClick={goBack} className="btn-ghost p-1.5"><ChevronLeft className="w-5 h-5" /></button>
          ) : (
            <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
          )}
          <div className="flex-1">
            <div className="text-sm font-black">{playType.label}</div>
            <div className="text-[10px] text-neutral-500">
              Step {stepIdx + 1} of {steps.length}: {currentStep.charAt(0).toUpperCase() + currentStep.slice(1)}
            </div>
          </div>
          {/* Step dots */}
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === stepIdx ? "bg-dragon-primary" : i < stepIdx ? "bg-emerald-500" : "bg-neutral-700"}`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* ── STEP: Players ── */}
          {currentStep === "players" && (
            <>
              {/* Role tabs */}
              <div className="flex gap-1.5 flex-wrap">
                {roles.map((role, i) => {
                  const tp = tagged.find(t => t.role === role);
                  return (
                    <button key={role} onClick={() => setCurrentRoleIdx(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                        currentRoleIdx === i
                          ? "bg-dragon-primary text-white"
                          : tp ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-surface-bg text-neutral-500"
                      }`}>
                      {role}{tp ? `: #${tp.jersey_number}` : ""}
                    </button>
                  );
                })}
              </div>

              {/* Show our roster or opponent roster depending on role */}
              {isOpponentRole ? (
                <OpponentPlayerGrid
                  players={opponentPlayers}
                  label={`Select ${currentRole} (opponent)`}
                  onSelect={handleOpponentSelect}
                  selectedId={tagged.find(t => t.role === currentRole)?.id ?? null}
                  search={searches[currentRole] ?? ""}
                  onSearch={v => setSearches(s => ({ ...s, [currentRole]: v }))}
                />
              ) : (
                <PlayerGrid
                  roster={roster}
                  label={`Select ${currentRole}`}
                  onSelect={handlePlayerSelect}
                  selectedId={tagged.find(t => t.role === currentRole)?.player_id ?? null}
                  search={searches[currentRole] ?? ""}
                  onSearch={v => setSearches(s => ({ ...s, [currentRole]: v }))}
                />
              )}
            </>
          )}

          {/* ── STEP: Yards / Result ── */}
          {currentStep === "yards" && (
            <>
              {needsYards && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label">Yards</label>
                    <div className="flex gap-1 bg-surface-bg rounded-lg p-0.5">
                      {(["stepper", "exact"] as const).map(mode => (
                        <button key={mode} onClick={() => { setYardMode(mode); setYardRaw(""); }}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                            yardMode === mode ? "bg-dragon-primary text-white" : "text-neutral-500"
                          }`}>
                          {mode === "stepper" ? "+/−" : "Type"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {yardMode === "stepper" && (
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
                  )}

                  {yardMode === "exact" && (
                    <input
                      type="number" inputMode="numeric"
                      placeholder="e.g. −3 or 14"
                      value={yardRaw}
                      onChange={e => { setYardRaw(e.target.value); const n = parseInt(e.target.value, 10); if (!isNaN(n)) setYards(n); }}
                      className="input text-center text-xl font-black tabular-nums"
                    />
                  )}

                  <div className="text-xs text-neutral-500 mt-1">
                    {yardLabel(gameState.ballOn)} → {yardLabel(Math.min(99, Math.max(1, gameState.ballOn + yards)))}
                  </div>
                </div>
              )}

              {needsResult && (
                <div>
                  <label className="label block mb-1.5">Result</label>
                  <div className="flex gap-2">
                    {(["Good", "No Good"] as const).map(r => (
                      <button key={r} onClick={() => setResult(prev => prev === r ? "" : r)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                          result === r
                            ? r === "Good" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-red-500 bg-red-500/20 text-red-400"
                            : "border-surface-border bg-surface-bg text-neutral-500"
                        }`}>{r}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* TD / First Down toggles */}
              {!needsResult && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setIsTD(t => !t)}
                    className={`py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                      isTD ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-neutral-500"
                    }`}>TD</button>
                  <button onClick={() => setIsFirstDown(f => !f)}
                    className={`py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                      isFirstDown ? "border-blue-500 bg-blue-500/20 text-blue-400" : "border-surface-border bg-surface-bg text-neutral-500"
                    }`}>1st Down</button>
                </div>
              )}

              {/* Touchback */}
              {needsTouchback && (
                <button onClick={() => setIsTouchback(t => !t)}
                  className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                    isTouchback ? "border-sky-500 bg-sky-500/20 text-sky-400" : "border-surface-border bg-surface-bg text-neutral-500"
                  }`}>Touchback</button>
              )}

              {/* Penalty */}
              <button onClick={() => setShowPenalties(s => !s)}
                className={`w-full py-2 rounded-xl text-xs font-bold border transition-colors ${
                  penalty ? "border-orange-500/50 bg-orange-500/10 text-orange-400" : "border-surface-border bg-surface-bg text-neutral-500"
                }`}>
                <Flag className="w-3 h-3 inline mr-1" />
                {penalty ? `${penalty} · ${flagYards} yds` : "Add Penalty"}
              </button>

              {showPenalties && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {PENALTIES.map(p => (
                      <button key={p} onClick={() => { setPenalty(p); setFlagYards(PENALTY_DEFAULT_YARDS[p] ?? 5); setShowPenalties(false); }}
                        className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border text-left transition-colors ${
                          penalty === p ? "border-orange-500 bg-orange-500/15 text-orange-400" : "border-surface-border text-neutral-400"
                        }`}>{p}</button>
                    ))}
                  </div>
                  {penalty && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500">Penalty yards:</span>
                      <input type="number" value={flagYards} onChange={e => setFlagYards(Number(e.target.value))}
                        className="input w-16 text-center text-sm" />
                      <button onClick={() => { setPenalty(null); setFlagYards(5); }} className="text-xs text-red-400 ml-auto">Clear</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── STEP: Formations ── */}
          {currentStep === "formations" && (
            <>
              <div>
                <label className="label block mb-1.5">Hash Mark</label>
                <div className="flex gap-2">
                  {(["left", "middle", "right"] as const).map(h => (
                    <button key={h} onClick={() => setHashMark(prev => prev === h ? null : h)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 capitalize transition-colors ${
                        hashMark === h ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border bg-surface-bg text-neutral-500"
                      }`}>{h}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Offensive Formation</label>
                <div className="flex flex-wrap gap-1.5">
                  {OFFENSIVE_FORMATIONS.map(f => (
                    <button key={f} onClick={() => setOffFormation(prev => prev === f ? null : f)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                        offFormation === f ? "border-blue-500 bg-blue-500/15 text-blue-400" : "border-surface-border text-neutral-500"
                      }`}>{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Defensive Formation</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFENSIVE_FORMATIONS.map(f => (
                    <button key={f} onClick={() => setDefFormation(prev => prev === f ? null : f)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                        defFormation === f ? "border-red-500 bg-red-500/15 text-red-400" : "border-surface-border text-neutral-500"
                      }`}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-neutral-600 text-center">
                Formations are optional — skip if not tracking.
              </div>
            </>
          )}

          {/* ── STEP: Defense (tacklers) ── */}
          {currentStep === "defense" && (
            <>
              <div className="text-xs text-neutral-400 mb-1">
                Select up to 3 tacklers. 1 player = 1.0 credit, 2+ = 0.5 each.
              </div>
              {tacklers.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {tacklers.map(t => (
                    <span key={t.player_id} className="flex items-center gap-1 text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded-lg">
                      #{t.jersey_number} {t.name.split(" ")[1]}
                      <span className="text-[10px] text-red-500">({t.credit})</span>
                      <button onClick={() => setTacklers(prev => {
                        const next = prev.filter(x => x.player_id !== t.player_id);
                        if (next.length === 1) return next.map(x => ({ ...x, credit: 1 }));
                        return next;
                      })} className="ml-0.5 text-red-500"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <PlayerGrid
                roster={roster}
                label="Select tackler(s)"
                onSelect={p => handleAddTackler(p)}
                selectedId={null}
                search={tacklerSearch}
                onSearch={setTacklerSearch}
              />
              <div className="text-[10px] text-neutral-600 text-center mt-2">
                Optional — skip if not tracking defensive credit on this play.
              </div>
            </>
          )}

          {/* ── STEP: Review ── */}
          {currentStep === "review" && (
            <div className="space-y-3">
              <div className="text-sm font-bold text-neutral-300">Review Play</div>
              <div className="card p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Type</span>
                  <span className="font-bold">{playType.label}</span>
                </div>
                {tagged.map(t => (
                  <div key={t.role} className="flex justify-between">
                    <span className="text-neutral-500 capitalize">{t.role}</span>
                    <span className="font-bold">#{t.jersey_number} {t.name}</span>
                  </div>
                ))}
                {needsYards && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Yards</span>
                    <span className={`font-bold ${yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : ""}`}>
                      {yards > 0 ? `+${yards}` : yards}
                    </span>
                  </div>
                )}
                {needsResult && result && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Result</span>
                    <span className={`font-bold ${result === "Good" ? "text-emerald-400" : "text-red-400"}`}>{result}</span>
                  </div>
                )}
                {(isTD || isFirstDown) && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Flags</span>
                    <span className="font-bold">
                      {[isTD && "TD", isFirstDown && "1st Down"].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {penalty && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Penalty</span>
                    <span className="font-bold text-orange-400">{penalty} ({flagYards} yds)</span>
                  </div>
                )}
                {offFormation && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">OFF</span>
                    <span className="font-bold">{offFormation}</span>
                  </div>
                )}
                {defFormation && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">DEF</span>
                    <span className="font-bold">{defFormation}</span>
                  </div>
                )}
                {tacklers.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Tacklers</span>
                    <span className="font-bold">{tacklers.map(t => `#${t.jersey_number}`).join(", ")}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="p-4 pt-2 border-t border-surface-border shrink-0 flex gap-2">
          {currentStep !== "review" ? (
            <>
              <button onClick={goBack} disabled={stepIdx === 0} className="btn-ghost flex-1 py-2.5 text-sm font-bold disabled:opacity-30">
                <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
              </button>
              <button onClick={goNext} disabled={!canGoNext()} className="btn-primary flex-1 py-2.5 text-sm font-bold disabled:opacity-50">
                Next <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </>
          ) : (
            <button onClick={handleSubmit} className="btn-primary w-full py-3 text-sm font-black">
              Record Play
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
