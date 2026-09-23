/**
 * An accepted defensive foul that replays the down is a no-play.
 *
 * The stats engine decides whether a flag wipes a play from `replayDown` in
 * its penalty catalog, and that table shipped with NFL flags: defensive
 * holding and defensive pass interference carry an automatic first down in
 * the NFL, so upstream marks them `replayDown: false` and the play stands.
 * Under NFHS both are distance fouls that replay the down — accepting one
 * means the snap did not happen, and no player may keep a stat from it.
 *
 * What the app was reporting before the flags were flipped:
 *   - defensive holding on a 3-yard run -> the back kept a carry and 3 yards
 *   - defensive PI on an incomplete pass -> the quarterback was charged an
 *     attempt, which quietly moves a completion percentage all season
 *
 * The ball was already right in both cases; `advanceSituationAfterPlay`
 * enforces from the previous spot and replays the down off the app's own
 * PENALTY_RULES table, which is why this only ever showed up in the stat line.
 *
 * The fix lives in `packages/football-stats-engine/dist` — a vendored,
 * prebuilt dist with no source in this repo. The engine repo carries the
 * same fix since 86bd3ee; this file catches a dist copied from any older
 * engine build.
 */
import { describe, it, expect } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import type { GameSummary, TeamId } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";

const US = "team-us";
const THEM = "team-them";
const GAME = "game-1";

function play(over: Omit<Partial<PlayWithPlayers>, "play_players"> & {
  id: string;
  credits?: Array<{ id: string; role: string }>;
}): PlayWithPlayers {
  const rows = (over.credits ?? []).map((t, i) => ({
    id: `${over.id}-pp-${i}`, play_id: over.id, player_id: t.id, role: t.role, credit: null,
  }));
  return {
    game_id: GAME, sequence: 1, quarter: 1, clock: "10:00", down: 1, distance: 10,
    yard_line: 30, possession: "us", play_type: "rush", play_data: {}, yards_gained: 0,
    is_touchdown: false, is_turnover: false, is_penalty: false, description: "",
    play_start_time: 600, ...over, play_players: rows,
  } as unknown as PlayWithPlayers;
}

function summarize(plays: PlayWithPlayers[]): GameSummary {
  const engine = new FootballStatsEngine({
    enableGameState: true,
    rules: "high_school",
    trackSituationalSplits: true,
    trackDrives: true,
    computePasserRating: true,
  });
  engine.setTeams(
    { id: US, name: "Us", abbreviation: "US" } as TeamId,
    { id: THEM, name: "Them", abbreviation: "TH" } as TeamId,
  );
  engine.registerPlayers([
    { id: "rb22", name: "RB" },
    { id: "qb12", name: "QB" },
    { id: "wr80", name: "WR" },
  ]);
  engine.processPlays(transformPlays(plays, {
    gameId: GAME, homeTeamId: US, awayTeamId: THEM,
    homeTeamName: "Us", awayTeamName: "Them", programTeamId: US,
  }));
  return engine.getGameSummary();
}

const group = (s: GameSummary, key: string, id: string): Record<string, number> =>
  ((s as unknown as Record<string, Record<string, Record<string, number>>>)[key] ?? {})[id] ?? {};

const teamPenalties = (s: GameSummary, side: "homeTeamStats" | "awayTeamStats") =>
  (s as unknown as Record<string, { penalties: number; penaltyYards: number }>)[side];

describe("an accepted defensive foul that replays the down is a no-play", () => {
  it("gives the back no carry on an accepted defensive holding", () => {
    const s = summarize([
      play({
        id: "h1", down: 2, distance: 14, yard_line: 21,
        play_type: "rush", yards_gained: 3, is_penalty: true,
        credits: [{ id: "rb22", role: "rusher" }],
        play_data: {
          penalty_type: "Holding-DEF", penalty_enforcement: "accepted",
          penalty_yards: 5, play_category: "defense",
        },
      }),
    ]);

    expect(group(s, "rushing", "rb22").carries ?? 0).toBe(0);
    expect(group(s, "rushing", "rb22").yards ?? 0).toBe(0);
    // The flag itself still belongs to the defence.
    expect(teamPenalties(s, "awayTeamStats").penalties).toBe(1);
    expect(teamPenalties(s, "awayTeamStats").penaltyYards).toBe(5);
  });

  it("charges no pass attempt on an accepted defensive PI", () => {
    const s = summarize([
      play({
        id: "p1", down: 3, distance: 25, yard_line: 40,
        play_type: "pass_inc", yards_gained: 0, is_penalty: true,
        credits: [{ id: "qb12", role: "passer" }, { id: "wr80", role: "receiver" }],
        play_data: {
          penalty_type: "PI-DEF", penalty_enforcement: "accepted",
          penalty_yards: 15, play_category: "defense",
        },
      }),
    ]);

    expect(group(s, "passing", "qb12").attempts ?? 0).toBe(0);
    expect(group(s, "receiving", "wr80").targets ?? 0).toBe(0);
    expect(teamPenalties(s, "awayTeamStats").penalties).toBe(1);
    expect(teamPenalties(s, "awayTeamStats").penaltyYards).toBe(15);
  });

  /* The other half of the rule, and the reason this cannot be a blanket
     "any flag wipes the play": declining leaves the football exactly as it
     was played, and the offence keeps everything it earned. */
  it("leaves the play alone when the same foul is declined", () => {
    const s = summarize([
      play({
        id: "d1", down: 2, distance: 4, yard_line: 31,
        play_type: "pass_comp", yards_gained: 24, is_penalty: true,
        credits: [{ id: "qb12", role: "passer" }, { id: "wr80", role: "receiver" }],
        play_data: {
          penalty_type: "Holding-DEF", penalty_enforcement: "declined",
          penalty_yards: 5, play_category: "defense",
        },
      }),
    ]);

    expect(group(s, "passing", "qb12").attempts ?? 0).toBe(1);
    expect(group(s, "passing", "qb12").yards ?? 0).toBe(24);
    expect(group(s, "receiving", "wr80").receptions ?? 0).toBe(1);
    expect(teamPenalties(s, "awayTeamStats").penalties).toBe(0);
  });

  /* A genuine tack-on foul must NOT be swept up by the same change. A
     facemask during a run is enforced on top of the run; the run happened
     and the back keeps it. */
  it("still credits the run when the foul is a tack-on facemask", () => {
    const s = summarize([
      play({
        id: "f1", down: 1, distance: 10, yard_line: 56,
        play_type: "rush", yards_gained: 8, is_penalty: true,
        credits: [{ id: "rb22", role: "rusher" }],
        play_data: {
          penalty_type: "Facemask", penalty_enforcement: "accepted",
          penalty_yards: 15, play_category: "defense",
        },
      }),
    ]);

    expect(group(s, "rushing", "rb22").carries ?? 0).toBe(1);
    expect(group(s, "rushing", "rb22").yards ?? 0).toBe(8);
  });
});
