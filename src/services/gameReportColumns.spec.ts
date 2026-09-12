import { expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { buildGameReport } from "./gameReport";

it("separates sack losses and includes return touchdowns in player and total rows", () => {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  const summary = engine.getGameSummary();
  summary.rushing.qb = { carries: 4, yards: 10, touchdowns: 0, longRush: 20, fumbles: 0 } as never;
  summary.passing.qb = { attempts: 0, sackYardsLost: 7 } as never;
  summary.returns.qb = { kickReturns: 2, kickReturnYards: 100, kickReturnLong: 90, kickReturnTouchdowns: 1,
    puntReturns: 1, puntReturnYards: 60, puntReturnLong: 60, puntReturnTouchdowns: 1 } as never;
  summary.defense.qb = { interceptionTouchdowns: 1 } as never;
  const report = buildGameReport({
    bundle: { summary, game: {}, roster: [{ player_id: "qb", jersey_number: 7, first_name: "Test", last_name: "QB" }], plays: [
      { play_type: "rush", possession: "us", yards_gained: 20, quarter: 1, play_data: {}, play_players: [{ player_id: "qb", role: "rusher" }] },
      { play_type: "int", possession: "them", yards_gained: 60, quarter: 1, play_data: {}, play_players: [{ player_id: "qb", role: "interceptor" }] },
    ] } as never,
    program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#008000" },
    opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#000000" },
    gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 0, touchbackYardLine: 20,
  });
  for (const r of [report.rushing[0], report.rushingTotal]) {
    expect(r).toMatchObject({ gain: 20, loss: -3, sackYds: -7, net: 10 });
    expect(r.gain + r.loss + r.sackYds).toBe(r.net);
  }
  for (const r of [report.returns[0], report.returnsTotal]) {
    expect([r.ko.td, r.punt.td, r.int.td]).toEqual([1, 1, 1]);
  }
});
