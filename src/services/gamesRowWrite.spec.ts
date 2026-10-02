import { describe, it, expect } from "vitest";
import { withoutMissingColumn } from "./gamesRowWrite";

/* The gap between deploying a build and applying its migration: the queue
   coalesces a game's patches into one, so a column the server lacks must not
   hold the final score and status hostage. */
describe("a games patch against a server without the official-final columns", () => {
  const patch = { our_score: 35, opponent_score: 14, status: "completed", final_snapshot: {}, final_history: [] };

  it("drops the column the server says it does not have, and keeps the rest", () => {
    const next = withoutMissingColumn(patch, { message: "Could not find the 'final_snapshot' column of 'games' in the schema cache" });
    expect(next).toEqual({ our_score: 35, opponent_score: 14, status: "completed", final_history: [] });
  });

  it("gives up on any other missing column, so a real fault still fails loudly", () => {
    expect(withoutMissingColumn(patch, { message: "Could not find the 'our_score' column of 'games' in the schema cache" })).toBeNull();
    expect(withoutMissingColumn(patch, { message: "permission denied for table games" })).toBeNull();
  });
});
