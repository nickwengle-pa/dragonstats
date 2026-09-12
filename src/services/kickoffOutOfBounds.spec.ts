import { describe, expect, it } from "vitest";
import { advanceSituationAfterPlay } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { isKickoffDue } from "@/components/game/specialTeamsPrompt";

describe("kickoff out of bounds", () => {
  for (const possession of ["us", "them"] as const) {
    const before = { possession, down: 1, distance: 10, ballOn: 40 };
    const base = { type: "kickoff", yards: 55, result: "", penalty: "Kickoff Out of Bounds", flagYards: 5, isTouchdown: false, firstDown: false };
    it(`gives the receiver the 35 when ${possession} kicks`, () => {
      const play = { ...base, playData: { kickoff_out_of_bounds_choice: "take_35" } };
      const after = advanceSituationAfterPlay(play, before, DEFAULT_GAME_CONFIG);
      expect(after).toEqual({ possession: possession === "us" ? "them" : "us", down: 1, distance: 10, ballOn: 35 });
      expect(isKickoffDue({ ...after, quarter: 1 }, { ...play, quarter: 1 }, DEFAULT_GAME_CONFIG)).toBe(false);
    });
    it(`keeps ${possession} kicking after a five-yard penalty`, () => {
      const play = { ...base, playData: { kickoff_out_of_bounds_choice: "rekick" } };
      const after = advanceSituationAfterPlay(play, before, DEFAULT_GAME_CONFIG);
      expect(after).toEqual({ ...before, ballOn: 35 });
      expect(isKickoffDue({ ...after, quarter: 1 }, { ...play, quarter: 1 }, DEFAULT_GAME_CONFIG)).toBe(true);
      expect(advanceSituationAfterPlay(play, after, DEFAULT_GAME_CONFIG).ballOn).toBe(30);
    });
  }
});
