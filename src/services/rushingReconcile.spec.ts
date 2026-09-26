/**
 * The rushing table's Total and page 1's NET YARDS RUSHING must agree, or the
 * sheet must say why.
 *
 * "Why does all my rushing add to 261 and then my net yards rushing total is
 * 235 later in the report?" A carry is credited to the runner's line but to the
 * team total of whoever had possession on the snap, so they can part ways -
 * and two gaps made them part ways on their own.
 */
import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import { buildGameReport } from "./gameReport";
import type { PlayWithPlayers } from "./gameService";
import type { GameStatsBundle } from "./statsService";

let seq = 0;
const play = (play_type: string, yards: number, rusher: string | null, pd: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: `p${++seq}`, game_id: "g", sequence: seq, quarter: 2, clock: "05:12", possession: "us", down: 1, distance: 10,
  yard_line: 40, play_type, yards_gained: yards, is_touchdown: false, is_turnover: false, is_penalty: false,
  description: play_type, play_data: pd,
  play_players: rusher ? [{ player_id: rusher, role: "rusher", credit: null }] : [],
  ...extra,
}) as unknown as PlayWithPlayers;

function report(plays: PlayWithPlayers[]) {
  const e = new FootballStatsEngine({ rules: "high_school" });
  e.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  e.processPlays(transformPlays(plays, { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  const roster = [{ player_id: "rb", jersey_number: 22, first_name: "Reed", last_name: "Barnes" }];
  const r = buildGameReport({
    bundle: { summary: e.getGameSummary(), plays, roster, game: {} } as unknown as GameStatsBundle,
    program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#f00" },
    opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#00f" },
    gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 0, touchbackYardLine: 20,
  });
  return { r, teamNet: Number(r.teamStats.find(x => x.label === "NET YARDS RUSHING")!.us) };
}

describe("the rushing Total matches NET YARDS RUSHING", () => {
  it("counts an unrostered back's carries on a line of their own", () => {
    const { r, teamNet } = report([
      play("rush", 10, "rb"),
      play("rush", 8, null, { pending_tagged: [{ id: "pending_42", jersey_number: 42, role: "rusher" }] }),
    ]);
    expect(r.rushing.map(x => x.net).sort()).toEqual([10, 8].sort());
    expect(r.rushingTotal.net).toBe(18);
    expect(teamNet).toBe(18);
    expect(r.rushingChecks).toEqual([]);
  });

  it("puts a carry with no runner tagged on TEAM, not on an unknown opponent", () => {
    const { r, teamNet } = report([play("rush", 4, null)]);
    expect(r.rushing).toEqual([expect.objectContaining({ name: "TEAM", net: 4 })]);
    expect(r.rushingTotal.net).toBe(teamNet);
  });
});

describe("when a play's runner and possession disagree", () => {
  it("names the play, and it accounts for the whole difference", () => {
    // Recorded as their snap after a replay flipped possession, but #22 is
    // still tagged as the runner: +26 on his line, and in THEIR team total.
    const { r, teamNet } = report([
      play("rush", 235, "rb"),
      play("rush", 26, "rb", {}, { possession: "them", quarter: 3, clock: "02:40" }),
    ]);
    expect(r.rushingTotal.net).toBe(261);
    expect(teamNet).toBe(235);
    expect(r.rushingChecks).toEqual([
      { quarter: 3, clock: "02:40", runner: "#22 Reed Barnes", yards: 26, kind: "their_snap" },
    ]);
  });

  it("flags their runner on our snap the other way round", () => {
    const { r } = report([
      play("rush", 6, null, { opp_tagged: [{ id: "opp_UNK_3", jersey_number: 3, role: "rusher", name: "#3" }] }),
    ]);
    expect(r.rushingChecks).toEqual([expect.objectContaining({ yards: 6, kind: "our_snap" })]);
  });
});
