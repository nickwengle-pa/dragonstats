import { describe, expect, it } from "vitest";
import { FootballStatsEngine, type GameSummary } from "football-stats-engine";
import type { PlayRecord } from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";
import { replayLiveGame, type LiveSessionConfig } from "./liveGameSession";
import { transformPlays } from "./playTransformer";
import { DEFAULT_GAME_CONFIG } from "./programService";

const config: LiveSessionConfig = {
  gameId: "live-penalty-rulings",
  programTeamId: "us",
  programName: "Us",
  programAbbreviation: "US",
  opponentTeamId: "them",
  opponentName: "Them",
  opponentAbbreviation: "TH",
  isHome: true,
  gameConfig: DEFAULT_GAME_CONFIG,
  pregame: null,
};

function flagged(
  type: "int" | "fumble",
  enforcement: "accepted" | "declined" | "offset",
  counts: boolean,
  yards = 10,
): PlayRecord {
  const roles = type === "int"
    ? [{ player_id: "qb", role: "passer" }, { player_id: "db", role: "interceptor" }]
    : [{ player_id: "rb", role: "rusher" }, { player_id: "db", role: "fumble_recovery" }];
  return {
    id: `${type}-${enforcement}-${counts}`,
    quarter: 1,
    clock: 600,
    type,
    yards: 5,
    result: "",
    penalty: "Holding-OFF",
    penaltyCategory: "offense",
    penaltyEnforcement: enforcement,
    flagYards: yards,
    isTouchdown: true,
    firstDown: false,
    turnover: true,
    ballOn: 40,
    down: 2,
    distance: 10,
    description: "Return with a recorded penalty ruling",
    possession: "us",
    fumbleReturnYards: type === "fumble" ? 15 : undefined,
    nextPossession: "us",
    nextBallOn: 30,
    nextDown: 2,
    nextDistance: 20,
    playData: {
      next_situation_source: "manual_override",
      penalty_type: "Holding-OFF",
      penalty_enforcement: enforcement,
      penalty_yards: yards,
      play_category: "offense",
      penalty_play_counts: counts,
      penalty_enforcement_from: "end_of_play",
      interception_return_yards: type === "int" ? 15 : undefined,
      fumble_return_yards: type === "fumble" ? 15 : undefined,
    },
    tagged: roles.map((tag) => ({
      ...tag, id: tag.player_id, jersey_number: null, name: tag.player_id,
    })),
  } as PlayRecord;
}

function stored(play: PlayRecord): PlayWithPlayers {
  return {
    id: play.id,
    game_id: config.gameId,
    sequence: 1,
    quarter: play.quarter,
    clock: "10:00",
    down: play.down,
    distance: play.distance,
    yard_line: play.ballOn,
    possession: play.possession,
    play_type: play.type,
    yards_gained: play.yards,
    is_touchdown: play.isTouchdown,
    is_turnover: play.turnover,
    is_penalty: true,
    description: play.description,
    play_start_time: play.clock,
    play_data: play.playData,
    play_players: play.tagged.map((tag, index) => ({
      id: `${play.id}-${index}`, play_id: play.id,
      player_id: tag.player_id, role: tag.role, credit: tag.credit ?? null,
    })),
  } as unknown as PlayWithPlayers;
}

function postgame(play: PlayRecord): GameSummary {
  const engine = new FootballStatsEngine({ rules: "high_school", enableGameState: true });
  engine.setTeams(
    { id: "us", name: "Us", abbreviation: "US" },
    { id: "them", name: "Them", abbreviation: "TH" },
  );
  engine.processPlays(transformPlays([stored(play)], {
    gameId: config.gameId, homeTeamId: "us", awayTeamId: "them",
    homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us",
  }));
  return engine.getGameSummary();
}

function stat(summary: GameSummary | null, group: "passing" | "rushing" | "defense", id: string, key: string): number {
  const groups = summary as unknown as Record<string, Record<string, Record<string, number>>> | null;
  return groups?.[group]?.[id]?.[key] ?? 0;
}

function credits(summary: GameSummary | null, type: "int" | "fumble") {
  return type === "int"
    ? {
      plays: stat(summary, "passing", "qb", "attempts"),
      turnovers: stat(summary, "passing", "qb", "interceptions"),
      recoveries: stat(summary, "defense", "db", "interceptions"),
      returnYards: stat(summary, "defense", "db", "interceptionYards"),
      returnTouchdowns: stat(summary, "defense", "db", "interceptionTouchdowns"),
    }
    : {
      plays: stat(summary, "rushing", "rb", "carries"),
      turnovers: stat(summary, "rushing", "rb", "fumblesLost"),
      recoveries: stat(summary, "defense", "db", "fumbleRecoveries"),
      returnYards: stat(summary, "defense", "db", "fumbleRecoveryYards"),
      returnTouchdowns: stat(summary, "defense", "db", "fumbleRecoveryTouchdowns"),
    };
}

describe("live penalty ruling parity", () => {
  for (const type of ["int", "fumble"] as const) {
    for (const enforcement of ["accepted", "offset"] as const) {
      it(`removes a ${type} and its return score when the ${enforcement} ruling says no play`, () => {
        const play = flagged(type, enforcement, false);
        const live = replayLiveGame([play], config);
        const post = postgame(play);
        expect(credits(live.summary, type)).toEqual(credits(post, type));
        expect(credits(live.summary, type)).toEqual({ plays: 0, turnovers: 0, recoveries: 0, returnYards: 0, returnTouchdowns: 0 });
        expect(live.score).toEqual({ us: 0, them: 0 });
        expect(live.currentState).toMatchObject({ possession: "us", ballOn: 30, down: 2, distance: 20 });
        expect(live.summary?.homeTeamStats).toMatchObject({
          penalties: enforcement === "accepted" ? 1 : 0,
          penaltyYards: enforcement === "accepted" ? 10 : 0,
        });
      });
    }

    for (const enforcement of ["accepted", "declined"] as const) {
      it(`retains ${type} credits for a counted ${enforcement} play, including stale declined no-play metadata`, () => {
        const play = flagged(type, enforcement, enforcement === "accepted");
        const live = replayLiveGame([play], config);
        const post = postgame(play);
        expect(credits(live.summary, type)).toEqual(credits(post, type));
        expect(credits(live.summary, type)).toMatchObject({ plays: 1, recoveries: 1, returnYards: 15, returnTouchdowns: 1 });
        expect(live.score).toEqual({ us: 0, them: 6 });
        expect(live.summary?.homeTeamStats).toMatchObject({
          penalties: enforcement === "accepted" ? 1 : 0,
          penaltyYards: enforcement === "accepted" ? 10 : 0,
        });
      });
    }
  }

  it("retains an explicitly recorded zero-yard accepted flag", () => {
    const play = flagged("int", "accepted", true, 0);
    const live = replayLiveGame([play], config);
    const post = postgame(play);
    expect(live.summary?.homeTeamStats).toMatchObject({ penalties: 1, penaltyYards: 0 });
    expect(post.homeTeamStats).toMatchObject({ penalties: 1, penaltyYards: 0 });
    expect(credits(live.summary, "int")).toEqual(credits(post, "int"));
  });
});
