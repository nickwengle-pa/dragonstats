import { describe, expect, it } from "vitest";
import { advanceSituationAfterPlay } from "./gameFlow";
import { DEFAULT_GAME_CONFIG as config } from "./programService";

const before = { possession: "us" as const, down: 1, distance: 10, ballOn: 35 };
const play = { type: "rush", yards: 5, result: "", penalty: null, flagYards: 0, isTouchdown: false, firstDown: false, turnover: false, fumbleRecoveredAt: 40, fumbleReturnYards: 0 };
describe("fumble recovery situations", () => {
  for (const possession of ["us", "them"] as const) {
    for (const returned of [0, 15]) {
      it(`${possession} throws an interception with a ${returned}-yard return`, () => {
        expect(advanceSituationAfterPlay({ type: "int", yards: 30 - returned, result: "", penalty: null, flagYards: 0, isTouchdown: false, firstDown: false, turnover: true }, { ...before, possession }, config)).toEqual({ possession: possession === "us" ? "them" : "us", down: 1, distance: 10, ballOn: 35 + returned });
      });
    }
    it(`${possession} throws a pick-six`, () => {
      expect(advanceSituationAfterPlay({ type: "int", yards: -35, result: "", penalty: null, flagYards: 0, isTouchdown: true, firstDown: false, turnover: true }, { ...before, possession }, config)).toEqual({ possession: possession === "us" ? "them" : "us", down: 1, distance: config.pat_distance, ballOn: 100 - config.pat_distance });
    });
  }
  it("keeps possession after the offense falls on its fumble", () => {
    expect(advanceSituationAfterPlay(play, before, config)).toEqual({ possession: "us", down: 2, distance: 5, ballOn: 40 });
  });
  it("uses the recovery spot when the loose ball bounces backward", () => {
    expect(advanceSituationAfterPlay({ ...play, fumbleRecoveredAt: 37 }, before, config)).toEqual({ possession: "us", down: 2, distance: 8, ballOn: 37 });
  });
  it("uses the end of an offensive recovery advance for the next down", () => {
    expect(advanceSituationAfterPlay({ ...play, type: "pass_comp", fumbleReturnYards: 8 }, before, config)).toEqual({ possession: "us", down: 1, distance: 10, ballOn: 48 });
  });
  it("flips possession and the field after a defensive return", () => {
    expect(advanceSituationAfterPlay({ ...play, turnover: true, fumbleReturnYards: 12 }, before, config)).toEqual({ possession: "them", down: 1, distance: 10, ballOn: 72 });
  });
  it("keeps strip-sack loss separate from the defensive recovery return", () => {
    expect(advanceSituationAfterPlay({ ...play, type: "sack", yards: -7, turnover: true, fumbleRecoveredAt: 28, fumbleReturnYards: 12 }, before, config)).toEqual({ possession: "them", down: 1, distance: 10, ballOn: 84 });
  });
  it("starts the recovering team's conversion after a return touchdown", () => {
    expect(advanceSituationAfterPlay({ ...play, turnover: true, fumbleReturnYards: 40, isTouchdown: true }, before, config)).toEqual({ possession: "them", down: 1, distance: config.pat_distance, ballOn: 100 - config.pat_distance });
  });
});
