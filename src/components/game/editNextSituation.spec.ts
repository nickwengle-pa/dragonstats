/**
 * A spot typed into the Adjust sheet on a play the editor has no spot control
 * for - a turnover, a blocked kick, a declined flag - survives an edit that
 * leaves the play's outcome alone, and gives way to one that moves it.
 */
import { describe, it, expect } from "vitest";
import { resolveEditedNextSituation } from "./editNextSituation";
import type { PlaySubmitData } from "./PlayEntryModal";
import { findPlayTypeDef, type PlayRecord } from "./types";
import { DEFAULT_GAME_CONFIG } from "@/services/programService";

const HAND = { possession: "them" as const, down: 1, distance: 10, ballOn: 50 };

function play(over: Partial<PlayRecord> = {}): PlayRecord {
  return {
    id: "p", quarter: 1, clock: 600, type: "int", yards: 15, result: "", penalty: null,
    flagYards: 0, isTouchdown: false, firstDown: false, turnover: true, tagged: [],
    ballOn: 40, down: 2, distance: 7, description: "", possession: "us",
    nextPossession: HAND.possession, nextDown: HAND.down, nextDistance: HAND.distance, nextBallOn: HAND.ballOn,
    playData: { next_situation_source: "manual_override" },
    ...over,
  };
}

/** What the editor hands back for `p` saved as-is, with `over` changed. */
function submit(p: PlayRecord, over: Partial<PlaySubmitData> = {}): PlaySubmitData {
  return {
    playType: findPlayTypeDef(p.type)!,
    tagged: p.tagged,
    yards: p.yards,
    isTouchdown: p.isTouchdown,
    isFirstDown: p.firstDown,
    isTouchback: !!p.isTouchback,
    turnover: p.turnover,
    clock: p.clock,
    result: p.result,
    penalty: p.penalty,
    penaltyCategory: p.penaltyCategory ?? null,
    penaltyEnforcement: p.penaltyEnforcement ?? "accepted",
    flagYards: p.flagYards,
    blockedKickType: p.blockedKickType ?? null,
    offensiveFormation: null,
    defensiveFormation: null,
    hashMark: null,
    description: p.description,
    playData: {},
    nextSituation: null,
    spotOverrideOffered: false,
    ...over,
  };
}

const resolve = (p: PlayRecord, s: PlaySubmitData) => resolveEditedNextSituation(p, s, DEFAULT_GAME_CONFIG);

describe("a hand-set spot through an edit", () => {
  it("an interception re-saved as-is keeps where the operator put the ball", () => {
    const p = play();
    expect(resolve(p, submit(p))).toEqual({
      nextSituation: { ...HAND, source: "manual_override" },
      handSpotDropped: false,
    });
  });

  it("naming a different tackler changes nothing about the spot", () => {
    const p = play();
    const r = resolve(p, submit(p, { tagged: [{ id: "x", player_id: "x", jersey_number: 4, name: "X", role: "tackler" }] }));
    expect(r.nextSituation).toEqual({ ...HAND, source: "manual_override" });
  });

  it("moving the return is the newer word on where the play ended", () => {
    const p = play();
    const r = resolve(p, submit(p, { yards: 30 }));
    expect(r.nextSituation).toBeNull();
    expect(r.handSpotDropped).toBe(true);
  });

  it("a lost fumble keeps it until the recovery spot moves", () => {
    const p = play({ type: "rush", yards: 4, fumbleRecoveredAt: 44, fumbleReturnYards: 0 });
    expect(resolve(p, submit(p, { fumbleRecoveredAt: 44, fumbleReturnYards: 0 })).nextSituation)
      .toEqual({ ...HAND, source: "manual_override" });
    expect(resolve(p, submit(p, { fumbleRecoveredAt: 44, fumbleReturnYards: 12 })).handSpotDropped).toBe(true);
  });

  it("a declined flag - no spot control in the editor - keeps it too", () => {
    const p = play({
      type: "pass_comp", yards: 8, turnover: false, penalty: "Holding", penaltyCategory: "defense",
      penaltyEnforcement: "declined", nextPossession: "us", nextBallOn: 45, nextDown: 3, nextDistance: 2,
    });
    expect(resolve(p, submit(p)).nextSituation)
      .toEqual({ possession: "us", down: 3, distance: 2, ballOn: 45, source: "manual_override" });
  });

  it("a blocked kick keeps it", () => {
    const p = play({ type: "blocked_kick", yards: -8, turnover: true, blockedKickType: "punt" });
    expect(resolve(p, submit(p)).nextSituation).toEqual({ ...HAND, source: "manual_override" });
  });

  it("where the editor offered the spot control, its answer is final", () => {
    // The operator went "Back to the rules" on an accepted flag.
    const p = play({ type: "rush", yards: 5, turnover: false, penalty: "Face Mask", penaltyCategory: "defense", flagYards: 15 });
    const enforced = { possession: "us" as const, down: 1, distance: 10, ballOn: 60, source: "penalty_enforced" as const };
    expect(resolve(p, submit(p, { nextSituation: enforced, spotOverrideOffered: true }))).toEqual({
      nextSituation: enforced,
      handSpotDropped: false,
    });
  });

  it("a play with no hand-set spot is left as the editor said", () => {
    const p = play({ playData: { next_situation_source: "auto" } });
    expect(resolve(p, submit(p))).toEqual({ nextSituation: null, handSpotDropped: false });
  });

  it("reads the spot off play_data, where the film chart keeps it", () => {
    const p = play({
      nextPossession: undefined, nextDown: undefined, nextDistance: undefined, nextBallOn: undefined,
      playData: { next_situation_source: "manual_override", next_possession: "them", next_down: 1, next_distance: 10, next_yard_line: 50 },
    });
    expect(resolve(p, submit(p)).nextSituation).toEqual({ ...HAND, source: "manual_override" });
  });
});
