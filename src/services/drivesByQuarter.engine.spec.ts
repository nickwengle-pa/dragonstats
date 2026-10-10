import { FootballStatsEngine, type TeamId } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import { resolveDriveResults } from "./driveResults";
import { drivesByQuarter, type QuarterDrive } from "./drivesByQuarter";
import type { PlayWithPlayers } from "./gameService";

/* The Drive Chart against the real engine: the fake DriveStats in
   drivesByQuarter.spec.ts cannot show that drive numbers, results and the
   quarter split hold up once the engine skips kickoffs. */

const US = "team-us";
const THEM = "team-them";
let seq = 0;
const secs = (clock: string) => { const [m, s] = clock.split(":").map(Number); return m * 60 + s; };
function P(quarter: number, clock: string, possession: "us" | "them", play_type: string, extra: Partial<PlayWithPlayers> = {}): PlayWithPlayers {
  seq += 1;
  return {
    id: `p${seq}`, game_id: "g", sequence: seq, quarter, clock, possession, down: 1, distance: 10,
    yard_line: 30, play_type, play_data: {}, yards_gained: 0, is_touchdown: false, is_turnover: false,
    is_penalty: false, description: `${possession} ${play_type}`, play_start_time: secs(clock),
    created_at: "", play_players: [], ...extra,
  } as PlayWithPlayers;
}
const quarterBreak = (quarter: number, possession: "us" | "them") =>
  P(quarter, "0:00", possession, "quarter_change", { description: `End of Q${quarter}` });

function chart(plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ enableGameState: true, rules: "high_school", trackDrives: true });
  const home: TeamId = { id: US, name: "Us", abbreviation: "US" };
  const away: TeamId = { id: THEM, name: "Them", abbreviation: "TH" };
  engine.setTeams(home, away);
  engine.registerPlayers([]);
  engine.processPlays(transformPlays(plays, { gameId: "g", homeTeamId: US, awayTeamId: THEM, homeTeamName: "Us", awayTeamName: "Them", programTeamId: US }));
  const summary = engine.getGameSummary();
  const drives = resolveDriveResults(summary.drives, plays.map((p) => ({
    possession: p.possession, playType: p.play_type, quarter: p.quarter, down: p.down,
    isTouchdown: p.is_touchdown, isTurnover: p.is_turnover, result: String(p.play_data?.result ?? ""),
  })));
  return drivesByQuarter(plays, drives);
}
const row = (d: QuarterDrive) => ({
  label: d.kickoffOnly ? null : d.label, kick: d.kickoffOnly, who: d.possession,
  plays: d.plays.map((p) => p.play_type).join(","),
  result: d.kickoffOnly ? null : d.stats?.result ?? null,
  from: d.continuedFrom, into: d.continuesInto,
});

describe("drive chart on the real engine", () => {
  it("labels each drive by how it ended, even after an opening kickoff", () => {
    seq = 0;
    const q1 = chart([
      P(1, "12:00", "them", "kickoff"),
      P(1, "11:50", "us", "rush", { yards_gained: 4 }),
      P(1, "10:40", "us", "punt", { down: 4, distance: 6 }),
      P(1, "10:30", "them", "rush", { yards_gained: 5 }),
      P(1, "10:00", "them", "pass_comp", { down: 2, distance: 5, yards_gained: 65, is_touchdown: true }),
      P(1, "9:50", "them", "pat", { down: 0, play_data: { result: "Good" } }),
      P(1, "9:50", "them", "kickoff"),
      P(1, "9:40", "us", "rush", { yards_gained: 3 }),
      P(1, "9:20", "us", "int", { down: 2, distance: 7, is_turnover: true }),
      P(1, "9:10", "them", "rush", { yards_gained: 5 }),
      P(1, "8:00", "them", "fg", { down: 4, distance: 5, play_data: { result: "Good" } }),
      P(1, "8:00", "them", "kickoff"),
      P(1, "7:50", "us", "rush", { yards_gained: 3 }),
    ]).get(1)!.map(row);
    expect(q1.map((d) => [d.label, d.who, d.plays, d.result])).toEqual([
      [null, "them", "kickoff", null],
      [1, "us", "rush,punt", "punt"],
      [2, "them", "rush,pass_comp,pat", "touchdown"],
      [null, "them", "kickoff", null],
      [3, "us", "rush,int", "turnover"],
      [4, "them", "rush,fg", "field_goal"],
      [null, "them", "kickoff", null],
      [5, "us", "rush", "end_of_game"],
    ]);
  });

  it("carries a drive from the 1st into the 2nd, but never across halftime", () => {
    seq = 0;
    const result = chart([
      P(1, "12:00", "us", "kickoff"),
      P(1, "0:20", "them", "rush", { yards_gained: 4 }),
      quarterBreak(1, "them"),
      P(2, "12:00", "them", "rush", { yards_gained: 3 }),
      P(2, "0:05", "them", "kneel", { down: 2, distance: 3, yards_gained: -1 }),
      quarterBreak(2, "them"),
      // The team holding the ball at the half kicks off the 3rd.
      P(3, "12:00", "them", "kickoff"),
      P(3, "11:50", "us", "rush", { yards_gained: 4 }),
    ]);
    expect(result.get(1)!.map(row).slice(-1)[0]).toMatchObject({ label: 1, into: 2 });
    expect(result.get(2)!.map(row)).toEqual([
      { label: 1, kick: false, who: "them", plays: "rush,kneel", result: "end_of_half", from: 1, into: null },
    ]);
    expect(result.get(3)!.map(row).map((d) => [d.kick, d.who, d.plays, d.from])).toEqual([
      [true, "them", "kickoff", null],
      [false, "us", "rush", null],
    ]);
  });

  it("shows the try and kickoff after a pick-six, and a lone onside kick, as kick lines", () => {
    seq = 0;
    const q1 = chart([
      P(1, "12:00", "them", "kickoff"),
      P(1, "11:50", "us", "pass_comp", { yards_gained: 8 }),
      P(1, "11:30", "us", "int", { down: 2, distance: 2, is_turnover: true, is_touchdown: true }),
      P(1, "11:30", "them", "pat", { down: 0, play_data: { result: "Good" } }),
      P(1, "11:30", "them", "kickoff"),
      P(1, "11:20", "us", "rush", { yards_gained: 4 }),
      P(1, "1:00", "us", "punt", { down: 4, distance: 2 }),
      P(1, "0:50", "them", "onside_kick"),
      P(1, "0:40", "us", "rush", { yards_gained: 2 }),
    ]).get(1)!.map(row);
    expect(q1.map((d) => [d.label, d.who, d.plays])).toEqual([
      [null, "them", "kickoff"],
      [1, "us", "pass_comp,int", ],
      [null, "them", "pat,kickoff"],
      [2, "us", "rush,punt"],
      [null, "them", "onside_kick"],
      [3, "us", "rush"],
    ]);
    expect(q1[1].result).toBe("turnover");
  });
});
