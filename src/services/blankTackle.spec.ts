/**
 * A tackle nobody named is no tackle (Nick, Oct 24).
 *
 * A blank tackler used to save as the film-later TEAM tag, and every report
 * counted it, so the Portage game carried a TEAM tackle on two kickoffs and
 * two punt returns that nobody had picked a tackler for. Older games still
 * hold those tags, so the stats skip them rather than waiting on a re-entry.
 * "Tackle by TEAM" is still a tackle, and a sack nobody named stays TEAM's.
 */
import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import { calcDefenseStats, type PlayWithPlayers } from "./gameService";
import { replayLiveGame } from "./liveGameSession";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { TEAM_PLAYER_ID, makeTeamTag, type PlayRecord } from "@/components/game/types";

const run = (playData: Record<string, unknown>): PlayWithPlayers => ({
  id: "p1", game_id: "g", sequence: 1, quarter: 1, clock: "10:00", down: 1, distance: 10,
  yard_line: 40, possession: "them", play_type: "rush", yards_gained: 4,
  is_touchdown: false, is_turnover: false, is_penalty: false, description: "", play_start_time: 600,
  play_data: { opp_tagged: [{ id: "opp_UNK_22", role: "rusher", jersey_number: 22, name: "#22" }], ...playData },
  play_players: [],
} as unknown as PlayWithPlayers);

const SACK = {
  ...run({ team_tagged: [{ role: "sacker", credit: 1 }] }),
  play_type: "sack", yards_gained: -6,
  play_data: {
    team_tagged: [{ role: "sacker", credit: 1 }],
    opp_tagged: [{ id: "opp_UNK_7", role: "passer", jersey_number: 7, name: "#7" }],
  },
} as unknown as PlayWithPlayers;

type Line = { soloTackles: number; totalTackles: number; sacks: number };
const team = (s: unknown) => (s as { defense: Record<string, Line | undefined> }).defense[TEAM_PLAYER_ID];

function report(play: PlayWithPlayers) {
  const e = new FootballStatsEngine({ rules: "high_school" });
  e.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  e.processPlays(transformPlays([play], { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  return e.getGameSummary();
}

function live(teamTag: Partial<ReturnType<typeof makeTeamTag>>) {
  const play = {
    id: "p1", type: "rush", possession: "them", ballOn: 40, quarter: 1, clock: 600, down: 1, distance: 10,
    yards: 4, isTouchdown: false, turnover: false, penalty: null, flagYards: 0, result: "", firstDown: false,
    description: "", playData: {},
    tagged: [
      { id: "opp_UNK_22", player_id: "opp_UNK_22", jersey_number: 22, name: "#22", role: "rusher", isOpponent: true },
      { ...makeTeamTag("tackler"), credit: 1, ...teamTag },
    ],
  } as unknown as PlayRecord;
  return replayLiveGame([play], {
    gameId: "g", programTeamId: "us", programName: "Us", programAbbreviation: "US",
    opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH",
    isHome: true, gameConfig: DEFAULT_GAME_CONFIG, pregame: null,
  } as never).summary!;
}

describe("a TEAM tackle nobody picked", () => {
  const blank = run({ team_tagged: [{ role: "tackler", credit: 1 }] });

  it("is no tackle in the report", () => {
    expect(team(report(blank))?.totalTackles ?? 0).toBe(0);
    expect(calcDefenseStats([blank]).get(TEAM_PLAYER_ID)?.totalTackles ?? 0).toBe(0);
  });

  it("is no tackle in the live panel", () => {
    expect(team(live({}))?.totalTackles ?? 0).toBe(0);
  });
});

describe("Tackle by TEAM", () => {
  it("is still a tackle, per tag or by the older play-level flag", () => {
    for (const play of [
      run({ team_tagged: [{ role: "tackler", credit: 1, confirmed: true }] }),
      run({ team_tagged: [{ role: "tackler", credit: 1 }], team_tackle_confirmed: true }),
    ]) {
      expect(team(report(play))).toMatchObject({ soloTackles: 1, totalTackles: 1 });
      expect(calcDefenseStats([play]).get(TEAM_PLAYER_ID)).toMatchObject({ soloTackles: 1, totalTackles: 1 });
    }
    expect(team(live({ teamCreditConfirmed: true }))).toMatchObject({ soloTackles: 1, totalTackles: 1 });
  });
});

describe("a sack nobody named", () => {
  it("stays TEAM's sack", () => {
    expect(team(report(SACK))?.sacks).toBe(1);
  });
});
