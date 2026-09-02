/**
 * Live stats must equal postgame stats for the same football.
 *
 * There are two independent converters from a recorded play into an engine
 * play: `liveGameSession` (what the operator watches during the game) and
 * `playTransformer` (what the box score, report and film chart are built
 * from). They were written separately and have drifted, so the numbers on the
 * screen during a game are not always the numbers in the report afterwards.
 *
 * This fixture pins the disagreements. It is deliberately written to FAIL
 * while they exist: each one is a real number a coach can read off the app,
 * and the point of the test is to make merging the two converters verifiable
 * rather than hopeful.
 *
 * The two paths take different input shapes — PlayRecord (app) and
 * PlayWithPlayers (database row) — which is itself most of the problem. Until
 * there is one converter, "the same play" has to be written twice, once in
 * each shape, which is what the pairs below are.
 *
 * Run: npm run test:unit  (vitest — it resolves the engine the way the app
 * does; the vendored dist uses extensionless imports and only a bundler can
 * load it, which is why plain node/tsx cannot run this file)
 */
import { FootballStatsEngine } from "football-stats-engine";
import type { GameSummary, TeamId } from "football-stats-engine";
import { replayLiveGame } from "./liveGameSession";
import { transformPlays } from "./playTransformer";
import type { PlayRecord, TaggedPlayer } from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { describe, it, expect } from "vitest";

const PROGRAM = "team-us";
const OPPONENT = "team-them";
const GAME = "game-1";


/* ── the same football, written twice ─────────────────────────────────── */

interface Tag { id: string; role: string; credit?: number }

function appPlay(over: Omit<Partial<PlayRecord>, "tagged"> & { id: string; tagged?: Tag[] }): PlayRecord {
  const tagged: TaggedPlayer[] = (over.tagged ?? []).map((t) => ({
    id: t.id,
    player_id: t.id,
    jersey_number: null,
    name: t.id,
    role: t.role,
    credit: t.credit,
  }));
  return {
    quarter: 1,
    clock: 600,
    type: "rush",
    yards: 0,
    result: "",
    penalty: null,
    flagYards: 0,
    isTouchdown: false,
    firstDown: false,
    turnover: false,
    ballOn: 30,
    down: 1,
    distance: 10,
    description: "",
    possession: "them",
    ...over,
    tagged,
  } as PlayRecord;
}

// `credits`, not `tags`: PlayWithPlayers already has a `tags` text[] column.
function dbPlay(over: Omit<Partial<PlayWithPlayers>, "play_players"> & { id: string; credits?: Tag[] }): PlayWithPlayers {
  const rows = (over.credits ?? []).map((t, i) => ({
    id: `${over.id}-pp-${i}`,
    play_id: over.id,
    player_id: t.id,
    role: t.role,
    credit: t.credit ?? null,
  }));
  return {
    game_id: GAME,
    sequence: 1,
    quarter: 1,
    clock: "10:00",
    down: 1,
    distance: 10,
    yard_line: 30,
    possession: "them",
    play_type: "rush",
    play_data: {},
    yards_gained: 0,
    is_touchdown: false,
    is_turnover: false,
    is_penalty: false,
    description: "",
    play_start_time: 600,
    ...over,
    play_players: rows,
  } as unknown as PlayWithPlayers;
}

/* One play: THEY run, and two of our defenders share the tackle. The modal
   records a shared tackle as two "tackler" tags at 0.5 credit each. */
const SHARED_TACKLE_APP = [
  appPlay({
    id: "p1",
    type: "rush",
    yards: 4,
    possession: "them",
    tagged: [
      { id: "lb1", role: "tackler", credit: 0.5 },
      { id: "lb2", role: "tackler", credit: 0.5 },
    ],
  }),
];

const SHARED_TACKLE_DB = [
  dbPlay({
    id: "p1",
    play_type: "rush",
    yards_gained: 4,
    possession: "them",
    credits: [
      { id: "lb1", role: "tackler", credit: 0.5 },
      { id: "lb2", role: "tackler", credit: 0.5 },
    ],
  }),
];

/* ── run each path ────────────────────────────────────────────────────── */

function livesummary(plays: PlayRecord[]): GameSummary | null {
  return replayLiveGame(plays, {
    gameId: GAME,
    programTeamId: PROGRAM,
    programName: "Us",
    programAbbreviation: "US",
    opponentTeamId: OPPONENT,
    opponentName: "Them",
    opponentAbbreviation: "TH",
    isHome: true,
    gameConfig: DEFAULT_GAME_CONFIG,
    rulesConfig: null,
    pregame: null,
  } as never).summary;
}

function postgameSummary(plays: PlayWithPlayers[]): GameSummary {
  const engine = new FootballStatsEngine({
    enableGameState: true,
    rules: "high_school",
    trackSituationalSplits: true,
    trackDrives: true,
    computePasserRating: true,
  });
  const home: TeamId = { id: PROGRAM, name: "Us", abbreviation: "US" };
  const away: TeamId = { id: OPPONENT, name: "Them", abbreviation: "TH" };
  engine.setTeams(home, away);
  engine.registerPlayers([
    { id: "lb1", name: "LB One" },
    { id: "lb2", name: "LB Two" },
  ]);
  engine.processPlays(
    transformPlays(plays, {
      gameId: GAME,
      homeTeamId: PROGRAM,
      awayTeamId: OPPONENT,
      homeTeamName: "Us",
      awayTeamName: "Them",
      programTeamId: PROGRAM,
    }),
  );
  return engine.getGameSummary();
}

const def = (s: GameSummary | null, id: string) =>
  (s?.defense as Record<string, { soloTackles?: number; assistedTackles?: number; totalTackles?: number }>)?.[id] ?? {};

/* ── 1. a shared tackle is one tackle, split ──────────────────────────── */

describe("live stats equal postgame stats", () => {
  /* Two defenders at 0.5 credit each: 0 solo, 1 assist apiece, half a tackle
     each, 1.0 across the pair. Counting them as solos invents a whole extra
     tackle and hands both players a stat they did not earn. */
  it("counts a shared tackle as one tackle split two ways (postgame)", () => {
    const post = postgameSummary(SHARED_TACKLE_DB);
    expect(def(post, "lb1").soloTackles ?? 0).toBe(0);
    expect(def(post, "lb1").assistedTackles ?? 0).toBe(1);
    expect((def(post, "lb1").totalTackles ?? 0) + (def(post, "lb2").totalTackles ?? 0)).toBe(1);
  });

  /* The one that matters: the operator watching Live Stats and the coach
     reading the box score afterwards must see the same defence. */
  it("agrees between live and postgame on a shared tackle", () => {
    const live = livesummary(SHARED_TACKLE_APP);
    const post = postgameSummary(SHARED_TACKLE_DB);

    expect(def(live, "lb1").soloTackles ?? 0).toBe(def(post, "lb1").soloTackles ?? 0);
    expect(def(live, "lb1").assistedTackles ?? 0).toBe(def(post, "lb1").assistedTackles ?? 0);
    expect(
      (def(live, "lb1").totalTackles ?? 0) + (def(live, "lb2").totalTackles ?? 0),
    ).toBe(
      (def(post, "lb1").totalTackles ?? 0) + (def(post, "lb2").totalTackles ?? 0),
    );
  });
});
