/**
 * A game marked final ran its clock out, whether or not the app's clock was
 * ever wound down to 0:00.
 *
 * "The last TOP needs to calc the remaining time left on the clock if End Game
 * is clicked before time is put to 0." The engine ends the last drive at its
 * own last snap, because there is no next play to end it on. Mid-game that is
 * right - the next snap hasn't happened. At the final whistle it drops whatever
 * was left: a kneel-down at 1:32 that nobody winds down to 0:00 costs the team
 * with the ball a minute and a half of possession, and the two TOPs stop adding
 * up to the game.
 *
 * So once the game is final, the time left after the last snap of the fourth
 * quarter belongs to whoever had the ball. When that is the team whose drive it
 * was, the drive runs to 0:00. When the last play handed the ball over (a punt,
 * a turnover), the drive really did end there and stays as it was; the time goes
 * on the new team's total with no drive of its own, since they never snapped it.
 *
 * Overtime has no game clock, and a game stopped before the fourth (weather, a
 * forfeit) never played the rest of its quarter, so neither gets the time.
 */
import type { DriveStats, GameSummary, TeamStats } from "football-stats-engine";

/** Quarter.Fourth. Written out so this module has no runtime engine import. */
const FOURTH_QUARTER = 4;

function toSeconds(clock: string): number {
  const [m, s] = clock.split(":").map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : 0;
}

/** Same "M:SS" the engine writes. */
function toClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The summary with the clock left at the end of a final game credited.
 *
 * `holder` is the team id with the ball when the game ended - the possession
 * after the last play. Without one, the last drive's team is assumed.
 */
export function runOutFinalClock(summary: GameSummary, holder: string | null): GameSummary {
  const last = summary.drives[summary.drives.length - 1];
  if (!last || last.endQuarter !== FOURTH_QUARTER) return summary;
  const left = toSeconds(last.endTime);
  if (left <= 0) return summary;

  const team = holder ?? last.team;
  const drives: DriveStats[] = team === last.team
    ? [...summary.drives.slice(0, -1), {
        ...last,
        endTime: "0:00",
        timeOfPossessionSeconds: last.timeOfPossessionSeconds + left,
        timeOfPossession: toClock(last.timeOfPossessionSeconds + left),
      }]
    : summary.drives;

  const credit = (stats: TeamStats): TeamStats => {
    if (stats.teamId !== team) return stats;
    const seconds = stats.timeOfPossessionSeconds + left;
    const own = drives.filter(d => d.team === team);
    return {
      ...stats,
      timeOfPossessionSeconds: seconds,
      timeOfPossession: toClock(seconds),
      ...(own.length > 0 ? {
        averageDriveTime: toClock(Math.round(own.reduce((sum, d) => sum + d.timeOfPossessionSeconds, 0) / own.length)),
      } : {}),
    };
  };

  return {
    ...summary,
    drives,
    homeTeamStats: credit(summary.homeTeamStats),
    awayTeamStats: credit(summary.awayTeamStats),
  };
}
