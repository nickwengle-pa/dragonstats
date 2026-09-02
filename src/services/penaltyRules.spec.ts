/**
 * NFHS penalty enforcement.
 *
 * The rule that matters here is the one this app had wrong: NFHS does not
 * award an automatic first down. Defensive holding and defensive pass
 * interference are distance fouls, the down is replayed, and the offence gets
 * a new series only when the yardage itself reaches the line to gain.
 *
 * The consequence is a fourth down. A 4th-and-20 defensive pass interference
 * used to hand over a first down; it should walk off 15 and leave fourth down.
 */
import { describe, it, expect } from "vitest";
import {
  grantsAutoFirstDown,
  penaltyDefaultYards,
  PENALTY_RULES,
} from "@/components/game/types";
import { advanceSituationAfterPlay } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";

describe("NFHS penalty rules", () => {
  it("grants no automatic first down for defensive pass interference", () => {
    expect(grantsAutoFirstDown("PI-DEF", "defense")).toBe(false);
  });

  it("grants no automatic first down for defensive holding", () => {
    expect(grantsAutoFirstDown("Holding-DEF", "defense")).toBe(false);
  });

  it("never grants one for an offensive foul", () => {
    expect(grantsAutoFirstDown("Holding-OFF", "offense")).toBe(false);
    expect(grantsAutoFirstDown("False Start", "offense")).toBe(false);
  });

  /* If a ruleset that does award them is ever added, it is a data change on
     the table — this is the switch that would turn it on. */
  it("reads the flag from the rule table rather than a hardcoded list", () => {
    const table = { ...PENALTY_RULES, "PI-DEF": { ...PENALTY_RULES["PI-DEF"], autoFirstDown: true } };
    expect(table["PI-DEF"].autoFirstDown).toBe(true);
    // The shipped table has it off.
    expect(PENALTY_RULES["PI-DEF"].autoFirstDown).toBeUndefined();
  });

  describe("standard distances pre-fill the entry modal", () => {
    it("uses 15 for pass interference either way", () => {
      expect(penaltyDefaultYards("PI-DEF")).toBe(15);
      expect(penaltyDefaultYards("PI-OFF")).toBe(15);
    });

    it("uses 5 for pre-snap fouls and 10 for offensive holding", () => {
      expect(penaltyDefaultYards("False Start")).toBe(5);
      expect(penaltyDefaultYards("Encroachment")).toBe(5);
      expect(penaltyDefaultYards("Holding-OFF")).toBe(10);
    });

    it("uses 15 for personal fouls", () => {
      expect(penaltyDefaultYards("Facemask")).toBe(15);
      expect(penaltyDefaultYards("Unsportsmanlike")).toBe(15);
      expect(penaltyDefaultYards("Clipping")).toBe(15);
    });

    it("falls back to 5 for anything not in the table", () => {
      expect(penaltyDefaultYards("Something Nobody Added")).toBe(5);
      expect(penaltyDefaultYards(null)).toBe(5);
    });
  });

  /* The consequence, end to end through the enforcement itself rather than
     through the flag: the audit's first regression fixture. */
  describe("a fourth-down defensive pass interference", () => {
    const flagged = (over: Partial<PlayRecord>): PlayRecord => ({
      id: "p", quarter: 1, clock: 600, type: "pass_inc", yards: 0, result: "",
      penalty: "PI-DEF", penaltyCategory: "defense", penaltyEnforcement: "accepted",
      flagYards: 15, isTouchdown: false, firstDown: false, turnover: false,
      tagged: [], ballOn: 30, down: 4, distance: 20, description: "",
      possession: "us", ...over,
    } as PlayRecord);

    it("walks off 15 and stays fourth down when the yardage does not reach the sticks", () => {
      const after = advanceSituationAfterPlay(
        flagged({}),
        { possession: "us", down: 4, distance: 20, ballOn: 30 },
        DEFAULT_GAME_CONFIG,
      );
      expect(after.ballOn).toBe(45);
      expect(after.down).toBe(4);
      expect(after.distance).toBe(5);
    });

    /* And the other half of the rule: the offence still gets a new series when
       the distance alone earns it, which is how NFHS gives first downs on
       defensive fouls at all. */
    it("does give a first down when the 15 yards reach the line to gain", () => {
      const after = advanceSituationAfterPlay(
        flagged({ down: 3, distance: 10 }),
        { possession: "us", down: 3, distance: 10, ballOn: 30 },
        DEFAULT_GAME_CONFIG,
      );
      expect(after.ballOn).toBe(45);
      expect(after.down).toBe(1);
    });
  });
});
