/* Pins play entry's shared rules as they behaved when they were moved out of
   PlayEntryModal.tsx. roleUsesOpponentRoster decides which roster every pick
   comes from, so a change to it is a change to who gets credited. */
import { describe, expect, it } from "vitest";
import {
  defaultBlockedKickType,
  ordinalDown,
  otherSide,
  resolveSoftTarget,
  roleUsesOpponentRoster,
  teamTag,
} from "./playEntryRules";
import type { GameState } from "./types";

describe("roleUsesOpponentRoster", () => {
  it("picks offensive roles from the team with the ball", () => {
    expect(roleUsesOpponentRoster("rusher", false)).toBe(false);
    expect(roleUsesOpponentRoster("rusher", true)).toBe(true);
    expect(roleUsesOpponentRoster("punter", true)).toBe(true);
  });
  it("picks defensive roles from the team without it", () => {
    for (const role of ["tackler", "assist", "sacker", "interceptor", "forced_fumble", "defender", "blocker"]) {
      expect(roleUsesOpponentRoster(role, false)).toBe(true);
      expect(roleUsesOpponentRoster(role, true)).toBe(false);
    }
  });
  it("puts the returner on the receiving team, except an onside kick the kickers recover", () => {
    expect(roleUsesOpponentRoster("returner", false, { playTypeId: "punt" })).toBe(true);
    expect(roleUsesOpponentRoster("returner", true, { playTypeId: "punt" })).toBe(false);
    expect(roleUsesOpponentRoster("returner", false, { playTypeId: "onside_kick", onsideRecoveredByKicker: true })).toBe(false);
    expect(roleUsesOpponentRoster("returner", false, { playTypeId: "onside_kick", onsideRecoveredByKicker: false })).toBe(true);
  });
  it("follows the recovery toggle on a blocked kick", () => {
    expect(roleUsesOpponentRoster("recoverer", false, { playTypeId: "blocked_kick", blockedRecoveredByKicking: true })).toBe(false);
    expect(roleUsesOpponentRoster("recoverer", false, { playTypeId: "blocked_kick", blockedRecoveredByKicking: false })).toBe(true);
  });
  it("gives a fumble recovery to whoever the flag says fell on it", () => {
    expect(roleUsesOpponentRoster("fumble_recovery", false, { fumbleRecoveredByUs: true })).toBe(false);
    expect(roleUsesOpponentRoster("fumble_recovery", false, { fumbleRecoveredByUs: false })).toBe(true);
    // On a loose kick, the kick's own flag wins.
    expect(roleUsesOpponentRoster("fumble_recovery", false, { fumbleRecoveredByUs: true, kickRecoveredByKicking: false })).toBe(true);
    expect(roleUsesOpponentRoster("fumble_recovery", true, { kickRecoveredByKicking: true })).toBe(true);
  });
});

describe("resolveSoftTarget", () => {
  const roster = [
    { jersey: 2, item: "two" },
    { jersey: 21, item: "twenty-one" },
    { jersey: 44, item: "forty-four" },
    { jersey: null, item: "no number" },
  ];
  it("points at an exact jersey", () => {
    expect(resolveSoftTarget("44", roster, null)).toEqual({ kind: "player", item: "forty-four" });
    expect(resolveSoftTarget("2", roster, null)).toEqual({ kind: "player", item: "two" });
  });
  it("narrows on a unique prefix", () => {
    expect(resolveSoftTarget("4", roster, null)).toEqual({ kind: "player", item: "forty-four" });
  });
  it("never guesses between two players wearing the same number", () => {
    expect(resolveSoftTarget("7", [{ jersey: 7, item: "a" }, { jersey: 7, item: "b" }], 7)).toBeNull();
  });
  it("offers an unrostered number only once no rostered one could still be meant", () => {
    expect(resolveSoftTarget("9", roster, 9)).toEqual({ kind: "pending", jersey: 9 });
    expect(resolveSoftTarget("9", roster, null)).toBeNull();
  });
  it("ignores an empty or non-numeric search", () => {
    expect(resolveSoftTarget("", roster, 1)).toBeNull();
    expect(resolveSoftTarget("a", roster, 1)).toBeNull();
  });
});

describe("small helpers", () => {
  it("defaults a blocked kick from the situation", () => {
    const at = (down: number, ballOn: number) => ({ down, ballOn }) as GameState;
    expect(defaultBlockedKickType(at(1, 97))).toBe("extra_point");
    expect(defaultBlockedKickType(at(4, 70))).toBe("field_goal");
    expect(defaultBlockedKickType(at(4, 40))).toBe("punt");
    expect(defaultBlockedKickType(at(2, 40))).toBe("field_goal");
  });
  it("writes downs and team tags the way the band does", () => {
    expect([1, 2, 3, 4].map(ordinalDown)).toEqual(["1st", "2nd", "3rd", "4th"]);
    expect(teamTag("Dragons", "drg")).toBe("DRG");
    expect(teamTag("Purchase Line Dragons")).toBe("PLD");
    expect(otherSide("us")).toBe("them");
  });
});
