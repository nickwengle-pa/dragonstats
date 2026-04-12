import { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Flag, Trash2 } from "lucide-react";
import {
  type BlockedKickType,
  type PenaltySide,
  type PlayTypeDef,
  type RosterPlayer,
  type OpponentPlayerRef,
  type TaggedPlayer,
  type PlayRecord,
  BLOCKED_KICK_TYPES,
  PLAY_TYPES,
  PENALTIES,
  PENALTY_DEFAULT_YARDS,
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  yardLabel,
  buildDescription,
  findPlayTypeDef,
  getPenaltyDefaultSide,
} from "./types";

/* ── Edit result passed back to GameScreen ── */
export interface PlayEditResult {
  playType: PlayTypeDef;
  tagged: TaggedPlayer[];
  yards: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  isTouchback: boolean;
  result: string;
  penalty: string | null;
  penaltyCategory: PenaltySide | null;
  flagYards: number;
  blockedKickType: BlockedKickType | null;
  offensiveFormation: string | null;
  defensiveFormation: string | null;
  hashMark: string | null;
  description: string;
}

interface Props {
  play: PlayRecord;
  roster: RosterPlayer[];
  opponentPlayers: OpponentPlayerRef[];
  ballOnBefore: number;
  downBefore: number;
  distanceBefore: number;
  onSave: (playId: string, result: PlayEditResult) => void;
  onDelete: (playId: string) => void;
  onClose: () => void;
}

type Step = "type" | "players" | "yards" | "formations" | "defense" | "review";

function inferTwoPointStyle(play: PlayRecord): "pass" | "run" {
  if (play.type !== "two_pt") return "pass";
  return play.tagged.some((tag) => tag.role === "rusher") ? "run" : "pass";
}

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
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
      <input
        type="text" placeholder="# or name..." value={search}
        onChange={e => onSearch(e.target.value)} className="input mb-2 text-sm"
      />
      <div className="grid grid-cols-5 gap-1.5 max-h-56 overflow-y-auto">
        {filtered.map(p => (
          <button key={p.player_id} onClick={() => onSelect(p)}
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-200 ${
              selectedId === p.player_id
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : "border-transparent bg-surface-bg text-slate-400 active:bg-surface-hover"
            }`}>
            <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
            <span className="text-[8px] font-bold text-slate-500 truncate w-full text-center">
              {p.player.preferred_name || p.player.first_name}
            </span>
            <span className="text-[7px] font-bold text-slate-600">{p.position ?? ""}</span>
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
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
      <input
        type="text" placeholder="# or name..." value={search}
        onChange={e => onSearch(e.target.value)} className="input mb-2 text-sm"
      />
      <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto">
        {filtered.map(p => (
          <button key={p.id} onClick={() => onSelect(p)}
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-200 ${
              selectedId === p.id
                ? "border-red-500 bg-red-500/10 text-red-400"
                : "border-transparent bg-surface-bg text-slate-400 active:bg-surface-hover"
            }`}>
            <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
            <span className="text-[8px] font-bold text-slate-500 truncate w-full text-center">{p.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-5 text-xs text-slate-600 text-center py-4">No opponent players found.</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PLAY EDIT MODAL — Full play editor
   ═══════════════════════════════════════════════ */

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-900/60 text-emerald-400 border-emerald-700/50",
  blue: "bg-blue-900/60 text-blue-400 border-blue-700/50",
  red: "bg-red-900/60 text-red-400 border-red-700/50",
  amber: "bg-amber-900/60 text-amber-400 border-amber-700/50",
  purple: "bg-purple-900/60 text-purple-400 border-purple-700/50",
  orange: "bg-orange-900/60 text-orange-400 border-orange-700/50",
  yellow: "bg-yellow-900/60 text-yellow-400 border-yellow-700/50",
  neutral: "bg-slate-800 text-slate-400 border-slate-700/50",
};

export default function PlayEditModal({
  play, roster, opponentPlayers, ballOnBefore, downBefore, distanceBefore,
  onSave, onDelete, onClose,
}: Props) {
  // Play type
  const [playType, setPlayType] = useState<PlayTypeDef>(findPlayTypeDef(play.type) ?? PLAY_TYPES[0]);

  // Tagged players (non-tackler roles from original play)
  const initTagged = play.tagged.filter(t => t.role !== "tackler");
  const initTacklers = play.tagged.filter(t => t.role === "tackler");
  const [tagged, setTagged] = useState<TaggedPlayer[]>(initTagged);
  const [currentRoleIdx, setCurrentRoleIdx] = useState(0);
  const [searches, setSearches] = useState<Record<string, string>>({});

  // Yards
  const [yards, setYards] = useState(play.yards);
  const [yardMode, setYardMode] = useState<"stepper" | "exact">("stepper");
  const [yardRaw, setYardRaw] = useState("");

  // Toggles
  const [isTD, setIsTD] = useState(play.isTouchdown);
  const [isFirstDown, setIsFirstDown] = useState(play.firstDown);
  const [isTouchback, setIsTouchback] = useState(Boolean(play.isTouchback));
  const resultInit = play.result || "";
  const [result, setResult] = useState<"Good" | "No Good" | "">(
    resultInit === "Good" ? "Good" : resultInit === "No Good" ? "No Good" : ""
  );

  // Penalty
  const [penalty, setPenalty] = useState<string | null>(play.penalty);
  const [penaltyCategory, setPenaltyCategory] = useState<PenaltySide | null>(play.penaltyCategory ?? null);
  const [flagYards, setFlagYards] = useState(play.flagYards);
  const [showPenalties, setShowPenalties] = useState(false);
  const [blockedKickType, setBlockedKickType] = useState<BlockedKickType | null>(play.blockedKickType ?? null);

  // Formations
  const [offFormation, setOffFormation] = useState<string | null>(play.offensiveFormation ?? null);
  const [defFormation, setDefFormation] = useState<string | null>(play.defensiveFormation ?? null);
  const [hashMark, setHashMark] = useState<string | null>(play.hashMark ?? null);

  // Defense (tacklers)
  const [tacklers, setTacklers] = useState<TaggedPlayer[]>(initTacklers);
  const [tacklerSearch, setTacklerSearch] = useState("");

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Step management
  const [twoPointStyle, setTwoPointStyle] = useState<"pass" | "run">(() => inferTwoPointStyle(play));
  const roles = useMemo(() => {
    if (playType.id !== "two_pt") return playType.roles;
    return twoPointStyle === "run" ? ["rusher"] : ["passer", "receiver"];
  }, [playType, twoPointStyle]);
  const needsYards = !["pass_inc", "spike", "penalty_only", "pat", "two_pt"].includes(playType.id);
  const needsResult = ["pat", "fg", "two_pt"].includes(playType.id);
  const needsTouchback = ["kickoff", "punt"].includes(playType.id);

  const steps: Step[] = ["type"];
  if (roles.length > 0) steps.push("players");
  if (needsYards || needsResult) steps.push("yards");
  steps.push("formations");
  // Show tackler step when opponent has the ball (our defense is on the field)
  // OR when we have the ball (record opponent tacklers — but those would be opponent players)
  steps.push("defense");
  steps.push("review");

  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx] ?? "review";

  const canGoNext = () => {
    if (currentStep === "players") {
      return roles.length === 0 || roles.every((role) => tagged.some((player) => player.role === role));
    }
    if (currentStep === "review" && penalty) {
      return !!penaltyCategory;
    }
    return true;
  };

  const goNext = () => { if (stepIdx < steps.length - 1 && canGoNext()) setStepIdx(s => s + 1); };
  const goBack = () => { if (stepIdx > 0) setStepIdx(s => s - 1); };

  const handleChangePlayType = (pt: PlayTypeDef) => {
    setPlayType(pt);
    if (pt.id !== "two_pt") setTwoPointStyle("pass");
    if (pt.id !== "blocked_kick") setBlockedKickType(null);
    if (pt.roles.join(",") !== playType.roles.join(",")) {
      setTagged([]);
      setCurrentRoleIdx(0);
    }
  };

  const handlePlayerSelect = (p: RosterPlayer) => {
    const role = roles[currentRoleIdx];
    if (!role) return;
    const tp: TaggedPlayer = {
      id: p.player_id, player_id: p.player_id, jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`, role,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    if (currentRoleIdx < roles.length - 1) setCurrentRoleIdx(i => i + 1);
  };

  const handleOpponentSelect = (p: OpponentPlayerRef) => {
    const role = roles[currentRoleIdx];
    if (!role) return;
    const tp: TaggedPlayer = {
      id: p.id, player_id: p.id, jersey_number: p.jersey_number,
      name: p.name, role, isOpponent: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    if (currentRoleIdx < roles.length - 1) setCurrentRoleIdx(i => i + 1);
  };

  const handleAddTackler = (p: RosterPlayer) => {
    if (tacklers.length >= 3) return;
    if (tacklers.some(t => t.player_id === p.player_id)) {
      setTacklers(prev => {
        const next = prev.filter(t => t.player_id !== p.player_id);
        if (next.length === 1) return next.map(t => ({ ...t, credit: 1 }));
        return next;
      });
      return;
    }
    const tp: TaggedPlayer = {
      id: p.player_id, player_id: p.player_id, jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`, role: "tackler", credit: 1,
    };
    setTacklers(prev => {
      const updated = [...prev, tp];
      if (updated.length > 1) return updated.map(t => ({ ...t, credit: 0.5 }));
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
    const newBallOn = Math.min(100, Math.max(0, ballOnBefore + playYards));
    const earnedFirst = isFirstDown || (playYards >= distanceBefore && downBefore <= 4);
    const scored = isTD || newBallOn >= 100;

    const desc = buildDescription(playType, allTagged, playYards, scored, penalty, finalResult);

    onSave(play.id, {
      playType,
      tagged: allTagged,
      yards: playYards,
      isTouchdown: scored,
      isFirstDown: earnedFirst,
      isTouchback,
      result: finalResult,
      penalty,
      penaltyCategory,
      flagYards: penalty ? flagYards : 0,
      blockedKickType: playType.id === "blocked_kick" ? blockedKickType : null,
      offensiveFormation: offFormation,
      defensiveFormation: defFormation,
      hashMark,
      description: desc,
    });
  };

  const currentRole = roles[currentRoleIdx];
  const OFFENSIVE_ROLES = new Set(["rusher", "passer", "receiver", "target", "kicker", "punter", "returner"]);
  // When opponent has ball, offensive roles use their roster; when we have ball, offensive roles use ours
  const isOpponentRole = play.possession === "them"
    ? OFFENSIVE_ROLES.has(currentRole)  // opponent on offense → their roster for offensive roles
    : ["interceptor"].includes(currentRole); // we're on offense → only interceptor is opponent

  return (
    <div className="sheet bg-black/60 backdrop-blur-sm">
      <div className="sheet-panel max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-2 shrink-0 border-b border-surface-border">
          {stepIdx > 0 && (
            <button onClick={goBack} className="btn-ghost p-1.5"><ChevronLeft className="w-5 h-5" /></button>
          )}
          <div className="flex-1">
            <div className="text-sm font-black">Edit Play</div>
            <div className="text-[10px] text-slate-500">
              Step {stepIdx + 1} of {steps.length}: {currentStep.charAt(0).toUpperCase() + currentStep.slice(1)}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <button key={i} onClick={() => setStepIdx(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                  i === stepIdx ? "bg-dragon-primary" : i < stepIdx ? "bg-emerald-500" : "bg-slate-700"
                }`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* ── STEP: Play Type ── */}
          {currentStep === "type" && (
            <>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Change Play Type</div>
              <div className="grid grid-cols-4 gap-1.5">
                {PLAY_TYPES.map(pt => (
                  <button key={pt.id} onClick={() => handleChangePlayType(pt)}
                    className={`py-2.5 px-1 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                      playType.id === pt.id
                        ? "ring-2 ring-white " + (COLOR_MAP[pt.color] ?? COLOR_MAP.neutral)
                        : COLOR_MAP[pt.color] ?? COLOR_MAP.neutral
                    }`}>
                    {pt.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-600 text-center">
                Current: <span className="font-bold text-slate-400">{playType.label}</span>
              </div>
            </>
          )}

          {/* ── STEP: Players ── */}
          {currentStep === "players" && (
            <>
              {playType.id === "two_pt" && (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conversion Type</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["pass", "run"] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => {
                          setTwoPointStyle(style);
                          setTagged([]);
                          setCurrentRoleIdx(0);
                        }}
                        className={`py-2.5 rounded-xl text-sm font-black border-2 capitalize transition-all duration-200 ${
                          twoPointStyle === style
                            ? "border-dragon-primary bg-dragon-primary/15 text-dragon-primary"
                            : "border-surface-border bg-surface-bg text-slate-500"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-1.5 flex-wrap">
                {roles.map((role, i) => {
                  const tp = tagged.find(t => t.role === role);
                  return (
                    <button key={role} onClick={() => setCurrentRoleIdx(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all duration-200 cursor-pointer ${
                        currentRoleIdx === i
                          ? "bg-dragon-primary text-white"
                          : tp ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-surface-bg text-slate-500"
                      }`}>
                      {role}{tp ? `: #${tp.jersey_number}` : ""}
                    </button>
                  );
                })}
              </div>
              {isOpponentRole ? (
                <OpponentPlayerGrid
                  players={opponentPlayers}
                  label={`Select ${currentRole} (opponent)`}
                  onSelect={handleOpponentSelect}
                  selectedId={tagged.find(t => t.role === currentRole)?.id ?? null}
                  search={searches[currentRole] ?? ""} onSearch={v => setSearches(s => ({ ...s, [currentRole]: v }))}
                />
              ) : (
                <PlayerGrid
                  roster={roster} label={`Select ${currentRole}`}
                  onSelect={handlePlayerSelect}
                  selectedId={tagged.find(t => t.role === currentRole)?.player_id ?? null}
                  search={searches[currentRole] ?? ""} onSearch={v => setSearches(s => ({ ...s, [currentRole]: v }))}
                />
              )}
            </>
          )}

          {/* ── STEP: Yards / Result ── */}
          {currentStep === "yards" && (
            <>
              {playType.id === "blocked_kick" && (
                <div>
                  <label className="label block mb-1.5">Blocked Kick Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {BLOCKED_KICK_TYPES.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setBlockedKickType(option.value)}
                        className={`py-2 rounded-xl text-xs font-bold border-2 transition-all duration-200 ${
                          blockedKickType === option.value
                            ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary"
                            : "border-surface-border bg-surface-bg text-slate-500"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {needsYards && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label">Yards</label>
                    <div className="flex gap-1 bg-surface-bg rounded-lg p-0.5">
                      {(["stepper", "exact"] as const).map(mode => (
                        <button key={mode} onClick={() => { setYardMode(mode); setYardRaw(""); }}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all duration-200 ${
                            yardMode === mode ? "bg-dragon-primary text-white" : "text-slate-500"
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
                        yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : "text-slate-300"
                      }`}>{yards}</div>
                      {[1, 5, 10].map(n => (
                        <button key={n} onClick={() => setYards(y => y + n)}
                          className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                      ))}
                    </div>
                  )}
                  {yardMode === "exact" && (
                    <input type="number" inputMode="numeric" placeholder="e.g. −3 or 14"
                      value={yardRaw}
                      onChange={e => { setYardRaw(e.target.value); const n = parseInt(e.target.value, 10); if (!isNaN(n)) setYards(n); }}
                      className="input text-center text-xl font-black tabular-nums" />
                  )}
                  <div className="text-xs text-slate-500 mt-1">
                    {yardLabel(ballOnBefore)} → {yardLabel(Math.min(99, Math.max(1, ballOnBefore + yards)))}
                  </div>
                </div>
              )}

              {needsResult && (
                <div>
                  <label className="label block mb-1.5">Result</label>
                  <div className="flex gap-2">
                    {(["Good", "No Good"] as const).map(r => (
                      <button key={r} onClick={() => setResult(prev => prev === r ? "" : r)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                          result === r
                            ? r === "Good" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-red-500 bg-red-500/20 text-red-400"
                            : "border-surface-border bg-surface-bg text-slate-500"
                        }`}>{r}</button>
                    ))}
                  </div>
                </div>
              )}

              {!needsResult && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setIsTD(t => !t)}
                    className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                      isTD ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-slate-500"
                    }`}>TD</button>
                  <button onClick={() => setIsFirstDown(f => !f)}
                    className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                      isFirstDown ? "border-blue-500 bg-blue-500/20 text-blue-400" : "border-surface-border bg-surface-bg text-slate-500"
                    }`}>1st Down</button>
                </div>
              )}

              {needsTouchback && (
                <button onClick={() => setIsTouchback(t => !t)}
                  className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                    isTouchback ? "border-sky-500 bg-sky-500/20 text-sky-400" : "border-surface-border bg-surface-bg text-slate-500"
                  }`}>Touchback</button>
              )}

              <button onClick={() => setShowPenalties(s => !s)}
                className={`w-full py-2 rounded-xl text-xs font-bold border transition-all duration-200 ${
                  penalty ? "border-orange-500/50 bg-orange-500/10 text-orange-400" : "border-surface-border bg-surface-bg text-slate-500"
                }`}>
                <Flag className="w-3 h-3 inline mr-1" />
                {penalty ? `${penalty} · ${flagYards} yds` : "Add Penalty"}
              </button>

              {showPenalties && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {PENALTIES.map(p => (
                      <button key={p} onClick={() => {
                        setPenalty(p);
                        setPenaltyCategory(getPenaltyDefaultSide(p));
                        setFlagYards(PENALTY_DEFAULT_YARDS[p] ?? 5);
                        setShowPenalties(false);
                      }}
                        className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border text-left transition-all duration-200 ${
                          penalty === p ? "border-orange-500 bg-orange-500/15 text-orange-400" : "border-surface-border text-slate-400"
                        }`}>{p}</button>
                    ))}
                  </div>
                  {penalty && (
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-slate-500 block mb-1">Flag On</span>
                        <div className="grid grid-cols-2 gap-2">
                          {(["offense", "defense"] as const).map((side) => (
                            <button
                              key={side}
                              onClick={() => setPenaltyCategory(side)}
                              className={`py-2 rounded-xl text-xs font-bold border-2 capitalize transition-all duration-200 ${
                                penaltyCategory === side
                                  ? "border-orange-500 bg-orange-500/15 text-orange-400"
                                  : "border-surface-border bg-surface-bg text-slate-500"
                              }`}
                            >
                              {side}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Penalty yards:</span>
                        <input type="number" value={flagYards} onChange={e => setFlagYards(Number(e.target.value))}
                          className="input w-16 text-center text-sm" />
                        <button onClick={() => { setPenalty(null); setPenaltyCategory(null); setFlagYards(5); }} className="text-xs text-red-400 ml-auto">Clear</button>
                      </div>
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
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 capitalize transition-all duration-200 ${
                        hashMark === h ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>{h}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Offensive Formation</label>
                <div className="flex flex-wrap gap-1.5">
                  {OFFENSIVE_FORMATIONS.map(f => (
                    <button key={f} onClick={() => setOffFormation(prev => prev === f ? null : f)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                        offFormation === f ? "border-blue-500 bg-blue-500/15 text-blue-400" : "border-surface-border text-slate-500"
                      }`}>{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Defensive Formation</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFENSIVE_FORMATIONS.map(f => (
                    <button key={f} onClick={() => setDefFormation(prev => prev === f ? null : f)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                        defFormation === f ? "border-red-500 bg-red-500/15 text-red-400" : "border-surface-border text-slate-500"
                      }`}>{f}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── STEP: Defense (tacklers) ── */}
          {currentStep === "defense" && (
            <>
              <div className="text-xs text-slate-400 mb-1">
                Select up to 3 tacklers. {play.possession === "them" ? "(Our defense)" : "(Opponent defense)"} · 1 = 1.0, 2+ = 0.5 each.
              </div>
              {tacklers.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {tacklers.map(t => (
                    <span key={t.player_id} className="flex items-center gap-1 text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded-lg">
                      #{t.jersey_number} {t.name.split(" ")[1] ?? t.name}
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
              {play.possession === "them" ? (
                /* They have ball — our guys make the tackles */
                <PlayerGrid
                  roster={roster} label="Select tackler(s) — Our defense"
                  onSelect={p => handleAddTackler(p)} selectedId={null}
                  search={tacklerSearch} onSearch={setTacklerSearch}
                />
              ) : (
                /* We have ball — skip or show note */
                <div className="text-xs text-slate-600 text-center py-4">
                  Tackler info is typically recorded when the opponent has the ball. Skip this step or add tacklers if needed.
                </div>
              )}
            </>
          )}

          {/* ── STEP: Review ── */}
          {currentStep === "review" && (
            <div className="space-y-3">
              <div className="text-sm font-bold text-slate-300">Review Changes</div>
              <div className="card p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="font-bold">{playType.label}</span>
                </div>
                {tagged.map(t => (
                  <div key={t.role} className="flex justify-between">
                    <span className="text-slate-500 capitalize">{t.role}</span>
                    <span className="font-bold">#{t.jersey_number} {t.name}</span>
                  </div>
                ))}
                {needsYards && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Yards</span>
                    <span className={`font-bold ${yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : ""}`}>
                      {yards > 0 ? `+${yards}` : yards}
                    </span>
                  </div>
                )}
                {needsResult && result && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Result</span>
                    <span className={`font-bold ${result === "Good" ? "text-emerald-400" : "text-red-400"}`}>{result}</span>
                  </div>
                )}
                {(isTD || isFirstDown) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Flags</span>
                    <span className="font-bold">
                      {[isTD && "TD", isFirstDown && "1st Down"].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {penalty && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Penalty</span>
                    <span className="font-bold text-orange-400">{penalty} ({flagYards} yds)</span>
                  </div>
                )}
                {offFormation && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">OFF</span>
                    <span className="font-bold">{offFormation}</span>
                  </div>
                )}
                {defFormation && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">DEF</span>
                    <span className="font-bold">{defFormation}</span>
                  </div>
                )}
                {tacklers.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tacklers</span>
                    <span className="font-bold">{tacklers.map(t => `#${t.jersey_number}`).join(", ")}</span>
                  </div>
                )}
              </div>

              {/* Delete play */}
              <div className="pt-2 border-t border-surface-border">
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)}
                    className="w-full py-2 rounded-xl text-xs font-bold text-red-500 border border-red-500/30 flex items-center justify-center gap-1">
                    <Trash2 className="w-3 h-3" /> Delete this play
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-500 border border-surface-border">Cancel</button>
                    <button onClick={() => onDelete(play.id)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30">Confirm Delete</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 pt-2 border-t border-surface-border shrink-0 flex gap-2">
          {currentStep !== "review" ? (
            <>
              <button onClick={goBack} disabled={stepIdx === 0}
                className="btn-ghost flex-1 py-2.5 text-sm font-bold disabled:opacity-30">
                <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
              </button>
              <button onClick={goNext} disabled={!canGoNext()}
                className="btn-primary flex-1 py-2.5 text-sm font-bold disabled:opacity-50">
                Next <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm font-bold">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={!canGoNext()} className="btn-primary flex-1 py-3 text-sm font-black disabled:opacity-50">
                Save Changes
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
