import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Shield,
  Zap,
  ChevronUp,
  ChevronDown,
  Flag,
  RotateCcw,
  Check,
  X,
  RefreshCw,
  Trophy,
  Target,
  CircleDot,
  Pencil,
} from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  insertPlay,
  deletePlay,
  updatePlay,
  loadGamePlays,
  updateGameScore,
  deriveGameState,
  type PlayInsert,
  type PlayWithPlayers,
} from "@/services/gameService";

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Player {
  id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface TaggedPlayer {
  id: string;
  player_id: string;
  jersey_number: number | null;
  name: string;
  role: string;
}

interface PlayRecord {
  id: string;
  quarter: number;
  clock: number;
  type: string;
  tab: string;
  yards: number;
  result: string;
  penalty: string | null;
  flagYards: number;
  isTouchdown: boolean;
  firstDown: boolean;
  turnover: boolean;
  tagged: TaggedPlayer[];
  ballOn: number;
  down: number;
  distance: number;
  description: string;
  possession: "us" | "them";
}

interface PlayTypeDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

/* ─────────────────────────────────────────────
   Constants
   ───────────────────────────────────────────── */

const PLAY_TYPES: Record<string, PlayTypeDef[]> = {
  offense: [
    { id: "rush", label: "Rush", icon: <Play className="w-4 h-4" />, roles: ["rusher"] },
    { id: "pass_comp", label: "Complete", icon: <Target className="w-4 h-4" />, roles: ["passer", "receiver"] },
    { id: "pass_inc", label: "Incomplete", icon: <X className="w-4 h-4" />, roles: ["passer", "receiver"] },
    { id: "sack", label: "Sack", icon: <Shield className="w-4 h-4" />, roles: ["passer", "sacker"] },
    { id: "fumble", label: "Fumble", icon: <RefreshCw className="w-4 h-4" />, roles: ["rusher"] },
    { id: "kneel", label: "Kneel", icon: <ChevronDown className="w-4 h-4" />, roles: ["passer"] },
    { id: "spike", label: "Spike", icon: <Zap className="w-4 h-4" />, roles: ["passer"] },
    { id: "penalty_only", label: "Penalty", icon: <Flag className="w-4 h-4" />, roles: [] },
  ],
  defense: [
    { id: "tackle", label: "Tackle", icon: <Shield className="w-4 h-4" />, roles: ["tackler", "assist"] },
    { id: "tfl", label: "TFL", icon: <ChevronDown className="w-4 h-4" />, roles: ["tackler", "assist"] },
    { id: "int", label: "INT", icon: <RotateCcw className="w-4 h-4" />, roles: ["interceptor"] },
    { id: "fum_rec", label: "Fum Rec", icon: <CircleDot className="w-4 h-4" />, roles: ["forced_fumble", "fumble_recovery"] },
    { id: "pbu", label: "PBU", icon: <X className="w-4 h-4" />, roles: ["defender"] },
    { id: "hurry", label: "Hurry", icon: <Zap className="w-4 h-4" />, roles: ["pass_rusher"] },
    { id: "safety", label: "Safety", icon: <Trophy className="w-4 h-4" />, roles: ["tackler"] },
  ],
  special: [
    { id: "kickoff", label: "Kickoff", icon: <Zap className="w-4 h-4" />, roles: ["kicker", "returner"] },
    { id: "punt", label: "Punt", icon: <ChevronUp className="w-4 h-4" />, roles: ["punter", "returner"] },
    { id: "fg", label: "FG", icon: <Trophy className="w-4 h-4" />, roles: ["kicker", "holder"] },
    { id: "pat", label: "PAT", icon: <Check className="w-4 h-4" />, roles: ["kicker"] },
    { id: "two_pt", label: "2PT", icon: <Target className="w-4 h-4" />, roles: ["passer", "receiver"] },
    { id: "blocked_kick", label: "Blocked", icon: <Shield className="w-4 h-4" />, roles: ["blocker"] },
  ],
};

const PENALTIES = [
  "Offsides", "False Start", "Holding-OFF", "Holding-DEF",
  "PI-OFF", "PI-DEF", "Facemask", "Unsportsmanlike",
  "Delay of Game", "Illegal Formation", "Block in Back",
  "Clipping", "Encroachment", "Illegal Shift", "Illegal Motion",
];

// Penalties against the OFFENSE (ball moves back, repeat down or loss of down)
const OFFENSE_PENALTIES = new Set([
  "False Start", "Holding-OFF", "PI-OFF", "Illegal Formation",
  "Delay of Game", "Illegal Shift", "Illegal Motion", "Clipping",
]);

// Default yardage per penalty (used to auto-fill flagYards when selecting)
const PENALTY_DEFAULT_YARDS: Record<string, number> = {
  "Offsides": 5, "False Start": 5, "Holding-OFF": 10, "Holding-DEF": 5,
  "PI-OFF": 10, "PI-DEF": 15, "Facemask": 15, "Unsportsmanlike": 15,
  "Delay of Game": 5, "Illegal Formation": 5, "Block in Back": 10,
  "Clipping": 15, "Encroachment": 5, "Illegal Shift": 5, "Illegal Motion": 5,
};

function findPlayTypeDef(typeId: string): PlayTypeDef | null {
  for (const tab of Object.values(PLAY_TYPES)) {
    const found = tab.find(p => p.id === typeId);
    if (found) return found;
  }
  return null;
}

const QUARTER_LABELS = ["1st", "2nd", "3rd", "4th", "OT"];
const NFHS_QUARTER_SECS = 720;

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

/**
 * Parse shorthand clock input into { mins, secs }.
 * "534"  → 5:34   "45" → 0:45   "1200" → 12:00   "0" → 0:00
 * Rule: last 2 digits = seconds, leading digits = minutes.
 * If result is invalid (secs >= 60) clamp to 59.
 */
function parseClockInput(raw: string): { mins: number; secs: number } | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (isNaN(n)) return null;
  if (digits.length <= 2) {
    const secs = Math.min(59, n);
    return { mins: 0, secs };
  }
  const secs = Math.min(59, n % 100);
  const mins = Math.min(12, Math.floor(n / 100));
  return { mins, secs };
}

function yardLabel(yard: number) {
  if (yard === 50) return "50";
  return yard > 50 ? `OPP ${100 - yard}` : `OWN ${yard}`;
}

function fmtClock(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDesc(
  pt: PlayTypeDef,
  tagged: TaggedPlayer[],
  yards: number,
  scored: boolean,
  pen: string | null,
  result: string,
  oppPlayer: { position: string; jersey: string | null } | null
): string {
  const parts: string[] = [];
  const byRole = (r: string) => tagged.find(t => t.role === r);
  const oppLabel = oppPlayer
    ? `${oppPlayer.position}${oppPlayer.jersey ? ` #${oppPlayer.jersey}` : ""}`
    : null;

  switch (pt.id) {
    case "rush": {
      const c = byRole("rusher");
      const who = oppLabel ?? `#${c?.jersey_number ?? "?"}`;
      parts.push(`${who} rush ${yards > 0 ? "+" : ""}${yards}`);
      break;
    }
    case "pass_comp": {
      const p = byRole("passer"), r = byRole("receiver");
      const passer = oppLabel ?? `#${p?.jersey_number ?? "?"}`;
      parts.push(`${passer} → #${r?.jersey_number ?? "?"} ${yards > 0 ? "+" : ""}${yards}`);
      break;
    }
    case "pass_inc": {
      const p = byRole("passer"), r = byRole("receiver");
      const passer = oppLabel ?? `#${p?.jersey_number ?? "?"}`;
      parts.push(`${passer} → #${r?.jersey_number ?? "?"} inc`);
      break;
    }
    case "sack": {
      const p = byRole("passer");
      const s = byRole("sacker");
      const who = oppLabel ?? `#${p?.jersey_number ?? "?"}`;
      parts.push(`${who} sacked ${yards}${s ? ` by #${s.jersey_number}` : ""}`);
      break;
    }
    case "fumble": parts.push("Fumble"); break;
    case "safety": parts.push("Safety"); break;
    case "fg": parts.push(`FG${yards > 0 ? ` ${yards}yd` : ""} ${result}`.trim()); break;
    case "pat": parts.push(`PAT ${result}`.trim()); break;
    case "two_pt": parts.push(`2PT ${result}`.trim()); break;
    case "kickoff": {
      const k = byRole("kicker"), ret = byRole("returner");
      parts.push(`Kickoff${k ? ` #${k.jersey_number}` : ""}${ret ? ` ret #${ret.jersey_number} ${yards}` : ""}`);
      break;
    }
    case "punt": {
      const p = byRole("punter"), ret = byRole("returner");
      parts.push(`Punt${p ? ` #${p.jersey_number}` : ""}${ret ? ` ret #${ret.jersey_number} ${yards}` : ""}`);
      break;
    }
    default: parts.push(pt.label); break;
  }

  if (scored) parts.push("TD");
  if (pen) parts.push(`🚩 ${pen}`);
  return parts.join(" · ");
}

/* ═══════════════════════════════════════════════
   GAME SCREEN
   ═══════════════════════════════════════════════ */

export default function GameScreen() {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const { program, season } = useProgramContext();

  /* ── Load game, roster, and existing plays ── */
  const [game, setGame] = useState<any>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!season || !gameId) return;
    setLoading(true);

    const [gameRes, rosterRes, existingPlays] = await Promise.all([
      supabase
        .from("games")
        .select("*, opponent:opponents(*)")
        .eq("id", gameId)
        .single(),
      supabase
        .from("season_rosters")
        .select("*, player:players(*)")
        .eq("season_id", season.id)
        .eq("is_active", true)
        .order("jersey_number", { ascending: true, nullsFirst: false }),
      loadGamePlays(gameId),
    ]);

    setGame(gameRes.data);
    setRoster(rosterRes.data ?? []);

    // Convert DB plays to local PlayRecord format
    const localPlays: PlayRecord[] = existingPlays.map(p => {
      const pd = (p.play_data ?? {}) as Record<string, any>;
      // Convert clock text "M:SS" back to seconds
      let clockSecs = 0;
      if (p.clock) {
        const [m, s] = p.clock.split(":").map(Number);
        clockSecs = (m || 0) * 60 + (s || 0);
      }
      return {
        id: p.id,
        quarter: p.quarter,
        clock: clockSecs,
        type: p.play_type,
        tab: pd.play_category ?? "offense",
        yards: p.yards_gained,
        result: pd.result ?? "",
        penalty: pd.penalty_type ?? null,
        flagYards: pd.penalty_yards ?? 0,
        isTouchdown: p.is_touchdown,
        firstDown: pd.is_first_down ?? false,
        turnover: p.is_turnover,
        tagged: p.play_players.map(pp => ({
          id: pp.player_id,
          player_id: pp.player_id,
          jersey_number: null,
          name: pp.player
            ? `${pp.player.first_name} ${pp.player.last_name}`
            : "?",
          role: pp.role,
        })),
        ballOn: p.yard_line,
        down: p.down,
        distance: p.distance,
        description: p.description,
        possession: p.possession,
      };
    });

    setPlays(localPlays);

    // Resume game state from existing plays
    if (existingPlays.length > 0) {
      const state = deriveGameState(existingPlays);
      setQuarter(state.quarter);
      setClock(state.clock);
      setPossession(state.possession);
      setOurScore(state.ourScore);
      setTheirScore(state.theirScore);
      setDown(state.down);
      setDistance(state.distance);
      setBallOn(state.ballOn);
    }

    setLoading(false);
  }, [season, gameId]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Game state ── */
  const [quarter, setQuarter] = useState(0);
  const [clock, setClock] = useState(NFHS_QUARTER_SECS);
  const [possession, setPossession] = useState<"us" | "them">("us");
  const [ourScore, setOurScore] = useState(0);
  const [theirScore, setTheirScore] = useState(0);

  /* ── Drive state ── */
  const [down, setDown] = useState(1);
  const [distance, setDistance] = useState(10);
  const [ballOn, setBallOn] = useState(25);

  /* ── Play entry ── */
  const [activeTab, setActiveTab] = useState<"offense" | "defense" | "special">("offense");
  const [playType, setPlayType] = useState<PlayTypeDef | null>(null);
  const [yards, setYards] = useState(0);
  const [yardInputMode, setYardInputMode] = useState<"stepper" | "exact" | "yardline">("stepper");
  const [yardRawInput, setYardRawInput] = useState("");
  const [isTD, setIsTD] = useState(false);
  const [isFirstDown, setIsFirstDown] = useState(false);
  const [penalty, setPenalty] = useState("");
  const [flagYards, setFlagYards] = useState(5);
  const [showPenaltySheet, setShowPenaltySheet] = useState(false);

  /* ── Player tagging ── */
  const [tagged, setTagged] = useState<TaggedPlayer[]>([]);
  const [activeRole, setActiveRole] = useState("");
  const [playerFilter, setPlayerFilter] = useState("");

  // When possession="them" and on offense tab, our roles flip to defensive credit
  const effectiveRoles = useMemo(() => {
    if (!playType) return [];
    if (possession === "them" && activeTab === "offense") return ["tackler", "assist"];
    return playType.roles;
  }, [playType, possession, activeTab]);

  useEffect(() => {
    if (effectiveRoles.length > 0) setActiveRole(effectiveRoles[0]);
    else setActiveRole("");
  }, [playType, possession, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Play log ── */
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showScoreAdj, setShowScoreAdj] = useState(false);

  /* ── Submit guard (double-tap prevention) ── */
  const isSubmitting = useRef(false);

  /* ── PAT gate (forced after every TD) ── */
  const [showPatGate, setShowPatGate] = useState(false);
  const [patGatePossession, setPatGatePossession] = useState<"us" | "them">("us");
  const [savingPat, setSavingPat] = useState(false);

  /* ── Situation adjuster (post-penalty) ── */
  const [showSituationAdj, setShowSituationAdj] = useState(false);
  const [adjBallOn, setAdjBallOn] = useState(25);
  const [adjDown, setAdjDown] = useState(1);
  const [adjDistance, setAdjDistance] = useState(10);

  /* ── Edit play ── */
  const [editPlay, setEditPlay] = useState<PlayRecord | null>(null);
  const [editYards, setEditYards] = useState(0);
  const [editEndBallOn, setEditEndBallOn] = useState(25);
  const [editEndRawInput, setEditEndRawInput] = useState("");
  const [editIsTD, setEditIsTD] = useState(false);
  const [editPenalty, setEditPenalty] = useState("");
  const [editPenaltyYards, setEditPenaltyYards] = useState(5);
  const [showEditPenaltyPicker, setShowEditPenaltyPicker] = useState(false);

  /* ── New controls ── */
  const [playResult, setPlayResult] = useState<"Good" | "No Good" | "">("");
  const [isTouchback, setIsTouchback] = useState(false);
  const [showClockEditor, setShowClockEditor] = useState(false);
  const [showClockPrompt, setShowClockPrompt] = useState(false);
  const [clockPromptReason, setClockPromptReason] = useState("");
  const [clockMins, setClockMins] = useState(12);
  const [clockSecs, setClockSecs] = useState(0);
  const [clockRawInput, setClockRawInput] = useState("");
  const [showEndGame, setShowEndGame] = useState(false);
  const [oppPlayerPos, setOppPlayerPos] = useState("");
  const [oppPlayerJersey, setOppPlayerJersey] = useState("");

  const firstDownMarker = useMemo(() => {
    const m = ballOn + distance;
    return m <= 100 ? m : 100;
  }, [ballOn, distance]);

  /* ── Filtered roster ── */
  const filteredRoster = useMemo(() => {
    if (!playerFilter) return roster;
    const q = playerFilter.toLowerCase();
    return roster.filter(p =>
      String(p.jersey_number).includes(q) ||
      p.player.first_name.toLowerCase().includes(q) ||
      p.player.last_name.toLowerCase().includes(q) ||
      (p.position ?? "").toLowerCase().includes(q)
    );
  }, [roster, playerFilter]);

  /* ── Quick stats ── */
  const stats = useMemo(() => {
    let rushAtt = 0, rushYds = 0, passAtt = 0, passComp = 0, passYds = 0, firstDowns = 0, tos = 0, pens = 0;
    // Defense — weighted tackles (solo=1, assisted=0.5 each)
    let defTackles = 0, defTfl = 0, defSacks = 0, defInts = 0, defPbus = 0;

    plays.forEach(p => {
      if (p.possession === "us") {
        if (p.type === "rush") { rushAtt++; rushYds += p.yards; }
        if (p.type === "pass_comp") { passAtt++; passComp++; passYds += p.yards; }
        if (p.type === "pass_inc") passAtt++;
        if (p.firstDown) firstDowns++;
        if (p.turnover) tos++;
      }
      if (p.penalty) pens++;

      // Defense: count team stops (their drives), apply 0.5 weighting per player for tackle display
      if (["tackle", "tfl"].includes(p.type)) {
        const hasTackler = p.tagged.some(t => t.role === "tackler");
        const hasAssist  = p.tagged.some(t => t.role === "assist");
        // Each player's contribution: 0.5 if assisted, 1.0 if solo
        if (hasTackler) defTackles += hasAssist ? 0.5 : 1;
        if (hasAssist)  defTackles += 0.5;
      }
      if (p.type === "tfl") defTfl++;
      if (p.type === "sack") defSacks++;
      if (p.type === "int") defInts++;
      if (p.type === "pbu") defPbus++;
    });

    return { rushAtt, rushYds, passAtt, passComp, passYds, firstDowns, tos, pens, defTackles, defTfl, defSacks, defInts, defPbus };
  }, [plays]);

  /* ── Handlers ── */

  const handleTag = (p: Player) => {
    if (!activeRole) return;
    const tp: TaggedPlayer = {
      id: p.id,
      player_id: p.player_id,
      jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`,
      role: activeRole,
    };
    setTagged(prev => [...prev.filter(t => t.role !== activeRole && t.id !== p.id), tp]);
    const idx = effectiveRoles.indexOf(activeRole);
    if (idx < effectiveRoles.length - 1) setActiveRole(effectiveRoles[idx + 1]);
    setPlayerFilter("");
  };

  const handleRemoveTag = (playerId: string) => {
    setTagged(prev => prev.filter(t => t.id !== playerId));
  };

  const resetPlayEntry = () => {
    setPlayType(null);
    setYards(0);
    setYardInputMode("stepper");
    setYardRawInput("");
    setIsTD(false);
    setIsFirstDown(false);
    setPlayResult("");
    setIsTouchback(false);
    setPenalty("");
    setFlagYards(5);
    setTagged([]);
    setActiveRole("");
    setPlayerFilter("");
    setOppPlayerPos("");
    setOppPlayerJersey("");
  };

  const handleSubmit = async () => {
    if (!playType || !gameId || !season) return;
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const isSpecialResult = ["pat", "fg", "two_pt"].includes(playType.id);
    const zeroYardPlay = playType.id === "pass_inc" || isSpecialResult
      || playType.id === "spike" || playType.id === "penalty_only";
    const playYards = zeroYardPlay ? 0 : yards;
    const newBallOn = Math.min(100, Math.max(0, ballOn + playYards));
    const earnedFirst = isFirstDown || (playYards >= distance && down <= 4);
    const scored = isTD || newBallOn >= 100;

    const oppPlayer = (possession === "them" && oppPlayerPos)
      ? { position: oppPlayerPos, jersey: oppPlayerJersey || null }
      : null;

    const passResult = playType.id === "pass_comp" ? "Complete"
                     : playType.id === "pass_inc" ? "Incomplete"
                     : null;
    const finalResult = playResult || passResult || "";

    const playInsert: PlayInsert = {
      game_id: gameId,
      quarter,
      clock: fmtClock(clock),
      possession,
      down,
      distance,
      yard_line: ballOn,
      play_type: playType.id,
      play_data: {
        season_id: season.id,
        play_category: activeTab,
        result: finalResult || null,
        is_first_down: earnedFirst,
        penalty_type: penalty || null,
        penalty_yards: penalty ? flagYards : 0,
        opp_player: oppPlayer,
      },
      yards_gained: playYards,
      is_touchdown: scored,
      is_turnover: ["int", "fum_rec"].includes(playType.id),
      is_penalty: !!penalty,
      primary_player_id: tagged[0]?.player_id ?? null,
      description: buildDesc(playType, tagged, playYards, scored, penalty || null, finalResult, oppPlayer),
    };

    const playerInserts = tagged.map(t => ({ player_id: t.player_id, role: t.role }));

    const savedPlay = await insertPlay(playInsert, playerInserts);
    if (!savedPlay) { console.error("Play failed to save"); return; }

    const localPlay: PlayRecord = {
      id: savedPlay.id,
      quarter,
      clock,
      type: playType.id,
      tab: activeTab,
      yards: playYards,
      result: finalResult,
      penalty: penalty || null,
      flagYards: penalty ? flagYards : 0,
      isTouchdown: scored,
      firstDown: earnedFirst,
      turnover: ["int", "fum_rec"].includes(playType.id),
      tagged: [...tagged],
      ballOn,
      down,
      distance,
      description: playInsert.description,
      possession,
    };
    setPlays(prev => [...prev, localPlay]);

    // ── Mark game live on first play ──
    if (plays.length === 0) {
      await updateGameScore(gameId, ourScore, theirScore, "live");
    }

    // ── Scoring ──
    let nextOurScore = ourScore;
    let nextTheirScore = theirScore;

    if (scored) {
      if (possession === "us") nextOurScore += 6; else nextTheirScore += 6;
    }
    if (playType.id === "pat" && playResult === "Good") {
      if (possession === "us") nextOurScore += 1; else nextTheirScore += 1;
    }
    if (playType.id === "fg" && playResult === "Good") {
      if (possession === "us") nextOurScore += 3; else nextTheirScore += 3;
    }
    if (playType.id === "two_pt" && playResult === "Good") {
      if (possession === "us") nextOurScore += 2; else nextTheirScore += 2;
    }
    if (playType.id === "safety") {
      // Safety: opposite team scores 2
      if (possession === "us") nextTheirScore += 2; else nextOurScore += 2;
    }

    if (nextOurScore !== ourScore || nextTheirScore !== theirScore) {
      setOurScore(nextOurScore);
      setTheirScore(nextTheirScore);
      await updateGameScore(gameId, nextOurScore, nextTheirScore);
    }

    // ── Game state advance ──
    if (penalty || playType.id === "penalty_only") {
      // Penalty plays: don't auto-advance — open situation adjuster
      const isOffPen = OFFENSE_PENALTIES.has(penalty);
      const sugBallOn = isOffPen
        ? Math.max(1, ballOn - flagYards)
        : Math.min(98, ballOn + flagYards);
      const sugDown = isOffPen ? down : 1; // def penalty = auto 1st
      const sugDistance = isOffPen
        ? Math.min(99, distance + flagYards)
        : Math.min(10, 100 - sugBallOn);
      setAdjBallOn(sugBallOn);
      setAdjDown(sugDown);
      setAdjDistance(Math.max(1, sugDistance));
      setShowSituationAdj(true);

    } else if (scored) {
      // TD — open PAT gate before advancing; do not auto-proceed
      setPatGatePossession(possession);
      setShowPatGate(true);

    } else if (playType.id === "pat" || playType.id === "two_pt") {
      // After PAT or 2PT — kickoff next; receiving team at their 35
      setBallOn(35); setDown(1); setDistance(10); setActiveTab("special");

    } else if (playType.id === "fg") {
      if (playResult === "Good") {
        // FG made — we kick off
        setBallOn(35); setDown(1); setDistance(10); setActiveTab("special");
      } else {
        // FG missed — they take over at the spot (min their 20)
        setBallOn(Math.max(20, 100 - ballOn)); setDown(1); setDistance(10);
        setPossession(p => p === "us" ? "them" : "us");
      }

    } else if (playType.id === "safety") {
      // Safety — scoring team kicks a free kick; switch to special, coach sets possession
      setActiveTab("special");

    } else if (["kickoff", "punt"].includes(playType.id)) {
      // Kicking plays — ALWAYS flip possession to the receiving team
      if (isTouchback) {
        // Touchback: receiving team starts at their own 20
        setBallOn(20); setDown(1); setDistance(10);
      } else {
        // Normal return: ball ends at newBallOn (yards entered = return/net yards)
        setBallOn(Math.max(1, newBallOn)); setDown(1); setDistance(10);
      }
      setPossession(p => p === "us" ? "them" : "us");

    } else if (playType.id === "int") {
      // INT — always flip possession; ball at interception/return spot
      setBallOn(Math.max(1, 100 - Math.max(1, newBallOn))); setDown(1); setDistance(10);
      setPossession(p => p === "us" ? "them" : "us");

    } else if (playType.id === "fum_rec" && possession === "them") {
      // We recovered their fumble — flip to us; ball at recovery spot
      setBallOn(Math.max(1, 100 - Math.max(1, newBallOn))); setDown(1); setDistance(10);
      setPossession(() => "us");

    } else if (earnedFirst) {
      setBallOn(newBallOn); setDown(1); setDistance(Math.min(10, 100 - newBallOn));

    } else if (down >= 4) {
      // Turnover on downs
      setBallOn(100 - newBallOn); setDown(1); setDistance(10);
      setPossession(p => p === "us" ? "them" : "us");

    } else {
      setBallOn(newBallOn); setDown(d => d + 1); setDistance(d => d - playYards);
    }

    // ── Clock prompt — ask for clock time on possession changes ──
    const POSS_CHANGE_PLAYS = ["kickoff", "punt", "int", "fum_rec", "blocked_kick"];
    const isTurnoverOnDowns = down >= 4 && !earnedFirst && !scored
      && !["kickoff", "punt", "fg", "pat", "two_pt", "safety", "int", "fum_rec"].includes(playType.id);
    if (POSS_CHANGE_PLAYS.includes(playType.id) || isTurnoverOnDowns) {
      const reasonMap: Record<string, string> = {
        kickoff: "After kickoff", punt: "After punt",
        int: "After interception", fum_rec: "After fumble recovery",
        blocked_kick: "After blocked kick",
      };
      const reason = reasonMap[playType.id] ?? "Turnover on downs";
      const minsLeft = Math.floor(clock / 60);
      setClockMins(minsLeft);
      setClockSecs(clock % 60);
      setClockPromptReason(reason);
      setShowClockPrompt(true);
    }

    resetPlayEntry();
    isSubmitting.current = false;
  };

  const handleUndo = async () => {
    if (plays.length === 0 || !gameId) return;
    const last = plays[plays.length - 1];

    const deleted = await deletePlay(last.id);
    if (!deleted) { console.error("Failed to undo play"); return; }

    setPlays(prev => prev.slice(0, -1));
    setBallOn(last.ballOn);
    setDown(last.down);
    setDistance(last.distance);

    let nextOur = ourScore;
    let nextTheir = theirScore;
    let scoreNeedsSync = false;

    if (last.isTouchdown) {
      if (last.possession === "us") nextOur = Math.max(0, nextOur - 6);
      else nextTheir = Math.max(0, nextTheir - 6);
      scoreNeedsSync = true;
    }
    if (last.type === "pat" && last.result === "Good") {
      if (last.possession === "us") nextOur = Math.max(0, nextOur - 1);
      else nextTheir = Math.max(0, nextTheir - 1);
      scoreNeedsSync = true;
    }
    if (last.type === "fg" && last.result === "Good") {
      if (last.possession === "us") nextOur = Math.max(0, nextOur - 3);
      else nextTheir = Math.max(0, nextTheir - 3);
      scoreNeedsSync = true;
    }
    if (last.type === "two_pt" && last.result === "Good") {
      if (last.possession === "us") nextOur = Math.max(0, nextOur - 2);
      else nextTheir = Math.max(0, nextTheir - 2);
      scoreNeedsSync = true;
    }
    if (last.type === "safety") {
      if (last.possession === "us") nextTheir = Math.max(0, nextTheir - 2);
      else nextOur = Math.max(0, nextOur - 2);
      scoreNeedsSync = true;
    }

    if (scoreNeedsSync) {
      setOurScore(nextOur);
      setTheirScore(nextTheir);
      await updateGameScore(gameId, nextOur, nextTheir);
    }
  };

  const openEditPlay = (play: PlayRecord) => {
    setEditPlay(play);
    setEditYards(play.yards);
    setEditEndBallOn(play.ballOn + play.yards);
    setEditEndRawInput("");
    setEditIsTD(play.isTouchdown);
    setEditPenalty(play.penalty ?? "");
    setEditPenaltyYards(play.flagYards || 5);
    setShowEditPenaltyPicker(false);
  };

  const handleSaveEdit = async () => {
    if (!editPlay) return;
    const def = findPlayTypeDef(editPlay.type);
    const updatedDesc = def
      ? buildDesc(def, editPlay.tagged, editYards, editIsTD, editPenalty || null, editPlay.result, null)
      : editPlay.description;

    const ok = await updatePlay(
      editPlay.id,
      { yards_gained: editYards, is_touchdown: editIsTD, is_penalty: !!editPenalty, description: updatedDesc },
      { penalty_type: editPenalty || null, penalty_yards: editPenalty ? editPenaltyYards : 0 }
    );
    if (!ok) return;

    setPlays(prev => prev.map(p => p.id === editPlay.id
      ? { ...p, yards: editYards, isTouchdown: editIsTD, penalty: editPenalty || null, flagYards: editPenalty ? editPenaltyYards : 0, description: updatedDesc }
      : p
    ));
    setEditPlay(null);
  };

  /**
   * Called from the PAT gate modal after a touchdown.
   * Records the PAT/2PT play automatically then advances field state.
   * result: "good_kick" | "no_good_kick" | "good_two" | "no_good_two" | "skip"
   */
  const handlePatGate = async (result: "good_kick" | "no_good_kick" | "good_two" | "no_good_two" | "skip") => {
    setSavingPat(true);
    const isTwoPoint = result.startsWith("good_two") || result.startsWith("no_good_two");
    const isGood = result.startsWith("good");

    if (result !== "skip" && gameId && season) {
      const patType = isTwoPoint ? "two_pt" : "pat";
      const patDef = findPlayTypeDef(patType)!;
      const pts = isTwoPoint && isGood ? 2 : (!isTwoPoint && isGood ? 1 : 0);

      const patInsert: PlayInsert = {
        game_id: gameId,
        quarter,
        clock: fmtClock(clock),
        possession: patGatePossession,
        down: 1,
        distance: 3,
        yard_line: 97,
        play_type: patType,
        play_data: {
          season_id: season.id,
          play_category: "special",
          result: isGood ? "Good" : "No Good",
          is_first_down: false,
          penalty_type: null,
          penalty_yards: 0,
          opp_player: null,
        },
        yards_gained: 0,
        is_touchdown: false,
        is_turnover: false,
        is_penalty: false,
        primary_player_id: null,
        description: `${isTwoPoint ? "2PT" : "PAT"} — ${isGood ? "Good" : "No Good"}`,
      };

      const saved = await insertPlay(patInsert, []);
      if (saved) {
        const localPat: PlayRecord = {
          id: saved.id, quarter, clock, type: patType, tab: "special",
          yards: 0, result: isGood ? "Good" : "No Good",
          penalty: null, flagYards: 0, isTouchdown: false,
          firstDown: false, turnover: false, tagged: [],
          ballOn: 97, down: 1, distance: 3,
          description: patInsert.description,
          possession: patGatePossession,
        };
        setPlays(prev => [...prev, localPat]);

        if (pts > 0) {
          const nextOur = patGatePossession === "us" ? ourScore + pts : ourScore;
          const nextTheir = patGatePossession === "them" ? theirScore + pts : theirScore;
          setOurScore(nextOur);
          setTheirScore(nextTheir);
          await updateGameScore(gameId, nextOur, nextTheir);
        }
      }
    }

    // Advance to kickoff situation regardless
    setBallOn(35); setDown(1); setDistance(10); setActiveTab("special");
    setPossession(patGatePossession); // scoring team kicks off
    setShowPatGate(false);
    setSavingPat(false);
  };

  const cycleQuarter = () => {
    setQuarter(q => {
      const next = (q + 1) % 5;
      if (next < 4) setClock(NFHS_QUARTER_SECS);
      return next;
    });
  };

  /* ── Render ── */

  if (loading) {
    return (
      <div className="screen safe-top safe-bottom">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-black flex-1">Game</h1>
        </div>
        <div className="text-neutral-500 text-sm text-center py-12 animate-pulse">Loading game...</div>
      </div>
    );
  }

  const oppName = game?.opponent?.name ?? "Opponent";
  const progName = program?.name ?? "Team";

  return (
    <div className="screen safe-top safe-bottom lg:flex-row lg:overflow-hidden">

      {/* ── Header (mobile only — hidden at lg, header moves into left panel) ── */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3 lg:hidden">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black flex-1 truncate">vs {oppName}</h1>
        <button onClick={() => setShowLog(true)} className="btn-ghost px-2 py-1 text-xs font-bold text-neutral-400">
          {plays.length} plays
        </button>
        <button onClick={() => setShowEndGame(true)} className="btn-ghost p-2 text-amber-500" title="End Game">
          <Trophy className="w-5 h-5" />
        </button>
      </div>

      {/* ── LEFT PANEL — play entry (full width mobile, left col at lg) ── */}
      <div className="flex-1 lg:flex lg:flex-col lg:overflow-hidden lg:border-r lg:border-surface-border">

        {/* lg header inside left panel */}
        <div className="hidden lg:flex items-center gap-3 px-6 pt-5 pb-3 shrink-0">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black flex-1 truncate">vs {oppName}</h1>
          <button onClick={() => setShowEndGame(true)} className="btn-ghost p-2 text-amber-500" title="End Game">
            <Trophy className="w-5 h-5" />
          </button>
        </div>

      <div className="flex-1 px-5 lg:px-6 overflow-y-auto pb-4 space-y-3">

        {/* ── Scoreboard ── */}
        <div className="card p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-center">
              <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{progName}</div>
              <div className="text-3xl font-black tabular-nums" style={{ color: program?.primary_color }}>
                {ourScore}
              </div>
              {possession === "us" && (
                <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto mt-1" />
              )}
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <button onClick={cycleQuarter} className="text-[10px] font-bold text-neutral-500 border border-surface-border rounded px-2 py-0.5 active:bg-surface-hover">
                {QUARTER_LABELS[quarter]}
              </button>
              <button
                onClick={() => { setClockMins(Math.floor(clock / 60)); setClockSecs(clock % 60); setShowClockEditor(true); }}
                className="text-xl font-black tabular-nums text-amber-400 active:opacity-60"
              >
                {fmtClock(clock)}
              </button>
              <button
                onClick={() => setPossession(p => p === "us" ? "them" : "us")}
                className="text-[10px] font-bold text-neutral-600 active:text-neutral-400"
              >
                ⇄ POSS
              </button>
            </div>

            <div className="flex-1 text-center">
              <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider truncate">{oppName}</div>
              <div className="text-3xl font-black tabular-nums text-neutral-300">
                {theirScore}
              </div>
              {possession === "them" && (
                <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto mt-1" />
              )}
            </div>
          </div>

          <button onClick={() => setShowScoreAdj(!showScoreAdj)} className="w-full text-center mt-2">
            <span className="text-[10px] font-bold text-neutral-600">± adjust score</span>
          </button>
          {showScoreAdj && (
            <div className="mt-2 pt-2 border-t border-surface-border">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-bold text-neutral-500 mb-1">{progName}</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 6, 7, 8].map(n => (
                      <button key={n} onClick={() => setOurScore(s => s + n)}
                        className="btn-ghost text-[11px] font-bold px-1.5 py-1 flex-1">+{n}</button>
                    ))}
                    <button onClick={() => setOurScore(s => Math.max(0, s - 1))}
                      className="btn-ghost text-[11px] font-bold px-1.5 py-1 text-red-400">−</button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-neutral-500 mb-1">{oppName}</div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 6, 7, 8].map(n => (
                      <button key={n} onClick={() => setTheirScore(s => s + n)}
                        className="btn-ghost text-[11px] font-bold px-1.5 py-1 flex-1">+{n}</button>
                    ))}
                    <button onClick={() => setTheirScore(s => Math.max(0, s - 1))}
                      className="btn-ghost text-[11px] font-bold px-1.5 py-1 text-red-400">−</button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => gameId && updateGameScore(gameId, ourScore, theirScore)}
                className="w-full mt-2 py-1.5 text-xs font-bold text-emerald-400 border border-emerald-900/50 rounded-lg active:opacity-70"
              >
                ✓ Save Score
              </button>
            </div>
          )}
        </div>

        {/* ── Field Viz ── */}
        <div className="card p-2 overflow-hidden">
          <div className="relative w-full h-14 rounded-lg overflow-hidden bg-emerald-900">
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(yd => (
              <div key={yd} className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: `${yd}%` }} />
            ))}
            {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((num, i) => (
              <span key={i} className="absolute bottom-0.5 text-[8px] text-white/30 font-mono -translate-x-1/2"
                style={{ left: `${(i + 1) * 10}%` }}>{num}</span>
            ))}
            {firstDownMarker <= 100 && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10" style={{ left: `${firstDownMarker}%` }} />
            )}
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white font-mono shadow-lg"
              style={{
                left: `${ballOn}%`,
                backgroundColor: possession === "us" ? (program?.primary_color ?? "#ef4444") : "#6b7280",
                boxShadow: `0 0 10px ${possession === "us" ? (program?.primary_color ?? "#ef4444") + "66" : "#6b728066"}`,
              }}
            >
              {ballOn > 50 ? 100 - ballOn : ballOn}
            </div>
          </div>
        </div>

        {/* ── Down & Distance ── */}
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(d => (
                <button key={d} onClick={() => setDown(d)}
                  className={`w-9 h-9 rounded-lg text-xs font-black transition-colors ${
                    down === d
                      ? "bg-amber-500 text-black"
                      : "bg-surface-bg text-neutral-500 active:bg-surface-hover"
                  }`}
                >
                  {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
                </button>
              ))}
            </div>

            <span className="text-neutral-600 font-bold">&</span>

            <div className="flex items-center gap-1">
              <button onClick={() => setDistance(d => Math.max(1, d - 1))} className="btn-ghost w-7 h-9 text-sm font-bold">−</button>
              <div className="w-8 h-9 rounded-lg bg-surface-bg flex items-center justify-center text-sm font-black text-amber-400 tabular-nums">
                {distance}
              </div>
              <button onClick={() => setDistance(d => Math.min(99, d + 1))} className="btn-ghost w-7 h-9 text-sm font-bold">+</button>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-neutral-600 mr-1">BALL</span>
              <button onClick={() => setBallOn(b => Math.max(1, b - 5))} className="btn-ghost px-1 h-9 text-[10px] font-bold text-neutral-500">−5</button>
              <button onClick={() => setBallOn(b => Math.max(1, b - 1))} className="btn-ghost w-7 h-9 text-sm font-bold">−</button>
              <div className="min-w-[52px] h-9 rounded-lg bg-surface-bg flex items-center justify-center text-xs font-black text-emerald-400 tabular-nums px-1">
                {yardLabel(ballOn)}
              </div>
              <button onClick={() => setBallOn(b => Math.min(99, b + 1))} className="btn-ghost w-7 h-9 text-sm font-bold">+</button>
              <button onClick={() => setBallOn(b => Math.min(99, b + 5))} className="btn-ghost px-1 h-9 text-[10px] font-bold text-neutral-500">+5</button>
            </div>
          </div>
        </div>

        {/* ── Quick Stats — offense when we have ball, defense when they do ── */}
        <div className="grid grid-cols-5 gap-1.5">
          {(possession === "us" ? [
            { label: "RUSH", val: `${stats.rushAtt}/${stats.rushYds}` },
            { label: "PASS", val: `${stats.passComp}-${stats.passAtt}/${stats.passYds}` },
            { label: "1ST", val: stats.firstDowns },
            { label: "TO", val: stats.tos },
            { label: "PEN", val: stats.pens },
          ] : [
            { label: "TAK", val: stats.defTackles % 1 === 0 ? stats.defTackles : stats.defTackles.toFixed(1) },
            { label: "TFL", val: stats.defTfl },
            { label: "SCK", val: stats.defSacks },
            { label: "INT", val: stats.defInts },
            { label: "PBU", val: stats.defPbus },
          ]).map(s => (
            <div key={s.label} className="card p-1.5 text-center">
              <div className={`text-[8px] font-bold tracking-wider ${possession === "us" ? "text-neutral-600" : "text-red-800"}`}>{s.label}</div>
              <div className="text-xs font-black tabular-nums">{s.val}</div>
            </div>
          ))}
        </div>

        {/* ── Play Type Tabs ── */}
        <div className="card p-3 space-y-3">
          <div className="flex gap-1">
            {(["offense", "defense", "special"] as const).map(tab => (
              <button key={tab}
                onClick={() => { setActiveTab(tab); resetPlayEntry(); }}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                  activeTab === tab
                    ? tab === "offense" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : tab === "defense" ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-surface-bg text-neutral-500 border border-transparent active:bg-surface-hover"
                }`}
              >
                {tab === "special" ? "ST" : tab.slice(0, 3)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {PLAY_TYPES[activeTab].map(pt => (
              <button key={pt.id}
                onClick={() => { setPlayType(pt); setYards(0); setIsTD(false); setIsFirstDown(false); setTagged([]); }}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-colors ${
                  playType?.id === pt.id
                    ? "border-dragon-primary bg-dragon-primary/10 text-white"
                    : "border-transparent bg-surface-bg text-neutral-400 active:bg-surface-hover"
                }`}
              >
                {pt.icon}
                <span className="text-[11px] font-bold">{pt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Play Details ── */}
        {playType && (
          <div className="card p-3 space-y-3">

            <div>
              {/* ── Yard entry mode tabs ── */}
              <div className="flex items-center justify-between mb-1.5">
                <label className="label">Yards</label>
                <div className="flex gap-1 bg-surface-bg rounded-lg p-0.5">
                  {(["stepper", "exact", "yardline"] as const).map(mode => (
                    <button key={mode}
                      onClick={() => { setYardInputMode(mode); setYardRawInput(""); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                        yardInputMode === mode
                          ? "bg-dragon-primary text-white"
                          : "text-neutral-500 active:text-neutral-300"
                      }`}>
                      {mode === "stepper" ? "+/−" : mode === "exact" ? "Type" : "Yd Line"}
                    </button>
                  ))}
                </div>
              </div>

              {yardInputMode === "stepper" && (
                <div className="flex items-center gap-1.5">
                  {[-10, -5, -1].map(n => (
                    <button key={n} onClick={() => setYards(y => y + n)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">{n}</button>
                  ))}
                  <div className={`w-14 h-10 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums ${
                    yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : "text-neutral-300"
                  }`}>
                    {yards}
                  </div>
                  {[1, 5, 10].map(n => (
                    <button key={n} onClick={() => setYards(y => y + n)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                  ))}
                </div>
              )}

              {yardInputMode === "exact" && (
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="numeric"
                    placeholder="e.g. −3 or 14"
                    value={yardRawInput}
                    onChange={e => {
                      setYardRawInput(e.target.value);
                      const n = parseInt(e.target.value, 10);
                      if (!isNaN(n)) setYards(n);
                    }}
                    className="input flex-1 text-center text-xl font-black tabular-nums"
                  />
                  <div className={`text-lg font-black tabular-nums min-w-[40px] text-right ${
                    yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : "text-neutral-400"
                  }`}>
                    {yards > 0 ? `+${yards}` : yards}
                  </div>
                </div>
              )}

              {yardInputMode === "yardline" && (
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold text-neutral-500 shrink-0">
                    From {yardLabel(ballOn)}
                  </div>
                  <input
                    type="number" inputMode="numeric" min={1} max={99}
                    placeholder="ending yd line (1–99)"
                    value={yardRawInput}
                    onChange={e => {
                      setYardRawInput(e.target.value);
                      const endLine = parseInt(e.target.value, 10);
                      if (!isNaN(endLine) && endLine >= 1 && endLine <= 99) {
                        setYards(endLine - ballOn);
                      }
                    }}
                    className="input flex-1 text-center font-black"
                  />
                  <div className={`text-lg font-black tabular-nums min-w-[40px] text-right ${
                    yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : "text-neutral-400"
                  }`}>
                    {yards > 0 ? `+${yards}` : yards}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setIsTD(t => !t)}
                className={`py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                  isTD ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-neutral-500"
                }`}>
                🏈 TD
              </button>
              <button onClick={() => setIsFirstDown(f => !f)}
                className={`py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                  isFirstDown ? "border-blue-500 bg-blue-500/20 text-blue-400" : "border-surface-border bg-surface-bg text-neutral-500"
                }`}>
                📏 1st Down
              </button>
            </div>

            {/* Touchback — kickoff / punt */}
            {["kickoff", "punt"].includes(playType.id) && (
              <div className="grid grid-cols-1 gap-2">
                <button onClick={() => setIsTouchback(t => !t)}
                  className={`py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                    isTouchback
                      ? "border-sky-500 bg-sky-500/20 text-sky-400"
                      : "border-surface-border bg-surface-bg text-neutral-500"
                  }`}>
                  Touchback → ball to 20
                </button>
              </div>
            )}

            {/* Result — PAT / FG / 2PT */}
            {["pat", "fg", "two_pt"].includes(playType.id) && (
              <div>
                <label className="label block mb-1.5">Result</label>
                <div className="flex gap-2">
                  {(["Good", "No Good"] as const).map(r => (
                    <button key={r} onClick={() => setPlayResult(pr => pr === r ? "" : r)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                        playResult === r
                          ? r === "Good"
                            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                            : "border-red-500 bg-red-500/20 text-red-400"
                          : "border-surface-border bg-surface-bg text-neutral-500"
                      }`}
                    >{r}</button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setShowPenaltySheet(true)}
              className={`w-full py-2 rounded-xl text-xs font-bold border transition-colors ${
                penalty ? "border-orange-500/50 bg-orange-500/10 text-orange-400" : "border-surface-border bg-surface-bg text-neutral-500"
              }`}
            >
              <Flag className="w-3 h-3 inline mr-1" />
              {penalty ? `${penalty} · ${flagYards} yds` : "Add Penalty"}
            </button>

            {/* Opponent Player — shown when they have possession */}
            {possession === "them" && (
              <div>
                <label className="label block mb-1.5">
                  Opp Player <span className="text-[10px] text-neutral-600 font-normal">optional — use generic if unknown</span>
                </label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {["QB", "RB", "WR", "TE", "FB", "OL", "K", "P", "DL", "LB", "DB"].map(pos => (
                    <button key={pos}
                      onClick={() => setOppPlayerPos(p => p === pos ? "" : pos)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                        oppPlayerPos === pos
                          ? "bg-dragon-primary text-white"
                          : "bg-surface-bg text-neutral-500 active:bg-surface-hover"
                      }`}
                    >{pos}</button>
                  ))}
                </div>
                {oppPlayerPos && (
                  <input
                    type="text" inputMode="numeric" maxLength={2}
                    placeholder="Jersey # (tap to add, leave blank for generic)"
                    value={oppPlayerJersey}
                    onChange={e => setOppPlayerJersey(e.target.value.replace(/\D/g, ""))}
                    className="input text-sm"
                  />
                )}
              </div>
            )}

            {/* Tag Players */}
            <div>
              <label className="label block mb-1.5">
                {possession === "them" && activeTab === "offense" ? "Defensive Credit" : "Tag Players"}
              </label>

              {effectiveRoles.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {effectiveRoles.map(role => {
                    const tp = tagged.find(t => t.role === role);
                    return (
                      <button key={role} onClick={() => setActiveRole(role)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                          activeRole === role
                            ? "bg-dragon-primary text-white"
                            : tp
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-surface-bg text-neutral-500"
                        }`}
                      >
                        {role}{tp ? `: #${tp.jersey_number}` : ""}
                      </button>
                    );
                  })}
                </div>
              )}


              <input
                type="text"
                placeholder="# or name..."
                value={playerFilter}
                onChange={e => setPlayerFilter(e.target.value)}
                className="input mb-2 text-sm"
              />

              <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto">
                {filteredRoster.map(p => {
                  const isTagged = tagged.some(t => t.id === p.id);
                  const tagRole = tagged.find(t => t.id === p.id)?.role;
                  return (
                    <button key={p.id}
                      onClick={() => isTagged ? handleRemoveTag(p.id) : handleTag(p)}
                      className={`flex flex-col items-center py-2 rounded-xl border-2 transition-colors ${
                        isTagged
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-transparent bg-surface-bg text-neutral-400 active:bg-surface-hover"
                      }`}
                    >
                      <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
                      <span className="text-[8px] font-bold text-neutral-500">{p.position}</span>
                      {tagRole && <span className="text-[7px] font-bold text-emerald-400 uppercase">{tagRole}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!playType || isSubmitting.current}
              className="btn-primary w-full text-sm font-black py-3 disabled:opacity-50"
            >
              {isSubmitting.current ? "Saving…" : "✓ Record Play"}
            </button>
          </div>
        )}

        {/* ── Recent Plays ── */}
        {plays.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-neutral-600 tracking-wider">RECENT PLAYS</span>
              <div className="flex items-center gap-3">
                <button onClick={handleUndo} className="text-[10px] font-bold text-red-400 active:text-red-300 flex items-center gap-0.5">
                  <RotateCcw className="w-3 h-3" />UNDO
                </button>
                <button onClick={() => setShowLog(true)} className="text-[10px] font-bold text-dragon-primary">
                  All {plays.length}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {plays.slice(-5).reverse().map((play, i) => (
                <div key={play.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${
                    i === 0 ? "bg-surface-card border-dragon-primary/30" : "bg-surface-card border-surface-border"
                  }`}
                >
                  <span className="text-[9px] font-bold text-neutral-600 shrink-0 tabular-nums">
                    Q{play.quarter + 1}
                  </span>
                  <span className="text-[9px] font-mono text-neutral-600 shrink-0">
                    {play.down}&{play.distance}
                  </span>
                  <span className={`text-[11px] font-bold shrink-0 tabular-nums ${
                    play.yards > 0 ? "text-emerald-400" : play.yards < 0 ? "text-red-400" : "text-neutral-500"
                  }`}>
                    {play.yards > 0 ? "+" : ""}{play.yards}
                  </span>
                  <span className="text-xs text-neutral-300 truncate flex-1">{play.description}</span>
                  {play.isTouchdown && <span className="text-[10px] font-black text-amber-400 shrink-0">TD</span>}
                  {play.penalty && <Flag className="w-3 h-3 text-orange-400 shrink-0" />}
                  <button onClick={() => openEditPlay(play)} className="p-1 shrink-0 active:opacity-60">
                    <Pencil className="w-3 h-3 text-neutral-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>{/* end left-panel scrollable */}
      </div>{/* end LEFT PANEL */}

      {/* ── RIGHT PANEL — play log, always visible at lg+ ── */}
      <div className="hidden lg:flex lg:flex-col lg:w-[380px] xl:w-[440px] shrink-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-surface-border">
          <h2 className="text-base font-black">Play Log</h2>
          <span className="text-xs font-bold text-neutral-600">{plays.length} plays</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {plays.length === 0 ? (
            <p className="text-neutral-600 text-sm text-center py-12">No plays yet</p>
          ) : (
            <div className="space-y-1.5">
              {plays.slice().reverse().map((play, i) => (
                <div key={play.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${
                    i === 0 ? "bg-surface-card border-dragon-primary/30" : "bg-surface-card border-surface-border"
                  }`}
                >
                  <span className="text-[9px] font-bold text-neutral-600 shrink-0 w-6">Q{play.quarter + 1}</span>
                  <span className="text-[9px] font-mono text-neutral-600 shrink-0 w-8">{play.down}&{play.distance}</span>
                  <span className={`text-[11px] font-bold shrink-0 w-8 tabular-nums ${
                    play.yards > 0 ? "text-emerald-400" : play.yards < 0 ? "text-red-400" : "text-neutral-500"
                  }`}>
                    {play.yards > 0 ? `+${play.yards}` : play.yards}
                  </span>
                  <span className="text-xs text-neutral-300 truncate flex-1">{play.description}</span>
                  {play.isTouchdown && <span className="text-[10px] font-black text-amber-400 shrink-0">TD</span>}
                  {play.penalty && <Flag className="w-3 h-3 text-orange-400 shrink-0" />}
                  <button onClick={() => openEditPlay(play)} className="p-1 shrink-0 active:opacity-60">
                    <Pencil className="w-3 h-3 text-neutral-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Play Log Sheet (mobile only) ── */}
      {showLog && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 lg:hidden">
          <div className="w-full max-w-app bg-surface-card rounded-t-2xl border border-surface-border max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h2 className="text-lg font-black">Play Log</h2>
              <button onClick={() => setShowLog(false)} className="btn-ghost p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {plays.length === 0 ? (
                <p className="text-neutral-500 text-sm text-center py-8">No plays recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {plays.slice().reverse().map((play, i) => (
                    <div key={play.id} className={`card flex items-center gap-3 p-3 ${i === 0 ? "border-dragon-primary/30" : ""}`}>
                      <div className="text-[10px] font-mono text-neutral-600 min-w-[28px]">
                        {QUARTER_LABELS[play.quarter]}
                      </div>
                      <div className="text-[10px] font-mono text-neutral-500 min-w-[36px]">
                        {play.down}&{play.distance}
                      </div>
                      <div className={`text-xs font-bold min-w-[40px] ${
                        play.yards > 0 ? "text-emerald-400" : play.yards < 0 ? "text-red-400" : "text-neutral-500"
                      }`}>
                        {play.yards > 0 ? "+" : ""}{play.yards}
                      </div>
                      <div className="text-sm text-neutral-300 flex-1 truncate">{play.description}</div>
                      {play.isTouchdown && <span className="text-xs font-black text-amber-400">TD</span>}
                      {play.penalty && <Flag className="w-3 h-3 text-orange-400" />}
                      <button onClick={() => { setShowLog(false); openEditPlay(play); }} className="p-1 active:opacity-60">
                        <Pencil className="w-3.5 h-3.5 text-neutral-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Penalty Sheet ── */}
      {showPenaltySheet && (
        <div className="sheet bg-black/70">
          <div className="sheet-panel max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h2 className="text-lg font-black">Penalty</h2>
              <button onClick={() => setShowPenaltySheet(false)} className="btn-ghost p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {PENALTIES.map(p => (
                  <button key={p} onClick={() => { setPenalty(p); setFlagYards(PENALTY_DEFAULT_YARDS[p] ?? 5); }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-colors ${
                      penalty === p
                        ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                        : "bg-surface-bg text-neutral-400 border border-transparent active:bg-surface-hover"
                    }`}
                  >{p}</button>
                ))}
              </div>

              {penalty && (
                <>
                  <div>
                    <label className="label block mb-1.5">Penalty Yards</label>
                    <div className="flex items-center gap-2">
                      {[5, 10, 15].map(n => (
                        <button key={n} onClick={() => setFlagYards(n)}
                          className={`flex-1 py-2 rounded-lg text-sm font-bold ${
                            flagYards === n ? "bg-orange-500/20 text-orange-400" : "bg-surface-bg text-neutral-400"
                          }`}>{n}</button>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => setShowPenaltySheet(false)} className="btn-primary w-full">
                    Apply {penalty} · {flagYards} yds
                  </button>
                  <button onClick={() => { setPenalty(""); setShowPenaltySheet(false); }}
                    className="w-full text-center text-xs font-bold text-red-400 py-2">
                    Clear Penalty
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Clock Editor ── */}
      {showClockEditor && (
        <div className="sheet bg-black/70">
          <div className="sheet-panel-sm">
            <div className="flex items-center justify-between p-5 pb-3">
              <h2 className="text-lg font-black">Set Clock</h2>
              <button onClick={() => setShowClockEditor(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 pb-6 space-y-4">
              <div>
                <p className="text-[11px] text-neutral-500 mb-2">Type time remaining — <span className="text-neutral-300 font-bold">534</span> → 5:34 · <span className="text-neutral-300 font-bold">45</span> → 0:45</p>
                <input
                  autoFocus
                  type="text" inputMode="numeric" maxLength={4}
                  placeholder="e.g. 534 or 45"
                  value={clockRawInput}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setClockRawInput(raw);
                    const parsed = parseClockInput(raw);
                    if (parsed) { setClockMins(parsed.mins); setClockSecs(parsed.secs); }
                  }}
                  className="input text-center text-3xl font-black tracking-widest tabular-nums py-4"
                />
              </div>
              <div className="text-center text-4xl font-black tabular-nums text-dragon-primary">
                {String(clockMins).padStart(2, "0")}:{String(clockSecs).padStart(2, "0")}
              </div>
              <button
                onClick={() => { setClock(clockMins * 60 + clockSecs); setClockRawInput(""); setShowClockEditor(false); }}
                className="btn-primary w-full py-3 font-black"
              >
                Set {clockMins}:{String(clockSecs).padStart(2, "0")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Game ── */}
      {showEndGame && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-5">
          <div className="w-full max-w-app bg-surface-card rounded-2xl border border-surface-border p-6">
            <div className="text-center mb-5">
              <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <h2 className="text-lg font-black">Mark Game Final?</h2>
              <p className="text-sm text-neutral-500 mt-1">
                {progName} <span className="font-black text-white">{ourScore}</span>
                {" – "}
                <span className="font-black text-white">{theirScore}</span> {oppName}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowEndGame(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={async () => {
                  if (gameId) {
                    await updateGameScore(gameId, ourScore, theirScore, "completed");
                    navigate(`/game/${gameId}/summary`);
                  }
                }}
                className="btn-primary flex-1"
              >
                Mark Final
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── PAT Gate (forced after every TD) ── */}
      {showPatGate && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-5">
          <div className="w-full max-w-app bg-surface-card rounded-2xl border border-surface-border p-5">
            <div className="text-center mb-5">
              <div className="text-3xl mb-1">🏈</div>
              <h2 className="text-lg font-black">TOUCHDOWN!</h2>
              <p className="text-xs text-neutral-500 mt-1">
                {patGatePossession === "us" ? "Your team scored" : "Opponent scored"} — confirm the PAT
              </p>
            </div>

            <div className="space-y-2">
              {/* PAT kick options */}
              <div className="flex gap-2">
                <button
                  disabled={savingPat}
                  onClick={() => handlePatGate("good_kick")}
                  className="flex-1 py-3 rounded-xl font-black text-sm border-2 border-emerald-500/50 bg-emerald-500/10 text-emerald-400 active:opacity-70"
                >
                  PAT Good · +1
                </button>
                <button
                  disabled={savingPat}
                  onClick={() => handlePatGate("no_good_kick")}
                  className="flex-1 py-3 rounded-xl font-black text-sm border-2 border-red-500/50 bg-red-500/10 text-red-400 active:opacity-70"
                >
                  PAT No Good
                </button>
              </div>

              {/* 2PT options */}
              <div className="flex gap-2">
                <button
                  disabled={savingPat}
                  onClick={() => handlePatGate("good_two")}
                  className="flex-1 py-3 rounded-xl font-black text-sm border-2 border-blue-500/50 bg-blue-500/10 text-blue-400 active:opacity-70"
                >
                  2PT Good · +2
                </button>
                <button
                  disabled={savingPat}
                  onClick={() => handlePatGate("no_good_two")}
                  className="flex-1 py-3 rounded-xl font-black text-sm border-2 border-surface-border bg-surface-bg text-neutral-500 active:opacity-70"
                >
                  2PT No Good
                </button>
              </div>

              <button
                disabled={savingPat}
                onClick={() => handlePatGate("skip")}
                className="w-full py-2 text-xs font-bold text-neutral-600 active:text-neutral-400"
              >
                {savingPat ? "Saving…" : "Skip — enter manually"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clock Prompt (possession changes) ── */}
      {showClockPrompt && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel-sm">
            <div className="p-5 pb-3">
              <h2 className="text-base font-black">What's the clock?</h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">{clockPromptReason} — for time of possession</p>
            </div>
            <div className="px-5 pb-6 space-y-3">
              <p className="text-[11px] text-neutral-600">Type digits only — <span className="text-neutral-300 font-bold">534</span> → 5:34 · <span className="text-neutral-300 font-bold">45</span> → 0:45</p>
              <input
                autoFocus
                type="text" inputMode="numeric" maxLength={4}
                placeholder="e.g. 534 or 45"
                value={clockRawInput}
                onChange={e => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setClockRawInput(raw);
                  const parsed = parseClockInput(raw);
                  if (parsed) { setClockMins(parsed.mins); setClockSecs(parsed.secs); }
                }}
                className="input text-center text-3xl font-black tracking-widest tabular-nums py-4"
              />
              <div className="text-center text-4xl font-black tabular-nums text-dragon-primary">
                {String(clockMins).padStart(2, "0")}:{String(clockSecs).padStart(2, "0")}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setClockRawInput(""); setShowClockPrompt(false); }}
                  className="btn-ghost flex-1 py-3 font-bold text-neutral-500"
                >
                  Skip
                </button>
                <button
                  onClick={() => { setClock(clockMins * 60 + clockSecs); setClockRawInput(""); setShowClockPrompt(false); }}
                  className="btn-primary flex-1 py-3 font-black"
                >
                  Set {clockMins}:{String(clockSecs).padStart(2, "0")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Situation Adjuster (post-penalty) ── */}
      {showSituationAdj && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel">
            <div className="flex items-center justify-between p-5 pb-3">
              <div>
                <h2 className="text-base font-black">Adjust Situation</h2>
                <p className="text-[11px] text-orange-400 font-bold mt-0.5">🚩 Penalty enforcement — confirm or override</p>
              </div>
            </div>
            <div className="px-5 pb-6 space-y-4">
              {/* Ball On */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label">Ball On</label>
                  <span className="text-xs font-bold text-neutral-300">{yardLabel(adjBallOn)}</span>
                </div>
                <div className="flex gap-1.5">
                  {[-10, -5, -1, +1, +5, +10].map(n => (
                    <button key={n} onClick={() => setAdjBallOn(b => Math.min(99, Math.max(1, b + n)))}
                      className="flex-1 py-2 rounded-lg text-xs font-bold bg-surface-bg text-neutral-400 active:bg-surface-hover border border-surface-border">
                      {n > 0 ? `+${n}` : n}
                    </button>
                  ))}
                </div>
              </div>
              {/* Down */}
              <div>
                <label className="label block mb-1.5">Down</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(d => (
                    <button key={d} onClick={() => setAdjDown(d)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                        adjDown === d
                          ? "border-dragon-primary bg-dragon-primary/10 text-white"
                          : "border-surface-border bg-surface-bg text-neutral-500"
                      }`}>{d}</button>
                  ))}
                </div>
              </div>
              {/* Distance */}
              <div>
                <label className="label block mb-1.5">Yards to Go</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setAdjDistance(d => Math.max(1, d - 1))} className="btn-ghost w-11 h-11 text-lg font-bold">−</button>
                  <div className="flex-1 text-center text-2xl font-black tabular-nums">{adjDistance}</div>
                  <button onClick={() => setAdjDistance(d => Math.min(99, d + 1))} className="btn-ghost w-11 h-11 text-lg font-bold">+</button>
                </div>
              </div>
              <button
                onClick={() => {
                  setBallOn(adjBallOn);
                  setDown(adjDown);
                  setDistance(adjDistance);
                  setShowSituationAdj(false);
                }}
                className="btn-primary w-full py-3 font-black"
              >
                Confirm · {adjDown} & {adjDistance} from {yardLabel(adjBallOn)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Play Sheet ── */}
      {editPlay && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <div>
                <h2 className="text-lg font-black">Edit Play</h2>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Q{editPlay.quarter + 1} · {editPlay.tab} · {editPlay.type}
                </p>
              </div>
              <button onClick={() => setEditPlay(null)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">

              {/* ── Ball spot + Yards (bidirectional) ── */}
              {editPlay && (
                <div className="card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-neutral-500 tracking-wider">BALL SPOT</span>
                    <span className="text-[10px] font-bold text-neutral-500">
                      started at {yardLabel(editPlay.ballOn)}
                    </span>
                  </div>
                  {/* End yard line input */}
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[-5, -1, +1, +5].map(n => (
                        <button key={n}
                          onClick={() => {
                            const newEnd = Math.min(99, Math.max(1, editEndBallOn + n));
                            setEditEndBallOn(newEnd);
                            setEditEndRawInput(String(newEnd));
                            setEditYards(newEnd - editPlay.ballOn);
                          }}
                          className="btn-ghost flex-1 h-9 text-xs font-bold">
                          {n > 0 ? `+${n}` : n}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" inputMode="numeric" min={1} max={99}
                      placeholder="yd line"
                      value={editEndRawInput}
                      onChange={e => {
                        setEditEndRawInput(e.target.value);
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 1 && v <= 99) {
                          setEditEndBallOn(v);
                          setEditYards(v - editPlay.ballOn);
                        }
                      }}
                      className="input w-20 text-center font-black text-lg"
                    />
                  </div>
                  {/* Yards result — derived, still adjustable */}
                  <div className="flex items-center gap-2 pt-1 border-t border-surface-border">
                    <span className="text-[10px] font-bold text-neutral-500 tracking-wider flex-1">YARDS GAINED</span>
                    <div className="flex items-center gap-1">
                      {[-1, +1].map(n => (
                        <button key={n}
                          onClick={() => {
                            const newYards = editYards + n;
                            setEditYards(newYards);
                            setEditEndBallOn(editPlay.ballOn + newYards);
                            setEditEndRawInput(String(editPlay.ballOn + newYards));
                          }}
                          className="btn-ghost w-8 h-8 text-sm font-bold">
                          {n > 0 ? "+1" : "−1"}
                        </button>
                      ))}
                      <div className={`w-12 text-center text-xl font-black tabular-nums ${
                        editYards > 0 ? "text-emerald-400" : editYards < 0 ? "text-red-400" : "text-neutral-400"
                      }`}>
                        {editYards > 0 ? `+${editYards}` : editYards}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TD ── */}
              <button onClick={() => setEditIsTD(t => !t)}
                className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-colors ${
                  editIsTD
                    ? "border-amber-500 bg-amber-500/20 text-amber-400"
                    : "border-surface-border bg-surface-bg text-neutral-500"
                }`}>
                🏈 Touchdown
              </button>

              {/* ── Penalty ── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label">Penalty</label>
                  {editPenalty && (
                    <button onClick={() => { setEditPenalty(""); setShowEditPenaltyPicker(false); }}
                      className="text-[10px] font-bold text-red-400">
                      Clear
                    </button>
                  )}
                </div>

                {/* Selected penalty chip or picker toggle */}
                <button
                  onClick={() => setShowEditPenaltyPicker(v => !v)}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold border-2 text-left px-3 transition-colors ${
                    editPenalty
                      ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                      : "border-surface-border bg-surface-bg text-neutral-500"
                  }`}>
                  {editPenalty || "Select penalty…"}
                  <span className="float-right text-neutral-600">{showEditPenaltyPicker ? "▲" : "▼"}</span>
                </button>

                {showEditPenaltyPicker && (
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {PENALTIES.map(p => (
                      <button key={p}
                        onClick={() => {
                          const isDeselect = editPenalty === p;
                          setEditPenalty(isDeselect ? "" : p);
                          if (!isDeselect) {
                            const defYds = PENALTY_DEFAULT_YARDS[p] ?? 5;
                            setEditPenaltyYards(defYds);
                            setEditYards(-defYds);
                            if (editPlay) {
                              setEditEndBallOn(editPlay.ballOn - defYds);
                              setEditEndRawInput(String(editPlay.ballOn - defYds));
                            }
                          }
                          setShowEditPenaltyPicker(false);
                        }}
                        className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                          editPenalty === p
                            ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                            : "bg-surface-bg text-neutral-400 border border-transparent active:bg-surface-hover"
                        }`}>{p}</button>
                    ))}
                  </div>
                )}

                {editPenalty && (
                  <div className="flex gap-2 mt-2">
                    {[5, 10, 15].map(n => (
                      <button key={n}
                        onClick={() => {
                          setEditPenaltyYards(n);
                          setEditYards(-n);
                          if (editPlay) {
                            setEditEndBallOn(editPlay.ballOn - n);
                            setEditEndRawInput(String(editPlay.ballOn - n));
                          }
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                          editPenaltyYards === n
                            ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                            : "bg-surface-bg text-neutral-400 border border-transparent"
                        }`}>{n} yds</button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleSaveEdit} className="btn-primary w-full py-3 font-black">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
