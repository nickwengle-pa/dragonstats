import { expect, it } from "vitest";
import { resolveKickSpots } from "./kickSpots";

it("recovers a legacy touchdown from its kick distance without trusting old return yards", () => {
  expect(resolveKickSpots({ ballOn: 35, playData: {}, description: "Kickoff #7 Jones 57 yds to US 8, ret #2 Smith 12 yds", isTouchdown: true })?.returnYards).toBe(92);
});
it("does not invent yardage without a landing spot or kick distance", () => {
  expect(resolveKickSpots({ ballOn: 35, playData: { kicked_to_yard: null }, description: "Kickoff TD", isTouchdown: true })).toBeNull();
});
it("preserves ordinary returns and counts a goal-line touchdown return as 100 yards", () => {
  expect(resolveKickSpots({ ballOn: 35, playData: { kicked_to_yard: 8, return_to_ball_on: 80 }, description: "" })?.returnYards).toBe(12);
  expect(resolveKickSpots({ ballOn: 35, playData: { kicked_to_yard: 0 }, description: "", isTouchdown: true })?.returnYards).toBe(100);
});
