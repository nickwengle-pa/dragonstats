import {
  type PenaltySide,
  isPenaltyOnOffense,
  type PlayRecord,
} from "@/components/game/types";
import type { GameConfig } from "./programService";

export type TeamSide = "us" | "them";
export type FieldDirection = "left" | "right";
export type TossChoice = "receive" | "kick" | "defer" | "defend_goal";

export interface PregameConfig {
  tossWinner: TeamSide;
  tossChoice: TossChoice;
  openingKickoffReceiver: TeamSide;
  ourDriveDirectionQ1: FieldDirection;
}

export interface LiveSituation {
  possession: TeamSide;
  down: number;
  distance: number;
  ballOn: number;
}

interface GameRulesCarrier {
  rules_config?: Record<string, unknown> | null;
  opening_kickoff_receiver?: string | null;
  direction?: string | null;
}

interface AdvanceablePlay {
  type: string;
  yards: number;
  result: string;
  penalty: string | null;
  penaltyCategory?: PenaltySide | null;
  flagYards: number;
  isTouchdown: boolean;
  firstDown: boolean;
  isTouchback?: boolean;
  blockedKickType?: string | null;
  nextPossession?: TeamSide;
  nextDown?: number;
  nextDistance?: number;
  nextBallOn?: number;
}

const DEFAULT_PREGAME: PregameConfig = {
  tossWinner: "us",
  tossChoice: "receive",
  openingKickoffReceiver: "us",
  ourDriveDirectionQ1: "right",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isTeamSide(value: unknown): value is TeamSide {
  return value === "us" || value === "them";
}

function isFieldDirection(value: unknown): value is FieldDirection {
  return value === "left" || value === "right";
}

function isTossChoice(value: unknown): value is TossChoice {
  return value === "receive" || value === "kick" || value === "defer" || value === "defend_goal";
}

function parseStoredDirection(value: unknown): FieldDirection | null {
  if (isFieldDirection(value)) return value;
  if (value === "left-to-right") return "right";
  if (value === "right-to-left") return "left";
  return null;
}

function clampBallOn(ballOn: number): number {
  return Math.max(0, Math.min(100, ballOn));
}

function flipFieldPosition(ballOn: number): number {
  return Math.max(1, 100 - Math.max(1, clampBallOn(ballOn)));
}

export function oppositeTeam(team: TeamSide): TeamSide {
  return team === "us" ? "them" : "us";
}

export function oppositeFieldDirection(direction: FieldDirection): FieldDirection {
  return direction === "left" ? "right" : "left";
}

export function normalizeQuarter(quarter: number | null | undefined): number {
  if (!quarter || quarter < 1) return 1;
  return Math.min(Math.round(quarter), 5);
}

export function createDefaultPregameConfig(): PregameConfig {
  return { ...DEFAULT_PREGAME };
}

export function deriveOpeningKickoffReceiver(
  tossWinner: TeamSide,
  tossChoice: TossChoice,
  explicitOpeningKickoffReceiver?: TeamSide | null,
): TeamSide {
  if (tossChoice === "receive") return tossWinner;
  if (tossChoice === "kick") return oppositeTeam(tossWinner);
  if (explicitOpeningKickoffReceiver) return explicitOpeningKickoffReceiver;
  return oppositeTeam(tossWinner);
}

export function normalizePregameConfig(raw?: Partial<PregameConfig> | null): PregameConfig {
  const tossWinner = isTeamSide(raw?.tossWinner) ? raw.tossWinner : DEFAULT_PREGAME.tossWinner;
  const tossChoice = isTossChoice(raw?.tossChoice) ? raw.tossChoice : DEFAULT_PREGAME.tossChoice;
  const explicitOpeningKickoffReceiver = isTeamSide(raw?.openingKickoffReceiver)
    ? raw.openingKickoffReceiver
    : null;

  return {
    tossWinner,
    tossChoice,
    openingKickoffReceiver: deriveOpeningKickoffReceiver(
      tossWinner,
      tossChoice,
      explicitOpeningKickoffReceiver,
    ),
    ourDriveDirectionQ1: isFieldDirection(raw?.ourDriveDirectionQ1)
      ? raw.ourDriveDirectionQ1
      : DEFAULT_PREGAME.ourDriveDirectionQ1,
  };
}

export function getPregameConfig(game: GameRulesCarrier | null | undefined): PregameConfig | null {
  if (!game) return null;

  const rulesConfig = asRecord(game.rules_config);
  const pregame = asRecord(rulesConfig?.pregame);
  const direction = parseStoredDirection(pregame?.ourDriveDirectionQ1) ?? parseStoredDirection(game.direction);
  const openingKickoffReceiver = isTeamSide(game.opening_kickoff_receiver)
    ? game.opening_kickoff_receiver
    : isTeamSide(pregame?.openingKickoffReceiver)
      ? pregame.openingKickoffReceiver
      : null;

  if (!pregame && !direction && !openingKickoffReceiver) return null;

  return normalizePregameConfig({
    tossWinner: isTeamSide(pregame?.tossWinner) ? pregame.tossWinner : undefined,
    tossChoice: isTossChoice(pregame?.tossChoice) ? pregame.tossChoice : undefined,
    openingKickoffReceiver: openingKickoffReceiver ?? undefined,
    ourDriveDirectionQ1: direction ?? undefined,
  });
}

export function buildPregameGameUpdate(
  rulesConfig: Record<string, unknown> | null | undefined,
  pregame: PregameConfig,
): {
  rules_config: Record<string, unknown>;
  direction: FieldDirection;
  opening_kickoff_receiver: TeamSide;
} {
  const nextRules = { ...(rulesConfig ?? {}) };
  nextRules.pregame = {
    tossWinner: pregame.tossWinner,
    tossChoice: pregame.tossChoice,
    openingKickoffReceiver: pregame.openingKickoffReceiver,
    ourDriveDirectionQ1: pregame.ourDriveDirectionQ1,
  };

  return {
    rules_config: nextRules,
    direction: pregame.ourDriveDirectionQ1,
    opening_kickoff_receiver: pregame.openingKickoffReceiver,
  };
}

export function resolveGameConfig(
  baseConfig: GameConfig,
  rulesConfig: Record<string, unknown> | null | undefined,
): GameConfig {
  const nextConfig = { ...baseConfig };
  const minutes = Number(asRecord(rulesConfig)?.quarterLengthMinutes);

  if (Number.isFinite(minutes) && minutes > 0) {
    nextConfig.quarter_length_secs = Math.round(minutes * 60);
  }

  return nextConfig;
}

export function getSecondHalfKickoffReceiver(pregame: PregameConfig): TeamSide {
  return oppositeTeam(pregame.openingKickoffReceiver);
}

export function createKickoffSituation(
  kickingTeam: TeamSide,
  config: GameConfig,
  yardLine = config.kickoff_yard_line,
): LiveSituation {
  return {
    possession: kickingTeam,
    down: 1,
    distance: config.first_down_distance,
    ballOn: yardLine,
  };
}

export function createInitialSituation(
  pregame: PregameConfig | null,
  config: GameConfig,
): LiveSituation {
  if (!pregame) return createKickoffSituation("us", config);
  return createKickoffSituation(oppositeTeam(pregame.openingKickoffReceiver), config);
}

export function createSecondHalfSituation(
  pregame: PregameConfig | null,
  config: GameConfig,
): LiveSituation {
  if (!pregame) return createKickoffSituation("us", config);
  return createKickoffSituation(oppositeTeam(getSecondHalfKickoffReceiver(pregame)), config);
}

export function moveToQuarter(
  currentQuarter: number,
  targetQuarter: number,
  currentSituation: LiveSituation,
  pregame: PregameConfig | null,
  config: GameConfig,
): { quarter: number; clock: number; situation: LiveSituation } {
  let quarter = normalizeQuarter(currentQuarter);
  const finalQuarter = normalizeQuarter(targetQuarter);
  let situation = { ...currentSituation };

  while (quarter < finalQuarter) {
    quarter += 1;
    if (quarter === 3) {
      situation = createSecondHalfSituation(pregame, config);
    }
  }

  return {
    quarter,
    clock: config.quarter_length_secs,
    situation,
  };
}

export function getOurDriveDirectionForQuarter(
  quarter: number,
  pregame: PregameConfig | null,
): FieldDirection {
  const baseDirection = pregame?.ourDriveDirectionQ1 ?? DEFAULT_PREGAME.ourDriveDirectionQ1;
  return normalizeQuarter(quarter) % 2 === 1 ? baseDirection : oppositeFieldDirection(baseDirection);
}

export function getOurEndZoneSideForQuarter(
  quarter: number,
  pregame: PregameConfig | null,
): FieldDirection {
  return oppositeFieldDirection(getOurDriveDirectionForQuarter(quarter, pregame));
}

export function getOffenseDriveDirection(
  possession: TeamSide,
  quarter: number,
  pregame: PregameConfig | null,
): FieldDirection {
  const ourDirection = getOurDriveDirectionForQuarter(quarter, pregame);
  return possession === "us" ? ourDirection : oppositeFieldDirection(ourDirection);
}

export function toDisplayFieldPosition(
  ballOn: number,
  possession: TeamSide,
  quarter: number,
  pregame: PregameConfig | null,
): number {
  const clampedBallOn = clampBallOn(ballOn);
  const direction = getOffenseDriveDirection(possession, quarter, pregame);
  return direction === "right" ? clampedBallOn : 100 - clampedBallOn;
}

export function getRecordedNextSituation(
  play: Pick<AdvanceablePlay, "nextPossession" | "nextDown" | "nextDistance" | "nextBallOn">,
): LiveSituation | null {
  if (
    !isTeamSide(play.nextPossession)
    || typeof play.nextDown !== "number"
    || typeof play.nextDistance !== "number"
    || typeof play.nextBallOn !== "number"
  ) {
    return null;
  }

  return {
    possession: play.nextPossession,
    down: play.nextDown,
    distance: play.nextDistance,
    ballOn: clampBallOn(play.nextBallOn),
  };
}

export function advanceSituationAfterPlay(
  play: AdvanceablePlay,
  before: LiveSituation,
  config: GameConfig,
): LiveSituation {
  const possession = before.possession;
  const newBallOn = clampBallOn(before.ballOn + play.yards);

  if (play.penalty) {
    const isOffensePenalty = isPenaltyOnOffense(play.penalty, play.penaltyCategory);

    if (isOffensePenalty) {
      return {
        possession,
        down: before.down,
        distance: Math.min(99, before.distance + play.flagYards),
        ballOn: Math.max(1, before.ballOn - play.flagYards),
      };
    }

    const penaltyBallOn = Math.min(98, before.ballOn + play.flagYards);
    return {
      possession,
      down: 1,
      distance: Math.min(config.first_down_distance, 100 - penaltyBallOn),
      ballOn: penaltyBallOn,
    };
  }

  if (play.isTouchdown) {
    return {
      possession,
      down: 1,
      distance: config.pat_distance,
      ballOn: 100 - config.pat_distance,
    };
  }

  if (play.type === "safety") {
    return createKickoffSituation(possession, config, config.safety_kick_yard_line);
  }

  if (play.type === "pat" || play.type === "two_pt") {
    return createKickoffSituation(possession, config);
  }

  if (play.type === "fg") {
    if (play.result === "Good") {
      return createKickoffSituation(possession, config);
    }

    return {
      possession: oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      ballOn: Math.max(config.touchback_yard_line, flipFieldPosition(before.ballOn)),
    };
  }

  if (play.type === "kickoff" || play.type === "punt") {
    return {
      possession: oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      ballOn: play.isTouchback ? config.touchback_yard_line : flipFieldPosition(newBallOn),
    };
  }

  if (play.type === "blocked_kick") {
    if (play.blockedKickType === "extra_point") {
      return createKickoffSituation(possession, config);
    }

    if (play.blockedKickType === "field_goal") {
      return {
        possession: oppositeTeam(possession),
        down: 1,
        distance: config.first_down_distance,
        ballOn: Math.max(config.touchback_yard_line, flipFieldPosition(before.ballOn)),
      };
    }

    if (play.blockedKickType === "punt" || play.blockedKickType === "kickoff") {
      return {
        possession: oppositeTeam(possession),
        down: 1,
        distance: config.first_down_distance,
        ballOn: play.isTouchback ? config.touchback_yard_line : flipFieldPosition(newBallOn),
      };
    }
  }

  if (play.type === "int" || play.type === "fumble") {
    return {
      possession: oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      ballOn: flipFieldPosition(newBallOn),
    };
  }

  if (play.firstDown) {
    return {
      possession,
      down: 1,
      distance: Math.min(config.first_down_distance, 100 - newBallOn),
      ballOn: newBallOn,
    };
  }

  if (before.down >= 4) {
    return {
      possession: oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      ballOn: flipFieldPosition(newBallOn),
    };
  }

  return {
    possession,
    down: before.down + 1,
    distance: before.distance - play.yards,
    ballOn: newBallOn,
  };
}

export function rebuildPlaySituations(
  plays: PlayRecord[],
  pregame: PregameConfig | null,
  config: GameConfig,
): { plays: PlayRecord[]; currentQuarter: number; currentSituation: LiveSituation } {
  let currentQuarter = 1;
  let currentSituation = createInitialSituation(pregame, config);

  const nextPlays = plays.map((play) => {
    const playQuarter = normalizeQuarter(play.quarter);
    if (playQuarter > currentQuarter) {
      const transition = moveToQuarter(
        currentQuarter,
        playQuarter,
        currentSituation,
        pregame,
        config,
      );
      currentQuarter = transition.quarter;
      currentSituation = transition.situation;
    }

    const nextPlay: PlayRecord = {
      ...play,
      quarter: playQuarter,
      ballOn: currentSituation.ballOn,
      down: currentSituation.down,
      distance: currentSituation.distance,
      possession: currentSituation.possession,
    };

    const nextSituation = getRecordedNextSituation(nextPlay) ?? advanceSituationAfterPlay(nextPlay, currentSituation, config);
    currentSituation = nextSituation;
    currentQuarter = playQuarter;
    return {
      ...nextPlay,
      nextPossession: nextSituation.possession,
      nextDown: nextSituation.down,
      nextDistance: nextSituation.distance,
      nextBallOn: nextSituation.ballOn,
    };
  });

  return {
    plays: nextPlays,
    currentQuarter,
    currentSituation,
  };
}
