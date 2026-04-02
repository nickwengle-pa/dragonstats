import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  insertPlay,
  deletePlay,
  updatePlayFull,
  loadGamePlays,
  updateGameScore,
  deriveGameState,
  type PlayInsert,
} from "@/services/gameService";
import { opponentPlayerService, type OpponentPlayer } from "@/services/opponentService";

// Game components
import Scoreboard from "@/components/game/Scoreboard";
import FieldVisualizer from "@/components/game/FieldVisualizer";
import QuickActions from "@/components/game/QuickActions";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import PlayEditModal, { type PlayEditResult } from "@/components/game/PlayEditModal";
import PlayLog from "@/components/game/PlayLog";
import {
  type RosterPlayer,
  type OpponentPlayerRef,
  type PlayRecord,
  type PlayTypeDef,
  type GameState,
  findPlayTypeDef,
  NFHS_QUARTER_SECS,
  QUARTER_LABELS,
  OFFENSE_PENALTIES,
  fmtClock,
  yardLabel,
} from "@/components/game/types";

/* ═══════════════════════════════════════════════
   GAME SCREEN — Main Wrapper
   ═══════════════════════════════════════════════ */

export default function GameScreen() {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const { program, season } = useProgramContext();

  /* ── Data loading ── */
  const [game, setGame] = useState<any>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [oppPlayers, setOppPlayers] = useState<OpponentPlayerRef[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!season || !gameId) return;
    setLoading(true);

    const [gameRes, rosterRes, existingPlays] = await Promise.all([
      supabase.from("games").select("*, opponent:opponents(*)").eq("id", gameId).single(),
      supabase.from("season_rosters").select("*, player:players(*)").eq("season_id", season.id).eq("is_active", true).order("jersey_number", { ascending: true, nullsFirst: false }),
      loadGamePlays(gameId),
    ]);

    setGame(gameRes.data);
    setRoster(rosterRes.data ?? []);

    // Load opponent players
    if (gameRes.data?.opponent_id) {
      const opp = await opponentPlayerService.getByOpponent(gameRes.data.opponent_id);
      setOppPlayers(opp);
    }

    // Convert DB plays to local PlayRecord format
    const localPlays: PlayRecord[] = existingPlays.map(p => {
      const pd = (p.play_data ?? {}) as Record<string, any>;
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
        yards: p.yards_gained,
        result: pd.result ?? "",
        penalty: pd.penalty_type ?? null,
        flagYards: pd.penalty_yards ?? 0,
        isTouchdown: p.is_touchdown,
        firstDown: pd.is_first_down ?? false,
        turnover: p.is_turnover,
        tagged: p.play_players.map((pp: any) => ({
          id: pp.player_id,
          player_id: pp.player_id,
          jersey_number: null,
          name: pp.player ? `${pp.player.first_name} ${pp.player.last_name}` : "?",
          role: pp.role,
          credit: pp.credit ?? undefined,
        })),
        ballOn: p.yard_line,
        down: p.down,
        distance: p.distance,
        description: p.description,
        possession: p.possession,
        offensiveFormation: (p as any).offensive_formation ?? null,
        defensiveFormation: (p as any).defensive_formation ?? null,
        hashMark: (p as any).hash_mark ?? null,
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
  const [down, setDown] = useState(1);
  const [distance, setDistance] = useState(10);
  const [ballOn, setBallOn] = useState(25);

  /* ── Plays ── */
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const isSubmitting = useRef(false);

  /* ── Modal state ── */
  const [selectedPlayType, setSelectedPlayType] = useState<PlayTypeDef | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [editPlay, setEditPlay] = useState<PlayRecord | null>(null);
  const [showPatGate, setShowPatGate] = useState(false);
  const [patGatePossession, setPatGatePossession] = useState<"us" | "them">("us");
  const [savingPat, setSavingPat] = useState(false);
  const [showClockEditor, setShowClockEditor] = useState(false);
  const [clockMins, setClockMins] = useState(12);
  const [clockSecs, setClockSecs] = useState(0);
  const [showEndGame, setShowEndGame] = useState(false);
  const [showSituationAdj, setShowSituationAdj] = useState(false);
  const [adjBallOn, setAdjBallOn] = useState(25);
  const [adjDown, setAdjDown] = useState(1);
  const [adjDistance, setAdjDistance] = useState(10);

  /* ── Derived state ── */
  const gameState: GameState = { quarter, clock, possession, ourScore, theirScore, down, distance, ballOn };
  const firstDownMarker = useMemo(() => Math.min(ballOn + distance, 100), [ballOn, distance]);

  /* ── Quick stats ── */
  const stats = useMemo(() => {
    let rushAtt = 0, rushYds = 0, passAtt = 0, passComp = 0, passYds = 0, firstDowns = 0, tos = 0, pens = 0;
    plays.forEach(p => {
      if (p.possession === "us") {
        if (p.type === "rush") { rushAtt++; rushYds += p.yards; }
        if (p.type === "pass_comp") { passAtt++; passComp++; passYds += p.yards; }
        if (p.type === "pass_inc") passAtt++;
        if (p.firstDown) firstDowns++;
        if (p.turnover) tos++;
      }
      if (p.penalty) pens++;
    });
    return { rushAtt, rushYds, passAtt, passComp, passYds, firstDowns, tos, pens };
  }, [plays]);

  /* ── Handle play type selection from quick actions ── */
  const handlePlayTypeSelect = (pt: PlayTypeDef) => {
    setSelectedPlayType(pt);
  };

  /* ── Handle play submission from modal ── */
  const handlePlaySubmit = async (data: PlaySubmitData) => {
    if (!gameId || !season || isSubmitting.current) return;
    isSubmitting.current = true;

    const playInsert: PlayInsert = {
      game_id: gameId,
      quarter,
      clock: fmtClock(clock),
      possession,
      down,
      distance,
      yard_line: ballOn,
      play_type: data.playType.id,
      play_data: {
        season_id: season.id,
        result: data.result || null,
        is_first_down: data.isFirstDown,
        penalty_type: data.penalty,
        penalty_yards: data.flagYards,
      },
      yards_gained: data.yards,
      is_touchdown: data.isTouchdown,
      is_turnover: ["int", "fumble"].includes(data.playType.id),
      is_penalty: !!data.penalty,
      primary_player_id: data.tagged[0]?.player_id ?? null,
      description: data.description,
      // Extended fields
      offensive_formation: data.offensiveFormation,
      defensive_formation: data.defensiveFormation,
      hash_mark: data.hashMark,
    };

    const playerInserts = data.tagged.map(t => ({
      player_id: t.player_id,
      role: t.role,
      credit: t.credit ?? null,
    }));

    const savedPlay = await insertPlay(playInsert, playerInserts);
    if (!savedPlay) { isSubmitting.current = false; return; }

    // Add to local play log
    const localPlay: PlayRecord = {
      id: savedPlay.id,
      quarter, clock, type: data.playType.id, yards: data.yards,
      result: data.result, penalty: data.penalty,
      flagYards: data.flagYards, isTouchdown: data.isTouchdown,
      firstDown: data.isFirstDown, turnover: playInsert.is_turnover,
      tagged: data.tagged, ballOn, down, distance,
      description: data.description, possession,
      offensiveFormation: data.offensiveFormation,
      defensiveFormation: data.defensiveFormation,
      hashMark: data.hashMark,
    };
    setPlays(prev => [...prev, localPlay]);

    // Mark game live on first play
    if (plays.length === 0) await updateGameScore(gameId, ourScore, theirScore, "live");

    // ── Scoring ──
    let nextOur = ourScore, nextTheir = theirScore;
    if (data.isTouchdown) { if (possession === "us") nextOur += 6; else nextTheir += 6; }
    if (data.playType.id === "pat" && data.result === "Good") { if (possession === "us") nextOur += 1; else nextTheir += 1; }
    if (data.playType.id === "fg" && data.result === "Good") { if (possession === "us") nextOur += 3; else nextTheir += 3; }
    if (data.playType.id === "two_pt" && data.result === "Good") { if (possession === "us") nextOur += 2; else nextTheir += 2; }
    if (data.playType.id === "safety") { if (possession === "us") nextTheir += 2; else nextOur += 2; }

    if (nextOur !== ourScore || nextTheir !== theirScore) {
      setOurScore(nextOur); setTheirScore(nextTheir);
      await updateGameScore(gameId, nextOur, nextTheir);
    }

    // ── Game state advance ──
    const newBallOn = Math.min(100, Math.max(0, ballOn + data.yards));
    const earnedFirst = data.isFirstDown;

    if (data.penalty && OFFENSE_PENALTIES.has(data.penalty)) {
      const sugBall = Math.max(1, ballOn - data.flagYards);
      setAdjBallOn(sugBall); setAdjDown(down); setAdjDistance(Math.min(99, distance + data.flagYards));
      setShowSituationAdj(true);
    } else if (data.penalty) {
      const sugBall = Math.min(98, ballOn + data.flagYards);
      setAdjBallOn(sugBall); setAdjDown(1); setAdjDistance(Math.min(10, 100 - sugBall));
      setShowSituationAdj(true);
    } else if (data.isTouchdown) {
      setPatGatePossession(possession);
      setShowPatGate(true);
    } else if (["pat", "two_pt"].includes(data.playType.id)) {
      setBallOn(35); setDown(1); setDistance(10);
    } else if (data.playType.id === "fg") {
      if (data.result === "Good") { setBallOn(35); setDown(1); setDistance(10); }
      else { setBallOn(Math.max(20, 100 - ballOn)); setDown(1); setDistance(10); setPossession(p => p === "us" ? "them" : "us"); }
    } else if (data.playType.id === "safety") {
      // Free kick
    } else if (["kickoff", "punt"].includes(data.playType.id)) {
      if (data.isTouchback) { setBallOn(20); } else { setBallOn(Math.max(1, newBallOn)); }
      setDown(1); setDistance(10); setPossession(p => p === "us" ? "them" : "us");
    } else if (data.playType.id === "int") {
      setBallOn(Math.max(1, 100 - Math.max(1, newBallOn))); setDown(1); setDistance(10);
      setPossession(p => p === "us" ? "them" : "us");
    } else if (data.playType.id === "fumble") {
      setBallOn(Math.max(1, 100 - Math.max(1, newBallOn))); setDown(1); setDistance(10);
      setPossession(p => p === "us" ? "them" : "us");
    } else if (earnedFirst) {
      setBallOn(newBallOn); setDown(1); setDistance(Math.min(10, 100 - newBallOn));
    } else if (down >= 4) {
      setBallOn(100 - newBallOn); setDown(1); setDistance(10);
      setPossession(p => p === "us" ? "them" : "us");
    } else {
      setBallOn(newBallOn); setDown(d => d + 1); setDistance(d => d - data.yards);
    }

    setSelectedPlayType(null);
    isSubmitting.current = false;
  };

  /* ── Undo ── */
  const handleUndo = async () => {
    if (plays.length === 0 || !gameId) return;
    const last = plays[plays.length - 1];
    const deleted = await deletePlay(last.id);
    if (!deleted) return;

    setPlays(prev => prev.slice(0, -1));
    setBallOn(last.ballOn); setDown(last.down); setDistance(last.distance);

    let nextOur = ourScore, nextTheir = theirScore;
    if (last.isTouchdown) { if (last.possession === "us") nextOur -= 6; else nextTheir -= 6; }
    if (last.type === "pat" && last.result === "Good") { if (last.possession === "us") nextOur -= 1; else nextTheir -= 1; }
    if (last.type === "fg" && last.result === "Good") { if (last.possession === "us") nextOur -= 3; else nextTheir -= 3; }
    if (last.type === "two_pt" && last.result === "Good") { if (last.possession === "us") nextOur -= 2; else nextTheir -= 2; }
    if (last.type === "safety") { if (last.possession === "us") nextTheir -= 2; else nextOur -= 2; }

    nextOur = Math.max(0, nextOur); nextTheir = Math.max(0, nextTheir);
    if (nextOur !== ourScore || nextTheir !== theirScore) {
      setOurScore(nextOur); setTheirScore(nextTheir);
      await updateGameScore(gameId, nextOur, nextTheir);
    }
  };

  /* ── Edit play (full) ── */
  const handleSaveEdit = async (playId: string, result: PlayEditResult) => {
    const idx = plays.findIndex(p => p.id === playId);
    if (idx === -1) return;
    const original = plays[idx];

    // Persist to DB
    const ok = await updatePlayFull(playId, {
      play_type: result.playType.id,
      yards_gained: result.yards,
      is_touchdown: result.isTouchdown,
      is_turnover: ["int", "fumble"].includes(result.playType.id),
      is_penalty: !!result.penalty,
      primary_player_id: result.tagged[0]?.player_id ?? null,
      description: result.description,
      offensive_formation: result.offensiveFormation,
      defensive_formation: result.defensiveFormation,
      hash_mark: result.hashMark,
      play_data: {
        result: result.result || null,
        is_first_down: result.isFirstDown,
        penalty_type: result.penalty,
        penalty_yards: result.flagYards,
      },
    }, result.tagged.map(t => ({
      player_id: t.player_id,
      role: t.role,
      credit: t.credit ?? null,
    })));
    if (!ok) return;

    // Update local play record
    const updatedPlay: PlayRecord = {
      ...original,
      type: result.playType.id,
      yards: result.yards,
      isTouchdown: result.isTouchdown,
      firstDown: result.isFirstDown,
      turnover: ["int", "fumble"].includes(result.playType.id),
      result: result.result,
      penalty: result.penalty,
      flagYards: result.flagYards,
      tagged: result.tagged,
      description: result.description,
      offensiveFormation: result.offensiveFormation,
      defensiveFormation: result.defensiveFormation,
      hashMark: result.hashMark,
    };

    // Cascade: recalculate down/distance/ballOn for this play and all subsequent plays
    const newPlays = [...plays];
    newPlays[idx] = updatedPlay;
    cascadeGameState(newPlays, idx);

    setPlays(newPlays);
    setEditPlay(null);

    // Recalculate score from scratch
    recalcScoreAndState(newPlays);
  };

  /* ── Delete play from edit modal ── */
  const handleDeletePlay = async (playId: string) => {
    const idx = plays.findIndex(p => p.id === playId);
    if (idx === -1) return;
    const deleted = await deletePlay(playId);
    if (!deleted) return;

    const newPlays = plays.filter(p => p.id !== playId);
    // Re-cascade from the deleted play's position onward
    if (idx < newPlays.length) {
      cascadeGameState(newPlays, idx);
    }
    setPlays(newPlays);
    setEditPlay(null);
    recalcScoreAndState(newPlays);
  };

  /* ── Cascade helper: recalculate down/distance/ballOn from startIdx onward ── */
  const cascadeGameState = (allPlays: PlayRecord[], startIdx: number) => {
    for (let i = startIdx; i < allPlays.length; i++) {
      const prev = i > 0 ? allPlays[i - 1] : null;
      const play = allPlays[i];

      // Determine ball position before this play
      let prevBallOn = 25, prevDown = 1, prevDist = 10, prevPoss: "us" | "them" = "us";
      if (prev) {
        // Compute where the previous play left things
        const after = advanceState(prev, {
          ballOn: prev.ballOn, down: prev.down, distance: prev.distance, possession: prev.possession,
        });
        prevBallOn = after.ballOn;
        prevDown = after.down;
        prevDist = after.distance;
        prevPoss = after.possession;
      }

      play.ballOn = prevBallOn;
      play.down = prevDown;
      play.distance = prevDist;
      play.possession = prevPoss;

      // Persist updated situation to DB (fire-and-forget)
      updatePlayFull(play.id, {
        yard_line: prevBallOn,
        down: prevDown,
        distance: prevDist,
        possession: prevPoss,
      }, play.tagged.map(t => ({ player_id: t.player_id, role: t.role, credit: t.credit ?? null })));
    }
  };

  /* ── Compute resulting state after a play ── */
  const advanceState = (play: PlayRecord, before: { ballOn: number; down: number; distance: number; possession: "us" | "them" }) => {
    const { ballOn, down, distance, possession } = before;
    const newBallOn = Math.min(100, Math.max(0, ballOn + play.yards));

    // Turnovers
    if (["int", "fumble"].includes(play.type)) {
      return { ballOn: Math.max(1, 100 - Math.max(1, newBallOn)), down: 1, distance: 10, possession: possession === "us" ? "them" as const : "us" as const };
    }
    // Kickoff / punt
    if (["kickoff", "punt"].includes(play.type)) {
      const kb = play.yards === 0 ? 20 : Math.max(1, newBallOn); // touchback if 0 yards
      return { ballOn: kb, down: 1, distance: 10, possession: possession === "us" ? "them" as const : "us" as const };
    }
    // TD — next play starts at PAT spot
    if (play.isTouchdown) {
      return { ballOn: 97, down: 1, distance: 3, possession };
    }
    // PAT/2PT/FG good — kickoff
    if (["pat", "two_pt"].includes(play.type)) {
      return { ballOn: 35, down: 1, distance: 10, possession };
    }
    if (play.type === "fg") {
      if (play.result === "Good") return { ballOn: 35, down: 1, distance: 10, possession };
      return { ballOn: Math.max(20, 100 - ballOn), down: 1, distance: 10, possession: possession === "us" ? "them" as const : "us" as const };
    }
    // Penalty
    if (play.penalty && OFFENSE_PENALTIES.has(play.penalty)) {
      return { ballOn: Math.max(1, ballOn - play.flagYards), down, distance: Math.min(99, distance + play.flagYards), possession };
    }
    if (play.penalty) {
      const sugBall = Math.min(98, ballOn + play.flagYards);
      return { ballOn: sugBall, down: 1, distance: Math.min(10, 100 - sugBall), possession };
    }
    // First down
    if (play.firstDown) {
      return { ballOn: newBallOn, down: 1, distance: Math.min(10, 100 - newBallOn), possession };
    }
    // Turnover on downs
    if (down >= 4) {
      return { ballOn: 100 - newBallOn, down: 1, distance: 10, possession: possession === "us" ? "them" as const : "us" as const };
    }
    // Normal advance
    return { ballOn: newBallOn, down: down + 1, distance: distance - play.yards, possession };
  };

  /* ── Recalculate score and current state from all plays ── */
  const recalcScoreAndState = async (allPlays: PlayRecord[]) => {
    let us = 0, them = 0;
    allPlays.forEach(p => {
      const poss = p.possession;
      if (p.isTouchdown) { if (poss === "us") us += 6; else them += 6; }
      if (p.type === "pat" && p.result === "Good") { if (poss === "us") us += 1; else them += 1; }
      if (p.type === "fg" && p.result === "Good") { if (poss === "us") us += 3; else them += 3; }
      if (p.type === "two_pt" && p.result === "Good") { if (poss === "us") us += 2; else them += 2; }
      if (p.type === "safety") { if (poss === "us") them += 2; else us += 2; }
    });
    setOurScore(us);
    setTheirScore(them);

    // Set current game state from last play
    if (allPlays.length > 0) {
      const last = allPlays[allPlays.length - 1];
      const after = advanceState(last, { ballOn: last.ballOn, down: last.down, distance: last.distance, possession: last.possession });
      setBallOn(after.ballOn);
      setDown(after.down);
      setDistance(after.distance);
      setPossession(after.possession);
    } else {
      setBallOn(25); setDown(1); setDistance(10); setPossession("us");
    }

    if (gameId) await updateGameScore(gameId, us, them);
  };

  /* ── PAT gate ── */
  const handlePatGate = async (result: "good_kick" | "no_good_kick" | "good_two" | "no_good_two" | "skip") => {
    setSavingPat(true);
    const isTwoPoint = result.startsWith("good_two") || result.startsWith("no_good_two");
    const isGood = result.startsWith("good");

    if (result !== "skip" && gameId && season) {
      const patType = isTwoPoint ? "two_pt" : "pat";
      const pts = isTwoPoint && isGood ? 2 : (!isTwoPoint && isGood ? 1 : 0);

      const patInsert: PlayInsert = {
        game_id: gameId, quarter, clock: fmtClock(clock), possession: patGatePossession,
        down: 1, distance: 3, yard_line: 97, play_type: patType,
        play_data: { season_id: season.id, result: isGood ? "Good" : "No Good", is_first_down: false, penalty_type: null, penalty_yards: 0 },
        yards_gained: 0, is_touchdown: false, is_turnover: false, is_penalty: false,
        primary_player_id: null, description: `${isTwoPoint ? "2PT" : "PAT"} — ${isGood ? "Good" : "No Good"}`,
      };

      const saved = await insertPlay(patInsert, []);
      if (saved) {
        setPlays(prev => [...prev, {
          id: saved.id, quarter, clock, type: patType, yards: 0,
          result: isGood ? "Good" : "No Good", penalty: null, flagYards: 0,
          isTouchdown: false, firstDown: false, turnover: false, tagged: [],
          ballOn: 97, down: 1, distance: 3, description: patInsert.description,
          possession: patGatePossession,
        }]);

        if (pts > 0) {
          const nextOur = patGatePossession === "us" ? ourScore + pts : ourScore;
          const nextTheir = patGatePossession === "them" ? theirScore + pts : theirScore;
          setOurScore(nextOur); setTheirScore(nextTheir);
          await updateGameScore(gameId, nextOur, nextTheir);
        }
      }
    }

    setBallOn(35); setDown(1); setDistance(10);
    setPossession(patGatePossession);
    setShowPatGate(false);
    setSavingPat(false);
  };

  /* ── Cycle quarter ── */
  const cycleQuarter = () => {
    setQuarter(q => { const next = (q + 1) % 5; if (next < 4) setClock(NFHS_QUARTER_SECS); return next; });
  };

  /* ── End game ── */
  const handleEndGame = async () => {
    if (!gameId) return;
    await updateGameScore(gameId, ourScore, theirScore, "completed");
    navigate(`/game/${gameId}/summary`);
  };

  /* ── Render ── */

  if (loading) {
    return (
      <div className="screen safe-top safe-bottom">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="text-xl font-black flex-1">Game</h1>
        </div>
        <div className="text-neutral-500 text-sm text-center py-12 animate-pulse">Loading game...</div>
      </div>
    );
  }

  const oppName = game?.opponent?.name ?? "Opponent";
  const progName = program?.name ?? "Team";
  const primaryColor = program?.primary_color ?? "#ef4444";
  const progAbbr = program?.abbreviation ?? progName.slice(0, 3).toUpperCase();
  const oppAbbr = game?.opponent?.abbreviation ?? oppName.slice(0, 3).toUpperCase();
  const oppColor = game?.opponent?.primary_color ?? "#6b7280";
  const progLogoUrl = program?.logo_url ?? null;
  const oppLogoUrl = game?.opponent?.logo_url ?? null;

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-black flex-1 truncate">vs {oppName}</h1>
        <button onClick={() => setShowLog(true)} className="btn-ghost px-2 py-1 text-xs font-bold text-neutral-400">
          {plays.length} plays
        </button>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-4 space-y-3">
        {/* Scoreboard */}
        <Scoreboard
          state={gameState}
          progName={progName}
          oppName={oppName}
          primaryColor={primaryColor}
          progLogoUrl={progLogoUrl}
          oppLogoUrl={oppLogoUrl}
          oppColor={oppColor}
          onCycleQuarter={cycleQuarter}
          onEditClock={() => { setClockMins(Math.floor(clock / 60)); setClockSecs(clock % 60); setShowClockEditor(true); }}
          onTogglePossession={() => setPossession(p => p === "us" ? "them" : "us")}
          onEndGame={() => setShowEndGame(true)}
        />

        {/* Field */}
        <FieldVisualizer
          ballOn={ballOn}
          firstDownMarker={firstDownMarker}
          possession={possession}
          primaryColor={primaryColor}
          progAbbr={progAbbr}
          oppAbbr={oppAbbr}
          oppColor={oppColor}
        />

        {/* Down & Distance */}
        <div className="card p-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(d => (
                <button key={d} onClick={() => setDown(d)}
                  className={`w-9 h-9 rounded-lg text-xs font-black transition-colors ${
                    down === d ? "bg-amber-500 text-black" : "bg-surface-bg text-neutral-500 active:bg-surface-hover"
                  }`}>
                  {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
                </button>
              ))}
            </div>
            <span className="text-neutral-600 font-bold">&</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setDistance(d => Math.max(1, d - 1))} className="btn-ghost w-7 h-9 text-sm font-bold">-</button>
              <div className="w-8 h-9 rounded-lg bg-surface-bg flex items-center justify-center text-sm font-black text-amber-400 tabular-nums">{distance}</div>
              <button onClick={() => setDistance(d => Math.min(99, d + 1))} className="btn-ghost w-7 h-9 text-sm font-bold">+</button>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-neutral-600 mr-1">BALL</span>
              <button onClick={() => setBallOn(b => Math.max(1, b - 5))} className="btn-ghost px-1 h-9 text-[10px] font-bold text-neutral-500">-5</button>
              <button onClick={() => setBallOn(b => Math.max(1, b - 1))} className="btn-ghost w-7 h-9 text-sm font-bold">-</button>
              <div className="min-w-[52px] h-9 rounded-lg bg-surface-bg flex items-center justify-center text-xs font-black text-emerald-400 tabular-nums px-1">{yardLabel(ballOn)}</div>
              <button onClick={() => setBallOn(b => Math.min(99, b + 1))} className="btn-ghost w-7 h-9 text-sm font-bold">+</button>
              <button onClick={() => setBallOn(b => Math.min(99, b + 5))} className="btn-ghost px-1 h-9 text-[10px] font-bold text-neutral-500">+5</button>
            </div>
          </div>
        </div>

        {/* Quick stats */}
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

        {/* Quick Action Grid */}
        <div className="card p-3">
          <QuickActions onSelect={handlePlayTypeSelect} possession={possession} />
        </div>

        {/* Recent Plays */}
        {plays.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-neutral-600 tracking-wider">RECENT PLAYS</span>
              <div className="flex items-center gap-3">
                <button onClick={handleUndo} className="text-[10px] font-bold text-red-400 flex items-center gap-0.5">
                  <RotateCcw className="w-3 h-3" /> UNDO
                </button>
                <button onClick={() => setShowLog(true)} className="text-[10px] font-bold text-dragon-primary">
                  All {plays.length}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {plays.slice(-5).reverse().map(play => (
                <button key={play.id}
                  onClick={() => setEditPlay(play)}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-2 border border-surface-border bg-surface-card text-left active:bg-surface-hover"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{play.description}</div>
                    <div className="text-[10px] text-neutral-600">
                      {QUARTER_LABELS[play.quarter]} · {fmtClock(play.clock)} · {play.down}{play.down === 1 ? "st" : play.down === 2 ? "nd" : play.down === 3 ? "rd" : "th"}&{play.distance}
                    </div>
                  </div>
                  <div className={`text-xs font-black tabular-nums ${
                    play.yards > 0 ? "text-emerald-400" : play.yards < 0 ? "text-red-400" : "text-neutral-500"
                  }`}>
                    {play.yards > 0 ? `+${play.yards}` : play.yards}
                  </div>
                  {play.isTouchdown && <span className="text-[10px] font-bold text-amber-400">TD</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigate to summary */}
        {plays.length > 0 && (
          <button onClick={() => navigate(`/game/${gameId}/summary`)}
            className="w-full text-center py-2 text-xs font-bold text-dragon-primary">
            View Game Summary
          </button>
        )}
      </div>

      {/* ── MODALS ── */}

      {/* Play Entry Modal */}
      {selectedPlayType && (
        <PlayEntryModal
          playType={selectedPlayType}
          gameState={gameState}
          roster={roster}
          opponentPlayers={oppPlayers}
          onSubmit={handlePlaySubmit}
          onClose={() => setSelectedPlayType(null)}
        />
      )}

      {/* Play Log */}
      {showLog && (
        <PlayLog
          plays={plays}
          onEdit={p => { setShowLog(false); setEditPlay(p); }}
          onUndo={() => { handleUndo(); setShowLog(false); }}
          onClose={() => setShowLog(false)}
        />
      )}

      {/* Play Edit */}
      {editPlay && (() => {
        return (
          <PlayEditModal
            play={editPlay}
            roster={roster}
            opponentPlayers={oppPlayers}
            ballOnBefore={editPlay.ballOn}
            downBefore={editPlay.down}
            distanceBefore={editPlay.distance}
            onSave={handleSaveEdit}
            onDelete={handleDeletePlay}
            onClose={() => setEditPlay(null)}
          />
        );
      })()}

      {/* PAT Gate */}
      {showPatGate && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel p-6 space-y-3 max-w-sm mx-auto">
            <h2 className="text-lg font-black text-center">Extra Point</h2>
            <p className="text-sm text-neutral-400 text-center">Touchdown scored. Choose PAT attempt:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handlePatGate("good_kick")} disabled={savingPat}
                className="py-3 rounded-xl text-sm font-black bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/30">PAT Good</button>
              <button onClick={() => handlePatGate("no_good_kick")} disabled={savingPat}
                className="py-3 rounded-xl text-sm font-black bg-red-500/20 text-red-400 border-2 border-red-500/30">PAT No Good</button>
              <button onClick={() => handlePatGate("good_two")} disabled={savingPat}
                className="py-3 rounded-xl text-sm font-black bg-blue-500/20 text-blue-400 border-2 border-blue-500/30">2PT Good</button>
              <button onClick={() => handlePatGate("no_good_two")} disabled={savingPat}
                className="py-3 rounded-xl text-sm font-black bg-neutral-800 text-neutral-400 border-2 border-neutral-700">2PT Failed</button>
            </div>
            <button onClick={() => handlePatGate("skip")} disabled={savingPat}
              className="w-full text-xs text-neutral-500 font-bold py-2">Skip</button>
          </div>
        </div>
      )}

      {/* Clock Editor */}
      {showClockEditor && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel p-6 space-y-3 max-w-xs mx-auto">
            <h2 className="text-sm font-black text-center">Set Clock</h2>
            <div className="flex items-center justify-center gap-2">
              <input type="number" min={0} max={15} value={clockMins} onChange={e => setClockMins(Number(e.target.value))}
                className="input w-16 text-center text-xl font-black" />
              <span className="text-xl font-black">:</span>
              <input type="number" min={0} max={59} value={clockSecs} onChange={e => setClockSecs(Number(e.target.value))}
                className="input w-16 text-center text-xl font-black" />
            </div>
            <button onClick={() => { setClock(clockMins * 60 + clockSecs); setShowClockEditor(false); }}
              className="btn-primary w-full text-sm">Set</button>
            <button onClick={() => setShowClockEditor(false)} className="w-full text-xs text-neutral-500 font-bold py-1">Cancel</button>
          </div>
        </div>
      )}

      {/* End Game Confirm */}
      {showEndGame && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel p-6 space-y-3 max-w-xs mx-auto">
            <h2 className="text-lg font-black text-center">End Game?</h2>
            <p className="text-sm text-neutral-400 text-center">
              Final score: {progName} {ourScore} — {oppName} {theirScore}
            </p>
            <button onClick={handleEndGame} className="btn-primary w-full">Mark as Final</button>
            <button onClick={() => setShowEndGame(false)} className="w-full text-xs text-neutral-500 font-bold py-1">Continue Playing</button>
          </div>
        </div>
      )}

      {/* Situation Adjuster (after penalty) */}
      {showSituationAdj && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel p-6 space-y-3 max-w-xs mx-auto">
            <h2 className="text-sm font-black text-center">Adjust Situation (Penalty)</h2>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold text-neutral-500 block mb-1">Ball On</label>
                <input type="number" value={adjBallOn} onChange={e => setAdjBallOn(Number(e.target.value))}
                  className="input text-center text-sm font-black" min={1} max={99} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-500 block mb-1">Down</label>
                <input type="number" value={adjDown} onChange={e => setAdjDown(Number(e.target.value))}
                  className="input text-center text-sm font-black" min={1} max={4} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-neutral-500 block mb-1">Distance</label>
                <input type="number" value={adjDistance} onChange={e => setAdjDistance(Number(e.target.value))}
                  className="input text-center text-sm font-black" min={1} max={99} />
              </div>
            </div>
            <button onClick={() => {
              setBallOn(adjBallOn); setDown(adjDown); setDistance(adjDistance);
              setShowSituationAdj(false);
            }} className="btn-primary w-full text-sm">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
