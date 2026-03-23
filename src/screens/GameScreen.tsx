import { useState, useEffect, useCallback, useMemo } from "react";
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
} from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  insertPlay,
  deletePlay,
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
    { id: "rush", label: "Rush", icon: <Play className="w-4 h-4" />, roles: ["carrier"] },
    { id: "pass_comp", label: "Complete", icon: <Target className="w-4 h-4" />, roles: ["passer", "receiver"] },
    { id: "pass_inc", label: "Incomplete", icon: <X className="w-4 h-4" />, roles: ["passer", "receiver"] },
    { id: "sack", label: "Sack", icon: <Shield className="w-4 h-4" />, roles: ["passer"] },
    { id: "fumble", label: "Fumble", icon: <RefreshCw className="w-4 h-4" />, roles: ["fumbler"] },
    { id: "kneel", label: "Kneel", icon: <ChevronDown className="w-4 h-4" />, roles: ["passer"] },
  ],
  defense: [
    { id: "tackle", label: "Tackle", icon: <Shield className="w-4 h-4" />, roles: ["tackler", "assist"] },
    { id: "tfl", label: "TFL", icon: <ChevronDown className="w-4 h-4" />, roles: ["tackler"] },
    { id: "int", label: "INT", icon: <RotateCcw className="w-4 h-4" />, roles: ["interceptor"] },
    { id: "fum_rec", label: "Fum Rec", icon: <CircleDot className="w-4 h-4" />, roles: ["recoverer"] },
    { id: "pbu", label: "PBU", icon: <X className="w-4 h-4" />, roles: ["defender"] },
    { id: "hurry", label: "Hurry", icon: <Zap className="w-4 h-4" />, roles: ["rusher"] },
  ],
  special: [
    { id: "kickoff", label: "Kickoff", icon: <Zap className="w-4 h-4" />, roles: ["kicker", "returner"] },
    { id: "punt", label: "Punt", icon: <ChevronUp className="w-4 h-4" />, roles: ["punter", "returner"] },
    { id: "fg", label: "FG", icon: <Trophy className="w-4 h-4" />, roles: ["kicker", "holder"] },
    { id: "pat", label: "PAT", icon: <Check className="w-4 h-4" />, roles: ["kicker"] },
    { id: "two_pt", label: "2PT", icon: <Target className="w-4 h-4" />, roles: ["passer", "receiver"] },
  ],
};

const PENALTIES = [
  "Offsides", "False Start", "Holding-OFF", "Holding-DEF",
  "PI-OFF", "PI-DEF", "Facemask", "Unsportsmanlike",
  "Delay of Game", "Illegal Formation", "Block in Back",
  "Clipping", "Encroachment", "Illegal Shift", "Illegal Motion",
];

const QUARTER_LABELS = ["1st", "2nd", "3rd", "4th", "OT"];
const NFHS_QUARTER_SECS = 720;

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

function yardLabel(yard: number) {
  if (yard === 50) return "50";
  return yard > 50 ? `OPP ${100 - yard}` : `OWN ${yard}`;
}

function fmtClock(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildDesc(pt: PlayTypeDef, tagged: TaggedPlayer[], yards: number, scored: boolean, pen: string | null): string {
  const parts: string[] = [];
  const byRole = (r: string) => tagged.find(t => t.role === r);

  switch (pt.id) {
    case "rush": {
      const c = byRole("carrier");
      parts.push(`#${c?.jersey_number ?? "?"} rush ${yards > 0 ? "+" : ""}${yards}`);
      break;
    }
    case "pass_comp": {
      const p = byRole("passer"), r = byRole("receiver");
      parts.push(`#${p?.jersey_number ?? "?"} → #${r?.jersey_number ?? "?"} ${yards > 0 ? "+" : ""}${yards}`);
      break;
    }
    case "pass_inc": {
      const p = byRole("passer"), r = byRole("receiver");
      parts.push(`#${p?.jersey_number ?? "?"} → #${r?.jersey_number ?? "?"} inc`);
      break;
    }
    case "sack": {
      const p = byRole("passer");
      parts.push(`#${p?.jersey_number ?? "?"} sacked ${yards}`);
      break;
    }
    case "fumble": parts.push("Fumble"); break;
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
  const [isTD, setIsTD] = useState(false);
  const [isFirstDown, setIsFirstDown] = useState(false);
  const [penalty, setPenalty] = useState("");
  const [flagYards, setFlagYards] = useState(5);
  const [showPenaltySheet, setShowPenaltySheet] = useState(false);

  /* ── Player tagging ── */
  const [tagged, setTagged] = useState<TaggedPlayer[]>([]);
  const [activeRole, setActiveRole] = useState("");
  const [playerFilter, setPlayerFilter] = useState("");
  const roles = playType?.roles ?? [];

  useEffect(() => {
    if (roles.length > 0) setActiveRole(roles[0]);
    else setActiveRole("");
  }, [playType]);

  /* ── Play log ── */
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showScoreAdj, setShowScoreAdj] = useState(false);

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
    plays.forEach(p => {
      if (p.type === "rush") { rushAtt++; rushYds += p.yards; }
      if (p.type === "pass_comp") { passAtt++; passComp++; passYds += p.yards; }
      if (p.type === "pass_inc") { passAtt++; }
      if (p.firstDown) firstDowns++;
      if (p.turnover) tos++;
      if (p.penalty) pens++;
    });
    return { rushAtt, rushYds, passAtt, passComp, passYds, firstDowns, tos, pens };
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
    const idx = roles.indexOf(activeRole);
    if (idx < roles.length - 1) setActiveRole(roles[idx + 1]);
    setPlayerFilter("");
  };

  const handleRemoveTag = (playerId: string) => {
    setTagged(prev => prev.filter(t => t.id !== playerId));
  };

  const resetPlayEntry = () => {
    setPlayType(null);
    setYards(0);
    setIsTD(false);
    setIsFirstDown(false);
    setPenalty("");
    setFlagYards(5);
    setTagged([]);
    setActiveRole("");
    setPlayerFilter("");
  };

  const handleSubmit = async () => {
    if (!playType || !gameId || !season) return;

    const playYards = playType.id === "pass_inc" ? 0 : yards;
    const newBallOn = Math.min(100, Math.max(0, ballOn + playYards));
    const earnedFirst = isFirstDown || (playYards >= distance && down <= 4);
    const scored = isTD || newBallOn >= 100;

    // ── Build Supabase insert ──
    const result = playType.id === "pass_comp" ? "Complete"
                 : playType.id === "pass_inc" ? "Incomplete"
                 : null;
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
        result,
        is_first_down: earnedFirst,
        penalty_type: penalty || null,
        penalty_yards: penalty ? flagYards : 0,
      },
      yards_gained: playYards,
      is_touchdown: scored,
      is_turnover: ["int", "fum_rec"].includes(playType.id),
      is_penalty: !!penalty,
      primary_player_id: tagged[0]?.player_id ?? null,
      description: buildDesc(playType, tagged, playYards, scored, penalty || null),
    };

    const playerInserts = tagged.map(t => ({
      player_id: t.player_id,
      role: t.role,
    }));

    // ── Write to Supabase ──
    const savedPlay = await insertPlay(playInsert, playerInserts);

    if (!savedPlay) {
      console.error("Play failed to save");
      return;
    }

    // ── Update local state ──
    const localPlay: PlayRecord = {
      id: savedPlay.id,
      quarter,
      clock,
      type: playType.id,
      tab: activeTab,
      yards: playYards,
      result: result ?? "",
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
    };

    setPlays(prev => [...prev, localPlay]);

    // ── Auto-advance game state ──
    let nextOurScore = ourScore;
    let nextTheirScore = theirScore;

    if (scored) {
      if (possession === "us") { nextOurScore += 6; setOurScore(nextOurScore); }
      else { nextTheirScore += 6; setTheirScore(nextTheirScore); }
      setBallOn(97);
      setDown(1);
      setDistance(3);
      setActiveTab("special");
    } else if (earnedFirst) {
      setBallOn(newBallOn);
      setDown(1);
      setDistance(Math.min(10, 100 - newBallOn));
    } else if (down >= 4) {
      setBallOn(100 - newBallOn);
      setDown(1);
      setDistance(10);
      setPossession(p => p === "us" ? "them" : "us");
    } else {
      setBallOn(newBallOn);
      setDown(d => d + 1);
      setDistance(d => d - playYards);
    }

    // ── Sync score ──
    if (scored) {
      await updateGameScore(gameId, nextOurScore, nextTheirScore);
    }

    resetPlayEntry();
  };

  const handleUndo = async () => {
    if (plays.length === 0) return;
    const last = plays[plays.length - 1];

    const deleted = await deletePlay(last.id);
    if (!deleted) {
      console.error("Failed to undo play");
      return;
    }

    setPlays(prev => prev.slice(0, -1));
    setBallOn(last.ballOn);
    setDown(last.down);
    setDistance(last.distance);

    if (last.isTouchdown && gameId) {
      let nextOur = ourScore;
      let nextTheir = theirScore;
      if (possession === "us") { nextOur = Math.max(0, ourScore - 6); setOurScore(nextOur); }
      else { nextTheir = Math.max(0, theirScore - 6); setTheirScore(nextTheir); }
      await updateGameScore(gameId, nextOur, nextTheir);
    }
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
    <div className="screen safe-top safe-bottom">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-black flex-1 truncate">vs {oppName}</h1>
        <button onClick={() => setShowLog(true)} className="btn-ghost px-2 py-1 text-xs font-bold text-neutral-400">
          {plays.length} plays
        </button>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-4 space-y-3">

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
              <div className="text-xl font-black tabular-nums text-amber-400">{fmtClock(clock)}</div>
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
            <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-surface-border">
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

        {/* ── Quick Stats ── */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: "RUSH", val: `${stats.rushAtt}/${stats.rushYds}` },
            { label: "PASS", val: `${stats.passComp}-${stats.passAtt}/${stats.passYds}` },
            { label: "1ST", val: stats.firstDowns },
            { label: "TO", val: stats.tos },
            { label: "PEN", val: stats.pens },
          ].map(s => (
            <div key={s.label} className="card p-1.5 text-center">
              <div className="text-[8px] font-bold text-neutral-600 tracking-wider">{s.label}</div>
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
              <label className="label block mb-1.5">Yards</label>
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

            <button onClick={() => setShowPenaltySheet(true)}
              className={`w-full py-2 rounded-xl text-xs font-bold border transition-colors ${
                penalty ? "border-orange-500/50 bg-orange-500/10 text-orange-400" : "border-surface-border bg-surface-bg text-neutral-500"
              }`}
            >
              <Flag className="w-3 h-3 inline mr-1" />
              {penalty ? `${penalty} · ${flagYards} yds` : "Add Penalty"}
            </button>

            {/* Tag Players */}
            <div>
              <label className="label block mb-1.5">Tag Players</label>

              {roles.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {roles.map(role => {
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

            <button onClick={handleSubmit} disabled={!playType}
              className="btn-primary w-full text-sm font-black py-3"
            >
              ✓ Record Play
            </button>
          </div>
        )}

        {/* ── Last Play ── */}
        {plays.length > 0 && (
          <div className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-neutral-600 tracking-wider">LAST PLAY</span>
              <button onClick={handleUndo} className="text-[10px] font-bold text-red-400 active:text-red-300">
                <RotateCcw className="w-3 h-3 inline mr-0.5" />UNDO
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-neutral-500">
                {plays[plays.length - 1].down}&{plays[plays.length - 1].distance}
              </span>
              <span className={`text-sm font-bold ${
                plays[plays.length - 1].yards > 0 ? "text-emerald-400" : plays[plays.length - 1].yards < 0 ? "text-red-400" : "text-neutral-400"
              }`}>
                {plays[plays.length - 1].yards > 0 ? "+" : ""}{plays[plays.length - 1].yards} yd
              </span>
              <span className="text-sm text-neutral-300 truncate flex-1">{plays[plays.length - 1].description}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Play Log Sheet ── */}
      {showLog && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
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
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="w-full max-w-app bg-surface-card rounded-t-2xl border border-surface-border max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h2 className="text-lg font-black">Penalty</h2>
              <button onClick={() => setShowPenaltySheet(false)} className="btn-ghost p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {PENALTIES.map(p => (
                  <button key={p} onClick={() => setPenalty(p)}
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
    </div>
  );
}
