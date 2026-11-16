/* Pins the game screen's helpers as they behaved when they were moved out of
   GameScreen.tsx, so a later change to any of them is a decision rather than
   an accident. */
import { describe, expect, it } from "vitest";
import {
  applyScoreDelta,
  formatTeamYardLabel,
  getClockCaptureReason,
  getFieldSideForSpot,
  getStoredEndClock,
  getStoredStartClock,
  getTimeoutTeam,
  maxTimeoutsForQuarter,
  parseClockText,
  shouldPromptForClockCapture,
  timeoutHalfForQuarter,
  toBallOnFromFieldSide,
  toTeamTag,
  type LiveSituationSnapshot,
} from "./gameScreenRules";
import type { PlayRecord } from "@/components/game/types";

const ours = (ballOn = 30): LiveSituationSnapshot => ({ possession: "us", down: 1, distance: 10, ballOn });
const theirs = (ballOn = 30): LiveSituationSnapshot => ({ possession: "them", down: 1, distance: 10, ballOn });
const play = (over: Partial<PlayRecord> = {}) =>
  ({ type: "rush", result: "", isTouchdown: false, penalty: null, ...over }) as PlayRecord;

describe("team tags and yard labels", () => {
  it("prefers the team's own abbreviation, trimmed and upper-cased", () => {
    expect(toTeamTag("Purchase Line Dragons", " drg ")).toBe("DRG");
  });
  it("falls back to initials, the first three letters of one word, or TEAM", () => {
    expect(toTeamTag("Purchase Line Dragons")).toBe("PLD");
    expect(toTeamTag("Dragons")).toBe("DRA");
    expect(toTeamTag("  ")).toBe("TEAM");
    expect(toTeamTag(null)).toBe("TEAM");
  });
  it("labels a spot from the side of the field it is on", () => {
    expect(formatTeamYardLabel(35, "us", "DRG", "VIS")).toBe("DRG 35");
    expect(formatTeamYardLabel(65, "us", "DRG", "VIS")).toBe("VIS 35");
    expect(formatTeamYardLabel(35, "them", "DRG", "VIS")).toBe("VIS 35");
    expect(formatTeamYardLabel(50, "them", "DRG", "VIS")).toBe("50");
  });
});

describe("field side round trip", () => {
  it("names whose half a spot is in, for either offense", () => {
    expect(getFieldSideForSpot(20, "us")).toBe("program");
    expect(getFieldSideForSpot(80, "us")).toBe("opponent");
    expect(getFieldSideForSpot(20, "them")).toBe("opponent");
    expect(getFieldSideForSpot(50, "them")).toBe("opponent");
  });
  it("turns a side and yard line back into the same ballOn", () => {
    for (const possession of ["us", "them"] as const) {
      for (const ballOn of [1, 20, 49, 50, 51, 80, 99]) {
        const side = getFieldSideForSpot(ballOn, possession);
        const yardLine = ballOn <= 50 ? ballOn : 100 - ballOn;
        expect(toBallOnFromFieldSide(side, yardLine, possession)).toBe(ballOn);
      }
    }
  });
});

describe("clock", () => {
  it("reads m:ss and falls back on anything else", () => {
    expect(parseClockText("7:42", 0)).toBe(462);
    expect(parseClockText("0:05", 0)).toBe(5);
    expect(parseClockText("abc", 600)).toBe(600);
    expect(parseClockText(462, 600)).toBe(600);
  });
  it("uses the recorded start clock when there is one, the play's clock otherwise", () => {
    expect(getStoredStartClock({ clock: 300, playData: {} })).toBe(300);
    expect(getStoredStartClock({ clock: 300, playData: { recorded_start_clock_seconds: 290 } })).toBe(290);
    expect(getStoredEndClock({ clock: 300, playData: {} })).toBeNull();
    expect(getStoredEndClock({ clock: 300, playData: { recorded_end_clock_seconds: "12" } })).toBeNull();
    expect(getStoredEndClock({ clock: 300, playData: { recorded_end_clock_seconds: 12 } })).toBe(12);
  });
});

describe("timeouts", () => {
  it("gives each half three and each overtime period one", () => {
    expect([1, 2, 3, 4].map(timeoutHalfForQuarter)).toEqual([1, 1, 2, 2]);
    expect(timeoutHalfForQuarter(5)).toBe(3);
    expect([1, 4].map(maxTimeoutsForQuarter)).toEqual([3, 3]);
    expect(maxTimeoutsForQuarter(5)).toBe(1);
  });
  it("reads who called it, and nothing else", () => {
    expect(getTimeoutTeam(play({ type: "timeout", playData: { timeout_team: "them" } }))).toBe("them");
    expect(getTimeoutTeam(play({ type: "timeout", playData: { timeout_team: "both" } }))).toBeNull();
  });
});

describe("when to ask for the clock", () => {
  it("never after a timeout or a try", () => {
    expect(shouldPromptForClockCapture(play({ type: "timeout" }), ours(), theirs())).toBe(false);
    expect(shouldPromptForClockCapture(play({ type: "pat", isTouchdown: true }), ours(), ours())).toBe(false);
    expect(shouldPromptForClockCapture(play({ type: "two_pt", penalty: "Offside" }), ours(), ours())).toBe(false);
  });
  it("after a score, a stopping play, a flag or a change of possession", () => {
    expect(shouldPromptForClockCapture(play({ isTouchdown: true }), ours(), ours())).toBe(true);
    expect(shouldPromptForClockCapture(play({ type: "pass_inc" }), ours(), ours())).toBe(true);
    expect(shouldPromptForClockCapture(play({ penalty: "Holding" }), ours(), ours())).toBe(true);
    expect(shouldPromptForClockCapture(play(), ours(), theirs())).toBe(true);
  });
  it("not after an ordinary in-bounds run", () => {
    expect(shouldPromptForClockCapture(play(), ours(30), ours(34))).toBe(false);
  });
  it("names the reason the way the prompt shows it", () => {
    expect(getClockCaptureReason(play({ isTouchdown: true }), ours(), theirs())).toBe("after scoring play");
    expect(getClockCaptureReason(play({ type: "fg", result: "Good" }), ours(), theirs())).toBe("after field goal");
    expect(getClockCaptureReason(play({ type: "punt" }), ours(), theirs())).toBe("after punt");
    expect(getClockCaptureReason(play(), ours(), theirs())).toBe("after change of possession");
    expect(getClockCaptureReason(play(), ours(), ours())).toBe("after play");
  });
});

describe("score delta", () => {
  it("adds a touchdown to the side that scored and leaves the other alone", () => {
    const td = play({ quarter: 1, possession: "us", isTouchdown: true, ballOn: 95, turnover: false, playData: {} });
    const after = applyScoreDelta(td, { us: 7, them: 3 });
    expect(after.them).toBe(3);
    expect(after.us).toBeGreaterThan(7);
  });
  it("changes nothing on a play that scores nothing", () => {
    const run = play({ quarter: 1, possession: "us", ballOn: 30, turnover: false, playData: {} });
    expect(applyScoreDelta(run, { us: 7, them: 3 })).toEqual({ us: 7, them: 3 });
  });
});
