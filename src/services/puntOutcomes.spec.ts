/**
 * Fair catches and muffs on a play recorded as a Punt or Kickoff.
 *
 * The outcome rides in play_data.kick_outcome, not the play type, so both stat
 * paths have to read it. They used to read only the play type and counted
 * every fair catch picked that way as a 0-yard return.
 */
import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";
import { replayLiveGame } from "./liveGameSession";
import { advanceSituationAfterPlay } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { applyLostMuffs } from "./lostMuffs";
import { HUDL_COLUMNS, hudlRow } from "./hudlExport";
import type { PlayRecord } from "@/components/game/types";

const tags = (...roles: string[]) => roles.map(role => ({ player_id: role, role, credit: null }));
/** A 40-yard punt from our 30, landing on their 30. */
function punt(playData: Record<string, unknown>, yards: number, roles = ["punter", "returner"]): PlayWithPlayers {
  return {
    id: "p1", game_id: "g", sequence: 1, quarter: 1, clock: "10:00", down: 4, distance: 8,
    yard_line: 30, possession: "us", play_type: "punt",
    play_data: { kicked_to_yard: 30, ...playData }, yards_gained: yards,
    is_touchdown: false, is_turnover: false, is_penalty: false, description: "", play_start_time: 600,
    play_players: tags(...roles),
  } as unknown as PlayWithPlayers;
}

function run(play: PlayWithPlayers) {
  const engine = new FootballStatsEngine({ rules: "high_school", trackDrives: true });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  engine.processPlays(transformPlays([play], { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  const live = replayLiveGame([{
    id: play.id, type: play.play_type, possession: play.possession, ballOn: play.yard_line,
    quarter: 1, clock: 600, down: play.down, distance: play.distance,
    yards: play.yards_gained, isTouchdown: false, turnover: false, playData: play.play_data,
    tagged: play.play_players.map(t => ({ ...t, id: t.player_id, name: t.player_id })),
  } as unknown as PlayRecord], {
    gameId: "g", programTeamId: "us", programName: "Us", programAbbreviation: "US",
    opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH",
    isHome: true, gameConfig: DEFAULT_GAME_CONFIG, pregame: null,
  }).summary!;
  const summary = engine.getGameSummary();
  applyLostMuffs(summary, engine.getRawPlays());
  return [summary, live];
}

describe("punt outcomes", () => {
  it("counts a fair catch on a Punt as a fair catch, not a return", () => {
    for (const s of run(punt({ kick_outcome: "fair_catch", return_to_ball_on: 70 }, 40))) {
      expect(s.returns.returner?.puntReturns ?? 0).toBe(0);
      expect(s.returns.returner.puntReturnFairCatches).toBe(1);
      expect(s.punting.punter.puntsFairCaught).toBe(1);
    }
  });

  it("charges a muff the kickers fell on as a fumble lost, not a return", () => {
    for (const s of run(punt({ kick_outcome: "muffed", muff_recovered_by_kicking: true, return_to_ball_on: 72 }, 42))) {
      expect(s.returns.returner.puntReturns).toBe(0);
      expect(s.returns.returner.puntReturnFumbles).toBe(1);
      // We punted, so the muff is theirs: their fumble lost, their turnover.
      expect(s.awayTeamStats.fumblesLost).toBe(1);
      expect(s.awayTeamStats.turnovers).toBe(1);
      expect(s.homeTeamStats.turnovers).toBe(0);
      expect(s.punting.punter.punts).toBe(1);
    }
  });

  it("does not charge a muff the receivers recovered", () => {
    for (const s of run(punt({ kick_outcome: "muffed", muff_recovered_by_kicking: false, return_to_ball_on: 65 }, 35))) {
      expect(s.returns.returner.puntReturnFumbles).toBe(0);
      expect(s.awayTeamStats.turnovers).toBe(0);
    }
  });

  it("counts a muff the receivers fell on and ran back as a return", () => {
    for (const s of run(punt({ kick_outcome: "muffed", muff_recovered_by_kicking: false, return_to_ball_on: 65 }, 35))) {
      expect(s.returns.returner.puntReturns).toBe(1);
      expect(s.returns.returner.puntReturnYards).toBe(5);
    }
  });

  it("ignores a stale returner tag on a punt nobody fielded", () => {
    for (const outcome of ["downed", "out_of_bounds", "touchback"]) {
      for (const s of run(punt({ kick_outcome: outcome, return_to_ball_on: 70 }, 40))) {
        expect(s.returns.returner?.puntReturns ?? 0, outcome).toBe(0);
        expect(s.punting.punter.punts, outcome).toBe(1);
      }
    }
  });

  it("credits no tackle on a punt nobody fielded or fair caught", () => {
    for (const outcome of ["downed", "out_of_bounds", "touchback", "fair_catch"]) {
      for (const s of run(punt({ kick_outcome: outcome }, 40, ["punter", "returner", "tackler"]))) {
        const d = s.defense.tackler;
        expect((d?.soloTackles ?? 0) + (d?.assistedTackles ?? 0), outcome).toBe(0);
      }
    }
  });

  it("drops a stale returner and tackler from the Hudl row of a downed punt", () => {
    const row = (outcome: string) => {
      const cells = hudlRow({
        id: "p1", sequence: 1, type: "punt", possession: "us", ballOn: 30, quarter: 1, down: 4, distance: 8,
        yards: 40, isTouchdown: false, turnover: false, description: "", result: "",
        playData: { kicked_to_yard: 30, kick_outcome: outcome },
        tagged: [
          { id: "kr", player_id: "kr", jersey_number: 2, name: "KR", role: "returner" },
          { id: "t", player_id: "t", jersey_number: 9, name: "T", role: "tackler" },
        ],
      } as unknown as PlayRecord);
      return Object.fromEntries(HUDL_COLUMNS.map((c, i) => [c, cells[i]]));
    };
    expect(row("downed")).toMatchObject({ RETURNER_Jersey: "", TACKLER1_Jersey: "" });
    expect(row("fair_catch")).toMatchObject({ RETURNER_Jersey: 2, TACKLER1_Jersey: "" });
    expect(row("returned")).toMatchObject({ RETURNER_Jersey: 2, TACKLER1_Jersey: 9 });
  });

  it("leaves the ball with the kickers where they recovered a muff", () => {
    const before = { possession: "us" as const, down: 4, distance: 8, ballOn: 30 };
    const next = advanceSituationAfterPlay({
      type: "punt", yards: 42, isTouchdown: false, result: "", penalty: null, flagYards: 0, firstDown: false,
      playData: { kick_outcome: "muffed", muff_recovered_by_kicking: true },
    }, before, DEFAULT_GAME_CONFIG);
    expect(next).toMatchObject({ possession: "us", down: 1, ballOn: 72 });
  });

  it("hands the ball over after a muff the receivers recovered", () => {
    const before = { possession: "us" as const, down: 4, distance: 8, ballOn: 30 };
    const next = advanceSituationAfterPlay({
      type: "punt", yards: 35, isTouchdown: false, result: "", penalty: null, flagYards: 0, firstDown: false,
      playData: { kick_outcome: "muffed", muff_recovered_by_kicking: false },
    }, before, DEFAULT_GAME_CONFIG);
    expect(next).toMatchObject({ possession: "them", down: 1, ballOn: 35 });
  });
});
