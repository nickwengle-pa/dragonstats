import { describe, expect, it } from "vitest";
import { requiresScoringPenaltyRuling } from "./penaltySpot";

const accepted = {
  penalty: "Unsportsmanlike",
  penaltyEnforcement: "accepted" as const,
  playCounts: true,
  type: "rush",
  isTouchdown: false,
  result: "",
};

describe("scoring penalty next-situation confirmation", () => {
  for (const type of ["rush", "pass_comp", "int", "fumble", "kickoff", "punt"]) {
    it(`requires the ensuing situation for an accepted counted ${type} touchdown`, () => {
      expect(requiresScoringPenaltyRuling({ ...accepted, type, isTouchdown: true })).toBe(true);
    });
  }

  for (const type of ["fg", "pat", "two_pt"]) {
    it(`requires the ensuing kick for a successful counted ${type}`, () => {
      expect(requiresScoringPenaltyRuling({ ...accepted, type, result: "Good" })).toBe(true);
    });
  }

  for (const type of ["pat", "two_pt"]) {
    it(`requires the ensuing kick for a defensive ${type} return score`, () => {
      expect(requiresScoringPenaltyRuling({ ...accepted, type, result: "Returned" })).toBe(true);
    });
  }

  it("requires confirmation for a counted safety", () => {
    expect(requiresScoringPenaltyRuling({ ...accepted, type: "safety" })).toBe(true);
  });

  it("allows ordinary scoring transitions when the flag was declined or offset", () => {
    for (const penaltyEnforcement of ["declined", "offset"] as const) {
      expect(requiresScoringPenaltyRuling({ ...accepted, penaltyEnforcement, isTouchdown: true })).toBe(false);
    }
  });

  it("does not ask for a scoring ruling when the score was wiped or no flag exists", () => {
    expect(requiresScoringPenaltyRuling({ ...accepted, playCounts: false, isTouchdown: true })).toBe(false);
    expect(requiresScoringPenaltyRuling({ ...accepted, penalty: null, isTouchdown: true })).toBe(false);
  });

  it("does not require scoring confirmation for an ordinary gain or missed kick", () => {
    expect(requiresScoringPenaltyRuling(accepted)).toBe(false);
    expect(requiresScoringPenaltyRuling({ ...accepted, type: "fg", result: "No Good" })).toBe(false);
  });
});
