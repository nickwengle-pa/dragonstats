import { expect, it } from "vitest";
import { buildDescription, PLAY_TYPES, tidyStoredDescription, type TaggedPlayer } from "./types";

/* An opponent entered by jersey alone is named by that number. Plays saved
   before playerLabel learned that printed it twice, "#6 #6 run for 17 yds",
   and the Season Book's play-by-play showed every one of them. */

const rush = PLAY_TYPES.find(p => p.id === "rush")!;
const opp = (jersey: number, name: string): TaggedPlayer =>
  ({ id: `opp${jersey}`, player_id: `opp${jersey}`, jersey_number: jersey, name, role: "rusher", isOpponent: true });

it("prints a number-only player's number once, however the name was saved", () => {
  expect(buildDescription(rush, [opp(6, "#6")], 17, false, null, "")).toMatch(/^#6 rush/);
  expect(buildDescription(rush, [opp(6, "6")], 17, false, null, "")).toMatch(/^#6 rush/);
  expect(buildDescription(rush, [opp(6, "Jake Hill")], 17, false, null, "")).toMatch(/^#6 J\.Hill rush/);
});

it("cleans the doubled number out of plays already saved", () => {
  expect(tidyStoredDescription("rush", "#6 #6 run for 17 yds")).toBe("#6 run for 17 yds");
  expect(tidyStoredDescription("pass_comp", "#6 #6 → #33 #33 +19")).toBe("#6 → #33 +19");
  // A different number beside it is two players; a number then yards is a return.
  expect(tidyStoredDescription("rush", "#6 #66 run")).toBe("#6 #66 run");
  expect(tidyStoredDescription("punt", "Punt 40 yds, ret #6 6 yds")).toBe("Punt 40 yds, ret #6 6 yds");
});
