import { describe, expect, it } from "vitest";
import type { PlayCharting } from "./chartingService";
import { chartingLine } from "./chartingLine";

/* "If I did [chart formations and plays], would all of that information show
   up there?" The play-by-play prints the Film Chart's notes under each play. */

const charted = (fields: Partial<PlayCharting>): PlayCharting => ({
  play_id: "p1", game_id: "g1", hash_mark: null, personnel: null, offensive_formation: null,
  defensive_formation: null, motion: null, play_call: null, passer: null, receiver: null,
  tags: null, notes: null, ...fields,
});

describe("the Film Chart line under a play", () => {
  it("reads everything charted, in the order a coach says it", () => {
    expect(chartingLine(charted({
      offensive_formation: "Shotgun", personnel: "11", motion: "Jet", play_call: "Power Rt",
      defensive_formation: "4-3", hash_mark: "left", tags: ["explosive", "RPO"], notes: "Backside end\ncrashed",
    }), {})).toBe("Shotgun · 11 pers · Motion: Jet · Power Rt · vs 4-3 · Left hash · Tags: explosive, RPO · Note: Backside end crashed");
  });

  it("is blank for a play nobody charted", () => {
    expect(chartingLine(undefined, {})).toBe("");
    expect(chartingLine(charted({ tags: [], notes: "  " }), { play_data: {} })).toBe("");
  });

  it("falls back to what was picked when the play was entered", () => {
    const atSnap = { offensive_formation: "Pistol", defensive_formation: "5-2", hash_mark: "middle", play_data: { wristband_call: "Blue 42" } };
    expect(chartingLine(undefined, atSnap)).toBe("Pistol · Blue 42 · vs 5-2 · Middle of field");
    // The Film Chart's own pick wins over the one made at the snap.
    expect(chartingLine(charted({ offensive_formation: "Trips", hash_mark: "right" }), atSnap)).toBe("Trips · Blue 42 · vs 5-2 · Right hash");
  });

  it("keeps a typed personnel or a bare wristband number from reading as a stat", () => {
    expect(chartingLine(charted({ personnel: "Heavy", play_call: "42" }), {})).toBe("Heavy · Call 42");
  });
});
