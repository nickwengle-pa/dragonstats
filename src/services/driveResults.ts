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
 * Drives map to plays by number: both producers of a GameSummary number
 * drives by counting possession changes, so drive N is the Nth run of
 * consecutive same-possession plays (see matchesByNumber). If that ever stops
 * being true the original results are returned untouched — a stale label is
 * better than a confidently wrong one.
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
  // A touchdown the other team ran back (pick-six, scoop-and-score, punt
  // return) ended this drive in a turnover or a punt, not a score. Same test as
  // isReturnTouchdown in scoringLedger.ts, written out to keep this module free
  // of imports.
  const returned = play.isTurnover || play.playType === "int"
    || play.playType === "punt" || play.playType === "blocked_kick";
  if (play.isTouchdown && !returned) return DriveResult.Touchdown;
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
    if (play.playType === "quarter_change") continue;
    if (!current || play.possession !== last) {
      current = [];
      runs.push(current);
      last = play.possession;
    }
    current.push(play);
  }
  return runs;
}

/**
 * Whether each drive can be found by its number: drive N is run N.
 *
 * The engine skips kickoffs when it builds drives, so the opening kickoff (and
 * the one after a safety or a return score) is a run with no drive. Matching by
 * position then fails on the count in nearly every game, which left every drive
 * labelled the engine's PUNT. Both producers number drives by run, so the
 * number is the reliable key. Older games were charted before drives carried a
 * number (all #0) and fall back to position. As a guard against a numbering
 * that does not line up after all, one team must never map to both sides.
 */
function matchesByNumber(drives: DriveStats[], runs: DriveResultPlay[][]): boolean {
  if (drives.length === 0) return false;
  const seen = new Set<number>();
  const side = new Map<string, "us" | "them">();
  for (const drive of drives) {
    const n = drive.driveNumber;
    if (!Number.isInteger(n) || n < 1 || n > runs.length || seen.has(n)) return false;
    seen.add(n);
    const possession = runs[n - 1][0].possession;
    if ((side.get(drive.team) ?? possession) !== possession) return false;
    side.set(drive.team, possession);
  }
  return true;
}

/** Drives with their result corrected. Same array shape, same order. */
export function resolveDriveResults(
  drives: DriveStats[],
  plays: DriveResultPlay[],
): DriveStats[] {
  const runs = possessionRuns(plays);
  const byNumber = matchesByNumber(drives, runs);
  if (!byNumber && runs.length !== drives.length) return drives;

  return drives.map((drive, index) => {
    const i = byNumber ? drive.driveNumber - 1 : index;
    const run = runs[i];
    const decider = [...run].reverse().find(p => !AFTERMATH.has(p.playType));
    // The half ends when the next drive starts in a later half than this one.
    const nextRun = runs[i + 1];
    const half = (q: number) => (q <= 2 ? 1 : 2);
    const isLastOfGame = i === runs.length - 1;
    // Measured from the play that ended the drive: the kickoff riding on the
    // end of the run may already be in the next half.
    const endedIn = (decider ?? run[run.length - 1]).quarter;
    const isLastOfHalf = !isLastOfGame
      && nextRun.length > 0
      && half(nextRun[0].quarter) !== half(endedIn);
    return {
      ...drive,
      result: classify(decider, isLastOfHalf, isLastOfGame) as DriveResultValue,
    };
  });
}
