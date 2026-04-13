import {
  FootballStatsEngine,
  CoinTossChoice,
  PlayType,
  PassResult,
  RushResult,
  SpecialTeamsResult,
  KickResult,
  PenaltyEnforcement,
  type GameEvent,
  type GameStateSnapshot,
  type Play,
  type PlayContext,
  type PassPlay,
  type RushPlay,
  type SpecialTeamsPlay,
  type PenaltyPlay,
  type FumbleEvent,
  type PenaltyEvent,
} from "football-stats-engine";
import {
  getPenaltyDefaultSide,
  getPenaltyEngineCode,
  type PenaltySide,
  type TaggedPlayer,
  type PlayRecord,
  type GameState,
} from "@/components/game/types";
import {
  advanceSituationAfterPlay,
  createInitialSituation,
  getRecordedNextSituation,
  moveToQuarter,
  normalizeQuarter,
  type LiveSituation,
  type PregameConfig,
} from "./gameFlow";
import type { GameConfig } from "./programService";

export interface LiveSessionConfig {
  gameId: string;
  programTeamId: string;
  programName: string;
  programAbbreviation: string;
  opponentTeamId: string;
  opponentName: string;
  opponentAbbreviation: string;
  isHome: boolean;
  gameConfig: GameConfig;
  rulesConfig?: Record<string, unknown> | null;
  pregame: PregameConfig | null;
}

export interface LiveSessionScore {
  us: number;
  them: number;
}

export interface LiveSessionPlayResult {
  play: PlayRecord;
  beforeState: GameState;
  beforeSituation: LiveSituation;
  afterSituation: LiveSituation;
  scoreBefore: LiveSessionScore;
  scoreAfter: LiveSessionScore;
  nextState: GameState;
  events: GameEvent[];
  engineSnapshot: GameStateSnapshot | null;
}

export interface LiveSessionReplay {
  playResults: LiveSessionPlayResult[];
  currentState: GameState;
  score: LiveSessionScore;
  engineSnapshot: GameStateSnapshot | null;
  allEvents: GameEvent[];
}

function getRuleLevel(rulesConfig: Record<string, unknown> | null | undefined): "nfl" | "college" | "high_school" {
  const level = rulesConfig?.level;
  return level === "nfl" || level === "college" || level === "high_school"
    ? level
    : "high_school";
}

function getCustomRules(rulesConfig: Record<string, unknown> | null | undefined) {
  const quarterLengthMinutes = Number(rulesConfig?.quarterLengthMinutes);
  if (!Number.isFinite(quarterLengthMinutes) || quarterLengthMinutes <= 0) {
    return undefined;
  }

  return { quarterLengthSeconds: Math.round(quarterLengthMinutes * 60) };
}

function createEngine(config: LiveSessionConfig): FootballStatsEngine {
  const engine = new FootballStatsEngine({
    enableGameState: true,
    rules: getRuleLevel(config.rulesConfig),
    ...(getCustomRules(config.rulesConfig) ? { customRules: getCustomRules(config.rulesConfig) } : {}),
    trackSituationalSplits: true,
    trackDrives: true,
    computePasserRating: true,
  });

  const homeTeam = config.isHome
    ? { id: config.programTeamId, name: config.programName, abbreviation: config.programAbbreviation }
    : { id: config.opponentTeamId, name: config.opponentName, abbreviation: config.opponentAbbreviation };
  const awayTeam = config.isHome
    ? { id: config.opponentTeamId, name: config.opponentName, abbreviation: config.opponentAbbreviation }
    : { id: config.programTeamId, name: config.programName, abbreviation: config.programAbbreviation };

  engine.setTeams(homeTeam, awayTeam);

  if (config.pregame) {
    const openingKickoffReceiver = config.pregame.openingKickoffReceiver === "us"
      ? config.programTeamId
      : config.opponentTeamId;
    const secondHalfKickoffReceiver = openingKickoffReceiver === config.programTeamId
      ? config.opponentTeamId
      : config.programTeamId;
    const coinTossWinner = config.pregame.tossWinner === "us"
      ? config.programTeamId
      : config.opponentTeamId;
    const coinTossChoiceMap: Record<string, CoinTossChoice> = {
      receive: CoinTossChoice.Receive,
      kick: CoinTossChoice.Kick,
      defer: CoinTossChoice.Defer,
      defend_goal: CoinTossChoice.DefendGoal,
    };

    engine.configureKickoffReceivers(
      openingKickoffReceiver,
      secondHalfKickoffReceiver,
      coinTossWinner,
      coinTossChoiceMap[config.pregame.tossChoice],
    );
  }

  return engine;
}

function initialScore(): LiveSessionScore {
  return { us: 0, them: 0 };
}

export function createInitialGameState(config: LiveSessionConfig): GameState {
  const initialSituation = createInitialSituation(config.pregame, config.gameConfig);
  return {
    quarter: 1,
    clock: config.gameConfig.quarter_length_secs,
    possession: initialSituation.possession,
    down: initialSituation.down,
    distance: initialSituation.distance,
    ballOn: initialSituation.ballOn,
    ourScore: 0,
    theirScore: 0,
  };
}

export function advanceLiveQuarterState(
  state: GameState,
  config: LiveSessionConfig,
  targetQuarter = Math.min(5, state.quarter + 1),
): GameState {
  const transition = moveToQuarter(
    state.quarter,
    targetQuarter,
    {
      possession: state.possession,
      down: state.down,
      distance: state.distance,
      ballOn: state.ballOn,
    },
    config.pregame,
    config.gameConfig,
  );

  return {
    ...state,
    quarter: transition.quarter,
    clock: transition.clock,
    possession: transition.situation.possession,
    down: transition.situation.down,
    distance: transition.situation.distance,
    ballOn: transition.situation.ballOn,
  };
}

function getTeamId(side: "us" | "them", config: LiveSessionConfig): string {
  return side === "us" ? config.programTeamId : config.opponentTeamId;
}

function otherTeamId(teamId: string, config: LiveSessionConfig): string {
  return teamId === config.programTeamId ? config.opponentTeamId : config.programTeamId;
}

function mapBoardScore(score: LiveSessionScore, config: LiveSessionConfig) {
  return config.isHome
    ? { homeScore: score.us, awayScore: score.them }
    : { homeScore: score.them, awayScore: score.us };
}

function firstTaggedPlayer(play: PlayRecord, role: string): TaggedPlayer | undefined {
  return play.tagged.find((tag) => tag.role === role);
}

function playersByRole(play: PlayRecord, role: string): string[] {
  return play.tagged.filter((tag) => tag.role === role).map((tag) => tag.player_id);
}

function genericPlayerId(play: PlayRecord, role: string, config: LiveSessionConfig): string {
  return `${getTeamId(play.possession, config)}:${role}`;
}

function buildPenalties(play: PlayRecord, config: LiveSessionConfig): PenaltyEvent[] | undefined {
  if (!play.penalty) return undefined;

  const possTeamId = getTeamId(play.possession, config);
  const explicitSide = play.penaltyCategory ?? getPenaltyDefaultSide(play.penalty);
  const team = explicitSide === "defense"
    ? otherTeamId(possTeamId, config)
    : possTeamId;

  return [{
    penaltyType: getPenaltyEngineCode(play.penalty) ?? play.penalty.toLowerCase().replace(/\s+/g, "_"),
    team,
    yards: play.flagYards || 5,
    enforcement: PenaltyEnforcement.Accepted,
  }];
}

function buildFumble(play: PlayRecord, ballCarrier: string, config: LiveSessionConfig): FumbleEvent | undefined {
  const recoverer = firstTaggedPlayer(play, "fumble_recovery");
  const forcer = firstTaggedPlayer(play, "forced_fumble");
  if (!recoverer && !forcer && !play.turnover) return undefined;

  const possTeamId = getTeamId(play.possession, config);
  return {
    fumbledBy: ballCarrier,
    forcedBy: forcer?.player_id,
    recoveredBy: recoverer?.player_id,
    recoveryTeam: play.turnover ? otherTeamId(possTeamId, config) : possTeamId,
  };
}

function buildPlayContext(
  state: GameState,
  scoreBefore: LiveSessionScore,
  config: LiveSessionConfig,
): PlayContext {
  const boardScore = mapBoardScore(scoreBefore, config);
  return {
    gameId: config.gameId,
    quarter: normalizeQuarter(state.quarter),
    gameClock: `${Math.floor(state.clock / 60)}:${String(state.clock % 60).padStart(2, "0")}`,
    down: Math.max(1, Math.min(4, state.down)) as PlayContext["down"],
    distance: state.distance,
    yardLine: state.ballOn,
    possessionTeam: getTeamId(state.possession, config),
    homeTeam: config.isHome ? config.programTeamId : config.opponentTeamId,
    awayTeam: config.isHome ? config.opponentTeamId : config.programTeamId,
    homeScore: boardScore.homeScore,
    awayScore: boardScore.awayScore,
    isRedZone: state.ballOn >= 80,
  };
}

function toEnginePlay(
  play: PlayRecord,
  stateBefore: GameState,
  scoreBefore: LiveSessionScore,
  config: LiveSessionConfig,
): Play | null {
  const context = buildPlayContext(stateBefore, scoreBefore, config);
  const penalties = buildPenalties(play, config);

  switch (play.type) {
    case "rush": {
      const rusher = firstTaggedPlayer(play, "rusher")?.player_id ?? genericPlayerId(play, "rusher", config);
      return {
        type: PlayType.Rush,
        rusher,
        result: play.isTouchdown ? RushResult.Touchdown : RushResult.Normal,
        yardsGained: play.yards,
        isTouchdown: play.isTouchdown,
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
        fumble: buildFumble(play, rusher, config),
        penalties,
        description: play.description || undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }
    case "kneel": {
      const rusher = firstTaggedPlayer(play, "rusher")?.player_id ?? genericPlayerId(play, "rusher", config);
      return {
        type: PlayType.Rush,
        rusher,
        result: RushResult.Kneel,
        yardsGained: play.yards,
        isTouchdown: false,
        isKneel: true,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }
    case "spike": {
      const passer = firstTaggedPlayer(play, "passer")?.player_id ?? genericPlayerId(play, "passer", config);
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.SpikeBall,
        yardsGained: 0,
        isTouchdown: false,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }
    case "pass_comp": {
      const passer = firstTaggedPlayer(play, "passer")?.player_id ?? genericPlayerId(play, "passer", config);
      const receiver = firstTaggedPlayer(play, "receiver")?.player_id;
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Complete,
        target: receiver,
        receiver,
        yardsGained: play.yards,
        isTouchdown: play.isTouchdown,
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
        fumble: buildFumble(play, receiver ?? passer, config),
        penalties,
        description: play.description || undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }
    case "pass_inc": {
      const passer = firstTaggedPlayer(play, "passer")?.player_id ?? genericPlayerId(play, "passer", config);
      const target = firstTaggedPlayer(play, "target")?.player_id ?? firstTaggedPlayer(play, "receiver")?.player_id;
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Incomplete,
        target,
        yardsGained: 0,
        isTouchdown: false,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }
    case "sack": {
      const passer = firstTaggedPlayer(play, "passer")?.player_id ?? genericPlayerId(play, "passer", config);
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Sack,
        yardsGained: play.yards,
        isTouchdown: false,
        tackledBy: playersByRole(play, "sacker"),
        penalties,
        description: play.description || undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }
    case "int": {
      const passer = firstTaggedPlayer(play, "passer")?.player_id ?? genericPlayerId(play, "passer", config);
      const interceptor = firstTaggedPlayer(play, "interceptor")?.player_id;
      const interceptionReturnYards = typeof play.playData?.interception_return_yards === "number"
        ? play.playData.interception_return_yards
        : play.yards > 0 ? play.yards : undefined;
      return {
        type: PlayType.Pass,
        passer,
        result: PassResult.Interception,
        yardsGained: play.yards,
        isTouchdown: play.isTouchdown,
        interceptedBy: interceptor,
        interceptionReturnYards,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies PassPlay & { context: PlayContext } as Play;
    }
    case "fumble": {
      const rusher = firstTaggedPlayer(play, "rusher")?.player_id ?? genericPlayerId(play, "rusher", config);
      return {
        type: PlayType.Rush,
        rusher,
        result: RushResult.Fumble,
        yardsGained: play.yards,
        isTouchdown: play.isTouchdown,
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
        fumble: buildFumble(play, rusher, config),
        penalties,
        description: play.description || undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }
    case "kickoff": {
      return {
        type: PlayType.Kickoff,
        kicker: firstTaggedPlayer(play, "kicker")?.player_id,
        returner: firstTaggedPlayer(play, "returner")?.player_id,
        result: play.isTouchback ? SpecialTeamsResult.Touchback : (play.isTouchdown ? SpecialTeamsResult.ReturnTouchdown : SpecialTeamsResult.Normal),
        returnYards: firstTaggedPlayer(play, "returner") ? play.yards : undefined,
        isTouchback: play.isTouchback,
        isTouchdown: play.isTouchdown,
        tackledBy: playersByRole(play, "tackler"),
        penalties,
        description: play.description || undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }
    case "punt": {
      return {
        type: PlayType.Punt,
        punter: firstTaggedPlayer(play, "punter")?.player_id,
        returner: firstTaggedPlayer(play, "returner")?.player_id,
        result: play.isTouchback ? SpecialTeamsResult.Touchback : (play.isTouchdown ? SpecialTeamsResult.ReturnTouchdown : SpecialTeamsResult.Normal),
        returnYards: firstTaggedPlayer(play, "returner") ? play.yards : undefined,
        isTouchback: play.isTouchback,
        isTouchdown: play.isTouchdown,
        tackledBy: playersByRole(play, "tackler"),
        penalties,
        description: play.description || undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }
    case "fg": {
      return {
        type: PlayType.FieldGoal,
        kicker: firstTaggedPlayer(play, "kicker")?.player_id,
        result: play.result === "Good" ? KickResult.Good : KickResult.NoGood,
        isTouchdown: false,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }
    case "pat": {
      return {
        type: PlayType.ExtraPoint,
        kicker: firstTaggedPlayer(play, "kicker")?.player_id,
        result: play.result === "Good" ? KickResult.Good : KickResult.NoGood,
        isTouchdown: false,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }
    case "two_pt": {
      const passer = firstTaggedPlayer(play, "passer")?.player_id;
      const receiver = firstTaggedPlayer(play, "receiver")?.player_id;
      const rusher = firstTaggedPlayer(play, "rusher")?.player_id ?? genericPlayerId(play, "rusher", config);
      const isGood = play.result === "Good";

      if (passer) {
        return {
          type: PlayType.Pass,
          passer,
          result: receiver && isGood ? PassResult.Complete : PassResult.Incomplete,
          target: receiver,
          receiver: isGood ? receiver : undefined,
          yardsGained: isGood ? 3 : 0,
          isTouchdown: isGood,
          isTwoPointConversion: true,
          description: play.description || undefined,
          context,
        } satisfies PassPlay & { context: PlayContext } as Play;
      }

      return {
        type: PlayType.Rush,
        rusher,
        result: isGood ? RushResult.Touchdown : RushResult.Normal,
        yardsGained: isGood ? 3 : 0,
        isTouchdown: isGood,
        isTwoPointConversion: true,
        description: play.description || undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }
    case "blocked_kick": {
      const blockedBy = firstTaggedPlayer(play, "blocker")?.player_id;
      const blockedKickType = play.blockedKickType;

      if (blockedKickType === "punt") {
        return {
          type: PlayType.Punt,
          punter: firstTaggedPlayer(play, "punter")?.player_id,
          returner: firstTaggedPlayer(play, "returner")?.player_id,
          result: SpecialTeamsResult.Block,
          isBlocked: true,
          blockedBy,
          isTouchdown: play.isTouchdown,
          penalties,
          description: play.description || undefined,
          context,
        } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
      }
      if (blockedKickType === "kickoff") {
        return {
          type: PlayType.Kickoff,
          kicker: firstTaggedPlayer(play, "kicker")?.player_id,
          returner: firstTaggedPlayer(play, "returner")?.player_id,
          result: SpecialTeamsResult.Block,
          isBlocked: true,
          blockedBy,
          isTouchdown: play.isTouchdown,
          penalties,
          description: play.description || undefined,
          context,
        } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
      }
      return {
        type: blockedKickType === "extra_point" ? PlayType.ExtraPoint : PlayType.FieldGoal,
        result: KickResult.Blocked,
        isBlocked: true,
        blockedBy,
        isTouchdown: play.isTouchdown,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies SpecialTeamsPlay & { context: PlayContext } as Play;
    }
    case "safety": {
      const defenderRush = genericPlayerId(play, "opponent", config);
      return {
        type: PlayType.Rush,
        rusher: defenderRush,
        result: RushResult.Normal,
        yardsGained: play.yards,
        isTouchdown: false,
        tackledBy: playersByRole(play, "tackler"),
        assistedTackle: playersByRole(play, "assist"),
        penalties,
        description: play.description || undefined,
        context,
      } satisfies RushPlay & { context: PlayContext } as Play;
    }
    case "penalty_only": {
      if (!penalties || penalties.length === 0) return null;
      return {
        type: PlayType.Penalty,
        penalties,
        description: play.description || undefined,
        context,
      } satisfies PenaltyPlay & { context: PlayContext } as Play;
    }
    default:
      return null;
  }
}

function applyScoreDelta(play: PlayRecord, before: LiveSessionScore): LiveSessionScore {
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

function getBeforeStateForPlay(
  play: PlayRecord,
  scoreBefore: LiveSessionScore,
): GameState {
  return {
    quarter: normalizeQuarter(play.quarter),
    clock: play.clock,
    possession: play.possession,
    down: play.down,
    distance: play.distance,
    ballOn: play.ballOn,
    ourScore: scoreBefore.us,
    theirScore: scoreBefore.them,
  };
}

export function replayLiveGame(
  plays: PlayRecord[],
  config: LiveSessionConfig,
): LiveSessionReplay {
  const engine = createEngine(config);
  const playResults: LiveSessionPlayResult[] = [];
  const allEvents: GameEvent[] = [];
  let score = initialScore();
  let currentState = createInitialGameState(config);

  for (const play of plays) {
    const beforeState = getBeforeStateForPlay(play, score);
    const beforeSituation: LiveSituation = {
      possession: beforeState.possession,
      down: beforeState.down,
      distance: beforeState.distance,
      ballOn: beforeState.ballOn,
    };
    const afterSituation = getRecordedNextSituation(play) ?? advanceSituationAfterPlay(play, beforeSituation, config.gameConfig);
    const enginePlay = toEnginePlay(play, beforeState, score, config);
    let events: GameEvent[] = [];

    if (enginePlay) {
      events = engine.processPlay(enginePlay).events;
      allEvents.push(...events);
    }

    const scoreAfter = applyScoreDelta(play, score);
    const nextState: GameState = {
      quarter: normalizeQuarter(play.quarter),
      clock: play.clock,
      possession: afterSituation.possession,
      down: afterSituation.down,
      distance: afterSituation.distance,
      ballOn: afterSituation.ballOn,
      ourScore: scoreAfter.us,
      theirScore: scoreAfter.them,
    };

    playResults.push({
      play,
      beforeState,
      beforeSituation,
      afterSituation,
      scoreBefore: score,
      scoreAfter,
      nextState,
      events,
      engineSnapshot: engine.getGameStateSnapshot(),
    });

    score = scoreAfter;
    currentState = nextState;
  }

  return {
    playResults,
    currentState: plays.length > 0 ? currentState : createInitialGameState(config),
    score,
    engineSnapshot: engine.getGameStateSnapshot(),
    allEvents,
  };
}
