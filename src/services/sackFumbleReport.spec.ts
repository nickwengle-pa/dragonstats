/**
 * A fumble on a sack or a run keeps its own play type, so the Game Report's
 * "Fumbles: Number-Lost" row has to find it some other way than by type.
 */
import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import { buildGameReport } from "./gameReport";
import type { PlayWithPlayers } from "./gameService";
import type { GameStatsBundle } from "./statsService";

const snap = (over: Partial<PlayWithPlayers>, oppTagged: unknown[], players: unknown[]): PlayWithPlayers => ({
  id: over.id ?? "x", game_id: "g", sequence: 1, quarter: 1, clock: "10:00", possession: "us",
  down: 2, distance: 10, yard_line: 30, play_type: "sack", yards_gained: -7,
  is_touchdown: false, is_turnover: false, is_penalty: false, description: "",
  ...over,
  play_data: { opp_tagged: oppTagged, ...(over.play_data ?? {}) },
  play_players: players,
} as unknown as PlayWithPlayers);

function report(plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  const enginePlays = transformPlays(plays, { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" });
  engine.processPlays(enginePlays);
  const bundle = {
    summary: engine.getGameSummary(), plays, game: {},
    roster: [{ player_id: "qb", jersey_number: 8, first_name: "Our", last_name: "Qb" }],
  } as unknown as GameStatsBundle;
  return buildGameReport({ bundle, program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#f00" }, opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#00f" }, gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 0, touchbackYardLine: 20 });
}
const stat = (r: ReturnType<typeof report>, label: string) => r.teamStats.find(s => s.label === label);
const forced = [{ id: "opp_team", name: "TEAM", role: "forced_fumble" }];

describe("fumbles on a sack or a run in the game report", () => {
  it("counts a lost sack-fumble as a fumble and as lost", () => {
    const r = report([snap({ is_turnover: true }, forced, [{ player_id: "qb", role: "passer" }])]);
    expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "1-1" });
    // High school charges a sack as a carry, fumble and all.
    expect(r.rushing.find(x => x.name.includes("Qb"))).toMatchObject({ att: 1, sackYds: -7, fum: 1 });
  });

  it("counts a run fumble the offense kept as a fumble, not lost", () => {
    const r = report([snap({ play_type: "rush", yards_gained: 4 }, forced,
      [{ player_id: "qb", role: "rusher" }, { player_id: "qb", role: "fumble_recovery" }])]);
    expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "1-0" });
  });

  it("does not count an ordinary sack", () => {
    const r = report([snap({}, [], [{ player_id: "qb", role: "passer" }])]);
    expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "0-0" });
  });
});
