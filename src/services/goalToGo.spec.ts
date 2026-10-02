import { describe, expect, it } from "vitest";
import { canChooseGoalToGo, carryGoalToGo, distanceLabel, storedGoalToGo } from "./goalToGo";
import { advanceSituationAfterPlay, getRecordedNextSituation, rebuildPlaySituations } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";

const config = DEFAULT_GAME_CONFIG;
const snap = { possession: "us" as const, down: 1, ballOn: 90, distance: 10 };
const incomplete = { type: "pass_inc", yards: 0, result: "Incomplete", penalty: null,
  flagYards: 0, isTouchdown: false, firstDown: false };

describe("goal-to-go rulings", () => {
  it("uses G for a fresh series inside the ten", () => {
    expect(distanceLabel({ ballOn: 91, distance: 9 })).toBe("G");
    expect(distanceLabel({ ballOn: 97, distance: 3 })).toBe("G");
  });

  it("does not assume goal at exactly the ten", () => {
    expect(distanceLabel(snap)).toBe("10");
    expect(distanceLabel({ ...snap, goalToGo: true })).toBe("G");
    expect(distanceLabel({ ...snap, goalToGo: false })).toBe("10");
    expect(distanceLabel({ ballOn: 90, distance: 5 })).toBe("5");
  });

  it("offers the ruling only for first and ten at the opponent's ten", () => {
    expect(canChooseGoalToGo(snap)).toBe(true);
    expect(canChooseGoalToGo({ ...snap, ballOn: 89 })).toBe(false);
    expect(canChooseGoalToGo({ ...snap, ballOn: 91, distance: 9 })).toBe(false);
    expect(canChooseGoalToGo({ ...snap, down: 2 })).toBe(false);
    expect(canChooseGoalToGo({ ...snap, distance: 5 })).toBe(false);
  });

  for (const goalToGo of [true, false]) {
    it(`keeps a run-to-ten ${goalToGo ? "goal" : "ten"} ruling in computed advancement`, () => {
      const next = advanceSituationAfterPlay({ ...incomplete, type: "rush", yards: 10, firstDown: true,
        playData: { next_goal_to_go: goalToGo } }, { ...snap, ballOn: 80 }, config);
      expect(next).toEqual({ possession: "us", down: 1, ballOn: 90, distance: 10, goalToGo });
      expect(distanceLabel(next)).toBe(goalToGo ? "G" : "10");
    });
  }

  it("ignores a stale next ruling when a run edit no longer earns first and ten at the ten", () => {
    for (const [yards, firstDown] of [[9, false], [11, true]] as const) {
      const next = advanceSituationAfterPlay({ ...incomplete, type: "rush", yards, firstDown,
        playData: { next_goal_to_go: true } }, { ...snap, ballOn: 80 }, config);
      expect(next.goalToGo).toBeUndefined();
    }
    const shortOfSticks = advanceSituationAfterPlay({ ...incomplete, type: "rush", yards: 5,
      playData: { next_goal_to_go: true } }, { ...snap, ballOn: 85 }, config);
    expect(shortOfSticks).toMatchObject({ down: 2, ballOn: 90, distance: 5 });
    expect(shortOfSticks.goalToGo).toBeUndefined();
  });

  for (const goalToGo of [true, false]) {
    it(`keeps the ${goalToGo ? "goal" : "ten"} ruling on an incomplete pass`, () => {
      const next = advanceSituationAfterPlay(incomplete, { ...snap, goalToGo }, config);
      expect(next).toMatchObject({ down: 2, distance: 10, ballOn: 90, goalToGo });
      expect(distanceLabel(next)).toBe(goalToGo ? "G" : "10");
    });

    it(`retains the ${goalToGo ? "goal" : "numeric"} series after a false start`, () => {
      const next = advanceSituationAfterPlay({ ...incomplete, type: "penalty_only", penalty: "False Start",
        penaltyCategory: "offense", penaltyEnforcement: "accepted", flagYards: 5 }, { ...snap, goalToGo }, config);
      expect(next).toMatchObject({ down: 1, ballOn: 85, distance: 15, goalToGo });
      expect(distanceLabel(next)).toBe(goalToGo ? "G" : "15");
    });
  }

  it("resets the prior choice on a new first down inside the ten", () => {
    const next = advanceSituationAfterPlay({ ...incomplete, type: "rush", yards: 6, firstDown: true },
      { ...snap, goalToGo: false }, config);
    expect(next.goalToGo).toBeUndefined();
    expect(distanceLabel(next)).toBe("G");
  });

  it("honors an explicit official next-series choice", () => {
    expect(carryGoalToGo({ ...snap, goalToGo: true }, { ...snap, goalToGo: false }, true).goalToGo).toBe(true);
  });

  it("reads both true and false without treating cleared metadata as false", () => {
    expect(storedGoalToGo({ goal_to_go: false })).toBe(false);
    expect(storedGoalToGo({ goal_to_go: true })).toBe(true);
    expect(storedGoalToGo({ goal_to_go: null })).toBeUndefined();
    expect(getRecordedNextSituation({ nextPossession: "us", nextDown: 1, nextDistance: 10, nextBallOn: 90,
      playData: { next_goal_to_go: false } })?.goalToGo).toBe(false);
  });

  it("preserves the selected goal series through a rebuilt play chain", () => {
    const first = { id: "goal-1", type: "pass_inc", possession: "us", quarter: 1, clock: 120,
      down: 1, distance: 10, ballOn: 90, yards: 0, result: "Incomplete", penalty: null,
      flagYards: 0, isTouchdown: false, firstDown: false, turnover: false, description: "Incomplete", tagged: [],
      playData: { start_override: true, goal_to_go: true } } as PlayRecord;
    const second = { ...first, id: "goal-2", down: 2, playData: {} };
    const rebuilt = rebuildPlaySituations([first, second], null, config);
    expect(rebuilt.plays[0].playData?.next_goal_to_go).toBe(true);
    expect(rebuilt.plays[1].playData?.goal_to_go).toBe(true);
    expect(distanceLabel(rebuilt.currentSituation)).toBe("G");
  });

  it("persists a run-to-ten ruling while rebuilding and carries it into the following snap", () => {
    const run = { id: "run-to-ten", type: "rush", possession: "us", quarter: 1, clock: 120,
      down: 1, distance: 10, ballOn: 80, yards: 10, result: "", penalty: null,
      flagYards: 0, isTouchdown: false, firstDown: true, turnover: false, description: "Run for ten", tagged: [],
      playData: { start_override: true, next_goal_to_go: true } } as PlayRecord;
    const pass = { ...run, id: "after-ten", type: "pass_inc", ballOn: 90, yards: 0,
      firstDown: false, result: "Incomplete", playData: {} };
    const rebuilt = rebuildPlaySituations([run, pass], null, config);
    expect(rebuilt.plays[0].playData?.next_goal_to_go).toBe(true);
    expect(rebuilt.plays[1].playData?.goal_to_go).toBe(true);
    expect(rebuilt.currentSituation).toMatchObject({ down: 2, ballOn: 90, distance: 10, goalToGo: true });
  });

  it("clears a stale run-to-ten ruling when rebuilding a changed ending spot", () => {
    const run = { id: "changed-run", type: "rush", possession: "us", quarter: 1, clock: 120,
      down: 1, distance: 10, ballOn: 80, yards: 11, result: "", penalty: null,
      flagYards: 0, isTouchdown: false, firstDown: true, turnover: false, description: "Run for eleven", tagged: [],
      playData: { start_override: true, next_goal_to_go: false } } as PlayRecord;
    const rebuilt = rebuildPlaySituations([run], null, config);
    expect(rebuilt.plays[0].playData?.next_goal_to_go).toBeNull();
    expect(distanceLabel(rebuilt.currentSituation)).toBe("G");
  });
});
