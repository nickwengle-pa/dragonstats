import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { buildGameReport } from "./gameReport";
import type { PlayWithPlayers } from "./gameService";

function play(type: string, counts: boolean | null = false, enforcement = "accepted"): PlayWithPlayers {
  return {
    id: `${type}-${enforcement}`, game_id: "report", sequence: 1, quarter: 1, clock: "10:00",
    down: 1, distance: 10, yard_line: 40, possession: "us", play_type: type,
    yards_gained: 60, is_touchdown: type === "rush", is_turnover: false, is_penalty: counts != null,
    play_data: counts == null ? { result: "Good" } : {
      result: "Good", penalty_type: "Facemask", penalty_enforcement: enforcement,
      penalty_play_counts: counts, penalty_yards: 0, play_category: "defense",
    },
    play_players: [{ player_id: "player", role: type === "rush" ? "rusher" : "kicker" }],
  } as unknown as PlayWithPlayers;
}

function report(plays: PlayWithPlayers[], ourScore = 0, theirScore = 0) {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  return buildGameReport({
    bundle: { summary: engine.getGameSummary(), game: {}, plays,
      roster: [{ player_id: "player", jersey_number: 7, first_name: "Test", last_name: "Player" }] } as never,
    program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#008000" },
    opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#000000" },
    gameDate: null, kickoffLabel: null, occasion: null, ourScore, theirScore, touchbackYardLine: 20,
  });
}

describe("report scoring after penalty decisions", () => {
  for (const enforcement of ["accepted", "offset"]) {
    it(`excludes ${enforcement} no-play scores, player points, and kicking counts`, () => {
      const result = report(["rush", "fg", "pat", "two_pt", "safety"].map(type => play(type, false, enforcement)));
      expect(result.lineScore.us).toEqual([0, 0, 0, 0]);
      expect(result.lineScore.them).toEqual([0, 0, 0, 0]);
      expect(result.scoring).toEqual([]);
      expect(result.points).toEqual([]);
      expect(result.pointsTotal).toBe(0);
      for (const label of ["PAT Kicks", "Field Goals"]) {
        expect(result.teamStats.find(row => row.label === label)?.us).toBe("0-0");
      }
    });
  }

  it("folds the actual counted retry into a touchdown instead of a wiped PAT", () => {
    const result = report([play("rush", null), play("pat", false), play("pat", null)], 7);
    expect(result.lineScore.us).toEqual([7, 0, 0, 0]);
    expect(result.scoring).toHaveLength(1);
    expect(result.scoring[0].score).toBe("0-7");
    expect(result.pointsTotal).toBe(7);
    expect(result.teamStats.find(row => row.label === "PAT Kicks")?.us).toBe("1-1");
  });

  it("retains a declined field goal in the narrative and player points", () => {
    const result = report([play("fg", false, "declined")], 3);
    expect(result.lineScore.us).toEqual([3, 0, 0, 0]);
    expect(result.scoring).toHaveLength(1);
    expect(result.scoring[0].score).toBe("0-3");
    expect(result.pointsTotal).toBe(3);
    expect(result.teamStats.find(row => row.label === "Field Goals")?.us).toBe("1-1");
  });

  it("retains a counted field goal with an accepted tack-on foul", () => {
    const result = report([play("fg", true)], 3);
    expect(result.scoring).toHaveLength(1);
    expect(result.pointsTotal).toBe(3);
    expect(result.teamStats.find(row => row.label === "Field Goals")?.us).toBe("1-1");
  });
});
