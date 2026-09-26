/**
 * "The last TOP needs to calc the remaining time left on the clock if End Game
 * is clicked before time is put to 0."
 */
import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";
import { runOutFinalClock } from "./finalClock";
import { liveDriveRows } from "./liveDriveRows";
import type { PlayRecord } from "@/components/game/types";

let seq = 0;
const play = (quarter: number, clock: string, possession: "us" | "them", play_type = "rush", pd: Record<string, unknown> = {}) => ({
  id: `p${++seq}`, game_id: "g", sequence: seq, quarter, clock, possession, down: 1, distance: 10,
  yard_line: 40, play_type, yards_gained: play_type === "kneel" ? -1 : 4, is_touchdown: false, is_turnover: false,
  is_penalty: false, description: play_type, play_data: pd, play_players: [],
}) as unknown as PlayWithPlayers;

function summary(plays: PlayWithPlayers[]) {
  const e = new FootballStatsEngine({ rules: "high_school", trackDrives: true });
  e.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  e.processPlays(transformPlays(plays, { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  return e.getGameSummary();
}

/** Their drive for the first three minutes of the fourth, then ours. */
const fourth = (last: PlayWithPlayers) => [
  play(4, "12:00", "them"), play(4, "11:00", "them"),
  play(4, "10:00", "them", "punt", { kick_outcome: "fair_catch", next_possession: "us" }),
  play(4, "9:00", "us"), last,
];

describe("a game ended with time on the clock", () => {
  it("gives the time left to the drive that was running it out", () => {
    const before = summary(fourth(play(4, "1:32", "us", "kneel")));
    expect(before.homeTeamStats.timeOfPossessionSeconds).toBe(448); // 9:00 to the 1:32 snap

    const after = runOutFinalClock(before, "us");
    expect(after.drives[after.drives.length - 1]).toMatchObject({ team: "us", endTime: "0:00", timeOfPossessionSeconds: 540, timeOfPossession: "9:00" });
    expect(after.homeTeamStats).toMatchObject({ timeOfPossessionSeconds: 540, timeOfPossession: "9:00" });
    // The whole quarter is accounted for.
    expect(after.homeTeamStats.timeOfPossessionSeconds + after.awayTeamStats.timeOfPossessionSeconds).toBe(720);
    expect(after.awayTeamStats).toBe(before.awayTeamStats);
  });

  it("gives it to the other team when the last play handed them the ball", () => {
    const before = summary(fourth(play(4, "1:00", "us", "punt", { kick_outcome: "fair_catch" })));
    const after = runOutFinalClock(before, "them");
    // Our drive did end on the punt, so it stays as it was.
    expect(after.drives[after.drives.length - 1]).toEqual(before.drives[before.drives.length - 1]);
    expect(after.awayTeamStats.timeOfPossessionSeconds).toBe(before.awayTeamStats.timeOfPossessionSeconds + 60);
    expect(after.homeTeamStats.timeOfPossessionSeconds).toBe(before.homeTeamStats.timeOfPossessionSeconds);
  });

  it("assumes the last drive's team when nobody is named", () => {
    const after = runOutFinalClock(summary(fourth(play(4, "1:32", "us", "kneel"))), null);
    expect(after.homeTeamStats.timeOfPossessionSeconds).toBe(540);
  });

  it("leaves a game that already reached 0:00, overtime, and a game stopped early alone", () => {
    for (const plays of [
      fourth(play(4, "0:00", "us", "kneel")),
      [play(5, "0:00", "us"), play(5, "0:00", "us")],
      [play(3, "8:00", "us"), play(3, "6:00", "us")],
    ]) {
      const s = summary(plays);
      expect(runOutFinalClock(s, "us")).toBe(s);
    }
  });
});

describe("the live play list's last drive", () => {
  const rec = (id: string, clock: number, patch: Partial<PlayRecord> = {}): PlayRecord => ({
    id, possession: "us", quarter: 4, clock, type: "rush", yards: 4, result: "", penalty: null, flagYards: 0,
    isTouchdown: false, firstDown: false, turnover: false, tagged: [], ballOn: 40, down: 1, distance: 10,
    description: "", ...patch,
  });
  const drive = { driveNumber: 1, startQuarter: 4, startTime: "9:00", plays: 2, yards: 3, timeOfPossessionSeconds: 448 } as never;

  it("runs to 0:00 once the game is final", () => {
    const plays = [rec("run", 540), rec("kneel", 92, { type: "kneel", nextPossession: "us" })];
    expect(liveDriveRows(plays, [drive], "us", true, 720).get("kneel")?.seconds).toBe(540);
  });

  it("ends at its last play when that play gave the ball away", () => {
    const plays = [rec("run", 540), rec("punt", 60, { type: "punt", nextPossession: "them" })];
    expect(liveDriveRows(plays, [drive], "them", true, 720).get("punt")?.seconds).toBe(480);
  });
});
