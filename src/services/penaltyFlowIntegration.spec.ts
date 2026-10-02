import { describe, expect, it } from "vitest";
import { FootballStatsEngine, PlayType, type GameSummary, type TeamId } from "football-stats-engine";
import type { PlayWithPlayers } from "./gameService";
import { transformPlays } from "./playTransformer";
import { nullifiedStats, penaltyPlayCountsForEdit } from "./statAuditRules";

const US = "team-us";
const THEM = "team-them";
const context = {
  gameId: "penalty-flow", homeTeamId: US, awayTeamId: THEM,
  homeTeamName: "Us", awayTeamName: "Them", programTeamId: US,
};

function recorded(over: Partial<PlayWithPlayers> = {}): PlayWithPlayers {
  return {
    id: "play-1", game_id: context.gameId, sequence: 1, quarter: 1, clock: "10:00",
    down: 2, distance: 10, yard_line: 40, possession: "us", play_type: "rush",
    yards_gained: 20, is_touchdown: false, is_turnover: false, is_penalty: true,
    description: "Run with penalty", play_start_time: 600,
    play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "accepted",
      penalty_yards: 10, play_category: "offense",
    },
    play_players: [
      { id: "tag-rb", play_id: "play-1", player_id: "rb", role: "rusher", credit: null },
      { id: "tag-qb", play_id: "play-1", player_id: "qb", role: "passer", credit: null },
      { id: "tag-wr", play_id: "play-1", player_id: "wr", role: "receiver", credit: null },
    ],
    ...over,
  } as unknown as PlayWithPlayers;
}

function summarize(plays: PlayWithPlayers[]): GameSummary {
  const engine = new FootballStatsEngine({ rules: "high_school", enableGameState: true });
  engine.setTeams(
    { id: US, name: "Us", abbreviation: "US" } as TeamId,
    { id: THEM, name: "Them", abbreviation: "TH" } as TeamId,
  );
  engine.registerPlayers([{ id: "rb", name: "Runner" }, { id: "qb", name: "Passer" }, { id: "wr", name: "Receiver" }]);
  engine.processPlays(transformPlays(plays, context));
  return engine.getGameSummary();
}

const group = (summary: GameSummary, name: string, id: string): Record<string, number> =>
  ((summary as unknown as Record<string, Record<string, Record<string, number>>>)[name] ?? {})[id] ?? {};

describe("recorded penalty rulings", () => {
  for (const [penalty, spot, enforcement, expected] of [
    ["Holding-OFF", 45, "accepted", true],
    ["Holding-OFF", 35, "accepted", false],
    ["Custom foul", null, "accepted", false],
    ["Custom foul", null, "declined", true],
    ["Facemask", null, "accepted", true],
  ] as const) {
    it(`restores legacy ${penalty} at ${spot ?? "no spot"} (${enforcement}) with play counts ${expected}`, () => {
      const legacy = recorded({ play_data: {
        penalty_type: penalty, play_category: "offense", penalty_enforcement: enforcement,
        penalty_yards: 10, foul_spot_ball_on: spot,
      } });
      const counts = penaltyPlayCountsForEdit({
        penalty, penaltyCategory: "offense", penaltyEnforcement: enforcement,
        foulSpotBallOn: spot, penaltyEnforcementFrom: "auto", ballOn: 40,
      });
      expect(counts).toBe(expected);
      const savedEdit = recorded({ play_data: { ...legacy.play_data, penalty_play_counts: counts ? null : false } });
      expect(group(summarize([savedEdit]), "rushing", "rb").carries ?? 0)
        .toBe(group(summarize([legacy]), "rushing", "rb").carries ?? 0);
      expect(group(summarize([savedEdit]), "rushing", "rb").yards ?? 0)
        .toBe(group(summarize([legacy]), "rushing", "rb").yards ?? 0);
    });
  }

  it("keeps the full run for an end-of-play ruling even with a stored foul spot", () => {
    const play = recorded({ play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "accepted", play_category: "offense",
      penalty_yards: 10, penalty_standard_yards: 10, penalty_play_counts: true,
      penalty_enforcement_from: "end_of_play", foul_spot_ball_on: 45,
    } });
    const enginePlay = transformPlays([play], context)[0];
    expect((enginePlay as unknown as { yardsGained: number }).yardsGained).toBe(20);
    expect(group(summarize([play]), "rushing", "rb")).toMatchObject({ carries: 1, yards: 20 });
    expect(nullifiedStats(play)).toBe(false);
  });

  it("does not require a foul spot to preserve a tack-on foul", () => {
    const play = recorded({ play_data: {
      penalty_type: "Facemask", penalty_enforcement: "accepted", play_category: "defense",
      penalty_yards: 15, penalty_play_counts: true, penalty_enforcement_from: "end_of_play",
    } });
    expect(group(summarize([play]), "rushing", "rb")).toMatchObject({ carries: 1, yards: 20 });
  });

  it("an explicit counted-play override preserves the full run at the foul spot", () => {
    const play = recorded({ play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "accepted", play_category: "offense",
      penalty_yards: 10, penalty_play_counts: true, penalty_enforcement_from: "spot_of_foul",
      foul_spot_ball_on: 45,
    } });
    expect(group(summarize([play]), "rushing", "rb")).toMatchObject({ carries: 1, yards: 20 });
  });

  for (const playType of ["rush", "pass_comp", "int", "fumble", "kickoff", "punt"]) {
    it(`keeps only the accepted penalty when a ${playType} does not count`, () => {
      const play = recorded({ play_type: playType, is_touchdown: true, is_turnover: true,
        play_data: {
          penalty_type: "Facemask", penalty_enforcement: "accepted", play_category: "defense",
          penalty_yards: 15, penalty_play_counts: false,
        },
      });
      const converted = transformPlays([play], context);
      expect(converted).toHaveLength(1);
      expect(converted[0].type).toBe(PlayType.Penalty);
      const summary = summarize([play]);
      expect(group(summary, "rushing", "rb").carries ?? 0).toBe(0);
      expect(group(summary, "passing", "qb").attempts ?? 0).toBe(0);
      expect(group(summary, "receiving", "wr").receptions ?? 0).toBe(0);
      expect(summary.awayTeamStats).toMatchObject({ penalties: 1, penaltyYards: 15 });
      expect(nullifiedStats(play)).toBe(true);
    });
  }

  it("does not add a wiped touchdown to later play score context", () => {
    const wiped = recorded({ is_touchdown: true, play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "accepted", play_category: "offense",
      penalty_yards: 10, penalty_play_counts: false,
    } });
    const next = recorded({ id: "play-2", sequence: 2, is_penalty: false, play_data: {} });
    expect(transformPlays([wiped, next], context)[1].context.homeScore).toBe(0);
  });

  it("keeps a declined play regardless of old no-play and foul-spot metadata", () => {
    const play = recorded({ play_type: "pass_comp", play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "declined", play_category: "offense",
      penalty_yards: 10, penalty_play_counts: false, penalty_enforcement_from: "spot_of_foul",
      foul_spot_ball_on: 45,
    } });
    const summary = summarize([play]);
    expect(group(summary, "passing", "qb")).toMatchObject({ attempts: 1, completions: 1, yards: 20 });
    expect(group(summary, "receiving", "wr")).toMatchObject({ receptions: 1, yards: 20 });
    expect(summary.homeTeamStats).toMatchObject({ penalties: 0, penaltyYards: 0 });
    expect(nullifiedStats(play)).toBe(false);
  });

  it("does not clip a legacy declined forward hold", () => {
    const play = recorded({ play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "declined", play_category: "offense",
      penalty_yards: 10, foul_spot_ball_on: 45,
    } });
    expect(group(summarize([play]), "rushing", "rb")).toMatchObject({ carries: 1, yards: 20 });
  });

  it("wipes a newly recorded offsetting play and charges no penalty yards", () => {
    const play = recorded({ play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "offset", play_category: "offense",
      penalty_yards: 10, penalty_play_counts: false,
    } });
    const summary = summarize([play]);
    expect(transformPlays([play], context)[0].type).toBe(PlayType.Penalty);
    expect(group(summary, "rushing", "rb").carries ?? 0).toBe(0);
    expect(summary.homeTeamStats).toMatchObject({ penalties: 0, penaltyYards: 0 });
    expect(nullifiedStats(play)).toBe(true);
  });

  it("retains the historical behavior of offsetting rows without an explicit ruling", () => {
    const play = recorded({ play_data: {
      penalty_type: "Holding-OFF", penalty_enforcement: "offset", play_category: "offense",
      penalty_yards: 10,
    } });
    expect(group(summarize([play]), "rushing", "rb")).toMatchObject({ carries: 1, yards: 20 });
    expect(nullifiedStats(play)).toBe(false);
  });

  it("charges actual half-distance yardage instead of the selected standard distance", () => {
    const play = recorded({ yard_line: 6, play_data: {
      penalty_type: "False Start", penalty_enforcement: "accepted", play_category: "offense",
      penalty_yards: 3, penalty_standard_yards: 5, penalty_play_counts: false,
    } });
    expect(summarize([play]).homeTeamStats).toMatchObject({ penalties: 1, penaltyYards: 3 });
  });
});
