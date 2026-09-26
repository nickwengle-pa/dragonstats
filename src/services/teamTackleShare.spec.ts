/**
 * TEAM can share a tackle: "#44 and somebody in the pile", half each.
 *
 * The live panel always read a TEAM tag's credit, but the report's converter
 * read TEAM out of play_data with its credit thrown away, so a shared TEAM
 * tackle scored as a solo there: one play, 1.5 tackles, and a report that
 * disagreed with what the press box saw during the game.
 */
import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";
import { replayLiveGame } from "./liveGameSession";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { TEAM_PLAYER_ID, makeTeamTag, type PlayRecord } from "@/components/game/types";

const RUN: PlayWithPlayers = {
  id: "p1", game_id: "g", sequence: 1, quarter: 1, clock: "10:00", down: 1, distance: 10,
  yard_line: 40, possession: "them", play_type: "rush", yards_gained: 4,
  is_touchdown: false, is_turnover: false, is_penalty: false, description: "", play_start_time: 600,
  play_data: {
    team_tagged: [{ role: "tackler", credit: 0.5 }],
    team_tackle_confirmed: true,
    opp_tagged: [{ id: "opp_UNK_22", role: "rusher", jersey_number: 22, name: "#22" }],
  },
  play_players: [{ player_id: "lb44", role: "tackler", credit: 0.5 }],
} as unknown as PlayWithPlayers;

type Line = { soloTackles: number; assistedTackles: number; totalTackles: number };
const defense = (s: unknown, id: string) => (s as { defense: Record<string, Line> }).defense[id];

function report() {
  const e = new FootballStatsEngine({ rules: "high_school" });
  e.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  e.processPlays(transformPlays([RUN], { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  return e.getGameSummary();
}

function live() {
  const play = {
    id: "p1", type: "rush", possession: "them", ballOn: 40, quarter: 1, clock: 600, down: 1, distance: 10,
    yards: 4, isTouchdown: false, turnover: false, penalty: null, flagYards: 0, result: "", firstDown: false,
    description: "", playData: RUN.play_data,
    tagged: [
      { id: "opp_UNK_22", player_id: "opp_UNK_22", jersey_number: 22, name: "#22", role: "rusher", isOpponent: true },
      { id: "lb44", player_id: "lb44", jersey_number: 44, name: "Max Stone", role: "tackler", credit: 0.5 },
      { ...makeTeamTag("tackler"), credit: 0.5, teamCreditConfirmed: true },
    ],
  } as unknown as PlayRecord;
  return replayLiveGame([play], {
    gameId: "g", programTeamId: "us", programName: "Us", programAbbreviation: "US",
    opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH",
    isHome: true, gameConfig: DEFAULT_GAME_CONFIG, pregame: null,
  } as never).summary!;
}

const CONFIG = {
  gameId: "g", programTeamId: "us", programName: "Us", programAbbreviation: "US",
  opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH",
  isHome: true, gameConfig: DEFAULT_GAME_CONFIG, pregame: null,
} as never;

describe("a play reloaded from the database", () => {
  /* Reloaded plays carry their loose tags twice: rebuilt into tagged, and
     still in play_data where they are stored. Live stats read both. */
  it("counts a TEAM tackle once in live stats", () => {
    const play = {
      id: "p1", type: "rush", possession: "them", ballOn: 40, quarter: 1, clock: 600, down: 1, distance: 10,
      yards: 3, isTouchdown: false, turnover: false, penalty: null, flagYards: 0, result: "", firstDown: false,
      description: "",
      playData: { team_tagged: [{ role: "tackler", credit: 1 }], team_tackle_confirmed: true },
      tagged: [{ ...makeTeamTag("tackler"), credit: 1, teamCreditConfirmed: true }],
    } as unknown as PlayRecord;
    expect(defense(replayLiveGame([play], CONFIG).summary, TEAM_PLAYER_ID))
      .toMatchObject({ soloTackles: 1, totalTackles: 1 });
  });

  it("counts an opponent's tackle once in live stats", () => {
    const tackler = { id: "opp_UNK_55", player_id: "opp_UNK_55", jersey_number: 55, name: "#55", role: "tackler", credit: 1, isOpponent: true };
    const play = {
      id: "p1", type: "rush", possession: "us", ballOn: 40, quarter: 1, clock: 600, down: 1, distance: 10,
      yards: 3, isTouchdown: false, turnover: false, penalty: null, flagYards: 0, result: "", firstDown: false,
      description: "",
      playData: { opp_tagged: [{ id: "opp_UNK_55", role: "tackler", jersey_number: 55, name: "#55", credit: 1 }] },
      tagged: [tackler],
    } as unknown as PlayRecord;
    expect(defense(replayLiveGame([play], CONFIG).summary, "opp_UNK_55"))
      .toMatchObject({ soloTackles: 1, totalTackles: 1 });
  });
});

describe("a tackle shared with TEAM", () => {
  it("is half a tackle each, in the report and in the live panel", () => {
    for (const s of [report(), live()]) {
      expect(defense(s, "lb44")).toMatchObject({ soloTackles: 0, assistedTackles: 1, totalTackles: 0.5 });
      expect(defense(s, TEAM_PLAYER_ID)).toMatchObject({ soloTackles: 0, assistedTackles: 1, totalTackles: 0.5 });
    }
  });
});
