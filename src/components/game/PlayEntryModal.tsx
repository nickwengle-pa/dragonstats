import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Flag, Plus } from "lucide-react";
import {
  type BlockedKickType,
  type PlayTypeDef,
  type PenaltySide,
  type RosterPlayer,
  type OpponentPlayerRef,
  type TaggedPlayer,
  type GameState,
  BLOCKED_KICK_TYPES,
  PENALTIES,
  PENALTY_DEFAULT_YARDS,
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  getPenaltyDefaultSide,
  yardLabel,
  buildDescription,
} from "./types";

interface Props {
  playType: PlayTypeDef;
  gameState: GameState;
  roster: RosterPlayer[];
  opponentPlayers: OpponentPlayerRef[];
  progName: string;
  oppName: string;
  onSubmit: (data: PlaySubmitData) => void;
  onClose: () => void;
  onAddOpponentPlayer?: (player: OpponentPlayerRef) => void;
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
  penaltyCategory: PenaltySide | null;
  flagYards: number;
  blockedKickType: BlockedKickType | null;
  offensiveFormation: string | null;
  defensiveFormation: string | null;
  hashMark: string | null;
  description: string;
  playData?: Record<string, unknown>;
}

type Step = "players" | "yards" | "formations" | "defense" | "review"
  | "kick_kicker" | "kick_location" | "kick_returner" | "kick_return_yards" | "kick_tacklers";
type FieldTeam = "program" | "opponent";

function defaultBlockedKickType(gameState: GameState): BlockedKickType {
  if (gameState.ballOn >= 95) return "extra_point";
  if (gameState.down === 4 && gameState.ballOn >= 60) return "field_goal";
  if (gameState.down === 4) return "punt";
  return "field_goal";
}

function teamTag(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TEAM";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

/* ── Player selector grid (our roster) ── */
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
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-200 ${
              selectedId === p.player_id
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                : "border-transparent bg-surface-bg text-slate-400 active:bg-surface-hover"
            }`}
          >
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

/* ── Opponent player selector with quick-add ── */
function OpponentPlayerGrid({
  players, label, onSelect, selectedId, search, onSearch, onQuickAdd,
}: {
  players: OpponentPlayerRef[];
  label: string;
  onSelect: (p: OpponentPlayerRef) => void;
  selectedId: string | null;
  search: string;
  onSearch: (v: string) => void;
  onQuickAdd?: (jersey: number) => void;
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

  // Check if search is a number that doesn't match any existing player
  const searchNum = parseInt(search, 10);
  const canQuickAdd = onQuickAdd && !isNaN(searchNum) && searchNum > 0
    && !players.some(p => p.jersey_number === searchNum);

  return (
    <div>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
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
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-200 ${
              selectedId === p.id
                ? "border-red-500 bg-red-500/10 text-red-400"
                : "border-transparent bg-surface-bg text-slate-400 active:bg-surface-hover"
            }`}
          >
            <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
            <span className="text-[8px] font-bold text-slate-500 truncate w-full text-center">{p.name}</span>
          </button>
        ))}
        {filtered.length === 0 && !canQuickAdd && (
          <div className="col-span-5 text-xs text-slate-600 text-center py-4">
            No opponent players found. Type a jersey # to quick-add.
          </div>
        )}
      </div>
      {canQuickAdd && (
        <button
          onClick={() => onQuickAdd(searchNum)}
          className="mt-2 w-full py-2 rounded-xl text-xs font-bold border border-dashed border-amber-500/40 text-amber-400 bg-amber-500/5 flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add #{searchNum} to opponent roster & select
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PLAY ENTRY MODAL (Progressive, FSA-style)
   ═══════════════════════════════════════════════ */

export default function PlayEntryModal({
  playType, gameState, roster, opponentPlayers, progName, oppName, onSubmit, onClose, onAddOpponentPlayer,
}: Props) {
  // Local copy of opponent players (can grow via quick-add)
  const [localOppPlayers, setLocalOppPlayers] = useState<OpponentPlayerRef[]>(opponentPlayers);

  // Tagged players for this play
  const [tagged, setTagged] = useState<TaggedPlayer[]>([]);
  const [currentRoleIdx, setCurrentRoleIdx] = useState(0);
  const [searches, setSearches] = useState<Record<string, string>>({});

  // Yards — yard-line picker
  // Convert ballOn (possessing team's perspective) to program-perspective side + yard line
  const initResult = (() => {
    let programBallOn: number;
    if (gameState.possession === "us") {
      programBallOn = gameState.ballOn; // 0=our goal, 100=opp goal
    } else {
      programBallOn = 100 - gameState.ballOn; // flip to our perspective
    }
    const side: "our" | "opp" = programBallOn <= 50 ? "our" : "opp";
    const yl = programBallOn <= 50 ? programBallOn : 100 - programBallOn;
    return { side, yl: yl || 1 };
  })();
  const [resultYardLine, setResultYardLine] = useState(initResult.yl);
  const [resultSide, setResultSide] = useState<"our" | "opp">(initResult.side);
  const [resultYardRaw, setResultYardRaw] = useState("");
  const [totalYardsRaw, setTotalYardsRaw] = useState("");

  // Helper: adjust yard line and flip side when crossing 50
  const adjustYardLine = (
    currentYL: number,
    delta: number,
    currentSide: "our" | "opp",
    setYL: (v: number) => void,
    setSide: (v: "our" | "opp") => void,
  ) => {
    const newYL = currentYL + delta;
    if (newYL > 50) {
      setSide(currentSide === "our" ? "opp" : "our");
      setYL(Math.min(50, 100 - newYL));
    } else if (newYL < 1) {
      setSide(currentSide === "our" ? "opp" : "our");
      setYL(Math.max(1, Math.abs(newYL) + 1));
    } else {
      setYL(newYL);
    }
  };

  const adjustFieldTeamYardLine = (
    currentYL: number,
    delta: number,
    currentSide: FieldTeam,
    setYL: (value: number) => void,
    setSide: (value: FieldTeam) => void,
  ) => {
    const newYL = currentYL + delta;
    const oppositeSide: FieldTeam = currentSide === "program" ? "opponent" : "program";
    if (newYL > 50) {
      setSide(oppositeSide);
      setYL(Math.min(50, 100 - newYL));
    } else if (newYL < 1) {
      setSide(oppositeSide);
      setYL(Math.max(1, Math.abs(newYL) + 1));
    } else {
      setYL(newYL);
    }
  };

  // Toggles
  const [isTD, setIsTD] = useState(false);
  const [isFirstDown, setIsFirstDown] = useState(false);
  const [isTouchback, setIsTouchback] = useState(false);
  const [result, setResult] = useState<"Good" | "No Good" | "">("");

  // Penalty
  const [penalty, setPenalty] = useState<string | null>(null);
  const [penaltyCategory, setPenaltyCategory] = useState<PenaltySide | null>(null);
  const [flagYards, setFlagYards] = useState(5);
  const [showPenalties, setShowPenalties] = useState(false);
  const [blockedKickType, setBlockedKickType] = useState<BlockedKickType>(() => defaultBlockedKickType(gameState));

  // Formations
  const [offFormation, setOffFormation] = useState<string | null>(null);
  const [defFormation, setDefFormation] = useState<string | null>(null);
  const [hashMark, setHashMark] = useState<string | null>(null);

  // Defensive credit (tacklers)
  const [tacklers, setTacklers] = useState<TaggedPlayer[]>([]);
  const [tacklerSearch, setTacklerSearch] = useState("");

  // Kickoff / Punt specific state
  const isKickPlay = playType.id === "kickoff" || playType.id === "punt";
  const [kickedToYard, setKickedToYard] = useState(5); // receiving team's yard line where ball lands
  const [kickedToRaw, setKickedToRaw] = useState("");
  const [returnToYardLine, setReturnToYardLine] = useState(20);
  const receivingFieldSide: FieldTeam = gameState.possession === "us" ? "opponent" : "program";
  const [returnToTeam, setReturnToTeam] = useState<FieldTeam>(receivingFieldSide);
  const [returnToRaw, setReturnToRaw] = useState("");
  const [kickerSearch, setKickerSearch] = useState("");
  const [returnerSearch, setReturnerSearch] = useState("");
  const isInterception = playType.id === "int";

  const toProgramBallOn = (fieldSide: FieldTeam, yardLine: number) =>
    fieldSide === "program" ? yardLine : 100 - yardLine;

  const toOffensePerspectiveBallOn = (fieldSide: FieldTeam, yardLine: number) => {
    const programBallOn = toProgramBallOn(fieldSide, yardLine);
    return gameState.possession === "us" ? programBallOn : 100 - programBallOn;
  };

  const toFieldSpot = (offenseBallOn: number): { side: FieldTeam; yardLine: number } => {
    const programBallOn = gameState.possession === "us" ? offenseBallOn : 100 - offenseBallOn;
    return programBallOn <= 50
      ? { side: "program", yardLine: Math.max(1, Math.min(50, programBallOn)) }
      : { side: "opponent", yardLine: Math.max(1, Math.min(50, 100 - programBallOn)) };
  };

  const initialIntCatchSpot = toFieldSpot(Math.max(1, Math.min(99, gameState.ballOn + 10)));
  const [intCaughtTeam, setIntCaughtTeam] = useState<FieldTeam>(initialIntCatchSpot.side);
  const [intCaughtYardLine, setIntCaughtYardLine] = useState(initialIntCatchSpot.yardLine);
  const [intCaughtRaw, setIntCaughtRaw] = useState(String(initialIntCatchSpot.yardLine));
  const [intReturnTeam, setIntReturnTeam] = useState<FieldTeam>(initialIntCatchSpot.side);
  const [intReturnYardLine, setIntReturnYardLine] = useState(initialIntCatchSpot.yardLine);
  const [intReturnRaw, setIntReturnRaw] = useState(String(initialIntCatchSpot.yardLine));

  // Step management
  const [twoPointStyle, setTwoPointStyle] = useState<"pass" | "run">("pass");
  const roles = useMemo(() => {
    if (playType.id !== "two_pt") return playType.roles;
    return twoPointStyle === "run" ? ["rusher"] : ["passer", "receiver"];
  }, [playType, twoPointStyle]);
  const isTheirBall = gameState.possession === "them";
  const progTag = teamTag(progName);
  const oppTag = teamTag(oppName);
  const perspectiveSideLabel = (side: "our" | "opp") => side === "our" ? progName : oppName;
  const perspectiveSideTag = (side: "our" | "opp") => side === "our" ? progTag : oppTag;
  const fieldTeamLabel = (side: FieldTeam) => side === "program" ? progName : oppName;
  const fieldTeamTag = (side: FieldTeam) => side === "program" ? progTag : oppTag;
  const kickingFieldSide: FieldTeam = receivingFieldSide === "program" ? "opponent" : "program";
  const receivingTeamLabel = fieldTeamLabel(receivingFieldSide);
  const formatFieldSpot = (ballOn: number, possession: "us" | "them") => {
    const offenseTag = possession === "us" ? progTag : oppTag;
    const defenseTag = possession === "us" ? oppTag : progTag;
    if (ballOn === 50) return "50";
    return ballOn <= 50 ? `${offenseTag} ${ballOn}` : `${defenseTag} ${100 - ballOn}`;
  };
  const kickStartLabel = formatFieldSpot(gameState.ballOn, gameState.possession);
  const landingLabel = kickedToYard === 0 ? `${fieldTeamTag(receivingFieldSide)} EZ` : `${fieldTeamTag(receivingFieldSide)} ${kickedToYard}`;
  const kickDistance = isKickPlay ? Math.max(0, (100 - kickedToYard) - gameState.ballOn) : 0;
  const needsYards = !["pass_inc", "spike", "penalty_only", "pat", "two_pt", "kickoff", "punt"].includes(playType.id);
  const needsResult = ["pat", "fg", "two_pt"].includes(playType.id);
  const needsTouchback = false; // handled in kick-specific flow now
  const interceptionSpotBallOn = isInterception
    ? toOffensePerspectiveBallOn(intCaughtTeam, intCaughtYardLine)
    : null;
  const interceptionReturnBallOn = isInterception
    ? (isTD ? 0 : toOffensePerspectiveBallOn(intReturnTeam, intReturnYardLine))
    : null;
  const interceptionNetYards = isInterception && interceptionReturnBallOn != null
    ? interceptionReturnBallOn - gameState.ballOn
    : 0;
  const interceptionReturnYards = isInterception && interceptionSpotBallOn != null && interceptionReturnBallOn != null
    ? interceptionSpotBallOn - interceptionReturnBallOn
    : 0;
  const interceptionReturnLabel = isInterception
    ? (isTD
      ? `${fieldTeamTag(gameState.possession === "us" ? "program" : "opponent")} EZ`
      : `${fieldTeamTag(intReturnTeam)} ${intReturnYardLine}`)
    : null;

  // Compute yards from the yard-line picker
  const yards = (() => {
    if (!needsYards) return 0;
    let targetBallOn: number;
    if (gameState.possession === "us") {
      targetBallOn = resultSide === "our" ? resultYardLine : 100 - resultYardLine;
    } else {
      targetBallOn = resultSide === "our" ? 100 - resultYardLine : resultYardLine;
    }
    return targetBallOn - gameState.ballOn;
  })();

  const setResultFromTotalYards = (totalYards: number) => {
    const targetBallOn = Math.max(1, Math.min(99, gameState.ballOn + totalYards));
    const programBallOn = gameState.possession === "us" ? targetBallOn : 100 - targetBallOn;
    const side: "our" | "opp" = programBallOn <= 50 ? "our" : "opp";
    const yardLine = programBallOn <= 50 ? programBallOn : 100 - programBallOn;
    setResultSide(side);
    setResultYardLine(Math.max(1, Math.min(50, yardLine)));
    setResultYardRaw(String(Math.max(1, Math.min(50, yardLine))));
  };

  useEffect(() => {
    if (!needsYards) return;
    setTotalYardsRaw(String(yards));
  }, [needsYards, yards]);

  const steps: Step[] = [];
  if (isKickPlay) {
    // Kickoff/Punt specific flow
    steps.push("kick_kicker");
    steps.push("kick_location");
    if (!isTouchback) {
      steps.push("kick_returner");
      steps.push("kick_return_yards");
    }
    steps.push("review");
  } else {
    if (roles.length > 0) steps.push("players");
    if (needsYards || needsResult) steps.push("yards");
    steps.push("formations");
    steps.push("review");
  }

  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx] ?? "review";

  const canGoNext = (): boolean => {
    if (currentStep === "players") {
      return roles.length === 0 || roles.every((role) => tagged.some((player) => player.role === role));
    }
    if (currentStep === "kick_kicker") {
      const kickerRole = playType.id === "kickoff" ? "kicker" : "punter";
      return tagged.some(t => t.role === kickerRole);
    }
    if (currentStep === "kick_returner") {
      return tagged.some(t => t.role === "returner");
    }
    if (currentStep === "review" && penalty) {
      return !!penaltyCategory;
    }
    return true;
  };

  const goNext = () => { if (stepIdx < steps.length - 1 && canGoNext()) setStepIdx(s => s + 1); };
  const goBack = () => { if (stepIdx > 0) setStepIdx(s => s - 1); };

  /* ── Player selection — when opponent has ball, offensive roles use opponent roster ── */
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

  /* ── Quick-add opponent player by jersey number ── */
  const handleQuickAddOpponent = (jersey: number) => {
    const newPlayer: OpponentPlayerRef = {
      id: `quick_${jersey}_${Date.now()}`,
      name: `#${jersey}`,
      jersey_number: jersey,
      position: null,
    };
    setLocalOppPlayers(prev => [...prev, newPlayer]);
    // Notify parent to persist this player to the DB
    onAddOpponentPlayer?.(newPlayer);
    // Auto-select the new player
    handleOpponentSelect(newPlayer);
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
      if (updated.length > 1) {
        return updated.map(t => ({ ...t, credit: 0.5 }));
      }
      return updated;
    });
    setTacklerSearch("");
  };

  const handleAddOpponentTackler = (p: OpponentPlayerRef) => {
    if (tacklers.length >= 3) return;
    if (tacklers.some(t => t.id === p.id)) {
      setTacklers(prev => prev.filter(t => t.id !== p.id));
      return;
    }
    const credit = tacklers.length === 0 ? 1 : 0.5;
    const tp: TaggedPlayer = {
      id: p.id,
      player_id: p.id,
      jersey_number: p.jersey_number,
      name: p.name,
      role: "tackler",
      credit,
      isOpponent: true,
    };
    setTacklers(prev => {
      const updated = [...prev, tp];
      if (updated.length > 1) {
        return updated.map(t => ({ ...t, credit: 0.5 }));
      }
      return updated;
    });
    setTacklerSearch("");
  };

  /* ── Kick-specific player selection helpers ── */
  const handleKickerSelect = (p: RosterPlayer) => {
    const role = playType.id === "kickoff" ? "kicker" : "punter";
    const tp: TaggedPlayer = {
      id: p.player_id, player_id: p.player_id, jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`, role,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    goNext();
  };

  const handleKickerSelectOpp = (p: OpponentPlayerRef) => {
    const role = playType.id === "kickoff" ? "kicker" : "punter";
    const tp: TaggedPlayer = {
      id: p.id, player_id: p.id, jersey_number: p.jersey_number,
      name: p.name, role, isOpponent: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    goNext();
  };

  const handleReturnerSelect = (p: RosterPlayer) => {
    const tp: TaggedPlayer = {
      id: p.player_id, player_id: p.player_id, jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`, role: "returner",
    };
    setTagged(prev => [...prev.filter(t => t.role !== "returner"), tp]);
    goNext();
  };

  const handleReturnerSelectOpp = (p: OpponentPlayerRef) => {
    const tp: TaggedPlayer = {
      id: p.id, player_id: p.id, jersey_number: p.jersey_number,
      name: p.name, role: "returner", isOpponent: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== "returner"), tp]);
    goNext();
  };

  const handleSubmit = () => {
    const allTagged = [...tagged, ...tacklers];
    const passResult = playType.id === "pass_comp" ? "Complete" : playType.id === "pass_inc" ? "Incomplete" : "";
    const finalResult = result || passResult;

    const isZeroYard = ["pass_inc", "spike", "penalty_only"].includes(playType.id) || needsResult;
    let playYards: number;
    // Compute return yards from yard-line picker for kick plays
    let computedReturnYards = 0;
    if (isKickPlay && !isTouchback) {
      const isReceiverSide = returnToTeam === receivingFieldSide;
      const receiverYard = isReceiverSide ? returnToYardLine : 100 - returnToYardLine;
      computedReturnYards = receiverYard - kickedToYard;
    }

    if (isKickPlay) {
      playYards = isTouchback ? kickDistance : kickDistance - computedReturnYards;
    } else if (isInterception && interceptionReturnBallOn != null) {
      playYards = interceptionNetYards;
    } else if (isTD) {
      // TD: yards = distance from line of scrimmage to endzone
      // Turnovers (int/fumble) score in the opposite direction, so yards go negative (towards LOS endzone)
      const isTurnover = ["int", "fumble"].includes(playType.id);
      playYards = isTurnover ? -gameState.ballOn : 100 - gameState.ballOn;
    } else {
      playYards = isZeroYard ? 0 : yards;
    }
    const newBallOn = Math.min(100, Math.max(0, gameState.ballOn + playYards));
    const earnedFirst = isFirstDown || (!isKickPlay && playYards >= gameState.distance && gameState.down <= 4);
    const scored = isTD || (!isKickPlay && newBallOn >= 100);

    const desc = buildDescription(playType, allTagged, playYards, scored, penalty, finalResult, isKickPlay ? {
      kickDistance,
      kickedToYard,
      returnYards: isTouchback ? 0 : computedReturnYards,
      isTouchback,
      landingLabel,
    } : undefined, isInterception ? {
      turnoverSpotLabel: `${fieldTeamTag(intCaughtTeam)} ${intCaughtYardLine}`,
      returnSpotLabel: interceptionReturnLabel ?? undefined,
      returnYards: interceptionReturnYards,
    } : undefined);

    onSubmit({
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
      playData: isInterception ? {
        interception_spot: {
          field_side: intCaughtTeam,
          yard_line: intCaughtYardLine,
          ball_on: interceptionSpotBallOn,
          label: `${fieldTeamTag(intCaughtTeam)} ${intCaughtYardLine}`,
        },
        interception_return_to: {
          field_side: isTD ? (gameState.possession === "us" ? "program" : "opponent") : intReturnTeam,
          yard_line: isTD ? 0 : intReturnYardLine,
          ball_on: interceptionReturnBallOn,
          label: interceptionReturnLabel,
        },
        interception_return_yards: interceptionReturnYards,
        interception_net_yards: playYards,
      } : undefined,
    });
  };

  /* ── Determine which roster to show for current role ── */
  const currentRole = roles[currentRoleIdx];
  // When opponent has ball: offensive roles (rusher, passer, receiver, target, kicker, punter) use opponent roster
  // When we have ball: only interceptor uses opponent roster
  const OFFENSIVE_ROLES = new Set(["rusher", "passer", "receiver", "target", "kicker", "punter"]);
  const showOpponentRoster = isTheirBall
    ? OFFENSIVE_ROLES.has(currentRole) // Their offense = their players
    : ["interceptor"].includes(currentRole); // Our offense, opponent interceptor

  return (
    <div className="sheet bg-black/60 backdrop-blur-sm">
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
            <div className="text-[10px] text-slate-500">
              Step {stepIdx + 1} of {steps.length}: {
                ({
                  players: "Players", yards: "Yards", formations: "Formations",
                  defense: "Defense", review: "Review",
                  kick_kicker: playType.id === "kickoff" ? "Kicker" : "Punter",
                  kick_location: "Kick Location", kick_returner: "Returner",
                  kick_return_yards: "Return To", kick_tacklers: "Tacklers",
                } as Record<string, string>)[currentStep] ?? currentStep
              }
              {isTheirBall && currentStep === "players" && (
                <span className="text-red-400 ml-1">({oppName} ball)</span>
              )}
            </div>
          </div>
          {/* Step dots */}
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === stepIdx ? "bg-dragon-primary" : i < stepIdx ? "bg-emerald-500" : "bg-slate-700"}`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

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

              {/* Role tabs */}
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

              {/* Show opponent or our roster */}
              {showOpponentRoster ? (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Select ${currentRole} (opponent)`}
                  onSelect={handleOpponentSelect}
                  selectedId={tagged.find(t => t.role === currentRole)?.id ?? null}
                  search={searches[currentRole] ?? ""}
                  onSearch={v => setSearches(s => ({ ...s, [currentRole]: v }))}
                  onQuickAdd={handleQuickAddOpponent}
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

          {/* ── KICK STEP: Kicker / Punter ── */}
          {currentStep === "kick_kicker" && (
            <>
              {isTheirBall ? (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Select ${playType.id === "kickoff" ? "kicker" : "punter"} (opponent)`}
                  onSelect={handleKickerSelectOpp}
                  selectedId={tagged.find(t => t.role === (playType.id === "kickoff" ? "kicker" : "punter"))?.id ?? null}
                  search={kickerSearch}
                  onSearch={setKickerSearch}
                  onQuickAdd={handleQuickAddOpponent}
                />
              ) : (
                <PlayerGrid
                  roster={roster}
                  label={`Select ${playType.id === "kickoff" ? "kicker" : "punter"}`}
                  onSelect={handleKickerSelect}
                  selectedId={tagged.find(t => t.role === (playType.id === "kickoff" ? "kicker" : "punter"))?.player_id ?? null}
                  search={kickerSearch}
                  onSearch={setKickerSearch}
                />
              )}
            </>
          )}

          {/* ── KICK STEP: Kick Location ── */}
          {currentStep === "kick_location" && (
            <>
              <div>
                <label className="label block mb-2">
                  {playType.id === "kickoff" ? "Kicked" : "Punted"} To ({receivingTeamLabel} Yard Line)
                </label>
                <div className="flex items-center gap-1.5">
                  {[-10, -5, -1].map(n => (
                    <button key={n} onClick={() => setKickedToYard(y => Math.max(0, Math.min(50, y + n)))}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">{n}</button>
                  ))}
                  <div className="w-20 h-10 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums text-purple-400">
                    {landingLabel}
                  </div>
                  {[1, 5, 10].map(n => (
                    <button key={n} onClick={() => setKickedToYard(y => Math.max(0, Math.min(50, y + n)))}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-slate-500">Or type:</span>
                  <input
                    type="number" inputMode="numeric" min={0} max={50}
                    placeholder="e.g. 5"
                    value={kickedToRaw}
                    onChange={e => {
                      setKickedToRaw(e.target.value);
                      const n = parseInt(e.target.value, 10);
                      if (!isNaN(n)) setKickedToYard(Math.max(0, Math.min(50, n)));
                    }}
                    className="input w-20 text-center text-sm font-black"
                  />
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {playType.id === "kickoff" ? "Kick" : "Punt"} distance: <span className="font-bold text-slate-300">{kickDistance} yards</span>
                  {" "}({kickStartLabel} → {landingLabel})
                </div>
              </div>

              <button onClick={() => { setIsTouchback(t => !t); }}
                className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                  isTouchback ? "border-sky-500 bg-sky-500/20 text-sky-400" : "border-surface-border bg-surface-bg text-slate-500"
                }`}>Touchback</button>

              {isTouchback && (
                <div className="text-xs text-slate-500 text-center">
                  Receiving team will start at their own 25 yard line.
                </div>
              )}
            </>
          )}

          {/* ── KICK STEP: Returner ── */}
          {currentStep === "kick_returner" && (
            <>
              <div className="text-xs text-slate-400 mb-1">
                {playType.id === "kickoff" ? "Kicked" : "Punted"} to {landingLabel} ({kickDistance} yds). Select the returner.
              </div>
              {isTheirBall ? (
                <PlayerGrid
                  roster={roster}
                  label={`Select returner (${progName})`}
                  onSelect={handleReturnerSelect}
                  selectedId={tagged.find(t => t.role === "returner")?.player_id ?? null}
                  search={returnerSearch}
                  onSearch={setReturnerSearch}
                />
              ) : (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Select returner (${oppName})`}
                  onSelect={handleReturnerSelectOpp}
                  selectedId={tagged.find(t => t.role === "returner")?.id ?? null}
                  search={returnerSearch}
                  onSearch={setReturnerSearch}
                  onQuickAdd={handleQuickAddOpponent}
                />
              )}
            </>
          )}

          {/* ── KICK STEP: Return To Yard Line ── */}
          {currentStep === "kick_return_yards" && (
            <>
              <div>
                <label className="label block mb-2">Returned To (Yard Line)</label>

                {/* Side selector */}
                <div className="flex gap-1.5 mb-3">
                  {(["program", "opponent"] as const).map((side) => (
                    <button
                      key={side}
                      onClick={() => setReturnToTeam(side)}
                      className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                        returnToTeam === side
                            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                            : "border-surface-border bg-surface-bg text-slate-500"
                      }`}
                    >
                      {fieldTeamLabel(side)}
                    </button>
                  ))}
                </div>

                {/* Yard line stepper */}
                <div className="flex items-center gap-1.5">
                  {[-10, -5, -1].map(n => (
                    <button key={n} onClick={() => adjustFieldTeamYardLine(returnToYardLine, n, returnToTeam, setReturnToYardLine, setReturnToTeam)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">{n}</button>
                  ))}
                  <div className="w-14 h-10 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums text-emerald-400">
                    {returnToYardLine}
                  </div>
                  {[1, 5, 10].map(n => (
                    <button key={n} onClick={() => adjustFieldTeamYardLine(returnToYardLine, n, returnToTeam, setReturnToYardLine, setReturnToTeam)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-slate-500">Or type:</span>
                  <input
                    type="number" inputMode="numeric" min={1} max={50}
                    placeholder="e.g. 30"
                    value={returnToRaw}
                    onChange={e => {
                      setReturnToRaw(e.target.value);
                      const n = parseInt(e.target.value, 10);
                      if (!isNaN(n)) setReturnToYardLine(Math.max(1, Math.min(50, n)));
                    }}
                    className="input w-20 text-center text-sm font-black"
                  />
                </div>
                <div className="text-xs text-slate-500 mt-3">
                  {(() => {
                    const sideLabel = fieldTeamTag(returnToTeam);
                    const isReceiverSide = returnToTeam === receivingFieldSide;
                    const receiverYard = isReceiverSide ? returnToYardLine : 100 - returnToYardLine;
                    const retYds = receiverYard - kickedToYard;
                    return (
                      <>Caught at {landingLabel} → returned to <span className="font-bold text-slate-300">{sideLabel} {returnToYardLine}</span> ({retYds > 0 ? "+" : ""}{retYds} yds)</>
                    );
                  })()}
                </div>
              </div>

              {/* TD toggle for return TD */}
              <button onClick={() => setIsTD(t => !t)}
                className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                  isTD ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-slate-500"
                }`}>Return TD</button>
            </>
          )}

          {/* ── KICK STEP: Tacklers (optional) ── */}
          {currentStep === "kick_tacklers" && (
            <>
              <div className="text-xs text-slate-400 mb-1">
                Optional: Select tackler(s) from {progName}. 1 player = 1.0 credit, 2+ = 0.5 each.
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
              <div className="text-[10px] text-slate-600 text-center mt-2">
                Skip this step if not tracking tacklers.
              </div>
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
                  {isInterception ? (
                    <div className="space-y-4">
                      <div>
                        <label className="label block mb-2">Intercepted At</label>
                        <div className="flex gap-1.5 mb-3">
                          {(["program", "opponent"] as const).map((side) => (
                            <button
                              key={side}
                              onClick={() => setIntCaughtTeam(side)}
                              className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                                intCaughtTeam === side
                                  ? "border-red-500 bg-red-500/20 text-red-400"
                                  : "border-surface-border bg-surface-bg text-slate-500"
                              }`}
                            >
                              {fieldTeamLabel(side)}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {[-10, -5, -1].map((n) => (
                            <button
                              key={`int-caught-${n}`}
                              onClick={() => adjustFieldTeamYardLine(intCaughtYardLine, n, intCaughtTeam, setIntCaughtYardLine, setIntCaughtTeam)}
                              className="btn-ghost flex-1 h-10 text-sm font-bold"
                            >
                              {n}
                            </button>
                          ))}
                          <div className="w-14 h-10 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums text-red-300">
                            {intCaughtYardLine}
                          </div>
                          {[1, 5, 10].map((n) => (
                            <button
                              key={`int-caught+${n}`}
                              onClick={() => adjustFieldTeamYardLine(intCaughtYardLine, n, intCaughtTeam, setIntCaughtYardLine, setIntCaughtTeam)}
                              className="btn-ghost flex-1 h-10 text-sm font-bold"
                            >
                              +{n}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-slate-500">Or type:</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={50}
                            placeholder="e.g. 35"
                            value={intCaughtRaw}
                            onChange={(e) => {
                              setIntCaughtRaw(e.target.value);
                              const n = parseInt(e.target.value, 10);
                              if (!isNaN(n)) setIntCaughtYardLine(Math.max(1, Math.min(50, n)));
                            }}
                            className="input w-20 text-center text-sm font-black"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="label block mb-2">Returned To</label>
                        {!isTD && (
                          <div className="flex gap-1.5 mb-3">
                            {(["program", "opponent"] as const).map((side) => (
                              <button
                                key={side}
                                onClick={() => setIntReturnTeam(side)}
                                className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                                  intReturnTeam === side
                                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                                    : "border-surface-border bg-surface-bg text-slate-500"
                                }`}
                              >
                                {fieldTeamLabel(side)}
                              </button>
                            ))}
                          </div>
                        )}
                        {isTD ? (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-300">
                            {fieldTeamTag(gameState.possession === "us" ? "program" : "opponent")} EZ
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              {[-10, -5, -1].map((n) => (
                                <button
                                  key={`int-return-${n}`}
                                  onClick={() => adjustFieldTeamYardLine(intReturnYardLine, n, intReturnTeam, setIntReturnYardLine, setIntReturnTeam)}
                                  className="btn-ghost flex-1 h-10 text-sm font-bold"
                                >
                                  {n}
                                </button>
                              ))}
                              <div className="w-14 h-10 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums text-emerald-300">
                                {intReturnYardLine}
                              </div>
                              {[1, 5, 10].map((n) => (
                                <button
                                  key={`int-return+${n}`}
                                  onClick={() => adjustFieldTeamYardLine(intReturnYardLine, n, intReturnTeam, setIntReturnYardLine, setIntReturnTeam)}
                                  className="btn-ghost flex-1 h-10 text-sm font-bold"
                                >
                                  +{n}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-slate-500">Or type:</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={50}
                                placeholder="e.g. 35"
                                value={intReturnRaw}
                                onChange={(e) => {
                                  setIntReturnRaw(e.target.value);
                                  const n = parseInt(e.target.value, 10);
                                  if (!isNaN(n)) setIntReturnYardLine(Math.max(1, Math.min(50, n)));
                                }}
                                className="input w-20 text-center text-sm font-black"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 space-y-1">
                        <div>
                          INT at <span className="font-bold text-slate-300">{fieldTeamTag(intCaughtTeam)} {intCaughtYardLine}</span>
                        </div>
                        <div>
                          Return to <span className="font-bold text-slate-300">{interceptionReturnLabel}</span>
                          {" "}(<span className={interceptionReturnYards > 0 ? "text-emerald-400" : interceptionReturnYards < 0 ? "text-red-400" : ""}>
                            {interceptionReturnYards > 0 ? "+" : ""}{interceptionReturnYards} yds
                          </span>)
                        </div>
                        <div>
                          Net from LOS: <span className={interceptionNetYards > 0 ? "text-emerald-400 font-bold" : interceptionNetYards < 0 ? "text-red-400 font-bold" : "font-bold text-slate-300"}>
                            {interceptionNetYards > 0 ? "+" : ""}
                            {interceptionNetYards} yds
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label className="label block mb-2">Ball Spotted At</label>

                      <div className="flex gap-1.5 mb-3">
                        {(["our", "opp"] as const).map(side => (
                        <button
                          key={side}
                          onClick={() => setResultSide(side)}
                            className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                              resultSide === side
                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                                : "border-surface-border bg-surface-bg text-slate-500"
                            }`}
                        >
                            {perspectiveSideLabel(side)}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {[-10, -5, -1].map(n => (
                          <button key={n} onClick={() => adjustYardLine(resultYardLine, n, resultSide, setResultYardLine, setResultSide)}
                            className="btn-ghost flex-1 h-10 text-sm font-bold">{n}</button>
                        ))}
                        <div className={`w-14 h-10 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums ${
                          yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : "text-slate-300"
                        }`}>{resultYardLine}</div>
                        {[1, 5, 10].map(n => (
                          <button key={n} onClick={() => adjustYardLine(resultYardLine, n, resultSide, setResultYardLine, setResultSide)}
                            className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-slate-500">Or type:</span>
                        <input
                          type="number" inputMode="numeric" min={1} max={50}
                          placeholder="e.g. 35"
                          value={resultYardRaw}
                          onChange={e => {
                            setResultYardRaw(e.target.value);
                            const n = parseInt(e.target.value, 10);
                            if (!isNaN(n)) setResultYardLine(Math.max(1, Math.min(50, n)));
                          }}
                          className="input w-20 text-center text-sm font-black"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-slate-500">Yards:</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="+7 or -2"
                          value={totalYardsRaw}
                          onChange={e => {
                            const nextValue = e.target.value;
                            setTotalYardsRaw(nextValue);
                            const parsed = parseInt(nextValue, 10);
                            if (!isNaN(parsed)) {
                              setResultFromTotalYards(parsed);
                            }
                          }}
                          onBlur={() => setTotalYardsRaw(String(yards))}
                          className="input w-24 text-center text-sm font-black"
                        />
                      </div>

                      <div className="text-xs text-slate-500 mt-3">
                        {yardLabel(gameState.ballOn)} → <span className="font-bold text-slate-300">{perspectiveSideTag(resultSide)} {resultYardLine}</span>
                        {" "}(<span className={yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : ""}>{yards > 0 ? "+" : ""}{yards} yds</span>)
                      </div>
                    </>
                  )}
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

              {/* TD / First Down toggles */}
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

              {/* Touchback */}
              {needsTouchback && (
                <button onClick={() => setIsTouchback(t => !t)}
                  className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                    isTouchback ? "border-sky-500 bg-sky-500/20 text-sky-400" : "border-surface-border bg-surface-bg text-slate-500"
                  }`}>Touchback</button>
              )}

              {/* Penalty */}
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
              <div className="text-[10px] text-slate-600 text-center">
                Formations are optional — skip if not tracking.
              </div>
            </>
          )}

          {/* ── STEP: Defense (tacklers) ── */}
          {currentStep === "defense" && (
            <>
              <div className="text-xs text-slate-400 mb-1">
                {isTheirBall
                  ? `Select up to 3 tacklers from ${progName}. 1 player = 1.0 credit, 2+ = 0.5 each.`
                  : `Select up to 3 ${oppName} tacklers. 1 player = 1.0 credit, 2+ = 0.5 each.`
                }
              </div>
              {tacklers.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {tacklers.map(t => (
                    <span key={t.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
                      t.isOpponent ? "bg-orange-900/30 text-orange-400" : "bg-red-900/30 text-red-400"
                    }`}>
                      {t.isOpponent && <span className="text-[9px]">{oppTag}</span>}
                      #{t.jersey_number} {t.name.split(" ")[1]}
                      <span className="text-[10px] opacity-60">({t.credit})</span>
                      <button onClick={() => setTacklers(prev => {
                        const next = prev.filter(x => x.id !== t.id);
                        if (next.length === 1) return next.map(x => ({ ...x, credit: 1 }));
                        return next;
                      })} className="ml-0.5 opacity-60"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {isTheirBall ? (
                <PlayerGrid
                  roster={roster}
                  label={`Select tackler(s) from ${progName}`}
                  onSelect={p => handleAddTackler(p)}
                  selectedId={null}
                  search={tacklerSearch}
                  onSearch={setTacklerSearch}
                />
              ) : (
                <OpponentPlayerGrid
                  players={opponentPlayers}
                  label={`Select ${oppName} tackler(s)`}
                  onSelect={p => handleAddOpponentTackler(p)}
                  selectedId={null}
                  search={tacklerSearch}
                  onSearch={setTacklerSearch}
                  onQuickAdd={handleQuickAddOpponent}
                />
              )}
              <div className="text-[10px] text-slate-600 text-center mt-2">
                Optional — skip if not tracking tacklers on this play.
              </div>
            </>
          )}

          {/* ── STEP: Review ── */}
          {currentStep === "review" && (
            <div className="space-y-3">
              <div className="text-sm font-bold text-slate-300">Review Play</div>
              <div className="card p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="font-bold">{playType.label}</span>
                </div>
                {tagged.map(t => (
                  <div key={t.role} className="flex justify-between">
                    <span className="text-slate-500 capitalize">{t.role}</span>
                    <span className="font-bold">
                      {t.isOpponent && <span className="text-red-400 text-[10px] mr-1">{oppTag}</span>}
                      #{t.jersey_number} {t.name}
                    </span>
                  </div>
                ))}
                {needsYards && (
                  <>
                    {isInterception ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Intercepted At</span>
                          <span className="font-bold">{fieldTeamTag(intCaughtTeam)} {intCaughtYardLine}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Returned To</span>
                          <span className="font-bold">{interceptionReturnLabel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Return Yards</span>
                          <span className={`font-bold ${interceptionReturnYards > 0 ? "text-emerald-400" : interceptionReturnYards < 0 ? "text-red-400" : ""}`}>
                            {interceptionReturnYards > 0 ? `+${interceptionReturnYards}` : interceptionReturnYards}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Net Yards</span>
                          <span className={`font-bold ${interceptionNetYards > 0 ? "text-emerald-400" : interceptionNetYards < 0 ? "text-red-400" : ""}`}>
                            {interceptionNetYards > 0 ? `+${interceptionNetYards}` : interceptionNetYards}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        {!isTD && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Spotted At</span>
                            <span className="font-bold">{perspectiveSideTag(resultSide)} {resultYardLine}</span>
                          </div>
                        )}
                        {(() => {
                          const displayYards = isTD
                            ? (["int", "fumble"].includes(playType.id) ? -gameState.ballOn : 100 - gameState.ballOn)
                            : yards;
                          return (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Yards</span>
                              <span className={`font-bold ${displayYards > 0 ? "text-emerald-400" : displayYards < 0 ? "text-red-400" : ""}`}>
                                {displayYards > 0 ? `+${displayYards}` : displayYards}
                              </span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </>
                )}
                {isKickPlay && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kick Distance</span>
                      <span className="font-bold text-purple-400">{kickDistance} yds</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Landed At</span>
                      <span className="font-bold">{isTouchback ? "Touchback" : landingLabel}</span>
                    </div>
                    {!isTouchback && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Returned To</span>
                        <span className="font-bold text-emerald-400">
                          {(() => {
                            const sideLabel = fieldTeamTag(returnToTeam);
                            const isReceiverSide = returnToTeam === receivingFieldSide;
                            const receiverYard = isReceiverSide ? returnToYardLine : 100 - returnToYardLine;
                            const retYds = receiverYard - kickedToYard;
                            return `${sideLabel} ${returnToYardLine} (${retYds > 0 ? "+" : ""}${retYds} yds)`;
                          })()}
                        </span>
                      </div>
                    )}
                  </>
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
            <button onClick={handleSubmit} disabled={!canGoNext()} className="btn-primary w-full py-3 text-sm font-black disabled:opacity-50">
              Record Play
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
