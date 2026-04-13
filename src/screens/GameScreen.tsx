import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RotateCcw, Home, BarChart3 } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  insertPlay,
  deletePlay,
  updatePlayFull,
  updatePlaySituation,
  loadGamePlays,
  updateGameScore,
  hasManagedLiveState,
  updateCurrentGameState,
  withManagedLiveState,
  type PlayInsert,
} from "@/services/gameService";
import { opponentPlayerService } from "@/services/opponentService";
import { getGameConfig } from "@/services/programService";
import {
  advanceSituationAfterPlay,
  buildPregameGameUpdate,
  createKickoffSituation,
  createDefaultPregameConfig,
  createInitialSituation,
  getOffenseDriveDirection,
  getOurEndZoneSideForQuarter,
  getOurDriveDirectionForQuarter,
  getPregameConfig,
  moveToQuarter,
  normalizeQuarter,
  oppositeFieldDirection,
  rebuildPlaySituations,
  resolveGameConfig,
  toDisplayFieldPosition,
  type PregameConfig,
} from "@/services/gameFlow";
import {
  createInitialGameState,
  replayLiveGame,
  type LiveSessionConfig,
  type LiveSessionPlayResult,
} from "@/services/liveGameSession";

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
} from "@/components/game/types";

interface LiveSituationSnapshot {
  possession: "us" | "them";
  down: number;
  distance: number;
  ballOn: number;
}

interface ScoreSnapshot {
  us: number;
  them: number;
}

interface PendingClockCapture {
  play: PlayRecord;
  before: LiveSituationSnapshot;
  scoreBefore: ScoreSnapshot;
  resolved?: Pick<LiveSessionPlayResult, "afterSituation" | "scoreAfter" | "events" | "engineSnapshot">;
  reason: string;
  patGatePossession?: "us" | "them";
}

const LIVE_STATE_PERSIST_DELAY_MS = 250;
const MAX_TIMEOUTS_PER_HALF = 3;
type FieldSide = "program" | "opponent";
type TimeoutTeam = "us" | "them";

function toTeamTag(name: string | null | undefined, explicitAbbreviation?: string | null) {
  if (typeof explicitAbbreviation === "string" && explicitAbbreviation.trim().length > 0) {
    return explicitAbbreviation.trim().toUpperCase();
  }

  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TEAM";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

function formatTeamYardLabel(
  ballOn: number,
  possession: "us" | "them",
  programAbbr: string,
  opponentAbbr: string,
) {
  if (ballOn === 50) return "50";
  const offenseTag = possession === "us" ? programAbbr : opponentAbbr;
  const defenseTag = possession === "us" ? opponentAbbr : programAbbr;
  return ballOn <= 50 ? `${offenseTag} ${ballOn}` : `${defenseTag} ${100 - ballOn}`;
}

function getFieldSideForSpot(ballOn: number, possession: "us" | "them"): FieldSide {
  if (possession === "us") {
    return ballOn <= 50 ? "program" : "opponent";
  }

  return ballOn <= 50 ? "opponent" : "program";
}

function toBallOnFromFieldSide(fieldSide: FieldSide, yardLine: number, possession: "us" | "them") {
  if (possession === "us") {
    return fieldSide === "program" ? yardLine : 100 - yardLine;
  }

  return fieldSide === "opponent" ? yardLine : 100 - yardLine;
}

function parseClockText(clockText: unknown, fallback: number): number {
  if (typeof clockText !== "string") return fallback;
  const [mins, secs] = clockText.split(":").map(Number);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return fallback;
  return mins * 60 + secs;
}

function timeoutHalfForQuarter(quarter: number): 1 | 2 {
  return normalizeQuarter(quarter) <= 2 ? 1 : 2;
}

function getTimeoutTeam(play: PlayRecord): TimeoutTeam | null {
  const timeoutTeam = play.playData?.timeout_team;
  return timeoutTeam === "us" || timeoutTeam === "them" ? timeoutTeam : null;
}

function readStoredClock(play: Pick<PlayRecord, "clock" | "playData">, key: string): number | null {
  const value = play.playData?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStoredStartClock(play: Pick<PlayRecord, "clock" | "playData">): number {
  return readStoredClock(play, "recorded_start_clock_seconds") ?? play.clock;
}

function getStoredEndClock(play: Pick<PlayRecord, "clock" | "playData">): number | null {
  return readStoredClock(play, "recorded_end_clock_seconds");
}

function shouldPromptForClockCapture(
  play: Pick<PlayRecord, "type" | "result" | "isTouchdown">,
  before: LiveSituationSnapshot,
  after: LiveSituationSnapshot,
): boolean {
  if (play.type === "timeout") return false;
  if (play.isTouchdown) return true;
  if (play.type === "fg" && play.result === "Good") return true;
  if (play.type === "safety") return true;
  return after.possession !== before.possession;
}

function getClockCaptureReason(
  play: Pick<PlayRecord, "type" | "result" | "isTouchdown">,
  before: LiveSituationSnapshot,
  after: LiveSituationSnapshot,
): string {
  if (play.isTouchdown) return "after scoring play";
  if (play.type === "fg" && play.result === "Good") return "after field goal";
  if (play.type === "safety") return "after safety";
  if (play.type === "kickoff") return "after kickoff";
  if (play.type === "punt") return "after punt";
  if (play.type === "int") return "after interception return";
  if (play.type === "fumble") return "after turnover return";
  if (after.possession !== before.possession) return "after change of possession";
  return "after play";
}

function serializeEngineSnapshot(snapshot: Record<string, any> | null | undefined) {
  if (!snapshot) return null;

  return {
    ...snapshot,
    overtime: snapshot.overtime ? {
      ...snapshot.overtime,
      teamsThatHavePossessed: Array.isArray(snapshot.overtime.teamsThatHavePossessed)
        ? snapshot.overtime.teamsThatHavePossessed
        : Array.from(snapshot.overtime.teamsThatHavePossessed ?? []),
    } : null,
  };
}

function applyScoreDelta(
  play: Pick<PlayRecord, "isTouchdown" | "possession" | "type" | "result">,
  before: ScoreSnapshot,
): ScoreSnapshot {
  const next = { ...before };

  if (play.isTouchdown) {
    if (play.possession === "us") next.us += 6;
    else next.them += 6;
  }
  if (play.type === "pat" && play.result === "Good") {
    if (play.possession === "us") next.us += 1;
    else next.them += 1;
  }
  if (play.type === "fg" && play.result === "Good") {
    if (play.possession === "us") next.us += 3;
    else next.them += 3;
  }
  if (play.type === "two_pt" && play.result === "Good") {
    if (play.possession === "us") next.us += 2;
    else next.them += 2;
  }
  if (play.type === "safety") {
    if (play.possession === "us") next.them += 2;
    else next.us += 2;
  }

  return next;
}

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
  const persistedLiveStateKey = useRef<string | null>(null);
  const liveSessionConfig = useMemo<LiveSessionConfig | null>(() => {
    if (!gameId || !program || !game?.opponent?.id) return null;

    return {
      gameId,
      programTeamId: program.id,
      programName: program.name,
      programAbbreviation: toTeamTag(program.name, program.abbreviation),
      opponentTeamId: game.opponent.id,
      opponentName: game.opponent.name ?? "Opponent",
      opponentAbbreviation: toTeamTag(game.opponent.name ?? "Opponent", game.opponent.abbreviation),
      isHome: Boolean(game.is_home),
      gameConfig: gc,
      rulesConfig: game.rules_config as Record<string, unknown> | null,
      pregame,
    };
  }, [game, gameId, gc, pregame, program]);

  const loadData = useCallback(async () => {
    if (!season || !gameId) return;
    setLoading(true);
    quarterSnapshots.current = {};
    setDirectionFlipped(false);

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
      const clockSecs = parseClockText(p.clock, 0);
      return {
        id: p.id,
        sequence: p.sequence,
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
        playData: { ...pd },
      };
    });

    const rebuilt = rebuildPlaySituations(localPlays, pregameConfig, gameConfig);
    setPlays(rebuilt.plays);

    const sessionConfig = program && gameData?.opponent?.id
      ? {
          gameId,
          programTeamId: program.id,
          programName: program.name,
          programAbbreviation: toTeamTag(program.name, program.abbreviation),
          opponentTeamId: gameData.opponent.id,
          opponentName: gameData.opponent.name ?? "Opponent",
          opponentAbbreviation: toTeamTag(gameData.opponent.name ?? "Opponent", gameData.opponent.abbreviation),
          isHome: Boolean(gameData.is_home),
          gameConfig,
          rulesConfig: gameData?.rules_config as Record<string, unknown> | null,
          pregame: pregameConfig,
        } satisfies LiveSessionConfig
      : null;
    const replay = sessionConfig ? replayLiveGame(rebuilt.plays, sessionConfig) : null;
    const derivedState = replay?.currentState ?? createInitialGameState({
      gameId,
      programTeamId: program?.id ?? "program",
      programName: program?.name ?? "Team",
      programAbbreviation: toTeamTag(program?.name ?? "Team", program?.abbreviation),
      opponentTeamId: gameData?.opponent?.id ?? "opponent",
      opponentName: gameData?.opponent?.name ?? "Opponent",
      opponentAbbreviation: toTeamTag(gameData?.opponent?.name ?? "Opponent", gameData?.opponent?.abbreviation),
      isHome: Boolean(gameData?.is_home),
      gameConfig,
      rulesConfig: gameData?.rules_config as Record<string, unknown> | null,
      pregame: pregameConfig,
    });

    const useStoredLiveState = hasManagedLiveState(gameData?.rules_config as Record<string, unknown> | null);
    const resumedQuarter = useStoredLiveState
      ? Number(gameData?.current_quarter ?? derivedState.quarter)
      : derivedState.quarter;
    const resumedClock = useStoredLiveState
      ? parseClockText(gameData?.current_clock, derivedState.clock)
      : derivedState.clock;
    const resumedPossession = useStoredLiveState && (gameData?.current_possession === "us" || gameData?.current_possession === "them")
      ? gameData.current_possession
      : derivedState.possession;
    const resumedDown = useStoredLiveState && typeof gameData?.current_down === "number"
      ? gameData.current_down
      : derivedState.down;
    const resumedDistance = useStoredLiveState && typeof gameData?.current_distance === "number"
      ? gameData.current_distance
      : derivedState.distance;
    const resumedBallOn = useStoredLiveState && typeof gameData?.current_yard_line === "number"
      ? gameData.current_yard_line
      : derivedState.ballOn;

    setQuarter(resumedQuarter);
    setClock(resumedClock);
    setPossession(resumedPossession);
    setOurScore(derivedState.ourScore);
    setTheirScore(derivedState.theirScore);
    setDown(resumedDown);
    setDistance(resumedDistance);
    setBallOn(resumedBallOn);

    persistedLiveStateKey.current = useStoredLiveState
      ? [resumedQuarter, resumedClock, resumedPossession, resumedDown, resumedDistance, resumedBallOn].join("|")
      : null;

    setLoading(false);
  }, [season, gameId, baseGc, program]);

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
  const [showPostPlayClockModal, setShowPostPlayClockModal] = useState(false);
  const [postPlayClockMins, setPostPlayClockMins] = useState(12);
  const [postPlayClockSecs, setPostPlayClockSecs] = useState(0);
  const [pendingClockCapture, setPendingClockCapture] = useState<PendingClockCapture | null>(null);
  const [showTimeoutModal, setShowTimeoutModal] = useState(false);
  const [timeoutTeam, setTimeoutTeam] = useState<TimeoutTeam>("us");
  const [timeoutMins, setTimeoutMins] = useState(12);
  const [timeoutSecs, setTimeoutSecs] = useState(0);
  const [showBallEditor, setShowBallEditor] = useState(false);
  const [ballEditSide, setBallEditSide] = useState<FieldSide>("program");
  const [ballEditYard, setBallEditYard] = useState(25);
  const [ballEditRaw, setBallEditRaw] = useState("25");
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
  const quarterSnapshots = useRef<Partial<Record<number, { clock: number; situation: LiveSituationSnapshot }>>>({});
  const [directionFlipped, setDirectionFlipped] = useState(false);
  const ballDisplayPosition = useMemo(
    () => {
      const displayPosition = toDisplayFieldPosition(ballOn, possession, quarter, pregame);
      return directionFlipped ? 100 - displayPosition : displayPosition;
    },
    [ballOn, directionFlipped, possession, quarter, pregame],
  );
  const firstDownDisplayPosition = useMemo(
    () => {
      const displayPosition = toDisplayFieldPosition(firstDownMarker, possession, quarter, pregame);
      return directionFlipped ? 100 - displayPosition : displayPosition;
    },
    [directionFlipped, firstDownMarker, possession, quarter, pregame],
  );
  const ourEndZoneSide = useMemo(
    () => {
      const side = getOurEndZoneSideForQuarter(quarter, pregame);
      return directionFlipped ? oppositeFieldDirection(side) : side;
    },
    [directionFlipped, quarter, pregame],
  );

  useEffect(() => {
    if (!loading && game && !pregame) {
      setShowPregame(true);
    }
  }, [loading, game, pregame]);

  useEffect(() => {
    quarterSnapshots.current = {};
    setDirectionFlipped(false);
  }, [gameId]);

  const toBoardScore = useCallback((score: ScoreSnapshot) => {
    const isHome = game?.is_home ?? true;
    return {
      us: score.us,
      them: score.them,
      home: isHome ? score.us : score.them,
      visitor: isHome ? score.them : score.us,
    };
  }, [game?.is_home]);

  const buildSituationSnapshot = useCallback((
    snapshotQuarter: number,
    snapshotClock: number,
    situation: LiveSituationSnapshot,
  ) => {
    const programTag = toTeamTag(program?.name ?? "Team", program?.abbreviation);
    const opponentTag = toTeamTag(game?.opponent?.name ?? "Opponent", game?.opponent?.abbreviation);
    const firstDownAt = Math.min(situation.ballOn + situation.distance, 100);
    return {
      quarter: snapshotQuarter,
      quarter_label: quarterLabel(snapshotQuarter),
      clock: fmtClock(snapshotClock),
      clock_seconds: snapshotClock,
      possession: situation.possession,
      down: situation.down,
      distance: situation.distance,
      yard_line: situation.ballOn,
      yard_label: formatTeamYardLabel(situation.ballOn, situation.possession, programTag, opponentTag),
      first_down_yard_line: firstDownAt,
      display_ball_on: toDisplayFieldPosition(situation.ballOn, situation.possession, snapshotQuarter, pregame),
      display_first_down: toDisplayFieldPosition(firstDownAt, situation.possession, snapshotQuarter, pregame),
      our_drive_direction: getOurDriveDirectionForQuarter(snapshotQuarter, pregame),
      offense_drive_direction: getOffenseDriveDirection(situation.possession, snapshotQuarter, pregame),
      our_end_zone_side: getOurEndZoneSideForQuarter(snapshotQuarter, pregame),
    };
  }, [game?.opponent?.abbreviation, game?.opponent?.name, pregame, program?.abbreviation, program?.name]);

  const buildWorksheetRow = useCallback((
    play: PlayRecord,
    before: LiveSituationSnapshot,
    after: LiveSituationSnapshot,
    scoreBefore: ScoreSnapshot,
    scoreAfter: ScoreSnapshot,
  ) => {
    const startClockSeconds = getStoredStartClock(play);
    const endClockSeconds = getStoredEndClock(play);
    const formatTaggedName = (name: string, jerseyNumber: number | null | undefined) =>
      jerseyNumber != null ? `#${jerseyNumber} ${name}` : name;
    const defenders = play.tagged
      .filter((tag) => ["tackler", "assist", "sacker", "interceptor", "blocker"].includes(tag.role))
      .map((tag) => formatTaggedName(tag.name, tag.jersey_number))
      .join(", ");
    const primaryTag = play.tagged[0] ?? null;
    const eventParts = [play.result, play.penalty].filter(Boolean);
    const storedTags = Array.isArray(play.playData?.tags) ? (play.playData?.tags as string[]) : null;
    const programTag = toTeamTag(program?.name ?? "Team", program?.abbreviation);
    const opponentTag = toTeamTag(game?.opponent?.name ?? "Opponent", game?.opponent?.abbreviation);
    const teamAbbreviation = play.possession === "us"
      ? programTag
      : opponentTag;
    const playTypeLabel = play.type === "timeout"
      ? "Timeout"
      : findPlayTypeDef(play.type)?.label ?? play.type;
    const scoreBeforeBoard = toBoardScore(scoreBefore);
    const scoreAfterBoard = toBoardScore(scoreAfter);

    return {
      sequence: play.sequence ?? null,
      team_side: play.possession,
      team_abbreviation: teamAbbreviation,
      quarter: play.quarter,
      clock: fmtClock(play.clock),
      home_score_before: scoreBeforeBoard.home,
      visitor_score_before: scoreBeforeBoard.visitor,
      home_score_after: scoreAfterBoard.home,
      visitor_score_after: scoreAfterBoard.visitor,
      down: before.down,
      to_go: before.distance,
      ball_on: before.ballOn,
      ball_on_label: formatTeamYardLabel(before.ballOn, before.possession, programTag, opponentTag),
      type: play.type,
      type_label: playTypeLabel,
      yards: play.yards,
      event: eventParts.length > 0 ? eventParts.join(" | ") : null,
      tackled_by: defenders || null,
      play: play.description,
      formation: play.offensiveFormation ?? null,
      defense: play.defensiveFormation ?? null,
      hash: play.hashMark ?? null,
      primary_player_number: primaryTag?.jersey_number ?? null,
      primary_player_role: primaryTag?.role ?? null,
      possession: play.possession,
      start_ball_on: before.ballOn,
      end_ball_on: after.ballOn,
      start_clock: fmtClock(startClockSeconds),
      end_clock: endClockSeconds != null ? fmtClock(endClockSeconds) : null,
      tags: storedTags,
    };
  }, [game?.opponent?.abbreviation, game?.opponent?.name, program?.abbreviation, program?.name, toBoardScore]);

  const buildStoredPlayData = useCallback((
    play: PlayRecord,
    before: LiveSituationSnapshot,
    scoreBefore: ScoreSnapshot,
    resolved?: Pick<LiveSessionPlayResult, "afterSituation" | "scoreAfter" | "events" | "engineSnapshot">,
  ) => {
    const startClockSeconds = getStoredStartClock(play);
    const endClockSeconds = getStoredEndClock(play);
    const afterClockSeconds = endClockSeconds ?? play.clock;
    const autoAfter = advanceSituationAfterPlay(play, before, gc);
    const after: LiveSituationSnapshot = resolved?.afterSituation ?? {
      possession: play.nextPossession ?? autoAfter.possession,
      down: play.nextDown ?? autoAfter.down,
      distance: play.nextDistance ?? autoAfter.distance,
      ballOn: play.nextBallOn ?? autoAfter.ballOn,
    };
    const scoreAfter = resolved?.scoreAfter ?? applyScoreDelta(play, scoreBefore);
    const existingSource = typeof play.playData?.next_situation_source === "string"
      ? play.playData?.next_situation_source
      : null;
    const nextSituationSource = existingSource
      ?? (play.type === "timeout"
        ? "timeout"
        : (play.penalty || play.type === "blocked_kick") ? "pending_review" : "auto");
    const worksheetRow = buildWorksheetRow(play, before, after, scoreBefore, scoreAfter);

    return {
      after,
      scoreAfter,
      playData: {
        ...(play.playData ?? {}),
        result: play.result || null,
        is_first_down: play.firstDown,
        is_touchback: play.isTouchback ?? false,
        penalty_type: play.penalty,
        play_category: play.penaltyCategory ?? null,
        penalty_yards: play.flagYards,
        blocked_kick_type: play.blockedKickType ?? null,
        next_possession: after.possession,
        next_down: after.down,
        next_distance: after.distance,
        next_yard_line: after.ballOn,
        next_situation_source: nextSituationSource,
        recorded_clock: fmtClock(play.clock),
        recorded_clock_seconds: play.clock,
        recorded_start_clock: fmtClock(startClockSeconds),
        recorded_start_clock_seconds: startClockSeconds,
        recorded_end_clock: endClockSeconds != null ? fmtClock(endClockSeconds) : null,
        recorded_end_clock_seconds: endClockSeconds,
        context_before: buildSituationSnapshot(play.quarter, startClockSeconds, before),
        context_after: buildSituationSnapshot(play.quarter, afterClockSeconds, after),
        context_after_auto: buildSituationSnapshot(play.quarter, afterClockSeconds, autoAfter),
        score_before: toBoardScore(scoreBefore),
        score_after: toBoardScore(scoreAfter),
        pregame_snapshot: pregame ? { ...pregame } : null,
        config_snapshot: { ...gc },
        engine_events: (resolved?.events ?? []).map((event) => ({ ...event })),
        engine_state_after: serializeEngineSnapshot(resolved?.engineSnapshot as Record<string, any> | null | undefined),
        worksheet_row: worksheetRow,
      },
    };
  }, [buildSituationSnapshot, buildWorksheetRow, gc, pregame, toBoardScore]);

  useEffect(() => {
    if (!gameId || !game || loading) return;

    const liveStateKey = [quarter, clock, possession, down, distance, ballOn].join("|");
    const alreadyManaged = hasManagedLiveState(game?.rules_config as Record<string, unknown> | null);
    if (persistedLiveStateKey.current === liveStateKey && alreadyManaged) return;

    const timeoutId = window.setTimeout(() => {
      void updateCurrentGameState(gameId, {
        quarter,
        clock: fmtClock(clock),
        possession,
        down,
        distance,
        yard_line: ballOn,
      }, game?.rules_config as Record<string, unknown> | null).then((saved) => {
        if (!saved) return;
        persistedLiveStateKey.current = liveStateKey;
        setGame((prev: any) => prev ? ({
          ...prev,
          current_quarter: quarter,
          current_clock: fmtClock(clock),
          current_possession: possession,
          current_down: down,
          current_distance: distance,
          current_yard_line: ballOn,
          rules_config: withManagedLiveState(prev.rules_config as Record<string, unknown> | null),
        }) : prev);
      });
    }, LIVE_STATE_PERSIST_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [ballOn, clock, distance, down, game, gameId, loading, possession, quarter]);

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

  const progAbbr = useMemo(
    () => toTeamTag(program?.name ?? "Team", program?.abbreviation),
    [program?.abbreviation, program?.name],
  );
  const oppAbbr = useMemo(
    () => toTeamTag(game?.opponent?.name ?? "Opponent", game?.opponent?.abbreviation),
    [game?.opponent?.abbreviation, game?.opponent?.name],
  );
  const currentBallLabel = useMemo(
    () => formatTeamYardLabel(ballOn, possession, progAbbr, oppAbbr),
    [ballOn, oppAbbr, possession, progAbbr],
  );
  const suggestedPhase = useMemo(() => {
    const isKickState = ballOn === gc.kickoff_yard_line || ballOn === gc.safety_kick_yard_line;
    const isConversionState = ballOn === 100 - gc.pat_distance && distance <= gc.pat_distance;
    if (isKickState || isConversionState) return "special" as const;
    return possession === "us" ? "offense" as const : "defense" as const;
  }, [ballOn, distance, gc.kickoff_yard_line, gc.pat_distance, gc.safety_kick_yard_line, possession]);
  const timeoutState = useMemo(() => {
    const activeHalf = timeoutHalfForQuarter(quarter);
    let usedUs = 0;
    let usedThem = 0;

    plays.forEach((play) => {
      if (play.type !== "timeout") return;
      if (timeoutHalfForQuarter(play.quarter) !== activeHalf) return;

      const team = getTimeoutTeam(play);
      if (team === "us") usedUs += 1;
      if (team === "them") usedThem += 1;
    });

    return {
      ourRemaining: Math.max(0, MAX_TIMEOUTS_PER_HALF - usedUs),
      theirRemaining: Math.max(0, MAX_TIMEOUTS_PER_HALF - usedThem),
    };
  }, [plays, quarter]);

  const applySituation = useCallback((next: { possession: "us" | "them"; down: number; distance: number; ballOn: number }) => {
    setPossession(next.possession);
    setDown(next.down);
    setDistance(next.distance);
    setBallOn(next.ballOn);
  }, []);

  const adjustDistance = useCallback((delta: number) => {
    setDistance((current) => Math.max(1, Math.min(99, current + delta)));
  }, []);

  const adjustBall = useCallback((delta: number) => {
    setBallOn((current) => Math.max(1, Math.min(99, current + delta)));
  }, []);

  const openBallEditor = useCallback(() => {
    const nextSide = getFieldSideForSpot(ballOn, possession);
    const nextYard = ballOn <= 50 ? ballOn : 100 - ballOn;
    setBallEditSide(nextSide);
    setBallEditYard(nextYard);
    setBallEditRaw(String(nextYard));
    setShowBallEditor(true);
  }, [ballOn, possession]);

  const applyBallEdit = useCallback(() => {
    const nextBallOn = toBallOnFromFieldSide(ballEditSide, ballEditYard, possession);
    setBallOn(nextBallOn);
    setShowBallEditor(false);
  }, [ballEditSide, ballEditYard, possession]);

  const openTimeoutModal = useCallback((team: TimeoutTeam) => {
    const remaining = team === "us" ? timeoutState.ourRemaining : timeoutState.theirRemaining;
    if (remaining <= 0) return;
    setTimeoutTeam(team);
    setTimeoutMins(Math.floor(clock / 60));
    setTimeoutSecs(clock % 60);
    setShowTimeoutModal(true);
  }, [clock, timeoutState.ourRemaining, timeoutState.theirRemaining]);

  const openPostPlayClockCapture = useCallback((capture: PendingClockCapture) => {
    setPendingClockCapture(capture);
    setPostPlayClockMins(Math.floor(clock / 60));
    setPostPlayClockSecs(clock % 60);
    setShowPostPlayClockModal(true);
  }, [clock]);

  const persistPlaySituations = useCallback((
    nextPlays: PlayRecord[],
    replayResults?: LiveSessionPlayResult[],
  ) => {
    const results = replayResults ?? (liveSessionConfig ? replayLiveGame(nextPlays, liveSessionConfig).playResults : []);
    let scoreCursor: ScoreSnapshot = { us: 0, them: 0 };

    const updates = nextPlays.map((play, index) => {
      const resolved = results[index];
      const before: LiveSituationSnapshot = resolved?.beforeSituation ?? {
        possession: play.possession,
        down: play.down,
        distance: play.distance,
        ballOn: play.ballOn,
      };
      const stored = buildStoredPlayData(
        play,
        before,
        resolved?.scoreBefore ?? scoreCursor,
        resolved ? {
          afterSituation: resolved.afterSituation,
          scoreAfter: resolved.scoreAfter,
          events: resolved.events,
          engineSnapshot: resolved.engineSnapshot,
        } : undefined,
      );
      scoreCursor = stored.scoreAfter;

      return updatePlaySituation(play.id, {
        quarter: play.quarter,
        clock: fmtClock(play.clock),
        possession: play.possession,
        down: play.down,
        distance: play.distance,
        yard_line: play.ballOn,
        end_yard_line: stored.after.ballOn,
        play_start_time: getStoredStartClock(play),
        play_end_time: getStoredEndClock(play),
      }, stored.playData);
    });

    void Promise.all(updates);
  }, [buildStoredPlayData, liveSessionConfig]);

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
    const replay = liveSessionConfig ? replayLiveGame(rebuilt.plays, liveSessionConfig) : null;

    setPlays(rebuilt.plays);
    persistPlaySituations(rebuilt.plays, replay?.playResults);

    const replayState = replay?.currentState;
    if (replayState) {
      setQuarter(replayState.quarter);
      setClock(replayState.clock);
      setOurScore(replayState.ourScore);
      setTheirScore(replayState.theirScore);
      applySituation({
        possession: replayState.possession,
        down: replayState.down,
        distance: replayState.distance,
        ballOn: replayState.ballOn,
      });
    } else if (rebuilt.plays.length > 0) {
      const last = rebuilt.plays[rebuilt.plays.length - 1];
      setQuarter(last.quarter);
      setClock(last.clock);
      applySituation(rebuilt.currentSituation);
    } else {
      const reset = createInitialSituation(pregame, gc);
      setQuarter(1);
      setClock(gc.quarter_length_secs);
      setOurScore(0);
      setTheirScore(0);
      applySituation(reset);
    }

    if (gameId) {
      const replayScore = replay?.score ?? { us: 0, them: 0 };
      await updateGameScore(
        gameId,
        replayScore.us,
        replayScore.them,
        rebuilt.plays.length > 0 ? "live" : "scheduled",
      );
    }
  }, [applySituation, gameId, gc, liveSessionConfig, persistPlaySituations, pregame]);

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
            playData: {
              ...(play.playData ?? {}),
              next_situation_source: "manual_override",
            },
          }
        : play
    ));

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
        setOurScore(0);
        setTheirScore(0);
        applySituation(reset);
      } else {
        const rebuilt = rebuildPlaySituations(plays, nextPregame, nextConfig);
        const replayConfig = program && data.opponent?.id
          ? {
              gameId,
              programTeamId: program.id,
              programName: program.name,
              programAbbreviation: program.abbreviation ?? "US",
              opponentTeamId: data.opponent.id,
              opponentName: data.opponent.name ?? "Opponent",
              opponentAbbreviation: data.opponent.abbreviation ?? "OPP",
              isHome: Boolean(data.is_home),
              gameConfig: nextConfig,
              rulesConfig: data.rules_config as Record<string, unknown> | null,
              pregame: nextPregame,
            } satisfies LiveSessionConfig
          : null;
        const replay = replayConfig ? replayLiveGame(rebuilt.plays, replayConfig) : null;
        setPlays(rebuilt.plays);
        persistPlaySituations(rebuilt.plays, replay?.playResults);
        if (replay) {
          setQuarter(replay.currentState.quarter);
          setClock(replay.currentState.clock);
          setOurScore(replay.currentState.ourScore);
          setTheirScore(replay.currentState.theirScore);
          applySituation({
            possession: replay.currentState.possession,
            down: replay.currentState.down,
            distance: replay.currentState.distance,
            ballOn: replay.currentState.ballOn,
          });
        } else if (rebuilt.plays.length > 0) {
          const last = rebuilt.plays[rebuilt.plays.length - 1];
          setQuarter(last.quarter);
          setClock(last.clock);
          applySituation(rebuilt.currentSituation);
        }
      }
      setShowPregame(false);
    }

    setSavingPregame(false);
  }, [applySituation, baseGc, game, gameId, persistPlaySituations, plays, program]);

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
    const before: LiveSituationSnapshot = { possession, down, distance, ballOn };
    const scoreBefore: ScoreSnapshot = { us: ourScore, them: theirScore };
    const isTurnover = ["int", "fumble"].includes(data.playType.id);
    const previewPlay: PlayRecord = {
      id: "pending",
      sequence: plays.length + 1,
      quarter,
      clock,
      type: data.playType.id,
      yards: data.yards,
      result: data.result,
      penalty: data.penalty,
      penaltyCategory: data.penaltyCategory,
      flagYards: data.flagYards,
      isTouchdown: data.isTouchdown,
      firstDown: data.isFirstDown,
      turnover: isTurnover,
      isTouchback: data.isTouchback,
      blockedKickType: data.blockedKickType,
      tagged: data.tagged,
      ballOn,
      down,
      distance,
      description: data.description,
      possession,
      offensiveFormation: data.offensiveFormation,
      defensiveFormation: data.defensiveFormation,
      hashMark: data.hashMark,
      playData: {
        season_id: season.id,
        recorded_start_clock: fmtClock(clock),
        recorded_start_clock_seconds: clock,
        ...(data.playData ?? {}),
        next_situation_source: data.penalty || data.playType.id === "blocked_kick" ? "pending_review" : "auto",
      },
    };
    const liveReplay = liveSessionConfig ? replayLiveGame([...plays, previewPlay], liveSessionConfig) : null;
    const resolution = liveReplay?.playResults[liveReplay.playResults.length - 1];
    const storedPreview = buildStoredPlayData(
      previewPlay,
      before,
      scoreBefore,
      resolution ? {
        afterSituation: resolution.afterSituation,
        scoreAfter: resolution.scoreAfter,
        events: resolution.events,
        engineSnapshot: resolution.engineSnapshot,
      } : undefined,
    );
    const playInsert: PlayInsert = {
      game_id: gameId,
      quarter,
      clock: fmtClock(clock),
      possession,
      down,
      distance,
      yard_line: ballOn,
      play_type: data.playType.id,
      play_data: storedPreview.playData,
      yards_gained: data.yards,
      is_touchdown: data.isTouchdown,
      is_turnover: isTurnover,
      is_penalty: !!data.penalty,
      primary_player_id: data.tagged.find((tag) => !tag.isOpponent)?.player_id ?? null,
      description: data.description,
      end_yard_line: storedPreview.after.ballOn,
      play_start_time: clock,
      play_end_time: null,
      // Extended fields — only include if non-null to avoid missing-column errors
      ...(data.offensiveFormation ? { offensive_formation: data.offensiveFormation } : {}),
      ...(data.defensiveFormation ? { defensive_formation: data.defensiveFormation } : {}),
      ...(data.hashMark ? { hash_mark: data.hashMark } : {}),
    };

    const playerInserts = data.tagged.filter((tag) => !tag.isOpponent).map(t => ({
      player_id: t.player_id,
      role: t.role,
      credit: t.credit ?? null,
    }));

    const savedPlay = await insertPlay(playInsert, playerInserts);
    if (!savedPlay) { console.error("insertPlay returned null — check Supabase logs"); isSubmitting.current = false; setSelectedPlayType(null); return; }

    // Add to local play log
    const storedWorksheetRow = (storedPreview.playData.worksheet_row as Record<string, unknown> | undefined) ?? {};
    const localPlay: PlayRecord = {
      ...previewPlay,
      id: savedPlay.id,
      sequence: savedPlay.sequence,
      nextPossession: storedPreview.after.possession,
      nextDown: storedPreview.after.down,
      nextDistance: storedPreview.after.distance,
      nextBallOn: storedPreview.after.ballOn,
      playData: {
        ...storedPreview.playData,
        worksheet_row: {
          ...storedWorksheetRow,
          sequence: savedPlay.sequence,
        },
      },
    };
    setPlays(prev => [...prev, localPlay]);

    // Mark game live on first play
    if (plays.length === 0) await updateGameScore(gameId, ourScore, theirScore, "live");

    // ── Scoring ──
    const nextScore = resolution?.scoreAfter ?? storedPreview.scoreAfter;
    const nextOur = nextScore.us;
    const nextTheir = nextScore.them;

    if (nextOur !== ourScore || nextTheir !== theirScore) {
      setOurScore(nextOur); setTheirScore(nextTheir);
      await updateGameScore(gameId, nextOur, nextTheir);
    }

    // ── Game state advance ──
    const nextSituation = resolution?.afterSituation ?? storedPreview.after;
    if (data.penalty || data.playType.id === "blocked_kick") {
      queueSituationAdjustment(savedPlay.id, localPlay, before);
    } else {
      applySituation(nextSituation);
      if (shouldPromptForClockCapture(localPlay, before, nextSituation)) {
        openPostPlayClockCapture({
          play: localPlay,
          before,
          scoreBefore,
          resolved: resolution ? {
            afterSituation: resolution.afterSituation,
            scoreAfter: resolution.scoreAfter,
            events: resolution.events,
            engineSnapshot: resolution.engineSnapshot,
          } : undefined,
          reason: getClockCaptureReason(localPlay, before, nextSituation),
          patGatePossession: data.isTouchdown ? nextSituation.possession : undefined,
        });
      } else if (data.isTouchdown) {
        setPatGatePossession(nextSituation.possession);
        setShowPatGate(true);
      }
    }

    } catch (err) {
      console.error("Error in handlePlaySubmit:", err);
    } finally {
      setSelectedPlayType(null);
      isSubmitting.current = false;
    }
  };

  const handleRecordTimeout = useCallback(async () => {
    if (!gameId || !season || isSubmitting.current) return;

    const remaining = timeoutTeam === "us" ? timeoutState.ourRemaining : timeoutState.theirRemaining;
    if (remaining <= 0) {
      setShowTimeoutModal(false);
      return;
    }

    isSubmitting.current = true;

    try {
      const nextClock = Math.max(0, Math.min(gc.quarter_length_secs, (timeoutMins * 60) + timeoutSecs));
      const before: LiveSituationSnapshot = { possession, down, distance, ballOn };
      const scoreBefore: ScoreSnapshot = { us: ourScore, them: theirScore };
      const timeoutLabel = timeoutTeam === "us"
        ? (program?.name ?? "Team")
        : (game?.opponent?.name ?? "Opponent");
      const previewPlay: PlayRecord = {
        id: "pending-timeout",
        sequence: plays.length + 1,
        quarter,
        clock: nextClock,
        type: "timeout",
        yards: 0,
        result: "",
        penalty: null,
        flagYards: 0,
        isTouchdown: false,
        firstDown: false,
        turnover: false,
        tagged: [],
        ballOn,
        down,
        distance,
        description: `${timeoutLabel} timeout`,
        possession,
        nextPossession: possession,
        nextDown: down,
        nextDistance: distance,
        nextBallOn: ballOn,
        playData: {
          season_id: season.id,
          recorded_start_clock: fmtClock(nextClock),
          recorded_start_clock_seconds: nextClock,
          recorded_end_clock: fmtClock(nextClock),
          recorded_end_clock_seconds: nextClock,
          timeout_team: timeoutTeam,
          timeout_label: timeoutLabel,
          timeout_remaining_after: Math.max(0, remaining - 1),
          next_situation_source: "timeout",
        },
      };

      const storedPreview = buildStoredPlayData(previewPlay, before, scoreBefore);
      const savedPlay = await insertPlay({
        game_id: gameId,
        quarter,
        clock: fmtClock(nextClock),
        possession,
        down,
        distance,
        yard_line: ballOn,
        play_type: "timeout",
        play_data: storedPreview.playData,
        yards_gained: 0,
        is_touchdown: false,
        is_turnover: false,
        is_penalty: false,
        primary_player_id: null,
        description: previewPlay.description,
        end_yard_line: ballOn,
        play_start_time: nextClock,
        play_end_time: nextClock,
      }, []);

      if (!savedPlay) return;

      const storedWorksheetRow = (storedPreview.playData.worksheet_row as Record<string, unknown> | undefined) ?? {};
      const localPlay: PlayRecord = {
        ...previewPlay,
        id: savedPlay.id,
        sequence: savedPlay.sequence,
        playData: {
          ...storedPreview.playData,
          worksheet_row: {
            ...storedWorksheetRow,
            sequence: savedPlay.sequence,
          },
        },
      };

      setPlays((prev) => [...prev, localPlay]);
      setClock(nextClock);

      if (plays.length === 0) {
        await updateGameScore(gameId, ourScore, theirScore, "live");
      }

      setShowTimeoutModal(false);
    } catch (err) {
      console.error("Error in handleRecordTimeout:", err);
    } finally {
      isSubmitting.current = false;
    }
  }, [
    ballOn,
    clock,
    distance,
    down,
    gameId,
    gc.quarter_length_secs,
    ourScore,
    plays,
    possession,
    quarter,
    season,
    theirScore,
    timeoutMins,
    timeoutSecs,
    timeoutState.ourRemaining,
    timeoutState.theirRemaining,
    timeoutTeam,
    buildStoredPlayData,
    game?.opponent?.name,
    program?.name,
  ]);

  const closePendingClockCapture = useCallback((showPatGateAfter = false) => {
    const patPossession = pendingClockCapture?.patGatePossession;
    setShowPostPlayClockModal(false);
    setPendingClockCapture(null);
    if (showPatGateAfter && patPossession) {
      setPatGatePossession(patPossession);
      setShowPatGate(true);
    }
  }, [pendingClockCapture?.patGatePossession]);

  const handleRecordPostPlayClock = useCallback(async () => {
    if (!pendingClockCapture || isSubmitting.current) return;

    isSubmitting.current = true;

    try {
      const nextClock = Math.max(0, Math.min(gc.quarter_length_secs, (postPlayClockMins * 60) + postPlayClockSecs));
      const updatedPlay: PlayRecord = {
        ...pendingClockCapture.play,
        clock: nextClock,
        playData: {
          ...(pendingClockCapture.play.playData ?? {}),
          recorded_end_clock: fmtClock(nextClock),
          recorded_end_clock_seconds: nextClock,
        },
      };
      const stored = buildStoredPlayData(
        updatedPlay,
        pendingClockCapture.before,
        pendingClockCapture.scoreBefore,
        pendingClockCapture.resolved,
      );
      const saved = await updatePlaySituation(updatedPlay.id, {
        quarter: updatedPlay.quarter,
        clock: fmtClock(nextClock),
        possession: updatedPlay.possession,
        down: updatedPlay.down,
        distance: updatedPlay.distance,
        yard_line: updatedPlay.ballOn,
        end_yard_line: stored.after.ballOn,
        play_start_time: getStoredStartClock(updatedPlay),
        play_end_time: nextClock,
      }, stored.playData);

      if (!saved) return;

      const storedWorksheetRow = (stored.playData.worksheet_row as Record<string, unknown> | undefined) ?? {};
      setPlays((prev) => prev.map((play) => (
        play.id === updatedPlay.id
          ? {
              ...updatedPlay,
              nextPossession: stored.after.possession,
              nextDown: stored.after.down,
              nextDistance: stored.after.distance,
              nextBallOn: stored.after.ballOn,
              playData: {
                ...stored.playData,
                worksheet_row: {
                  ...storedWorksheetRow,
                  sequence: play.sequence ?? updatedPlay.sequence ?? null,
                },
              },
            }
          : play
      )));
      setClock(nextClock);
      closePendingClockCapture(true);
    } catch (err) {
      console.error("Error in handleRecordPostPlayClock:", err);
    } finally {
      isSubmitting.current = false;
    }
  }, [
    buildStoredPlayData,
    closePendingClockCapture,
    gc.quarter_length_secs,
    pendingClockCapture,
    postPlayClockMins,
    postPlayClockSecs,
  ]);

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
      primary_player_id: result.tagged.find((tag) => !tag.isOpponent)?.player_id ?? null,
      description: result.description,
      ...(result.offensiveFormation != null ? { offensive_formation: result.offensiveFormation } : {}),
      ...(result.defensiveFormation != null ? { defensive_formation: result.defensiveFormation } : {}),
      ...(result.hashMark != null ? { hash_mark: result.hashMark } : {}),
      play_data: {
        ...(original.playData ?? {}),
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
        next_situation_source: result.penalty || result.playType.id === "blocked_kick" ? "pending_review" : "auto",
      },
    }, result.tagged.filter((tag) => !tag.isOpponent).map(t => ({
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
      playData: {
        ...(original.playData ?? {}),
        result: result.result || null,
        is_first_down: result.isFirstDown,
        is_touchback: result.isTouchback,
        penalty_type: result.penalty,
        play_category: result.penaltyCategory ?? null,
        penalty_yards: result.flagYards,
        blocked_kick_type: result.blockedKickType ?? null,
        next_situation_source: result.penalty || result.playType.id === "blocked_kick" ? "pending_review" : "auto",
      },
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

  const changeQuarter = useCallback((delta: number) => {
    const targetQuarter = Math.max(1, Math.min(5, quarter + delta));
    if (targetQuarter === quarter) return;

    const liveSituation: LiveSituationSnapshot = { possession, down, distance, ballOn };
    quarterSnapshots.current[quarter] = { clock, situation: { ...liveSituation } };

    let transition: { quarter: number; clock: number; situation: LiveSituationSnapshot } | null = null;

    if (targetQuarter > quarter) {
      transition = moveToQuarter(quarter, targetQuarter, liveSituation, pregame, gc);
    } else {
      const savedSnapshot = quarterSnapshots.current[targetQuarter];
      if (savedSnapshot) {
        transition = {
          quarter: targetQuarter,
          clock: savedSnapshot.clock,
          situation: { ...savedSnapshot.situation },
        };
      } else {
        const priorPlays = plays.filter((play) => normalizeQuarter(play.quarter) <= targetQuarter);
        if (priorPlays.length > 0) {
          const rebuilt = rebuildPlaySituations(priorPlays, pregame, gc);
          transition = rebuilt.currentQuarter < targetQuarter
            ? moveToQuarter(rebuilt.currentQuarter, targetQuarter, rebuilt.currentSituation, pregame, gc)
            : { quarter: targetQuarter, clock: gc.quarter_length_secs, situation: rebuilt.currentSituation };
        } else {
          const startingSituation = createInitialSituation(pregame, gc);
          transition = targetQuarter > 1
            ? moveToQuarter(1, targetQuarter, startingSituation, pregame, gc)
            : { quarter: 1, clock: gc.quarter_length_secs, situation: startingSituation };
        }
      }
    }

    if (!transition) return;

    setQuarter(transition.quarter);
    setClock(transition.clock);
    applySituation(transition.situation);
  }, [applySituation, ballOn, clock, distance, down, gc, plays, possession, pregame, quarter]);

  const goToPreviousQuarter = useCallback(() => {
    changeQuarter(-1);
  }, [changeQuarter]);

  const goToNextQuarter = useCallback(() => {
    changeQuarter(1);
  }, [changeQuarter]);

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
          <button onClick={() => navigate("/")} className="btn-ghost p-2 cursor-pointer"><Home className="w-5 h-5" /></button>
          <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] flex-1">Game</h1>
        </div>
        <div className="text-surface-muted text-sm text-center py-12 animate-pulse font-body">Loading game...</div>
      </div>
    );
  }

  const oppName = game?.opponent?.name ?? "Opponent";
  const progName = program?.name ?? "Team";
  const primaryColor = program?.primary_color ?? "#ef4444";
  const oppColor = game?.opponent?.primary_color ?? "#6b7280";
  const progLogoUrl = program?.logo_url ?? null;
  const oppLogoUrl = game?.opponent?.logo_url ?? null;

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <button onClick={() => navigate("/")} className="btn-ghost p-2 cursor-pointer"><Home className="w-5 h-5" /></button>
        <h1 className="text-lg font-display font-extrabold uppercase tracking-[0.08em] flex-1 truncate">vs {oppName}</h1>
        <button onClick={() => navigate(`/game/${gameId}/summary`)} className="btn-ghost p-1.5 cursor-pointer" title="Game Stats">
          <BarChart3 className="w-4 h-4 text-surface-muted" />
        </button>
        <button onClick={() => setShowLog(true)} className="btn-ghost px-2 py-1 text-[10px] font-display font-bold text-surface-muted uppercase tracking-wider cursor-pointer">
          {plays.length} plays
        </button>
        <button onClick={() => setShowPregame(true)} className="btn-ghost px-2 py-1 text-[10px] font-display font-bold text-surface-muted uppercase tracking-wider cursor-pointer">
          Pregame
        </button>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-4 space-y-3">
        {/* Scoreboard */}
        <Scoreboard
          state={gameState}
          progName={progName}
          oppName={oppName}
          progAbbr={progAbbr}
          oppAbbr={oppAbbr}
          primaryColor={primaryColor}
          ballLabel={currentBallLabel}
          progLogoUrl={progLogoUrl}
          oppLogoUrl={oppLogoUrl}
          oppColor={oppColor}
          onPreviousQuarter={goToPreviousQuarter}
          onNextQuarter={goToNextQuarter}
          canPreviousQuarter={quarter > 1}
          canNextQuarter={quarter < 5}
          onEditClock={() => { setClockMins(Math.floor(clock / 60)); setClockSecs(clock % 60); setShowClockEditor(true); }}
          onEndGame={() => setShowEndGame(true)}
          onSetDown={setDown}
          onAdjustDistance={adjustDistance}
          onAdjustBall={adjustBall}
          onEditBall={openBallEditor}
          ourTimeoutsRemaining={timeoutState.ourRemaining}
          theirTimeoutsRemaining={timeoutState.theirRemaining}
          onTakeTimeout={openTimeoutModal}
        />

        {/* Field */}
        <FieldVisualizer
          ballOn={ballOn}
          ballPosition={ballDisplayPosition}
          firstDownPosition={firstDownDisplayPosition}
          possession={possession}
          ourEndZoneSide={ourEndZoneSide}
          primaryColor={primaryColor}
          progName={progName}
          oppName={oppName}
          progAbbr={progAbbr}
          oppAbbr={oppAbbr}
          progLogoUrl={progLogoUrl}
          oppLogoUrl={oppLogoUrl}
          oppColor={oppColor}
          onFlipDirection={() => setDirectionFlipped((current) => !current)}
        />

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
              <div className="stat-label text-[8px]">{s.label}</div>
              <div className="text-xs font-display font-extrabold tabular-nums">{s.val}</div>
            </div>
          ))}
        </div>

        {/* Quick Action Grid */}
        <div className="card p-3">
          <QuickActions
            onSelect={handlePlayTypeSelect}
            possession={possession}
            progName={progName}
            oppName={oppName}
            suggestedPhase={suggestedPhase}
          />
        </div>

        {/* Recent Plays */}
        {plays.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-title mb-0">Recent Plays</span>
              <div className="flex items-center gap-3">
                <button onClick={handleUndo} className="text-[10px] font-display font-bold text-red-400 flex items-center gap-1 uppercase tracking-wider cursor-pointer">
                  <RotateCcw className="w-3 h-3" /> Undo
                </button>
                <button onClick={() => setShowLog(true)} className="text-[10px] font-display font-bold text-dragon-primary uppercase tracking-wider cursor-pointer">
                  All {plays.length}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {plays.slice(-5).reverse().map(play => (
                <button key={play.id}
                  onClick={() => { if (play.type !== "timeout") setEditPlay(play); }}
                  className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 border border-surface-border bg-surface-card text-left ${
                    play.type === "timeout" ? "" : "active:bg-surface-hover cursor-pointer"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-body font-semibold truncate">{play.description}</div>
                    <div className="text-[10px] text-surface-muted font-body">
                      {QUARTER_LABELS[play.quarter]} · {fmtClock(play.clock)} · {play.down}{play.down === 1 ? "st" : play.down === 2 ? "nd" : play.down === 3 ? "rd" : "th"}&{play.distance}
                    </div>
                  </div>
                  <div className={`text-xs font-display font-extrabold tabular-nums ${
                    play.type === "timeout"
                      ? "text-amber-300"
                      : play.yards > 0
                        ? "text-emerald-400"
                        : play.yards < 0
                          ? "text-red-400"
                          : "text-surface-muted"
                  }`}>
                    {play.type === "timeout" ? "TO" : play.yards > 0 ? `+${play.yards}` : play.yards}
                  </div>
                  {play.isTouchdown && <span className="text-[10px] font-display font-bold text-amber-400 uppercase tracking-wider">TD</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigate to summary */}
        {plays.length > 0 && (
          <button onClick={() => navigate(`/game/${gameId}/summary`)}
            className="w-full text-center py-2 text-[11px] font-display font-bold text-dragon-primary uppercase tracking-wider cursor-pointer">
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
          progName={progName}
          oppName={oppName}
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
            progName={progName}
            oppName={oppName}
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

      {showPostPlayClockModal && pendingClockCapture && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel p-6 space-y-3 max-w-xs mx-auto">
            <h2 className="text-sm font-black text-center">Update Play Clock</h2>
            <div className="text-xs text-neutral-500 text-center">
              Enter the game clock {pendingClockCapture.reason}
            </div>
            <div className="flex items-center justify-center gap-2">
              <input
                type="number"
                min={0}
                max={Math.floor(gc.quarter_length_secs / 60)}
                value={postPlayClockMins}
                onChange={e => setPostPlayClockMins(Math.max(0, Number(e.target.value) || 0))}
                className="input w-16 text-center text-xl font-black"
              />
              <span className="text-xl font-black">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={postPlayClockSecs}
                onChange={e => setPostPlayClockSecs(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="input w-16 text-center text-xl font-black"
              />
            </div>
            <button onClick={handleRecordPostPlayClock} className="btn-primary w-full text-sm">Save Clock</button>
            <button onClick={() => closePendingClockCapture(true)} className="w-full text-xs text-neutral-500 font-bold py-1">Skip For Now</button>
          </div>
        </div>
      )}

      {showTimeoutModal && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel p-6 space-y-3 max-w-xs mx-auto">
            <h2 className="text-sm font-black text-center">Record Timeout</h2>
            <div className="text-xs text-neutral-500 text-center">
              {timeoutTeam === "us" ? progName : oppName} timeout in {quarterLabel(quarter)}
            </div>
            <div className="flex items-center justify-center gap-2">
              <input
                type="number"
                min={0}
                max={Math.floor(gc.quarter_length_secs / 60)}
                value={timeoutMins}
                onChange={e => setTimeoutMins(Math.max(0, Number(e.target.value) || 0))}
                className="input w-16 text-center text-xl font-black"
              />
              <span className="text-xl font-black">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={timeoutSecs}
                onChange={e => setTimeoutSecs(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                className="input w-16 text-center text-xl font-black"
              />
            </div>
            <button onClick={handleRecordTimeout} className="btn-primary w-full text-sm">Record Timeout</button>
            <button onClick={() => setShowTimeoutModal(false)} className="w-full text-xs text-neutral-500 font-bold py-1">Cancel</button>
          </div>
        </div>
      )}

      {showBallEditor && (
        <div className="sheet bg-black/80">
          <div className="sheet-panel p-6 space-y-3 max-w-xs mx-auto">
            <h2 className="text-sm font-black text-center">Set Line Of Scrimmage</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "program" as const, label: progName },
                { value: "opponent" as const, label: oppName },
              ]).map((side) => (
                <button
                  key={side.value}
                  onClick={() => setBallEditSide(side.value)}
                  className={`py-2 rounded-xl text-xs font-bold border-2 uppercase transition-colors ${
                    ballEditSide === side.value
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                      : "border-surface-border bg-surface-bg text-neutral-500"
                  }`}
                >
                  {side.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const nextValue = Math.max(1, ballEditYard - 5);
                setBallEditYard(nextValue);
                setBallEditRaw(String(nextValue));
              }} className="btn-ghost px-2 py-2 text-xs font-bold cursor-pointer">-5</button>
              <button onClick={() => {
                const nextValue = Math.max(1, ballEditYard - 1);
                setBallEditYard(nextValue);
                setBallEditRaw(String(nextValue));
              }} className="btn-ghost px-2 py-2 text-xs font-bold cursor-pointer">-1</button>
              <input
                type="number"
                min={1}
                max={50}
                value={ballEditRaw}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setBallEditRaw(nextValue);
                  const parsed = Number(nextValue);
                  if (Number.isFinite(parsed)) {
                    setBallEditYard(Math.max(1, Math.min(50, parsed)));
                  }
                }}
                onBlur={() => setBallEditRaw(String(ballEditYard))}
                className="input flex-1 text-center text-lg font-black tabular-nums"
              />
              <button onClick={() => {
                const nextValue = Math.min(50, ballEditYard + 1);
                setBallEditYard(nextValue);
                setBallEditRaw(String(nextValue));
              }} className="btn-ghost px-2 py-2 text-xs font-bold cursor-pointer">+1</button>
              <button onClick={() => {
                const nextValue = Math.min(50, ballEditYard + 5);
                setBallEditYard(nextValue);
                setBallEditRaw(String(nextValue));
              }} className="btn-ghost px-2 py-2 text-xs font-bold cursor-pointer">+5</button>
            </div>
            <div className="text-xs text-neutral-500 text-center">
              {ballEditSide === "program" ? progAbbr : oppAbbr} {ballEditYard}
            </div>
            <button onClick={applyBallEdit} className="btn-primary w-full text-sm">Set</button>
            <button onClick={() => setShowBallEditor(false)} className="w-full text-xs text-neutral-500 font-bold py-1">Cancel</button>
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
                {([
                  { value: "us" as const, label: progName },
                  { value: "them" as const, label: oppName },
                ]).map((team) => (
                  <button
                    key={team.value}
                    onClick={() => setAdjPossession(team.value)}
                    className={`py-2 rounded-xl text-xs font-bold border-2 uppercase transition-colors ${
                      adjPossession === team.value
                        ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary"
                        : "border-surface-border bg-surface-bg text-neutral-500"
                    }`}
                  >
                    {team.label}
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
