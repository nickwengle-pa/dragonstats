/**
 * Interceptions and fumbles brought back, per player, read off the plays.
 *
 * The engine keeps the count and yards of both but no long, and the reports
 * print No-Yds-Lg-TD for every kind of return. The game report already built
 * its interception column this way; fumble returns never had one at all, so a
 * scoop-and-score reached the final score and no return line. One helper, so
 * the game report, the season report and the season stats page count them the
 * same way. Touchdowns stay with the engine, as for kick and punt returns.
 */
import type { PlayWithPlayers } from "./gameService";

export interface ReturnTally { no: number; yds: number; long: number }

export interface DefensiveReturnTally { int: ReturnTally; fr: ReturnTally }

/** The ball changed hands on a fumble. A pick and a kick have lines of their
 *  own, and a fumble on a run or a sack keeps its own play type - the same
 *  test the scoring ledger uses. */
export function isFumbleLost(play: Pick<PlayWithPlayers, "is_turnover" | "play_type">): boolean {
  return Boolean(play.is_turnover)
    && !["int", "kickoff", "onside_kick", "punt", "fair_catch", "blocked_kick"].includes(play.play_type);
}

const credited = (play: PlayWithPlayers, role: string): string | null =>
  play.play_players?.find(pp => pp.role === role)?.player_id ?? null;

const add = (t: ReturnTally, yds: number) => {
  t.no += 1;
  t.yds += yds;
  t.long = Math.max(t.long, yds);
};

export function defensiveReturnsFromPlays(plays: PlayWithPlayers[]): Map<string, DefensiveReturnTally> {
  const out = new Map<string, DefensiveReturnTally>();
  const tallyFor = (id: string) => {
    let t = out.get(id);
    if (!t) { t = { int: { no: 0, yds: 0, long: 0 }, fr: { no: 0, yds: 0, long: 0 } }; out.set(id, t); }
    return t;
  };
  for (const play of plays) {
    const pd = (play.play_data ?? {}) as Record<string, unknown>;
    if (play.play_type === "int") {
      const id = credited(play, "interceptor");
      if (!id) continue;
      // The playTransformer's fallback for a pick recorded before the return
      // spot was stored, so this agrees with the engine's yardage.
      const stored = pd.interception_return_yards;
      add(tallyFor(id).int, typeof stored === "number" ? stored : Math.max(0, Number(play.yards_gained) || 0));
    } else if (isFumbleLost(play)) {
      const id = credited(play, "fumble_recovery");
      if (!id) continue;
      const stored = Number(pd.fumble_return_yards);
      add(tallyFor(id).fr, pd.fumble_return_yards != null && Number.isFinite(stored) ? stored : 0);
    }
  }
  return out;
}
