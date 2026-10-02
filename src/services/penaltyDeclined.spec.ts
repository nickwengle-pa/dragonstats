import { describe, expect, it } from "vitest";
import { advanceSituationAfterPlay, type LiveSituation } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";

const declined = {
  type: "rush",
  yards: 0,
  result: "",
  penalty: "Holding-OFF",
  penaltyCategory: "offense" as const,
  penaltyEnforcement: "declined" as const,
  flagYards: 10,
  isTouchdown: false,
  firstDown: false,
};

describe("declined penalties and down advancement", () => {
  for (const possession of ["us", "them"] as const) {
    for (const type of ["penalty", "penalty_only", "false_start", "encroachment"]) {
      it(`preserves ${possession}'s fourth-down situation for a declined standalone ${type}`, () => {
        const before: LiveSituation = { possession, ballOn: 40, down: 4, distance: 15 };
        expect(advanceSituationAfterPlay({ ...declined, type }, before, DEFAULT_GAME_CONFIG)).toEqual(before);
      });
    }
  }

  it("advances a live run normally when its attached holding flag is declined", () => {
    expect(advanceSituationAfterPlay(
      { ...declined, yards: 6 },
      { possession: "us", ballOn: 40, down: 2, distance: 10 },
      DEFAULT_GAME_CONFIG,
    )).toEqual({ possession: "us", ballOn: 46, down: 3, distance: 4 });
  });

  it("awards an earned first down when a completed play's flag is declined", () => {
    expect(advanceSituationAfterPlay(
      { ...declined, type: "pass_comp", yards: 12, firstDown: true },
      { possession: "them", ballOn: 40, down: 3, distance: 10 },
      DEFAULT_GAME_CONFIG,
    )).toEqual({ possession: "them", ballOn: 52, down: 1, distance: 10 });
  });

  it("changes possession when a live fourth-down play falls short despite a declined flag", () => {
    expect(advanceSituationAfterPlay(
      { ...declined, yards: 3 },
      { possession: "us", ballOn: 40, down: 4, distance: 10 },
      DEFAULT_GAME_CONFIG,
    )).toEqual({ possession: "them", ballOn: 57, down: 1, distance: 10 });
  });

  it("retains an interception when its attached flag is declined", () => {
    expect(advanceSituationAfterPlay(
      { ...declined, type: "int", yards: 8, turnover: true },
      { possession: "them", ballOn: 40, down: 2, distance: 10 },
      DEFAULT_GAME_CONFIG,
    )).toEqual({ possession: "us", ballOn: 52, down: 1, distance: 10 });
  });
});
