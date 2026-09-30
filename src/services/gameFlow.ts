import {
  type PenaltySide,
  isPenaltyOnOffense,
  grantsAutoFirstDown,
  getPenaltyDefaultSide,
  penaltyCostsDown,
  type PlayRecord,
} from "@/components/game/types";
import type { GameConfig } from "./programService";
import { kickoffOutOfBoundsSituation } from "./kickoffOutOfBounds";

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
  playData?: Record<string, unknown>;
  type: string;
  yards: number;
  result: string;
  penalty: string | null;
  penaltyCategory?: PenaltySide | null;
  penaltyEnforcement?: "accepted" | "declined" | "offset";
  flagYards: number;
  isTouchdown: boolean;
  firstDown: boolean;
  /** For fumbles: whether possession actually changed. undefined/true = lost (turnover). */
  turnover?: boolean;
  isTouchback?: boolean;
  blockedKickType?: string | null;
  /** Offense-relative spot the fumble was recovered at, and how far the
   *  recoverer then carried it. Both needed to place the ball afterwards. */
  fumbleRecoveredAt?: number | null;
  fumbleReturnYards?: number | null;
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

/** Quarters 1-4 are regulation; 5/6/7 are OT1/OT2/OT3. */
export const MAX_QUARTER = 7;

export function normalizeQuarter(quarter: number | null | undefined): number {
  if (!quarter || quarter < 1) return 1;
  return Math.min(Math.round(quarter), MAX_QUARTER);
}

/** Overtime settles a tie and nothing else: offered at the end of the 4th or
 *  of an OT period only while the score is level and an OT period is left. */
export function canStartOvertime(quarter: number, ourScore: number, theirScore: number): boolean {
  return quarter >= 4 && quarter < MAX_QUARTER && ourScore === theirScore;
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

/**
 * Which optional detail this game's crew is charting live. Both default ON so
 * existing games behave exactly as before. Turning one off only removes the
 * live-entry step — Film Chart and the play editor can still fill it in later.
 */
export interface ChartingPrefs {
  formations: boolean;
  tacklers: boolean;
}

export const DEFAULT_CHARTING: ChartingPrefs = { formations: true, tacklers: true };

export function getChartingPrefs(game: GameRulesCarrier | null | undefined): ChartingPrefs {
  const charting = asRecord(asRecord(game?.rules_config)?.charting);
  return {
    formations: typeof charting?.formations === "boolean" ? charting.formations : true,
    tacklers: typeof charting?.tacklers === "boolean" ? charting.tacklers : true,
  };
}

export function buildPregameGameUpdate(
  rulesConfig: Record<string, unknown> | null | undefined,
  pregame: PregameConfig,
  charting?: ChartingPrefs,
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
  if (charting) {
    nextRules.charting = { formations: charting.formations, tacklers: charting.tacklers };
  }

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
    // NFHS overtime: each possession starts 1st-and-goal at the opponent's
    // 10-yard line. Possession carries over from the current selection — the
    // OT coin toss decides who goes first, so the operator flips it on the
    // scoreboard if needed.
    if (quarter >= 5) {
      situation = {
        possession: situation.possession,
        down: 1,
        distance: 10,
        ballOn: 90,
      };
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

/* Which stored next-situations are facts, and which are caches.

   Every play has next_* written onto it after every recalc, and until now the
   replay honoured all of them. That froze the chain: correct play 12's yardage
   and play 13 moved, but play 13 still handed on the spot it was stored with,
   so 14 onward never moved and play 13 showed a gain its own spots disagreed
   with. Only two sources are anything but a copy of what the rules would
   compute again - a spot the operator stated, and one the app enforced from a
   foul spot the operator gave. Everything else is re-derived. */
const AUTHORITATIVE_NEXT_SOURCES = new Set(["manual_override", "penalty_enforced"]);

export function getAuthoritativeNextSituation(
  play: Pick<AdvanceablePlay, "nextPossession" | "nextDown" | "nextDistance" | "nextBallOn" | "playData">,
): LiveSituation | null {
  const source = play.playData?.next_situation_source;
  if (typeof source !== "string" || !AUTHORITATIVE_NEXT_SOURCES.has(source)) return null;
  return getRecordedNextSituation(play);
}

type SituatedPlay = Pick<PlayRecord, "possession" | "down" | "distance" | "ballOn" | "playData" | "type" | "quarter"
  | "nextPossession" | "nextDown" | "nextDistance" | "nextBallOn">;

const sameSituation = (a: LiveSituation, b: LiveSituation) =>
  a.possession === b.possession && a.down === b.down && a.distance === b.distance && a.ballOn === b.ballOn;

/** The situation a play was recorded as starting from. A quarter change is
 *  stored as where it LEFT the ball, so its start is the snapshot it kept. */
function recordedStart(play: SituatedPlay): LiveSituation | null {
  if (play.type === "quarter_change") {
    const before = play.playData?.quarter_change_before as Partial<LiveSituation> | undefined;
    if (!before || !isTeamSide(before.possession)) return null;
    const { down, distance, ballOn } = before;
    if (![down, distance, ballOn].every(Number.isFinite)) return null;
    return { possession: before.possession, down: down!, distance: distance!, ballOn: ballOn! };
  }
  return { possession: play.possession, down: play.down, distance: play.distance, ballOn: play.ballOn };
}

/**
 * Flag the plays whose starting spot somebody set by hand.
 *
 * The scoreboard's ball, down and distance buttons and the film chart's
 * situation editor change where the NEXT play starts without touching the play
 * before it. Nothing wrote that down as an override; it survived only because
 * every stored next-state was frozen, which is also what stopped edits from
 * re-chaining. Now that the chain is re-derived, those corrections have to be
 * named or the replay walks straight over them.
 *
 * Read off stored data: a play recorded from anywhere other than where the
 * play before it said the ball went was put there by hand. Only compared where
 * the previous play actually carries a stored next - a film-chart edit clears
 * it, and a stale start behind one of those is exactly what should re-chain.
 */
export function markHandSetStarts<T extends SituatedPlay>(
  plays: T[],
  pregame: PregameConfig | null,
  config: GameConfig,
): T[] {
  return plays.map((play, index) => {
    if (play.playData?.start_override === true) return play;
    const start = recordedStart(play);
    if (!start) return play;
    const playQuarter = normalizeQuarter(play.quarter);
    let expected: LiveSituation | null;
    let fromQuarter: number;
    if (index === 0) {
      expected = createInitialSituation(pregame, config);
      fromQuarter = 1;
    } else {
      const prev = plays[index - 1];
      expected = getRecordedNextSituation(prev);
      fromQuarter = normalizeQuarter(prev.quarter);
    }
    if (!expected) return play;
    // A quarter change carries its own transition; anything else crossing a
    // quarter gets the one the replay would apply.
    if (play.type !== "quarter_change" && playQuarter > fromQuarter) {
      expected = moveToQuarter(fromQuarter, playQuarter, expected, pregame, config).situation;
    }
    if (sameSituation(start, expected)) return play;
    return { ...play, playData: { ...(play.playData ?? {}), start_override: true } };
  });
}

/** The same check for one play as it is recorded, against the play it follows.
 *  Flagged at the snap, a scoreboard correction survives an edit made later in
 *  the same session, before any reload could read it back off stored data. */
export function withHandSetStart<T extends SituatedPlay>(
  play: T,
  previous: SituatedPlay | undefined,
  pregame: PregameConfig | null,
  config: GameConfig,
): T {
  const marked = markHandSetStarts<SituatedPlay>(previous ? [previous, play] : [play], pregame, config);
  return marked[marked.length - 1] as T;
}

export function advanceSituationAfterPlay(
  play: AdvanceablePlay,
  before: LiveSituation,
  config: GameConfig,
): LiveSituation {
  const outOfBoundsChoice = play.playData?.kickoff_out_of_bounds_choice;
  if (["kickoff", "onside_kick"].includes(play.type) && (outOfBoundsChoice === "rekick" || outOfBoundsChoice === "take_35")) {
    return kickoffOutOfBoundsSituation(before, outOfBoundsChoice, config.first_down_distance);
  }
  // Not snaps. A score correction used to fall through to the scrimmage
  // branch and cost a down; its stored next-state was what hid that.
  if (play.type === "timeout" || play.type === "quarter_change" || play.type === "score_correction") {
    return {
      possession: before.possession,
      down: before.down,
      distance: before.distance,
      ballOn: before.ballOn,
    };
  }

  const possession = before.possession;
  const newBallOn = clampBallOn(before.ballOn + play.yards);

  if (play.penalty) {
    const enforcement = play.penaltyEnforcement ?? "accepted";

    // Offsetting penalties: no yardage, down replays.
    if (enforcement === "offset") {
      return {
        possession,
        down: before.down,
        distance: before.distance,
        ballOn: before.ballOn,
      };
    }

    // Declined penalty: fall through to normal play advancement below.
    if (enforcement === "accepted") {
      const isOffensePenalty = isPenaltyOnOffense(play.penalty, play.penaltyCategory);

      if (isOffensePenalty) {
        // Offensive penalty: walk the ball back, replay the down.
        // Half-the-distance to the goal applies when the penalty distance would
        // push the offense behind their own goal line (i.e. into their own EZ).
        const halfDistance = Math.max(1, Math.floor(before.ballOn / 2));
        const appliedYards = Math.min(play.flagYards, halfDistance);
        const newOffenseBallOn = Math.max(1, before.ballOn - appliedYards);
        const distanceAdded = before.ballOn - newOffenseBallOn;
        // Grounding and an illegal forward pass cost the down too; on fourth
        // down that hands the ball over at the enforced spot.
        if (penaltyCostsDown(play.penalty, "offense")) {
          if (before.down >= 4) {
            return {
              possession: oppositeTeam(possession),
              down: 1,
              distance: Math.min(config.first_down_distance, newOffenseBallOn),
              ballOn: flipFieldPosition(newOffenseBallOn),
            };
          }
          return {
            possession,
            down: before.down + 1,
            distance: Math.min(99, before.distance + distanceAdded),
            ballOn: newOffenseBallOn,
          };
        }
        return {
          possession,
          down: before.down,
          distance: Math.min(99, before.distance + distanceAdded),
          ballOn: newOffenseBallOn,
        };
      }

      // Defensive penalty: advance the ball downfield, then evaluate first down.
      // Half-the-distance applies when the penalty would push the ball past the
      // opponent's goal line.
      const yardsToGoal = 100 - before.ballOn;
      const halfDistance = Math.max(1, Math.floor(yardsToGoal / 2));
      const appliedYards = Math.min(play.flagYards, halfDistance);
      const penaltyBallOn = Math.min(98, before.ballOn + appliedYards);
      const resolvedSide = play.penaltyCategory ?? getPenaltyDefaultSide(play.penalty);
      const autoFirst = grantsAutoFirstDown(play.penalty, resolvedSide);
      const distanceConsumed = penaltyBallOn - before.ballOn;
      const earnedFirstByYardage = distanceConsumed >= before.distance;

      if (autoFirst || earnedFirstByYardage) {
        return {
          possession,
          down: 1,
          distance: Math.min(config.first_down_distance, 100 - penaltyBallOn),
          ballOn: penaltyBallOn,
        };
      }

      // Non-auto defensive penalty without enough yards for a fresh first down:
      // replay the down at the new spot with the line-to-gain reduced.
      return {
        possession,
        down: before.down,
        distance: Math.max(1, before.distance - distanceConsumed),
        ballOn: penaltyBallOn,
      };
    }
    // enforcement === "declined" — fall through to normal play advancement.
  }

  /* A lost fumble changes possession, and the FLAG is what says so — not the
     play type. Keyed off type === "fumble", a sack-fumble left the ball with
     the offense: the type was "sack", so this was false, possession never
     flipped, and because live state is replayed from the play list every
     snap after it inherited the wrong team.

     `=== true` rather than `!== false` because turnover is undefined on
     ordinary plays; only an explicit turnover flips.

     The second clause preserves the old reading for a legacy "fumble" row
     whose flag was never stored. is_turnover is BOOLEAN DEFAULT false so this
     should not exist, but a row predating the column would come back null,
     and under `=== true` alone it would silently stop changing possession —
     rewriting the state of a game already recorded. */
  const fumbleLost = play.turnover === true
    || (play.type === "fumble" && play.turnover == null);

  if (play.isTouchdown) {
    const isReturnTd =
      play.type === "int" ||
      fumbleLost ||
      play.type === "kickoff" ||
      play.type === "punt" ||
      play.type === "blocked_kick";
    const scoringTeam = isReturnTd ? oppositeTeam(possession) : possession;
    return {
      possession: scoringTeam,
      down: 1,
      distance: config.pat_distance,
      ballOn: 100 - config.pat_distance,
    };
  }

  if (play.type === "safety") {
    return createKickoffSituation(possession, config, config.safety_kick_yard_line);
  }

  if (play.type === "pat" || play.type === "two_pt") {
    // Defensive 2-point return ("two-point safety"): defense scored, so they
    // become the kicking team for the next kickoff.
    if (play.result === "Returned") {
      return createKickoffSituation(oppositeTeam(possession), config);
    }
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

  if (play.type === "kickoff" || play.type === "punt" || play.type === "fair_catch") {
    return {
      possession: oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      ballOn: play.isTouchback ? config.touchback_yard_line : flipFieldPosition(newBallOn),
    };
  }

  if (play.type === "onside_kick") {
    // Possession is set explicitly via play.nextPossession when the user
    // picks who recovered. Fall through to the default (kicking-team retains)
    // when the recoverer is on the kicking team; flip when the receiving team
    // gets it. The caller normally provides nextPossession so this is a safety net.
    // The modal writes who recovered onto the play itself; an edit re-derives
    // the next state, so possession must not hang on a stored nextPossession
    // an edit has just cleared.
    const recorded = play.playData?.onside_recovered_by_kicker;
    const recoveredByKicker = typeof recorded === "boolean" ? recorded : play.nextPossession === possession;
    return {
      possession: recoveredByKicker ? possession : oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      // If the kicking team recovers, possession didn't change, so the ball
      // stays in their frame (no field flip). Only flip when the receiving
      // team gets it.
      ballOn: play.isTouchback
        ? config.touchback_yard_line
        : recoveredByKicker
          ? clampBallOn(newBallOn)
          : flipFieldPosition(newBallOn),
    };
  }

  if (play.type === "blocked_kick") {
    if (play.blockedKickType === "extra_point") {
      return createKickoffSituation(possession, config);
    }

    if (play.blockedKickType === "field_goal") {
      // Spot the ball where the play ENDED, not where the kick was attempted
      // from. This used to read before.ballOn and clamp up to the touchback
      // line, so a blocked field goal that was recovered and returned always
      // suggested the 20 and silently discarded the return yardage the
      // operator had just entered on the previous step. The punt and kickoff
      // branch below already did this correctly; they now agree.
      return {
        possession: oppositeTeam(possession),
        down: 1,
        distance: config.first_down_distance,
        ballOn: play.isTouchback ? config.touchback_yard_line : flipFieldPosition(newBallOn),
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

  // Interception always flips; fumble flips only when it was lost.
  if (play.type === "int" || fumbleLost) {
    /*
     * Where the ball actually finished, in the offense's frame.
     *
     * newBallOn alone is where the PLAY ended - for a strip-sack, the spot the
     * quarterback went down. It ignored both the recovery spot and the return,
     * so a sack from the 40 for -7 recovered and run back 12 yards suggested
     * the ball at the 33, as though the recoverer never moved.
     *
     * The recovering team runs the other way, so its return counts DOWN here.
     * Both fields are absent on an interception and on older plays, where this
     * falls back to exactly the previous behaviour.
     */
    const recoveredAt = play.fumbleRecoveredAt ?? newBallOn;
    const finishedAt = clampBallOn(recoveredAt - (play.fumbleReturnYards ?? 0));
    return {
      possession: oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      ballOn: flipFieldPosition(finishedAt),
    };
  }

  // Keep the original carrier's yards separate from where a retained fumble
  // finishes. The recovery and advance determine the next spot and distance.
  const retainedFumble = play.fumbleRecoveredAt != null || play.fumbleReturnYards != null;
  const finalBallOn = retainedFumble
    ? clampBallOn((play.fumbleRecoveredAt ?? newBallOn) + (play.fumbleReturnYards ?? 0))
    : newBallOn;
  const situationGain = retainedFumble ? finalBallOn - before.ballOn : play.yards;
  if (retainedFumble ? situationGain >= before.distance : play.firstDown) {
    return {
      possession,
      down: 1,
      distance: Math.max(1, Math.min(config.first_down_distance, 100 - finalBallOn)),
      ballOn: finalBallOn,
    };
  }

  if (before.down >= 4) {
    return {
      possession: oppositeTeam(possession),
      down: 1,
      distance: config.first_down_distance,
      ballOn: flipFieldPosition(finalBallOn),
    };
  }

  // Normal down-to-down: clamp distance to >= 1 and cap at yards-to-goal so it
  // never shows "2nd & 0" or a distance past the goal line.
  return {
    possession,
    down: before.down + 1,
    distance: Math.max(1, Math.min(before.distance - situationGain, 100 - finalBallOn)),
    ballOn: finalBallOn,
  };
}

/**
 * An override says where the ball went from where its play STARTED.
 *
 * Nearly every flag and turnover carries one: the adjust sheet opens after
 * each and confirming it, changed or not, stores the spot as stated. Taken as
 * an absolute spot, every one of them was a wall - an edit upstream moved the
 * play's start and left its end behind, the same broken play the cached spots
 * produced, just at every flag instead of every snap. So it travels with its
 * play: started five yards further back, it ends five yards further back.
 *
 * `recordedFrom` is the start the override was stated against - the play's
 * own stored start, which is always written in the same pass as its next.
 * The team is relative too: what the override records is whether the offense
 * kept the ball or the defense got it. If an edit upstream changes who had the
 * ball at this snap - an earlier play turned into a turnover, the opening
 * receiver corrected - keeping the stated team would hand the ball back
 * mid-drive.
 */
function carryOverride(
  override: LiveSituation,
  recordedFrom: Pick<LiveSituation, "possession" | "ballOn">,
  start: LiveSituation,
): LiveSituation {
  const offenseKept = override.possession === recordedFrom.possession;
  const possession = offenseKept ? start.possession : oppositeTeam(start.possession);
  const shift = start.ballOn - recordedFrom.ballOn;
  if (shift === 0 && possession === override.possession) return override;
  // ballOn is measured from the goal of whoever has the ball NEXT.
  const ballOn = clampBallOn(offenseKept ? override.ballOn + shift : override.ballOn - shift);
  return { ...override, possession, ballOn, distance: Math.max(1, Math.min(override.distance, 100 - ballOn)) };
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
    if (play.type === "quarter_change") {
      /* Going forward a quarter is the same transition the replay applies to
         any play that crosses one, so it follows the chain - Q1 edits have to
         reach Q2. Its stored spot wins only when it was recorded somewhere
         the chain did not put it, or when it is a correction backwards. */
      if (playQuarter > currentQuarter && play.playData?.start_override !== true) {
        const endedAt = currentSituation;
        currentSituation = moveToQuarter(currentQuarter, playQuarter, currentSituation, pregame, config).situation;
        currentQuarter = playQuarter;
        /* The entry keeps where the quarter ended, for Undo and as its own
           start. Left as recorded, an edit before it made that disagree with
           the chain, and the next reload read it as a hand-set start and froze
           the quarter change where it was. */
        const recordedBefore = play.playData?.quarter_change_before as Record<string, unknown> | undefined;
        return {
          ...play,
          playData: recordedBefore
            ? { ...play.playData, quarter_change_before: { ...recordedBefore, ...endedAt } }
            : play.playData,
          possession: currentSituation.possession,
          down: currentSituation.down,
          distance: currentSituation.distance,
          ballOn: currentSituation.ballOn,
          nextPossession: currentSituation.possession,
          nextDown: currentSituation.down,
          nextDistance: currentSituation.distance,
          nextBallOn: currentSituation.ballOn,
        };
      }
      currentQuarter = playQuarter;
      currentSituation = getRecordedNextSituation(play) ?? { possession: play.possession, down: play.down, distance: play.distance, ballOn: play.ballOn };
      return play;
    }
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

    // Where the operator put the ball by hand outranks where the chain left it.
    if (play.playData?.start_override === true) {
      currentSituation = { possession: play.possession, down: play.down, distance: play.distance, ballOn: play.ballOn };
    }

    const nextPlay: PlayRecord = {
      ...play,
      quarter: playQuarter,
      ballOn: currentSituation.ballOn,
      down: currentSituation.down,
      distance: currentSituation.distance,
      possession: currentSituation.possession,
    };

    const override = getAuthoritativeNextSituation(nextPlay);
    const nextSituation = override
      ? carryOverride(override, { possession: play.possession, ballOn: play.ballOn }, currentSituation)
      : advanceSituationAfterPlay(nextPlay, currentSituation, config);
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
