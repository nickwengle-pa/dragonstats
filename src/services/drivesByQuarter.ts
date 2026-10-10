import type { DriveStats } from "football-stats-engine";
import type { PlayWithPlayers } from "./gameService";

/** One drive's plays within one quarter. A drive that runs across a quarter
 *  break appears once under each quarter it touches, with that quarter's
 *  plays, flagged as carried in from or out to the neighbouring quarter. */
export interface QuarterDrive {
  /** The engine's drive number (kickoffs count), used to match its stats. */
  driveNumber: number;
  /** What the report calls it: real drives counted 1, 2, 3, kickoffs skipped. */
  label: number;
  possession: "us" | "them";
  plays: PlayWithPlayers[];
  /** Started in an earlier quarter. */
  continuedFrom: number | null;
  /** Carries on into a later quarter. */
  continuesInto: number | null;
  /** The engine's summary of the whole drive, when it produced one. */
  stats: DriveStats | null;
  /** A kickoff with no snap after it by the kicking team: not a real drive. */
  kickoffOnly: boolean;
}

/**
 * Group a game's plays into drives, then split each drive by quarter.
 *
 * Drives are numbered exactly as transformPlays numbers them for the engine —
 * a new drive whenever possession at the snap changes, quarter_change rows
 * skipped — so number N here is the engine's drive N and its stats line up.
 */
export function drivesByQuarter(plays: PlayWithPlayers[], drives: DriveStats[]): Map<number, QuarterDrive[]> {
  const runs: { driveNumber: number; possession: "us" | "them"; plays: PlayWithPlayers[] }[] = [];
  for (const play of [...plays].sort((a, b) => a.sequence - b.sequence)) {
    if (play.play_type === "quarter_change") continue;
    const current = runs[runs.length - 1];
    if (!current || current.possession !== play.possession) {
      runs.push({ driveNumber: runs.length + 1, possession: play.possession, plays: [play] });
    } else current.plays.push(play);
  }

  const byQuarter = new Map<number, QuarterDrive[]>();
  let label = 0;
  for (const run of runs) {
    const stats = drives.find((d) => d.driveNumber === run.driveNumber) ?? null;
    const kickoffOnly = run.plays.every((p) => p.play_type === "kickoff" || p.play_type === "timeout")
      && run.plays.some((p) => p.play_type === "kickoff");
    if (!kickoffOnly) label += 1;
    const quarters: number[] = [];
    const pieces = new Map<number, PlayWithPlayers[]>();
    for (const play of run.plays) {
      if (!pieces.has(play.quarter)) { pieces.set(play.quarter, []); quarters.push(play.quarter); }
      pieces.get(play.quarter)!.push(play);
    }
    quarters.forEach((quarter, i) => {
      const list = byQuarter.get(quarter) ?? [];
      list.push({
        driveNumber: run.driveNumber,
        label,
        possession: run.possession,
        plays: pieces.get(quarter)!,
        continuedFrom: i > 0 ? quarters[i - 1] : null,
        continuesInto: i < quarters.length - 1 ? quarters[i + 1] : null,
        stats,
        kickoffOnly,
      });
      byQuarter.set(quarter, list);
    });
  }
  return byQuarter;
}
