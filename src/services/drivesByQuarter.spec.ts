import { describe, expect, it } from "vitest";
import type { DriveStats } from "football-stats-engine";
import type { PlayWithPlayers } from "./gameService";
import { drivesByQuarter } from "./drivesByQuarter";

let seq = 0;
const play = (patch: Partial<PlayWithPlayers> = {}): PlayWithPlayers => ({
  id: `p${++seq}`, sequence: seq, game_id: "g", quarter: 1, clock: "10:00", possession: "us",
  down: 1, distance: 10, yard_line: 25, play_type: "rush", play_data: {}, yards_gained: 4,
  is_touchdown: false, is_turnover: false, is_penalty: false, description: "Run",
  created_at: "", play_players: [], ...patch,
});

describe("drives by quarter", () => {
  it("numbers drives on possession change and matches the engine's drive by number", () => {
    const plays = [
      play({ play_type: "kickoff" }),
      play({ possession: "them" }), play({ possession: "them", play_type: "punt" }),
      play(), play({ is_touchdown: true }),
    ];
    const stats = { driveNumber: 3, plays: 2 } as DriveStats;
    const q1 = drivesByQuarter(plays, [stats]).get(1)!;
    expect(q1.map((d) => [d.driveNumber, d.possession, d.plays.length, d.kickoffOnly])).toEqual([
      [1, "us", 1, true], [2, "them", 2, false], [3, "us", 2, false],
    ]);
    expect(q1[2].stats).toBe(stats);
    expect(q1.filter((d) => !d.kickoffOnly).map((d) => d.label)).toEqual([1, 2]);
  });

  it("shows a drive that crosses a quarter break under both quarters, marked continued", () => {
    const plays = [
      play({ quarter: 1 }),
      play({ play_type: "quarter_change", description: "End of 1st" }),
      play({ quarter: 2 }), play({ quarter: 2 }),
    ];
    const result = drivesByQuarter(plays, []);
    const [first] = result.get(1)!;
    const [second] = result.get(2)!;
    expect([first.plays.length, first.continuedFrom, first.continuesInto]).toEqual([1, null, 2]);
    expect([second.plays.length, second.continuedFrom, second.continuesInto]).toEqual([2, 1, null]);
    expect(second.driveNumber).toBe(first.driveNumber);
  });

  it("keeps game order even when rows arrive out of sequence", () => {
    const a = play(); const b = play({ possession: "them" });
    const q1 = drivesByQuarter([b, a], []).get(1)!;
    expect(q1.map((d) => d.possession)).toEqual(["us", "them"]);
  });
});
