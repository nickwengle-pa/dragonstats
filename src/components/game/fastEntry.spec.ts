import { describe, it, expect } from "vitest";
import { toggleFastTackler } from "./fastEntry";
import { makeTeamTag, type TaggedPlayer } from "./types";
import { splitTackleCredit } from "@/services/tackleCredit";

const pick = (id: string): TaggedPlayer => ({ id, player_id: id, name: id, jersey_number: 44, role: "tackler" });
describe("live tackle capture", () => {
  it("keeps the coach's solo and assist report consistent when picks change", () => {
    const solo = toggleFastTackler([], pick("a"));
    expect(splitTackleCredit(solo)).toEqual({ tackledBy: ["a"], assistedTackle: [] });
    const shared = toggleFastTackler(solo, pick("b"));
    expect(splitTackleCredit(shared)).toEqual({ tackledBy: [], assistedTackle: ["a", "b"] });
    expect(splitTackleCredit(toggleFastTackler(shared, pick("a")))).toEqual({ tackledBy: ["b"], assistedTackle: [] });
  });
  it("replaces unknown credit instead of adding an invented assist", () => {
    expect(toggleFastTackler([{ ...makeTeamTag("tackler"), credit: 1 }], pick("a")))
      .toEqual([{ ...pick("a"), credit: 1 }]);
    expect(toggleFastTackler([{ ...pick("opp_team"), isOpponent: true, credit: 1 }], { ...pick("opp_44"), isOpponent: true }))
      .toEqual([{ ...pick("opp_44"), isOpponent: true, credit: 1 }]);
  });
  it("retains the existing three-player limit without blocking removal", () => {
    let tags: TaggedPlayer[] = [];
    for (const id of ["a", "b", "c", "d"]) tags = toggleFastTackler(tags, pick(id));
    expect(tags).toHaveLength(3);
    expect(toggleFastTackler(tags, pick("b")).map(t => t.id)).toEqual(["a", "c"]);
  });
});
