import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";

function summary(rules: "high_school" | "nfl", defenders = ["d1"]) {
  const engine = new FootballStatsEngine({ rules, trackDrives: false });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  engine.registerPlayers(["qb", ...defenders].map(id => ({ id, name: id })));
  const play = {
    id: "sack", game_id: "game", sequence: 1, quarter: 1, clock: "10:00", down: 1, distance: 10,
    yard_line: 40, possession: "us", play_type: "sack", play_data: {}, yards_gained: -7,
    is_touchdown: false, is_turnover: false, is_penalty: false, description: "Sack -7", play_start_time: 600,
    play_players: [{ player_id: "qb", role: "passer" }, ...defenders.map(player_id => ({ player_id, role: "sacker", credit: 1 / defenders.length }))],
  } as unknown as PlayWithPlayers;
  engine.processPlays(transformPlays([play], { gameId: "game", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  return engine.getGameSummary();
}

describe("NFHS sacks through the app transformer and engine", () => {
  it("charges a carry and rushing loss, preserving passing and total offense", () => {
    const s = summary("high_school");
    expect(s.rushing.qb.carries).toBe(1);
    expect(s.rushing.qb.yards).toBe(-7);
    expect(s.passing.qb.attempts).toBe(0);
    expect(s.passing.qb.yards).toBe(0);
    expect(s.homeTeamStats.rushAttempts).toBe(1);
    expect(s.homeTeamStats.rushingYards).toBe(-7);
    expect(s.homeTeamStats.totalYards).toBe(-7);
    expect(s.defense.d1.sacks).toBe(1);
    expect(s.defense.d1.soloTackles).toBe(1);
    expect(s.defense.d1.tacklesForLoss).toBe(1);
  });
  it("splits sacks, tackles, TFLs and sack yards without double credit", () => {
    const s = summary("high_school", ["d1", "d2"]);
    for (const id of ["d1", "d2"]) {
      expect(s.defense[id].sacks).toBe(0.5);
      expect(s.defense[id].assistedTackles).toBe(1);
      expect(s.defense[id].soloTackles).toBe(0);
      expect(s.defense[id].totalTackles).toBe(0.5);
      expect(s.defense[id].tacklesForLoss).toBe(0.5);
      expect(s.defense[id].sackYards).toBe(3.5);
    }
  });
  it("preserves NFL rushing treatment", () => {
    const s = summary("nfl");
    expect(s.rushing.qb).toBeUndefined();
    expect(s.homeTeamStats.rushAttempts).toBe(0);
    expect(s.homeTeamStats.rushingYards).toBe(0);
    expect(s.homeTeamStats.totalYards).toBe(-7);
  });
});
