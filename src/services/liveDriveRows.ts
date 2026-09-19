import type { DriveStats } from "football-stats-engine";
import type { PlayRecord } from "@/components/game/types";

export interface LiveDriveRow {
  possession: "us" | "them";
  plays: number;
  yards: number;
  seconds: number;
  playIds: string[];
}

/** Anchor each finished drive to its last recorded play. Drive numbers mirror
 * replayLiveGame, including gaps for kickoff-only possessions. */
export function liveDriveRows(
  plays: PlayRecord[], drives: DriveStats[], possession: "us" | "them",
  completed: boolean, quarterLength: number,
): Map<string, LiveDriveRow> {
  const runs: PlayRecord[][] = [];
  for (const play of plays) {
    if (play.type === "quarter_change") continue;
    const current = runs[runs.length - 1];
    if (!current || current[0].possession !== play.possession) runs.push([play]);
    else current.push(play);
  }
  const rows = new Map<string, LiveDriveRow>();
  runs.forEach((run, index) => {
    const last = run[run.length - 1];
    const next = runs[index + 1]?.[0];
    if (!next && !completed && possession === last.possession) return;
    const drive = drives.find(d => d.driveNumber === index + 1);
    // Kickoff-only possessions have no offensive drive to summarize.
    if (!drive || drive.plays === 0) return;
    const storedEnd = last.playData?.recorded_end_clock_seconds;
    const endClock = typeof storedEnd === "number" && Number.isFinite(storedEnd)
      ? storedEnd : next?.clock ?? last.clock;
    const endQuarter = typeof storedEnd === "number" ? last.quarter : next?.quarter ?? last.quarter;
    const [minutes, seconds] = drive.startTime.split(":").map(Number);
    const elapsed = (endQuarter - drive.startQuarter) * quarterLength + minutes * 60 + seconds - endClock;
    rows.set(last.id, {
      possession: last.possession, plays: drive.plays, yards: drive.yards,
      playIds: run.map(play => play.id),
      seconds: Math.max(0, Number.isFinite(elapsed) ? elapsed : drive.timeOfPossessionSeconds),
    });
  });
  return rows;
}
