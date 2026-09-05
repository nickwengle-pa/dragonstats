import { describe, it, expect } from "vitest";
import { isKickoffDue } from "./specialTeamsPrompt";
import { DEFAULT_GAME_CONFIG as config } from "@/services/programService";

const situation = { down: 1, distance: config.first_down_distance, ballOn: config.kickoff_yard_line, quarter: 1 };
const previous = { type: "rush", result: "", isTouchdown: false, quarter: 1 };
describe("kickoff suggestions", () => {
  it("does not mistake a normal snap at the kickoff yard line for a kick", () => {
    expect(isKickoffDue(situation, previous, config)).toBe(false);
  });
  it("recognizes opening and second-half kickoffs", () => {
    expect(isKickoffDue(situation, undefined, config)).toBe(true);
    expect(isKickoffDue({ ...situation, quarter: 3 }, { ...previous, quarter: 2 }, config)).toBe(true);
  });
  it("recognizes kicks after tries and good field goals, but not missed field goals", () => {
    for (const type of ["pat", "two_pt"]) expect(isKickoffDue(situation, { ...previous, type }, config)).toBe(true);
    expect(isKickoffDue(situation, { ...previous, type: "fg", result: "Good" }, config)).toBe(true);
    expect(isKickoffDue(situation, { ...previous, type: "fg", result: "No Good" }, config)).toBe(false);
  });
  it("waits for the conversion before suggesting a kickoff after a touchdown", () => {
    expect(isKickoffDue({ ...situation, ballOn: 100 - config.pat_distance, distance: config.pat_distance }, { ...previous, isTouchdown: true }, config)).toBe(false);
    expect(isKickoffDue(situation, { ...previous, isTouchdown: true }, config)).toBe(true);
  });
});
