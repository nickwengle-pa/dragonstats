import { describe, expect, it, vi } from "vitest";
import type { PlayWithPlayers } from "./gameService";

/* A game of four rushes, one per quarter, by the same back. The period
   switch must give each quarter its own carry and each half its two. */

const US = "prog-1";
const BACK = "back-1";

function rush(seq: number, quarter: number, yards: number, touchdown = false): PlayWithPlayers {
  return {
    id: `p${seq}`, sequence: seq, created_at: "", game_id: "g1",
    quarter, clock: "8:00", possession: "us", down: 1, distance: 10, yard_line: 30,
    play_type: "rush", play_data: {}, yards_gained: yards,
    is_touchdown: touchdown, is_turnover: false, is_penalty: false,
    description: "", play_start_time: 480, play_end_time: 470,
    play_players: [{ id: `pp${seq}`, play_id: `p${seq}`, player_id: BACK, role: "rusher" }],
  } as unknown as PlayWithPlayers;
}

const PLAYS = [rush(1, 1, 5), rush(2, 2, 7), rush(3, 3, 11), rush(4, 4, 13)];

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "in", "order"]) c[k] = () => c;
  c.single = async () => result;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => table === "games"
      ? chain({ data: {
          id: "g1", season_id: "s1", opponent_id: "o1", is_home: true, our_score: 0, opponent_score: 0,
          status: "live", rules_config: {}, opening_kickoff_receiver: null,
          opponent: { id: "o1", name: "Them", abbreviation: "THM" },
        }, error: null })
      : chain({ data: [{ player_id: BACK, jersey_number: 22, position: "RB", player: { first_name: "Al", last_name: "Back" } }], error: null }),
  },
}));
vi.mock("./gameService", async (orig) => ({
  ...(await orig<typeof import("./gameService")>()),
  loadGamePlays: async () => PLAYS,
}));
vi.mock("./opponentService", () => ({ opponentPlayerService: { getByOpponent: async () => [] } }));

const { computeGameStatsBundle } = await import("./statsService");
const PROGRAM = { id: US, name: "Us", abbreviation: "US" };

describe("quarter and half splits", () => {
  it("counts the whole game by default", async () => {
    const b = await computeGameStatsBundle("g1", PROGRAM);
    expect(b?.summary.rushing[BACK]?.carries).toBe(4);
    expect(b?.summary.rushing[BACK]?.yards).toBe(36);
  });

  it("narrows to one quarter", async () => {
    const b = await computeGameStatsBundle("g1", PROGRAM, "q3");
    expect(b?.summary.rushing[BACK]?.carries).toBe(1);
    expect(b?.summary.rushing[BACK]?.yards).toBe(11);
    expect(b?.plays.map((p) => p.quarter)).toEqual([3]);
    expect(b?.allPlays).toHaveLength(4);
  });

  it("narrows to a half", async () => {
    const h1 = await computeGameStatsBundle("g1", PROGRAM, "h1");
    const h2 = await computeGameStatsBundle("g1", PROGRAM, "h2");
    expect(h1?.summary.rushing[BACK]?.yards).toBe(12);
    expect(h2?.summary.rushing[BACK]?.yards).toBe(24);
  });

  it("comes back empty, not broken, for a period with no plays", async () => {
    const b = await computeGameStatsBundle("g1", PROGRAM, "ot");
    expect(b?.summary.rushing[BACK]?.carries ?? 0).toBe(0);
  });
});
