/**
 * How each drive actually ended.
 *
 * The engine's finalizeDrive only ever produces two answers: Touchdown when the
 * drive reached the goal line, and Punt for absolutely everything else. A field
 * goal, a missed field goal, an interception, a turnover on downs and the end of
 * a half all come back labelled PUNT.
 *
 * It cannot easily do better, either, because a drive does not end on the play
 * that decided it. Possession in this app belongs to the KICKING team on a
 * kickoff, so a scoring drive runs "…touchdown, PAT, kickoff" and a field goal
 * drive runs "…field goal, kickoff" — the last play of the drive is the kickoff
 * both times. Reading the final play would call every scoring drive a kickoff.
 *
 * So this walks backwards past the plays that are consequences of the drive
 * ending (the try, the kickoff, timeouts) and classifies the first real play it
 * finds. The engine ships prebuilt and is not ours to recompile, so the
 * correction happens here, over the top of what it returned.
 *
 * Drives map to plays by position: both producers of a GameSummary number
 * drives by counting possession changes, so the Nth run of consecutive
 * same-possession plays is the Nth drive. If that ever stops being true the
 * counts disagree and the original results are returned untouched — a stale
 * label is better than a confidently wrong one.
 */

import type { DriveStats } from "football-stats-engine";

/** The engine's DriveResult, by value.
 *
 *  Written out rather than imported as the enum so this module has no runtime
 *  dependency on the engine package, whose ESM build uses extensionless imports
 *  that plain node cannot resolve. That keeps driveResults.test.ts runnable
 *  without a bundler. The cast back to the engine's type happens once, at the
 *  return, and DriveStats["result"] still checks the field on the way out. */
type DriveResultValue = DriveStats["result"];
const DriveResult = {
  Touchdown: "touchdown",
  FieldGoal: "field_goal",
  MissedFieldGoal: "missed_field_goal",
  Punt: "punt",
  Turnover: "turnover",
  TurnoverOnDowns: "turnover_on_downs",
  EndOfHalf: "end_of_half",
  EndOfGame: "end_of_game",
  Safety: "safety",
} as const;
type LocalDriveResult = (typeof DriveResult)[keyof typeof DriveResult];

/** The play fields a drive result depends on, whatever shape they arrived in. */
export interface DriveResultPlay {
  possession: "us" | "them";
  playType: string;
  quarter: number;
  down: number;
  isTouchdown: boolean;
  isTurnover: boolean;
  /** play_data.result — "Good" / "No Good" on a kick. */
  result: string;
}

/** Plays that happen BECAUSE a drive ended, so they cannot be what ended it. */
const AFTERMATH = new Set([
  "pat", "two_pt", "kickoff", "onside_kick", "timeout",
  "false_start", "encroachment", "penalty_only",
]);

/** Kicks that end a drive by design rather than by failing. */
const PUNT_TYPES = new Set(["punt", "fair_catch"]);

function classify(
  play: DriveResultPlay | undefined,
  isLastOfHalf: boolean,
  isLastOfGame: boolean,
): LocalDriveResult {
  // A drive with nothing but aftermath in it is the kickoff that opens a half,
  // or a possession that never got a snap away.
  if (!play) {
    return isLastOfGame ? DriveResult.EndOfGame : DriveResult.Punt;
  }
  if (play.isTouchdown) return DriveResult.Touchdown;
  if (play.playType === "fg") {
    return play.result === "Good" ? DriveResult.FieldGoal : DriveResult.MissedFieldGoal;
  }
  if (play.playType === "safety") return DriveResult.Safety;
  if (PUNT_TYPES.has(play.playType)) return DriveResult.Punt;
  // A blocked kick the kicking team fell on is still a punt that never got
  // away; one the other team came up with is a turnover.
  if (play.playType === "blocked_kick") {
    return play.isTurnover ? DriveResult.Turnover : DriveResult.Punt;
  }
  if (play.isTurnover || play.playType === "int") return DriveResult.Turnover;
  // Ran a play on fourth down, did not punt, did not kick, did not score.
  if (play.down === 4) return DriveResult.TurnoverOnDowns;
  if (isLastOfGame) return DriveResult.EndOfGame;
  if (isLastOfHalf) return DriveResult.EndOfHalf;
  return DriveResult.Punt;
}

/**
 * Split plays into possession runs, mirroring how both summary producers
 * number drives.
 */
function possessionRuns(plays: DriveResultPlay[]): DriveResultPlay[][] {
  const runs: DriveResultPlay[][] = [];
  let current: DriveResultPlay[] | null = null;
  let last: "us" | "them" | null = null;
  for (const play of plays) {
    if (!current || play.possession !== last) {
      current = [];
      runs.push(current);
      last = play.possession;
    }
    current.push(play);
  }
  return runs;
}

/** Drives with their result corrected. Same array shape, same order. */
export function resolveDriveResults(
  drives: DriveStats[],
  plays: DriveResultPlay[],
): DriveStats[] {
  const runs = possessionRuns(plays);
  if (runs.length !== drives.length) return drives;

  return drives.map((drive, i) => {
    const run = runs[i];
    const decider = [...run].reverse().find(p => !AFTERMATH.has(p.playType));
    // The half ends when the next drive starts in a later half than this one.
    const nextRun = runs[i + 1];
    const half = (q: number) => (q <= 2 ? 1 : 2);
    const isLastOfGame = i === runs.length - 1;
    const isLastOfHalf = !isLastOfGame
      && nextRun.length > 0
      && half(nextRun[0].quarter) !== half(run[run.length - 1].quarter);
    return {
      ...drive,
      result: classify(decider, isLastOfHalf, isLastOfGame) as DriveResultValue,
    };
  });
}
