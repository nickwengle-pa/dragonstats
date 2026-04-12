import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RotateCcw, Home, BarChart3 } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  insertPlay,
  deletePlay,
  updatePlay,
  updatePlayFull,
  updatePlaySituation,
  loadGamePlays,
  updateGameScore,
  deriveGameState,
  type PlayInsert,
} from "@/services/gameService";
import { opponentPlayerService, type OpponentPlayer } from "@/services/opponentService";
import { getGameConfig } from "@/services/programService";
import {
  advanceSituationAfterPlay,
  buildPregameGameUpdate,
  createKickoffSituation,
  createDefaultPregameConfig,
  createInitialSituation,
  getOurEndZoneSideForQuarter,
  getPregameConfig,
  moveToQuarter,
  rebuildPlaySituations,
  resolveGameConfig,
  toDisplayFieldPosition,
  type PregameConfig,
} from "@/services/gameFlow";

// Game components
import Scoreboard from "@/components/game/Scoreboard";
import FieldVisualizer from "@/components/game/FieldVisualizer";
import PregameSetupSheet from "@/components/game/PregameSetupSheet";
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
  type BlockedKickType,
  findPlayTypeDef,
  QUARTER_LABELS,
  fmtClock,
  quarterLabel,
  yardLabel,
} from "@/components/game/types";

/* ═══════════════════════════════════════════════
   GAME SCREEN — Main Wrapper
   ═══════════════════════════════════════════════ */

export default function GameScreen() {
  const navigate = useNavigate();
  const { gameId } = useParams<{ gameId: string }>();
  const { program, season } = useProgramContext();

  /* ── Game config (from program settings) ── */
  const baseGc = useMemo(() => getGameConfig(program), [program]);

  /* ── Data loading ── */
  const [game, setGame] = useState<any>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [oppPlayers, setOppPlayers] = useState<OpponentPlayerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const gc = useMemo(() => resolveGameConfig(baseGc, game?.rules_config as Record<string, unknown> | null), [baseGc, game]);
  const pregame = useMemo(() => getPregameConfig(game), [game]);

  const loadData = useCallback(async () => {
    if (!season || !gameId) return;
    setLoading(true);

    const [gameRes, rosterRes, existingPlays] = await Promise.all([
      supabase.from("games").select("*, opponent:opponents(*)").eq("id", gameId).single(),
      supabase.from("season_rosters").select("*, player:players(*)").eq("season_id", season.id).eq("is_active", true).order("jersey_number", { ascending: true, nullsFirst: false }),
      loadGamePlays(gameId),
    ]);

    const gameData = gameRes.data;
    const gameConfig = resolveGameConfig(baseGc, gameData?.rules_config as Record<string, unknown> | null);
    const pregameConfig = getPregameConfig(gameData);

    setGame(gameData);
    setRoster(rosterRes.data ?? []);

    // Load opponent players
    if (gameData?.opponent_id) {
      const opp = await opponentPlayerService.getByOpponent(gameData.opponent_id);
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
        isTouchback: !!pd.is_touchback,
        penaltyCategory: pd.play_category === "offense" || pd.play_category === "defense" ? pd.play_category : null,
        blockedKickType: (
          pd.blocked_kick_type === "field_goal"
          || pd.blocked_kick_type === "extra_point"
          || pd.blocked_kick_type === "punt"
          || pd.blocked_kick_type === "kickoff"
        ) ? pd.blocked_kick_type as BlockedKickType : null,
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
        nextPossession: pd.next_possession === "us" || pd.next_possession === "them" ? pd.next_possession : undefined,
        nextDown: typeof pd.next_down === "number" ? pd.next_down : undefined,
        nextDistance: typeof pd.next_distance === "number" ? pd.next_distance : undefined,
        nextBallOn: typeof pd.next_yard_line === "number" ? pd.next_yard_line : undefined,
        offensiveFormation: (p as any).offensive_formation ?? null,
        defensiveFormation: (p as any).defensive_formation ?? null,
        hashMark: (p as any).hash_mark ?? null,
      };
    });

    const rebuilt = rebuildPlaySituations(localPlays, pregameConfig, gameConfig);
    setPlays(rebuilt.plays);

    // Resume game state from existing plays
    if (existingPlays.length > 0) {
      const state = deriveGameState(existingPlays, { config: gameConfig, pregame: pregameConfig });
      setQuarter(rebuilt.currentQuarter);
      setClock(state.clock);
      setPossession(rebuilt.currentSituation.possession);
      setOurScore(state.ourScore);
      setTheirScore(state.theirScore);
      setDown(rebuilt.currentSituation.down);
      setDistance(rebuilt.currentSituation.distance);
      setBallOn(rebuilt.currentSituation.ballOn);
    } else {
      const initialSituation = createInitialSituation(pregameConfig, gameConfig);
      setQuarter(1);
      setClock(gameConfig.quarter_length_secs);
      setPossession(initialSituation.possession);
      setDown(initialSituation.down);
      setDistance(initialSituation.distance);
      setBallOn(initialSituation.ballOn);
    }

    setLoading(false);
  }, [season, gameId, baseGc]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Game state ── */
  const initialSituation = useMemo(() => createInitialSituation(pregame, gc), [pregame, gc]);
  const [quarter, setQuarter] = useState(1);
  const [clock, setClock] = useState(gc.quarter_length_secs);
  const [possession, setPossession] = useState<"us" | "them">(initialSituation.possession);
  const [ourScore, setOurScore] = useState(0);
  const [theirScore, setTheirScore] = useState(0);
  const [down, setDown] = useState(initialSituation.down);
  const [distance, setDistance] = useState(initialSituation.distance);
  const [ballOn, setBallOn] = useState(initialSituation.ballOn);

  /* ── Plays ── */
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const isSubmitting = useRef(false);

  /* ── Modal state ── */
  const [selectedPlayType, setSelectedPlayType] = useState<PlayTypeDef | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [editPlay, setEditPlay] = useState<PlayRecord | null>(null);
  const [showPatGate, setShowPatGate] = useState(false);
  const [patGatePossession, setPatGatePossession] = useState<"us" | "them">("us");
  const [showClockEditor, setShowClockEditor] = useState(false);
  const [clockMins, setClockMins] = useState(12);
  const [clockSecs, setClockSecs] = useState(0);
  const [showEndGame, setShowEndGame] = useState(false);
  const [showSituationAdj, setShowSituationAdj] = useState(false);
  const [pendingSituationPlayId, setPendingSituationPlayId] = useState<string | null>(null);
  const [showPregame, setShowPregame] = useState(false);
  const [savingPregame, setSavingPregame] = useState(false);
  const [adjBallOn, setAdjBallOn] = useState(25);
  const [adjDown, setAdjDown] = useState(1);
  const [adjDistance, setAdjDistance] = useState(10);
  const [adjPossession, setAdjPossession] = useState<"us" | "them">("us");

  /* ── Derived state ── */
  const gameState: GameState = { quarter, clock, possession, ourScore, theirScore, down, distance, ballOn };
  const firstDownMarker = useMemo(() => Math.min(ballOn + distance, 100), [ballOn, distance]);
  const ballDisplayPosition = useMemo(
    () => toDisplayFieldPosition(ballOn, possession, quarter, pregame),
    [ballOn, possession, quarter, pregame],
  );
  const firstDownDisplayPosition = useMemo(
    () => toDisplayFieldPosition(firstDownMarker, possession, quarter, pregame),
    [firstDownMarker, possession, quarter, pregame],
  );
  const ourEndZoneSide = useMemo(
    () => getOurEndZoneSideForQuarter(quarter, pregame),
    [quarter, pregame],
  );

  useEffect(() => {
    if (!loading && game && !pregame) {
      setShowPregame(true);
    }
  }, [loading, game, pregame]);

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

  const applySituation = useCallback((next: { possession: "us" | "them"; down: number; distance: number; ballOn: number }) => {
    setPossession(next.possession);
    setDown(next.down);
    setDistance(next.distance);
    setBallOn(next.ballOn);
  }, []);

  const persistPlaySituations = useCallback((nextPlays: PlayRecord[]) => {
    void Promise.all(nextPlays.map((play) => updatePlaySituation(play.id, {
      possession: play.possession,
      down: play.down,
      distance: play.distance,
      yard_line: play.ballOn,
    })));
  }, []);

  const queueSituationAdjustment = useCallback((
    playId: string,
    play: PlayRecord,
    before: { possession: "us" | "them"; down: number; distance: number; ballOn: number },
  ) => {
    const suggested = advanceSituationAfterPlay(play, before, gc);
    setPendingSituationPlayId(playId);
    setAdjPossession(suggested.possession);
    setAdjBallOn(suggested.ballOn);
    setAdjDown(suggested.down);
    setAdjDistance(suggested.distance);
    setShowSituationAdj(true);
  }, [gc]);

  const recalcScoreAndState = useCallback(async (allPlays: PlayRecord[]) => {
    const rebuilt = rebuildPlaySituations(allPlays, pregame, gc);
    setPlays(rebuilt.plays);
    persistPlaySituations(rebuilt.plays);

    let us = 0;
    let them = 0;
    rebuilt.plays.forEach((play) => {
      if (play.isTouchdown) {
        if (play.possession === "us") us += 6;
        else them += 6;
      }
      if (play.type === "pat" && play.result === "Good") {
        if (play.possession === "us") us += 1;
        else them += 1;
      }
      if (play.type === "fg" && play.result === "Good") {
        if (play.possession === "us") us += 3;
        else them += 3;
      }
      if (play.type === "two_pt" && play.result === "Good") {
        if (play.possession === "us") us += 2;
        else them += 2;
      }
      if (play.type === "safety") {
        if (play.possession === "us") them += 2;
        else us += 2;
      }
    });

    setOurScore(us);
    setTheirScore(them);

    if (rebuilt.plays.length > 0) {
      const last = rebuilt.plays[rebuilt.plays.length - 1];
      setQuarter(last.quarter);
      setClock(last.clock);
      applySituation(rebuilt.currentSituation);
    } else {
      const reset = createInitialSituation(pregame, gc);
      setQuarter(1);
      setClock(gc.quarter_length_secs);
      applySituation(reset);
    }

    if (gameId) {
      await updateGameScore(gameId, us, them, rebuilt.plays.length > 0 ? "live" : "scheduled");
    }
  }, [applySituation, gameId, gc, persistPlaySituations, pregame]);

  const applySituationAdjustment = useCallback(async () => {
    if (!pendingSituationPlayId) return;

    const updatedPlays = plays.map((play) => (
      play.id === pendingSituationPlayId
        ? {
            ...play,
            nextPossession: adjPossession,
            nextDown: adjDown,
            nextDistance: adjDistance,
            nextBallOn: adjBallOn,
          }
        : play
    ));

    const ok = await updatePlay(pendingSituationPlayId, {}, {
      next_possession: adjPossession,
      next_down: adjDown,
      next_distance: adjDistance,
      next_yard_line: adjBallOn,
    });
    if (!ok) return;

    setShowSituationAdj(false);
    setPendingSituationPlayId(null);
    await recalcScoreAndState(updatedPlays);
  }, [adjBallOn, adjDistance, adjDown, adjPossession, pendingSituationPlayId, plays, recalcScoreAndState]);

  const handleSavePregame = useCallback(async (nextPregame: PregameConfig) => {
    if (!gameId || !game) return;

    setSavingPregame(true);
    const updates = buildPregameGameUpdate(
      (game.rules_config as Record<string, unknown> | null) ?? {},
      nextPregame,
    );

    const { data, error } = await supabase
      .from("games")
      .update(updates)
      .eq("id", gameId)
      .select("*, opponent:opponents(*)")
      .single();

    if (!error && data) {
      setGame(data);
      const nextConfig = resolveGameConfig(baseGc, data.rules_config as Record<string, unknown> | null);
      if (plays.length === 0) {
        const reset = createInitialSituation(nextPregame, nextConfig);
        setQuarter(1);
        setClock(nextConfig.quarter_length_secs);
        applySituation(reset);
      } else {
        const rebuilt = rebuildPlaySituations(plays, nextPregame, nextConfig);
        setPlays(rebuilt.plays);
        persistPlaySituations(rebuilt.plays);
        if (rebuilt.plays.length > 0) {
          const last = rebuilt.plays[rebuilt.plays.length - 1];
          setQuarter(last.quarter);
          setClock(last.clock);
          applySituation(rebuilt.currentSituation);
        }
      }
      setShowPregame(false);
    }

    setSavingPregame(false);
  }, [applySituation, baseGc, game, gameId, persistPlaySituations, plays]);

  /* ── Handle play type selection from quick actions ── */
  const handlePlayTypeSelect = (pt: PlayTypeDef) => {
    if (!pregame) {
      setShowPregame(true);
      return;
    }
    setSelectedPlayType(pt);
  };

  /* ── Handle play submission from modal ── */
  const handlePlaySubmit = async (data: PlaySubmitData) => {
    if (!gameId || !season || isSubmitting.current) return;
    isSubmitting.current = true;

    try {
    const before = { possession, down, distance, ballOn };
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
        is_touchback: data.isTouchback,
        penalty_type: data.penalty,
        play_category: data.penaltyCategory,
        penalty_yards: data.flagYards,
        blocked_kick_type: data.blockedKickType,
        next_possession: null,
        next_down: null,
        next_distance: null,
        next_yard_line: null,
      },
      yards_gained: data.yards,
      is_touchdown: data.isTouchdown,
      is_turnover: ["int", "fumble"].includes(data.playType.id),
      is_penalty: !!data.penalty,
      primary_player_id: data.tagged.find(t => !t.isOpponent)?.player_id ?? null,
      description: data.description,
      // Extended fields — only include if non-null to avoid missing-column errors
      ...(data.offensiveFormation ? { offensive_formation: data.offensiveFormation } : {}),
      ...(data.defensiveFormation ? { defensive_formation: data.defensiveFormation } : {}),
      ...(data.hashMark ? { hash_mark: data.hashMark } : {}),
    };

    const playerInserts = data.tagged
      .filter(t => !t.isOpponent)
      .map(t => ({
        player_id: t.player_id,
        role: t.role,
        credit: t.credit ?? null,
      }));

    const savedPlay = await insertPlay(playInsert, playerInserts);
    if (!savedPlay) { console.error("insertPlay returned null — check Supabase logs"); isSubmitting.current = false; setSelectedPlayType(null); return; }

    // Add to local play log
    const localPlay: PlayRecord = {
      id: savedPlay.id,
      quarter, clock, type: data.playType.id, yards: data.yards,
      result: data.result, penalty: data.penalty,
      penaltyCategory: data.penaltyCategory,
      flagYards: data.flagYards, isTouchdown: data.isTouchdown,
      firstDown: data.isFirstDown, turnover: playInsert.is_turnover,
      isTouchback: data.isTouchback,
      blockedKickType: data.blockedKickType,
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
    if (data.penalty || data.playType.id === "blocked_kick") {
      queueSituationAdjustment(savedPlay.id, localPlay, before);
    } else if (data.isTouchdown) {
      const afterTouchdown = advanceSituationAfterPlay(localPlay, before, gc);
      applySituation(afterTouchdown);
      setPatGatePossession(afterTouchdown.possession);
      setShowPatGate(true);
    } else {
      applySituation(advanceSituationAfterPlay(localPlay, before, gc));
    }

    } catch (err) {
      console.error("Error in handlePlaySubmit:", err);
    } finally {
      setSelectedPlayType(null);
      isSubmitting.current = false;
    }
  };

  /* ── Undo ── */
  const handleUndo = async () => {
    if (plays.length === 0 || !gameId) return;
    const last = plays[plays.length - 1];
    const deleted = await deletePlay(last.id);
    if (!deleted) return;

    await recalcScoreAndState(plays.slice(0, -1));
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
      primary_player_id: result.tagged.find(t => !t.isOpponent)?.player_id ?? null,
      description: result.description,
      ...(result.offensiveFormation != null ? { offensive_formation: result.offensiveFormation } : {}),
      ...(result.defensiveFormation != null ? { defensive_formation: result.defensiveFormation } : {}),
      ...(result.hashMark != null ? { hash_mark: result.hashMark } : {}),
      play_data: {
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
      },
    }, result.tagged.filter(t => !t.isOpponent).map(t => ({
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
      penaltyCategory: result.penaltyCategory,
      flagYards: result.flagYards,
      isTouchback: result.isTouchback,
      blockedKickType: result.blockedKickType,
      tagged: result.tagged,
      nextPossession: undefined,
      nextDown: undefined,
      nextDistance: undefined,
      nextBallOn: undefined,
      description: result.description,
      offensiveFormation: result.offensiveFormation,
      defensiveFormation: result.defensiveFormation,
      hashMark: result.hashMark,
    };

    const newPlays = [...plays];
    newPlays[idx] = updatedPlay;
    setEditPlay(null);
    await recalcScoreAndState(newPlays);

    if (updatedPlay.penalty || updatedPlay.type === "blocked_kick") {
      const rebuilt = rebuildPlaySituations(newPlays, pregame, gc);
      const rebuiltPlay = rebuilt.plays[idx];
      if (rebuiltPlay) {
        queueSituationAdjustment(rebuiltPlay.id, rebuiltPlay, {
          possession: rebuiltPlay.possession,
          down: rebuiltPlay.down,
          distance: rebuiltPlay.distance,
          ballOn: rebuiltPlay.ballOn,
        });
      }
    }
  };

  /* ── Delete play from edit modal ── */
  const handleDeletePlay = async (playId: string) => {
    const deleted = await deletePlay(playId);
    if (!deleted) return;

    const newPlays = plays.filter(p => p.id !== playId);
    setEditPlay(null);
    await recalcScoreAndState(newPlays);
  };


  /* ── PAT gate ── */
  const handlePatGate = (choice: "pat" | "two_pt" | "skip") => {
    if (choice === "skip") {
      applySituation(createKickoffSituation(patGatePossession, gc));
      setShowPatGate(false);
      return;
    }

    const nextPlayType = findPlayTypeDef(choice);
    if (nextPlayType) {
      setSelectedPlayType(nextPlayType);
    }
    setShowPatGate(false);
  };

  /* ── Cycle quarter ── */
  const cycleQuarter = () => {
    const nextQuarter = Math.min(5, quarter + 1);
    if (nextQuarter === quarter) return;
    const transition = moveToQuarter(quarter, nextQuarter, { possession, down, distance, ballOn }, pregame, gc);
    setQuarter(transition.quarter);
    setClock(transition.clock);
    applySituation(transition.situation);
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
          <button onClick={() => navigate("/")} className="btn-ghost p-2"><Home className="w-5 h-5" /></button>
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
        <button onClick={() => navigate("/")} className="btn-ghost p-2"><Home className="w-5 h-5" /></button>
        <h1 className="text-lg font-black flex-1 truncate">vs {oppName}</h1>
        <button onClick={() => navigate(`/game/${gameId}/summary`)} className="btn-ghost p-1.5" title="Game Stats">
          <BarChart3 className="w-4 h-4 text-neutral-400" />
        </button>
        <button onClick={() => setShowLog(true)} className="btn-ghost px-2 py-1 text-xs font-bold text-neutral-400">
          {plays.length} plays
        </button>
        <button onClick={() => setShowPregame(true)} className="btn-ghost px-2 py-1 text-xs font-bold text-neutral-400">
          Pregame
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
          onEndGame={() => setShowEndGame(true)}
        />

        {/* Field */}
        <FieldVisualizer
          ballOn={ballOn}
          ballPosition={ballDisplayPosition}
          firstDownPosition={firstDownDisplayPosition}
          possession={possession}
          ourEndZoneSide={ourEndZoneSide}
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
          <QuickActions onSelect={handlePlayTypeSelect} possession={possession} suggestedPhase={
            ballOn === gc.kickoff_yard_line || ballOn === gc.safety_kick_yard_line || ballOn === 100 - gc.pat_distance
              ? "special"
              : possession === "us" ? "offense" : "defense"
          } />
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

      {showPregame && (
        <PregameSetupSheet
          initialValue={pregame ?? createDefaultPregameConfig()}
          progName={progName}
          oppName={oppName}
          onClose={() => setShowPregame(false)}
          onSave={handleSavePregame}
          saving={savingPregame}
        />
      )}

      {/* Play Entry Modal */}
      {selectedPlayType && (
        <PlayEntryModal
          playType={selectedPlayType}
          gameState={gameState}
          roster={roster}
          opponentPlayers={oppPlayers}
          onSubmit={handlePlaySubmit}
          onClose={() => setSelectedPlayType(null)}
          onAddOpponentPlayer={async (player) => {
            // Persist quick-added opponent player to DB and update local state
            if (game?.opponent_id) {
              const saved = await opponentPlayerService.create({
                opponent_id: game.opponent_id,
                name: player.name,
                jersey_number: player.jersey_number,
                position: null,
              });
              if (saved) {
                setOppPlayers(prev => [...prev, saved]);
              }
            }
          }}
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
            <p className="text-sm text-neutral-400 text-center">Touchdown scored. Record the conversion attempt next:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handlePatGate("pat")}
                className="py-3 rounded-xl text-sm font-black bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/30">PAT Kick</button>
              <button onClick={() => handlePatGate("two_pt")}
                className="py-3 rounded-xl text-sm font-black bg-blue-500/20 text-blue-400 border-2 border-blue-500/30">2PT Try</button>
            </div>
            <button onClick={() => handlePatGate("skip")}
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
            <h2 className="text-sm font-black text-center">Adjust Next Situation</h2>
            <div>
              <label className="text-[10px] font-bold text-neutral-500 block mb-1">Possession</label>
              <div className="grid grid-cols-2 gap-2">
                {(["us", "them"] as const).map((team) => (
                  <button
                    key={team}
                    onClick={() => setAdjPossession(team)}
                    className={`py-2 rounded-xl text-xs font-bold border-2 uppercase transition-colors ${
                      adjPossession === team
                        ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary"
                        : "border-surface-border bg-surface-bg text-neutral-500"
                    }`}
                  >
                    {team}
                  </button>
                ))}
              </div>
            </div>
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
            <button onClick={applySituationAdjustment} className="btn-primary w-full text-sm">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
