import { describe, it, expect } from "vitest";
import { blockedTouchdownNetYards, needsNextSpotReview, normalizeBlockedTouchdown } from "./blockedKickOutcome";

describe("blocked punt recovered for a touchdown", () => {
  const play = { play_type: "blocked_kick", is_touchdown: true, is_penalty: false, yard_line: 11, yards_gained: 89, play_data: { next_situation_source: "pending_review" } };
  it("uses the kicking team's end zone for a receiving-team score", () => {
    expect(blockedTouchdownNetYards(11, false)).toBe(-11);
    expect(blockedTouchdownNetYards(11, true)).toBe(89);
  });
  it("corrects legacy display without mutating the saved row", () => {
    expect(normalizeBlockedTouchdown(play).yards_gained).toBe(-11);
    expect(play.yards_gained).toBe(89);
  });
  it("does not keep a penalty-free touchdown pending", () => {
    expect(needsNextSpotReview(play)).toBe(false);
    expect(needsNextSpotReview({ ...play, is_penalty: true })).toBe(true);
    expect(needsNextSpotReview({ ...play, is_touchdown: false })).toBe(true);
    expect(needsNextSpotReview({ ...play, play_type: "rush" })).toBe(true);
  });
});
