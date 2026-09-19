import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import { buildGameReport } from "./gameReport";
import { isOutOfBoundsKickoff } from "./kickoffOutOfBounds";
import type { PlayWithPlayers } from "./gameService";
import type { GameStatsBundle } from "./statsService";

function kick(id: string, data: Record<string, unknown>, extra: Partial<PlayWithPlayers> = {}): PlayWithPlayers {
  return { id, game_id: "game", sequence: Number(id), quarter: 1, clock: "10:00", possession: "us", down: 1, distance: 10, yard_line: 40, play_type: "kickoff", yards_gained: 55, is_touchdown: false, is_turnover: false, is_penalty: false, description: "Kickoff", play_data: data, play_players: [{ player_id: "k", role: "kicker", player: { first_name: "Test", last_name: "Kicker" } }], ...extra } as PlayWithPlayers;
}
function report(plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  engine.processPlays(transformPlays(plays, { gameId: "game", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  const summary = engine.getGameSummary();
  const bundle = { summary, plays, roster: [{ player_id: "k", jersey_number: 1, first_name: "Test", last_name: "Kicker" }], game: {} } as unknown as GameStatsBundle;
  return { summary, report: buildGameReport({ bundle, program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#f00" }, opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#00f" }, gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 0, touchbackYardLine: 20 }) };
}
describe("out-of-bounds kickoff report yardage", () => {
  it("counts an awarded-spot kickoff but gives it no distance, even beside a normal kick", () => {
    const result = report([
      kick("1", { kicked_to_yard: 5, kick_outcome: "out_of_bounds", kickoff_out_of_bounds_choice: "take_35" }),
      kick("2", { kicked_to_yard: 10, return_to_ball_on: 75, kick_outcome: "returned" }),
    ]);
    expect(result.summary.kicking.k).toMatchObject({ kickoffs: 2, averageKickoffDistance: 50 });
    expect(result.report.kickoffs[0]).toMatchObject({ no: 2, yds: 50, avg: 50 });
    expect(result.report.kickoffsTotal).toMatchObject({ no: 2, yds: 50, avg: 50 });
  });
  it("reports zero yardage when every kickoff went out of bounds", () => {
    const result = report([kick("1", { kicked_to_yard: 5, kickoff_out_of_bounds_choice: "take_35" })]);
    expect(result.report.kickoffsTotal).toMatchObject({ no: 1, yds: 0, avg: 0 });
  });
  it("recognizes older recorded outcomes and descriptions without affecting punts", () => {
    expect(isOutOfBoundsKickoff(kick("1", { kick_outcome: "out_of_bounds" }))).toBe(true);
    expect(isOutOfBoundsKickoff(kick("1", {}, { description: "Kickoff 55 yds · Out of Bounds" }))).toBe(true);
    expect(isOutOfBoundsKickoff(kick("1", { kick_outcome: "out_of_bounds" }, { play_type: "punt" }))).toBe(false);
  });
  it("keeps a re-kick out of the attempt count", () => {
    const result = report([kick("1", { kicked_to_yard: 5, kickoff_out_of_bounds_choice: "rekick" }), kick("2", { kicked_to_yard: 0, is_touchback: true })]);
    expect(result.report.kickoffsTotal).toMatchObject({ no: 1, yds: 60, avg: 60 });
  });
});
