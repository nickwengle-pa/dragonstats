/**
 * Fixes from the United Valley game review (Oct 30): a fumble return touchdown
 * by an unnamed recoverer, their kneels landing on our sheet, a punt return
 * cut back by a blindside block, and a run the offense fell on after it was
 * fumbled backward.
 */
import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import { buildGameReport, playerScoringFromPlays } from "./gameReport";
import { applyLostMuffs } from "./lostMuffs";
import { resolveKickSpots } from "./kickSpots";
import { nullifiedStats, withFumbleYards } from "./statAuditRules";
import { withoutMirroredKneelTeam } from "./gameService";
import { quickKneel } from "@/components/game/quickKneel";
import { PLAY_TYPES, lastPlayerKey } from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";
import type { GameStatsBundle } from "./statsService";

const transformCtx = { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" };

function report(plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  const enginePlays = transformPlays(plays, transformCtx);
  engine.processPlays(enginePlays);
  const summary = engine.getGameSummary();
  applyLostMuffs(summary, enginePlays);
  const bundle = {
    summary, plays, game: {},
    roster: [{ player_id: "rb", jersey_number: 3, first_name: "Our", last_name: "Back" }],
  } as unknown as GameStatsBundle;
  return buildGameReport({ bundle, program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#f00" }, opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#00f" }, gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 6, touchbackYardLine: 20 });
}

/** Our back runs 17 to the 58, fumbles, and THEIR TEAM returns it 58 for six. */
const scoopAndScore = {
  id: "p85", game_id: "g", sequence: 1, quarter: 3, clock: "8:33", possession: "us",
  down: 1, distance: 10, yard_line: 41, play_type: "rush", yards_gained: 17,
  is_touchdown: true, is_turnover: true, is_penalty: false, description: "#3 rush +17 · Fumble rec TEAM, ret 58 yds · TD",
  play_data: {
    fumble_recovered_at: 58, fumble_return_yards: 58,
    opp_tagged: [{ id: "opp_team", name: "TEAM", role: "forced_fumble" }, { id: "opp_team", name: "TEAM", role: "fumble_recovery" }],
  },
  play_players: [{ player_id: "rb", role: "rusher", player: { first_name: "Our", last_name: "Back" } }],
} as unknown as PlayWithPlayers;

describe("a fumble return touchdown with the recoverer left as TEAM", () => {
  it("is their team's touchdown, not our ball carrier's", () => {
    expect(playerScoringFromPlays([scoopAndScore]).get("rb")).toBeUndefined();
    const r = report([scoopAndScore]);
    expect(r.scoring[0]).toMatchObject({ team: "TH", isUs: false });
    expect(r.scoring[0].play).toMatch(/^TH fumble return for 58 yds/);
    expect(r.points).toEqual([]);
  });

  it("is not a rushing touchdown for the team that fumbled", () => {
    const stat = report([scoopAndScore]).teamStats.find(s => s.label === "Rushing Touchdowns");
    expect(stat).toMatchObject({ us: "0", them: "0" });
  });
});

describe("a kneel on their ball", () => {
  it("is tagged for their TEAM only", () => {
    const data = quickKneel(PLAY_TYPES.find(t => t.id === "kneel")!, { possession: "them", clock: 99 });
    expect(data.tagged[0]).toMatchObject({ player_id: "opp_team", isOpponent: true });
    expect(data.tagged[0].isTeam).toBeFalsy();
    expect(data.description).toBe("Kneel · Team rushing −1 yd");
  });

  it("drops the stray copy saved under our TEAM", () => {
    const row = { play_type: "kneel", possession: "them", play_data: {
      team_tagged: [{ role: "rusher", confirmed: true }], opp_tagged: [{ id: "opp_team", role: "rusher" }],
    } };
    expect(withoutMirroredKneelTeam(row).play_data.team_tagged).toEqual([]);
    const ours = { ...row, possession: "us" };
    expect(withoutMirroredKneelTeam(ours)).toBe(ours);
  });
});

describe("a return-team foul during a punt return", () => {
  // Punt from our 45 to their 13, returned 39; blindside block at their 18.
  const pd = { kicked_to_yard: 13, return_to_ball_on: 48, penalty_type: "Blindside Block", play_category: "defense",
    penalty_enforcement: "accepted", penalty_enforcement_from: "spot_of_foul", foul_spot_ball_on: 82, kick_outcome: "returned" };

  it("counts the return only to the foul spot", () => {
    expect(resolveKickSpots({ ballOn: 55, playData: pd, description: "" })).toMatchObject({ kickDistance: 32, returnYards: 5 });
  });

  it("leaves the punt standing", () => {
    expect(nullifiedStats({ play_type: "punt", is_penalty: true, yard_line: 55, play_data: pd })).toBe(false);
  });

  it("leaves a kicking-team foul's return alone", () => {
    expect(resolveKickSpots({ ballOn: 55, playData: { ...pd, play_category: "offense" }, description: "" })?.returnYards).toBe(39);
  });
});

describe("a fumble the offense fell on", () => {
  it("credits the runner to the recovery spot", () => {
    // 11 to the 56, fumbled backward, recovered by the offense at the 52.
    const play = { play_type: "rush", yard_line: 45, yards_gained: 11, play_data: { fumble_recovered_at: 52 } };
    expect(withFumbleYards(play).yards_gained).toBe(7);
  });
});

describe("the last player remembered per kick", () => {
  it("keeps kickoffs, PATs and punts apart", () => {
    expect(lastPlayerKey("kicker", "us", "kickoff")).not.toBe(lastPlayerKey("kicker", "us", "pat"));
    expect(lastPlayerKey("kicker", "us", "onside_kick")).toBe(lastPlayerKey("kicker", "us", "kickoff"));
    expect(lastPlayerKey("returner", "us", "punt")).not.toBe(lastPlayerKey("returner", "us", "kickoff"));
    expect(lastPlayerKey("rusher", "us", "rush")).toBe("rusher:us");
  });
});
