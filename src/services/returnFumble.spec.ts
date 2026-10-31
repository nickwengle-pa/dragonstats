/**
 * A returner who caught the kick, ran with it and fumbled. Unlike a muff it is
 * his return either way, to the recovery spot, and his fumble either way; it is
 * lost, and a turnover, only when the kicking team falls on it.
 */
import { describe, expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import { buildGameReport } from "./gameReport";
import { applyLostMuffs } from "./lostMuffs";
import { advanceSituationAfterPlay } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { replayLiveGame } from "./liveGameSession";
import type { PlayWithPlayers } from "./gameService";
import type { GameStatsBundle } from "./statsService";
import type { PlayRecord } from "@/components/game/types";

/** A punt from the kicking team's 30 landing on the receivers' 30, caught,
 *  run back and fumbled; recovered at the receivers' 38 (8 return yards). */
function returnFumble(kicking: "us" | "them", returner: string, byKickers: boolean, recoverer?: string): PlayWithPlayers {
  return {
    id: kicking, game_id: "g", sequence: 1, quarter: 1, clock: "10:00", possession: kicking,
    down: 4, distance: 8, yard_line: 30, play_type: "punt", yards_gained: 28,
    is_touchdown: false, is_turnover: false, is_penalty: false, description: "Punt",
    play_data: { kick_outcome: "fumbled", muff_recovered_by_kicking: byKickers, kicked_to_yard: 30, return_to_ball_on: 62 },
    play_players: [
      { player_id: kicking === "us" ? "p" : "opp_p", role: "punter" },
      { player_id: returner, role: "returner" },
      ...(recoverer ? [{ player_id: recoverer, role: "fumble_recovery" }] : []),
    ],
  } as unknown as PlayWithPlayers;
}

const transformCtx = { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" };

function summaries(play: PlayWithPlayers) {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  const enginePlays = transformPlays([play], transformCtx);
  engine.processPlays(enginePlays);
  const summary = engine.getGameSummary();
  applyLostMuffs(summary, enginePlays);
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
  return [summary, live];
}

function report(plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ rules: "high_school" });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  const enginePlays = transformPlays(plays, transformCtx);
  engine.processPlays(enginePlays);
  const summary = engine.getGameSummary();
  applyLostMuffs(summary, enginePlays);
  const bundle = {
    summary, plays, game: {},
    roster: [
      { player_id: "r", jersey_number: 3, first_name: "Our", last_name: "Returner" },
      { player_id: "p", jersey_number: 9, first_name: "Our", last_name: "Punter" },
      { player_id: "c", jersey_number: 44, first_name: "Our", last_name: "Cover" },
    ],
  } as unknown as GameStatsBundle;
  return buildGameReport({ bundle, program: { id: "us", name: "Us", abbreviation: "US", logoUrl: null, color: "#f00" }, opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#00f" }, gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 0, touchbackYardLine: 20 });
}
const stat = (r: ReturnType<typeof report>, label: string) => r.teamStats.find(s => s.label === label);

describe("a fumble on a punt return", () => {
  it("is a return to the recovery spot and a fumble, not lost, when the receivers keep it", () => {
    for (const s of summaries(returnFumble("us", "r", false))) {
      expect(s.returns.r).toMatchObject({ puntReturns: 1, puntReturnYards: 8, puntReturnFumbles: 1 });
      expect(s.awayTeamStats.fumblesLost).toBe(0);
      expect(s.awayTeamStats.turnovers).toBe(0);
      expect(s.homeTeamStats.fumblesLost).toBe(0);
    }
  });

  it("is lost and a turnover when the kickers recover, and credits their recoverer", () => {
    for (const s of summaries(returnFumble("us", "r", true, "c"))) {
      expect(s.returns.r).toMatchObject({ puntReturns: 1, puntReturnYards: 8, puntReturnFumbles: 1 });
      expect(s.awayTeamStats.fumblesLost).toBe(1);
      expect(s.awayTeamStats.turnovers).toBe(1);
      expect(s.homeTeamStats.turnovers).toBe(0);
      expect(s.defense.c.fumbleRecoveries).toBe(1);
    }
  });

  it("gives a receiver who falls on his own man's fumble no defensive recovery", () => {
    const [s] = summaries(returnFumble("them", "r", false, "r2"));
    expect(s.defense.r2?.fumbleRecoveries ?? 0).toBe(0);
  });

  it("prints our returner's fumble, kept, as a fumble and not lost", () => {
    const r = report([returnFumble("them", "r", false)]);
    expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "1-0", them: "0-0" });
    expect(r.returns.find(x => x.name.includes("Returner"))?.punt).toMatchObject({ no: 1, yds: 8, fum: 1 });
  });

  it("prints their fumble we recovered once, named or not", () => {
    for (const recoverer of ["c", undefined]) {
      const r = report([returnFumble("us", "opp_r", true, recoverer)]);
      expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "0-0", them: "1-1" });
      expect(stat(r, "Fumble returns: Number-Yards-TD")).toMatchObject({ us: "1-0-0", them: "0-0-0" });
    }
  });

  it("prints our muff that we fell on as a fumble, not lost", () => {
    const kept = { ...returnFumble("them", "r", false), play_data: { kick_outcome: "muffed", muff_recovered_by_kicking: false, kicked_to_yard: 30, return_to_ball_on: 62 } } as PlayWithPlayers;
    const r = report([kept]);
    expect(stat(r, "Fumbles: Number-Lost")).toMatchObject({ us: "1-0", them: "0-0" });
    expect(r.returns.find(x => x.name.includes("Returner"))?.punt).toMatchObject({ no: 1, fum: 1 });
  });

  it("prints their fumble we recovered once when TEAM recovered it", () => {
    const play = returnFumble("us", "opp_r", true);
    const teamRecovery = { ...play, play_data: { ...play.play_data, team_tagged: [{ role: "fumble_recovery", credit: null }] } } as PlayWithPlayers;
    const r = report([teamRecovery]);
    expect(stat(r, "Fumble returns: Number-Yards-TD")).toMatchObject({ us: "1-0-0", them: "0-0-0" });
  });

  it("leaves the ball with the kickers where they recovered it", () => {
    const next = advanceSituationAfterPlay({
      type: "punt", yards: 32, isTouchdown: false, result: "", penalty: null, flagYards: 0, firstDown: false,
      playData: { kick_outcome: "fumbled", muff_recovered_by_kicking: true },
    }, { possession: "us", down: 4, distance: 8, ballOn: 30 }, DEFAULT_GAME_CONFIG);
    expect(next).toMatchObject({ possession: "us", down: 1, ballOn: 62 });
  });

  it("hands the ball over at the recovery spot when the receivers keep it", () => {
    const next = advanceSituationAfterPlay({
      type: "punt", yards: 32, isTouchdown: false, result: "", penalty: null, flagYards: 0, firstDown: false,
      playData: { kick_outcome: "fumbled", muff_recovered_by_kicking: false },
    }, { possession: "us", down: 4, distance: 8, ballOn: 30 }, DEFAULT_GAME_CONFIG);
    expect(next).toMatchObject({ possession: "them", down: 1, ballOn: 38 });
  });
});
