import { expect, it } from "vitest";
import { quickKneel } from "./quickKneel";
import { PLAY_TYPES } from "./types";
import { advanceSituationAfterPlay } from "@/services/gameFlow";
import { DEFAULT_GAME_CONFIG } from "@/services/programService";

it("charges the selected quarterback a rushing loss while preserving the clock", () => {
  const qb = { id: "qb7", player_id: "qb7", name: "Quarterback", jersey_number: 7, role: "passer" };
  const data = quickKneel(PLAY_TYPES.find(t => t.id === "kneel")!, { possession: "us", clock: 30 }, qb);
  expect(data.tagged).toEqual([{ ...qb, role: "rusher" }]);
  expect(data.description).toBe("Kneel · #7 Quarterback rushing −1 yd");
  expect(data.yards).toBe(-1);
  expect(data.clock).toBe(30);
});

it("records a team rushing loss and advances the down for either team", () => {
  for (const possession of ["us", "them"] as const) {
    const before = { possession, clock: 30, down: 1, distance: 10, ballOn: 40 };
    const data = quickKneel(PLAY_TYPES.find(type => type.id === "kneel")!, before);
    expect(data.yards).toBe(-1);
    expect(data.tagged[0].role).toBe("rusher");
    expect(data.tagged[0].player_id).toBe(possession === "us" ? "our_team" : "opp_team");
    expect(data.clock).toBe(30);
    expect(data.playData?.quick_kneel).toBe(true);
    const after = advanceSituationAfterPlay({ ...data, type: "kneel", firstDown: false }, before, DEFAULT_GAME_CONFIG);
    expect(after).toEqual({ possession, down: 2, distance: 11, ballOn: 39 });
  }
});
