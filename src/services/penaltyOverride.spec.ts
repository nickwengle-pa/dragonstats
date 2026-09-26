/**
 * The operator's call on a flag outranks the rules the app applies.
 *
 * "The penalty actions are still really hard to figure out and use correctly
 * for overriding plays if needed, like the punt scenario." The step could not
 * say whether a play counted, and there was no way to say so when the rules
 * got it wrong. play_data.penalty_play_counts is that override; these check it
 * reaches the report, the live panel, the app's own defense stats, and the
 * sentence the step shows.
 */
import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";
import { replayLiveGame } from "./liveGameSession";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { penaltyPlayEffect } from "./penaltyOutcome";
import { nullifiedStats } from "./statAuditRules";
import type { PlayRecord } from "@/components/game/types";

const tags = (...roles: string[]) => roles.map((role, i) => ({ player_id: `${role}${i}`, role, credit: null }));

/** A 12-yard run with an accepted flag. */
const run = (penalty: string, side: "offense" | "defense", playCounts?: boolean) => ({
  id: "p1", game_id: "g", sequence: 1, quarter: 1, clock: "10:00", down: 1, distance: 10,
  yard_line: 30, possession: "us", play_type: "rush", yards_gained: 12,
  is_touchdown: false, is_turnover: false, is_penalty: true, description: "", play_start_time: 600,
  play_players: tags("rusher"),
  play_data: {
    penalty_type: penalty, penalty_yards: 10, play_category: side, penalty_enforcement: "accepted",
    ...(playCounts === undefined ? {} : { penalty_play_counts: playCounts }),
  },
}) as unknown as PlayWithPlayers;

const punt = (playCounts?: boolean) => ({
  id: "p1", game_id: "g", sequence: 1, quarter: 1, clock: "10:00", down: 4, distance: 20,
  yard_line: 30, possession: "us", play_type: "punt", yards_gained: 0,
  is_touchdown: false, is_turnover: false, is_penalty: true, description: "", play_start_time: 600,
  play_players: tags("punter"),
  play_data: {
    kick_outcome: "returned", kicked_to_yard: 30, return_to_ball_on: 60,
    penalty_type: "Roughing the Kicker", penalty_yards: 15, play_category: "defense", penalty_enforcement: "accepted",
    ...(playCounts === undefined ? {} : { penalty_play_counts: playCounts }),
  },
}) as unknown as PlayWithPlayers;

function both(p: PlayWithPlayers) {
  const e = new FootballStatsEngine({ rules: "high_school" });
  e.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  e.processPlays(transformPlays([p], { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  const live = replayLiveGame([{
    id: p.id, type: p.play_type, possession: p.possession, ballOn: p.yard_line,
    quarter: 1, clock: 600, down: p.down, distance: p.distance, yards: p.yards_gained,
    isTouchdown: false, turnover: false, playData: p.play_data,
    penalty: p.play_data?.penalty_type, flagYards: p.play_data?.penalty_yards,
    penaltyEnforcement: p.play_data?.penalty_enforcement, penaltyCategory: p.play_data?.play_category,
    tagged: p.play_players.map(t => ({ ...t, id: t.player_id, name: t.player_id })),
  } as unknown as PlayRecord], {
    gameId: "g", programTeamId: "us", programName: "Us", programAbbreviation: "US",
    opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH",
    isHome: true, gameConfig: DEFAULT_GAME_CONFIG, pregame: null,
  } as never).summary!;
  return [e.getGameSummary(), live];
}

describe("the play-counts override", () => {
  it("keeps a run the rules would wipe (defensive holding replays the down)", () => {
    for (const s of both(run("Holding-DEF", "defense"))) expect(s.rushing.rusher0?.yards ?? 0).toBe(0);
    for (const s of both(run("Holding-DEF", "defense", true))) expect(s.rushing.rusher0.yards).toBe(12);
  });

  it("wipes a run the rules would keep (a face mask is added on)", () => {
    for (const s of both(run("Facemask", "defense"))) expect(s.rushing.rusher0.yards).toBe(12);
    for (const s of both(run("Facemask", "defense", false))) {
      expect(s.rushing.rusher0?.yards ?? 0).toBe(0);
      expect(s.awayTeamStats.penalties).toBe(1); // the flag itself still counts
    }
  });

  it("keeps a punt that roughing the kicker would wipe", () => {
    for (const s of both(punt())) expect(s.punting.punter0?.punts ?? 0).toBe(0);
    for (const s of both(punt(true))) expect(s.punting.punter0.punts).toBe(1);
  });

  it("drives the app's own defense stats too", () => {
    expect(nullifiedStats(run("Facemask", "defense"))).toBe(false);
    expect(nullifiedStats(run("Facemask", "defense", false))).toBe(true);
    expect(nullifiedStats(run("Holding-DEF", "defense", true))).toBe(false);
    expect(nullifiedStats(punt())).toBe(true);
  });
});

describe("what the penalty step says about the play", () => {
  const effect = (over: Partial<Parameters<typeof penaltyPlayEffect>[0]>) => penaltyPlayEffect({
    playTypeId: "rush", penalty: "Holding-DEF", side: "defense", enforcement: "accepted",
    override: null, foulSpotBallOn: null, ballOn: 30, ...over,
  });

  it("matches the rules the stats follow", () => {
    expect(effect({})).toBe("wiped");
    expect(effect({ penalty: "Facemask" })).toBe("stands");
    expect(effect({ playTypeId: "punt", penalty: "Roughing the Kicker" })).toBe("wiped");
    expect(effect({ penalty: "Holding-OFF", side: "offense", foulSpotBallOn: 38 })).toBe("partial");
    expect(effect({ enforcement: "declined" })).toBe("declined");
    expect(effect({ enforcement: "offset" })).toBe("offset");
  });

  it("follows the override when there is one", () => {
    expect(effect({ override: true })).toBe("stands");
    expect(effect({ penalty: "Facemask", override: false })).toBe("wiped");
  });
});
