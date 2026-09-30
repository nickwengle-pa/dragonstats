/**
 * Interceptions and fumbles brought back by the defense. A scoop-and-score
 * used to reach the final score and no stat line: the report's fumble-return
 * touchdowns were a hard 0 and there was no fumble return column anywhere.
 */
import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { defensiveReturnsFromPlays } from "./defensiveReturns";
import { buildGameReport } from "./gameReport";

const pp = (player_id: string, role: string) => ({ player_id, role });

describe("defensiveReturnsFromPlays", () => {
  it("tallies picks and takeaway fumbles, with the long", () => {
    const tally = defensiveReturnsFromPlays([
      { play_type: "int", is_turnover: true, yards_gained: 0, play_data: { interception_return_yards: 18 }, play_players: [pp("cb", "interceptor")] },
      { play_type: "int", is_turnover: true, yards_gained: 0, play_data: { interception_return_yards: 6 }, play_players: [pp("cb", "interceptor")] },
      // A strip-sack keeps its own play type; the turnover flag is what says the ball changed hands.
      { play_type: "sack", is_turnover: true, yards_gained: -8, play_data: { fumble_return_yards: 42 }, play_players: [pp("lb", "fumble_recovery")] },
      { play_type: "fumble", is_turnover: true, yards_gained: 3, play_data: { fumble_return_yards: null }, play_players: [pp("lb", "fumble_recovery")] },
    ] as never);
    expect(tally.get("cb")!.int).toEqual({ no: 2, yds: 24, long: 18 });
    expect(tally.get("lb")!.fr).toEqual({ no: 2, yds: 42, long: 42 });
  });

  it("an offense falling on its own fumble is no defensive return", () => {
    const tally = defensiveReturnsFromPlays([
      { play_type: "rush", is_turnover: false, yards_gained: 4, play_data: { fumble_return_yards: 0 }, play_players: [pp("rb", "fumble_recovery")] },
    ] as never);
    expect(tally.size).toBe(0);
  });

  it("a pick recorded before the return spot was stored falls back to its yardage", () => {
    const tally = defensiveReturnsFromPlays([
      { play_type: "int", is_turnover: true, yards_gained: 12, play_data: {}, play_players: [pp("cb", "interceptor")] },
    ] as never);
    expect(tally.get("cb")!.int).toEqual({ no: 1, yds: 12, long: 12 });
  });
});

describe("the game report shows a fumble returned for a touchdown", () => {
  const report = () => {
    const engine = new FootballStatsEngine({ rules: "high_school" });
    engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
    const summary = engine.getGameSummary();
    summary.defense.lb = {
      playerName: "Test LB", totalTackles: 0, soloTackles: 0, assistedTackles: 0, sacks: 0, sackYards: 0,
      tacklesForLoss: 0, forcedFumbles: 0, fumbleRecoveries: 1, fumbleRecoveryYards: 42, fumbleRecoveryTouchdowns: 1,
      interceptions: 0, interceptionYards: 0, interceptionTouchdowns: 0, passesDefended: 0, qbHits: 0,
    } as never;
    return buildGameReport({
      bundle: {
        summary, game: {},
        roster: [{ player_id: "lb", jersey_number: 44, first_name: "Test", last_name: "LB" }],
        plays: [
          { play_type: "rush", possession: "them", is_turnover: true, is_touchdown: true, yards_gained: 3, quarter: 2,
            play_data: { fumble_return_yards: 42 }, play_players: [pp("lb", "fumble_recovery")] },
        ],
      } as never,
      program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#008000" },
      opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#000000" },
      gameDate: null, kickoffLabel: null, occasion: null, ourScore: 6, theirScore: 0, touchbackYardLine: 20,
    });
  };

  it("in the defense table", () => {
    const r = report();
    expect(r.defense[0]).toMatchObject({ fr: 1, frYds: 42, frTd: 1, intTd: 0 });
    expect(r.defenseTotal).toMatchObject({ frTd: 1 });
  });

  it("as a fumble return beside the other returns", () => {
    const r = report();
    expect(r.returns[0].fr).toEqual({ no: 1, yds: 42, long: 42, td: 1 });
    expect(r.returnsTotal.fr).toEqual({ no: 1, yds: 42, long: 42, td: 1 });
  });

  it("in the team line, which printed a hard zero", () => {
    const line = report().teamStats.find(t => t.label.startsWith("Fumble returns"));
    expect(line?.us).toBe("1-42-1");
  });
});
