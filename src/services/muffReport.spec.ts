/**
 * Where a muff the kicking team recovered lands in the printed game report:
 * the returner's Fum column, the team's Fumbles: Number-Lost row, and the
 * other side's Fumble returns.
 */
import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import { buildGameReport } from "./gameReport";
import { applyLostMuffs } from "./lostMuffs";
import type { PlayWithPlayers } from "./gameService";
import type { GameStatsBundle } from "./statsService";

/** A punt from the kicking team's 30 landing on the receivers' 30, muffed
 *  and recovered by the kicking team at the receivers' 28. */
function lostMuff(kicking: "us" | "them", returner: string): PlayWithPlayers {
  return {
    id: kicking, game_id: "g", sequence: 1, quarter: 1, clock: "10:00", possession: kicking,
    down: 4, distance: 8, yard_line: 30, play_type: "punt", yards_gained: 42,
    is_touchdown: false, is_turnover: false, is_penalty: false, description: "Punt",
    play_data: { kick_outcome: "muffed", muff_recovered_by_kicking: true, kicked_to_yard: 30, return_to_ball_on: 72 },
    play_players: [
      { player_id: kicking === "us" ? "p" : "opp_p", role: "punter" },
      { player_id: returner, role: "returner" },
    ],
  } as unknown as PlayWithPlayers;
}

function report(plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  const enginePlays = transformPlays(plays, { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" });
  engine.processPlays(enginePlays);
  const summary = engine.getGameSummary();
  applyLostMuffs(summary, enginePlays);
  const bundle = {
    summary, plays, game: {},
    roster: [
      { player_id: "r", jersey_number: 3, first_name: "Our", last_name: "Returner" },
      { player_id: "p", jersey_number: 9, first_name: "Our", last_name: "Punter" },
    ],
  } as unknown as GameStatsBundle;
  return buildGameReport({ bundle, program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#f00" }, opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#00f" }, gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 0, touchbackYardLine: 20 });
}
const stat = (r: ReturnType<typeof report>, label: string) => r.teamStats.find(s => s.label === label);

describe("a lost muff in the game report", () => {
  it("puts our returner's muff in his Fum column with no return attempt", () => {
    const r = report([lostMuff("them", "r")]);
    const row = r.returns.find(x => x.name.includes("Returner"));
    expect(row?.punt).toMatchObject({ no: 0, fum: 1 });
    expect(r.returnsTotal.punt).toMatchObject({ no: 0, fum: 1 });
  });

  it("counts it in our fumbles lost and in their fumble returns", () => {
    const r = report([lostMuff("them", "r")]);
    expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "1-1", them: "0-0" });
    expect(stat(r, "Fumble returns: Number-Yards-TD")).toMatchObject({ us: "0-0-0", them: "1-0-0" });
  });

  it("counts their muff that we recovered on both sides", () => {
    const r = report([lostMuff("us", "opp_r")]);
    expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "0-0", them: "1-1" });
    expect(stat(r, "Fumble returns: Number-Yards-TD")).toMatchObject({ us: "1-0-0", them: "0-0-0" });
    // Their returner is not on our return table.
    expect(r.returns).toHaveLength(0);
  });
});
