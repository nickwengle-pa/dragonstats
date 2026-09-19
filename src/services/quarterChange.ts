import { quarterLabel, type GameState, type PlayRecord } from "../components/game/types";

export function createQuarterChange(before: GameState, after: GameState, sequence: number): PlayRecord {
  const label = after.quarter >= 5 ? quarterLabel(after.quarter) : `${quarterLabel(after.quarter)} quarter`;
  return {
    id: "pending-quarter-change", sequence, quarter: after.quarter, clock: after.clock,
    type: "quarter_change", yards: 0, result: "", penalty: null, flagYards: 0,
    isTouchdown: false, firstDown: false, turnover: false, tagged: [],
    possession: after.possession, down: after.down, distance: after.distance, ballOn: after.ballOn,
    nextPossession: after.possession, nextDown: after.down, nextDistance: after.distance, nextBallOn: after.ballOn,
    description: after.quarter > before.quarter ? `Start ${label}${after.quarter === 3 ? " — second half" : ""}` : `Quarter corrected to ${label}`,
    playData: {
      quarter_change_before: { ...before },
      next_situation_source: "quarter_change",
      recorded_start_clock_seconds: after.clock,
      recorded_end_clock_seconds: after.clock,
    },
  };
}

export function quarterChangeBefore(play: PlayRecord): GameState | null {
  const before = play.playData?.quarter_change_before as GameState | undefined;
  if (play.type !== "quarter_change" || !before || !["us", "them"].includes(before.possession)) return null;
  return [before.quarter, before.clock, before.down, before.distance, before.ballOn, before.ourScore, before.theirScore].every(Number.isFinite) ? before : null;
}
