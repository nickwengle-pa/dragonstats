import type { DriveStats } from "football-stats-engine";
import type { PlayWithPlayers } from "./gameService";

/** One entry under a quarter of the Drive Chart: a drive's plays within that
 *  quarter, or a kick line (a kickoff, an onside kick, the try after a return
 *  score) that belongs to no drive.
 *
 *  A drive that runs across a quarter break appears once under each quarter it
 *  touches, with that quarter's plays, flagged as carried in from or out to the
 *  neighbouring quarter. It never carries across halftime or into overtime. */
export interface QuarterDrive {
  /** The engine's drive number (kickoffs count), used to match its stats. */
  driveNumber: number;
  /** What the report calls it: real drives counted 1, 2, 3, kicks skipped. */
  label: number;
  possession: "us" | "them";
  plays: PlayWithPlayers[];
  /** Started in an earlier quarter. */
  continuedFrom: number | null;
  /** Carries on into a later quarter. */
  continuesInto: number | null;
  /** The engine's summary of the whole drive, when it produced one. */
  stats: DriveStats | null;
  /** Kicks and tries with no snap of their own: shown as a line, not a drive. */
  kickoffOnly: boolean;
  /** The last drive of the game so far, and its team still has the ball. */
  ongoing: boolean;
}

/** Kicks that follow a drive rather than belong to it. The kicking team holds
 *  possession on a kickoff in this app, so "…TD, PAT, kickoff" is one run. */
const KICKS = new Set(["kickoff", "onside_kick"]);
/** Rows that can sit around a kick without being a snap of their own. */
const KICK_COMPANIONS = new Set(["timeout", "penalty_only"]);
/** Rows that are never a snap: a possession made only of these is not a drive.
 *  Same list driveResults.ts walks past to find what ended a drive. */
const NO_SNAP = new Set([
  "pat", "two_pt", "kickoff", "onside_kick", "timeout",
  "false_start", "encroachment", "penalty_only",
]);

/** 1 for the first half, 2 for the second, then one per overtime period. A
 *  drive can run from the 1st into the 2nd quarter, never across these. */
function half(quarter: number): number {
  return quarter <= 2 ? 1 : quarter <= 4 ? 2 : quarter;
}

/** Split plays into consecutive pieces by quarter. */
function byQuarterPieces(plays: PlayWithPlayers[]): { quarter: number; plays: PlayWithPlayers[] }[] {
  const pieces: { quarter: number; plays: PlayWithPlayers[] }[] = [];
  for (const play of plays) {
    const last = pieces[pieces.length - 1];
    if (last && last.quarter === play.quarter) last.plays.push(play);
    else pieces.push({ quarter: play.quarter, plays: [play] });
  }
  return pieces;
}

/**
 * Group a game's plays into drives, then split each drive by quarter.
 *
 * Drives are numbered exactly as transformPlays numbers them for the engine —
 * a new drive whenever possession at the snap changes, quarter_change rows
 * skipped — so number N here is the engine's drive N and its stats line up.
 * The kick that follows a drive is peeled off into its own line, so it neither
 * pads the drive's play list nor drags it across halftime.
 */
export function drivesByQuarter(plays: PlayWithPlayers[], drives: DriveStats[]): Map<number, QuarterDrive[]> {
  const sorted = [...plays].sort((a, b) => a.sequence - b.sequence);
  const runs: { driveNumber: number; possession: "us" | "them"; plays: PlayWithPlayers[] }[] = [];
  for (const play of sorted) {
    if (play.play_type === "quarter_change") continue;
    const current = runs[runs.length - 1];
    if (!current || current.possession !== play.possession) {
      runs.push({ driveNumber: runs.length + 1, possession: play.possession, plays: [play] });
    } else current.plays.push(play);
  }
  const lastRow = sorted[sorted.length - 1];

  const byQuarter = new Map<number, QuarterDrive[]>();
  const add = (entry: QuarterDrive, quarter: number) => {
    const list = byQuarter.get(quarter) ?? [];
    list.push(entry);
    byQuarter.set(quarter, list);
  };

  let label = 0;
  runs.forEach((run, index) => {
    const stats = drives.find((d) => d.driveNumber === run.driveNumber) ?? null;
    const snapped = run.plays.some((p) => !NO_SNAP.has(p.play_type));

    // Peel the trailing kick, and anything riding with it, off the drive.
    let cut = run.plays.length;
    if (snapped) {
      let i = run.plays.length - 1;
      while (i >= 0 && KICK_COMPANIONS.has(run.plays[i].play_type)) i--;
      if (i >= 0 && KICKS.has(run.plays[i].play_type)) {
        while (i > 0 && (KICKS.has(run.plays[i - 1].play_type) || KICK_COMPANIONS.has(run.plays[i - 1].play_type))) i--;
        cut = i;
      }
    }
    const drivePlays = snapped ? run.plays.slice(0, cut) : [];
    const kickPlays = snapped ? run.plays.slice(cut) : run.plays;

    if (drivePlays.length > 0) {
      label += 1;
      const last = drivePlays[drivePlays.length - 1];
      const isLastRun = index === runs.length - 1;
      // The last drive is still going only while nothing has ended it: no kick
      // after it, its team still has the ball after its last snap, and no
      // half or game break has been recorded since.
      const ongoing = isLastRun && kickPlays.length === 0
        && (last.play_data?.next_possession ?? last.possession) === run.possession
        && !(lastRow?.play_type === "quarter_change" && half(last.quarter + 1) !== half(last.quarter));
      const pieces = byQuarterPieces(drivePlays);
      pieces.forEach((piece, i) => {
        const prev = pieces[i - 1];
        const next = pieces[i + 1];
        add({
          driveNumber: run.driveNumber,
          label,
          possession: run.possession,
          plays: piece.plays,
          continuedFrom: prev && half(prev.quarter) === half(piece.quarter) ? prev.quarter : null,
          continuesInto: next && half(next.quarter) === half(piece.quarter) ? next.quarter : null,
          stats,
          kickoffOnly: false,
          ongoing,
        }, piece.quarter);
      });
    }

    for (const piece of byQuarterPieces(kickPlays)) {
      add({
        driveNumber: run.driveNumber,
        label,
        possession: run.possession,
        plays: piece.plays,
        continuedFrom: null,
        continuesInto: null,
        stats: drivePlays.length > 0 ? null : stats,
        kickoffOnly: true,
        ongoing: false,
      }, piece.quarter);
    }
  });
  return byQuarter;
}
