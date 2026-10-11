import { expect, it } from "vitest";
import { buildDescription, makeTeamTag, PLAY_TYPES, tidyStoredDescription, type TaggedPlayer } from "./types";

const inc = PLAY_TYPES.find(p => p.id === "pass_inc")!;
const tag = (role: string, jersey: number, name: string): TaggedPlayer =>
  ({ id: `${role}${jersey}`, player_id: `${role}${jersey}`, jersey_number: jersey, name, role });
const passer = tag("passer", 7, "Alex Miller");

it("leaves the target out of an incomplete pass when nobody was named", () => {
  expect(buildDescription(inc, [passer], 0, false, null, "Incomplete")).toBe("#7 A.Miller inc");
});

it("does not name the TEAM placeholder a blank target records as", () => {
  expect(buildDescription(inc, [passer, makeTeamTag("target")], 0, false, null, "Incomplete")).toBe("#7 A.Miller inc");
  const theirTeam = { id: "opp_team", player_id: "opp_team", jersey_number: null, name: "TEAM", role: "target", isOpponent: true };
  expect(buildDescription(inc, [passer, theirTeam], 0, false, null, "Incomplete")).toBe("#7 A.Miller inc");
});

it("still names a target who was picked", () => {
  expect(buildDescription(inc, [passer, tag("target", 11, "Sam Ortiz")], 0, false, null, "Incomplete"))
    .toBe("#7 A.Miller → #11 S.Ortiz inc");
});

it("cleans the placeholder out of incomplete passes already saved", () => {
  expect(tidyStoredDescription("pass_inc", "#7 A.Miller → ? inc")).toBe("#7 A.Miller inc");
  expect(tidyStoredDescription("pass_inc", "#7 A.Miller → TEAM inc · PEN: Holding")).toBe("#7 A.Miller inc · PEN: Holding");
  expect(tidyStoredDescription("pass_inc", "#7 A.Miller → #11 S.Ortiz inc")).toBe("#7 A.Miller → #11 S.Ortiz inc");
  // Only incomplete passes: other text is the operator's.
  expect(tidyStoredDescription("rush", "Trick play → ? inc")).toBe("Trick play → ? inc");
});
