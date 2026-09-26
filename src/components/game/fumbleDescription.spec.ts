import { expect, it } from "vitest";
import { buildDescription, PLAY_TYPES, type TaggedPlayer } from "./types";

const type = (id: string) => PLAY_TYPES.find(p => p.id === id)!;
const tag = (role: string, jersey: number, name: string): TaggedPlayer =>
  ({ id: `${role}${jersey}`, player_id: `${role}${jersey}`, jersey_number: jersey, name, role });

it("says who scored on a strip-sack returned for a touchdown", () => {
  const tagged = [tag("passer", 7, "Alex Miller"), tag("fumble_recovery", 44, "Morgan Stone")];
  const d = buildDescription(type("sack"), tagged, -7, true, null, "", undefined, undefined,
    { recoveredBy: tagged[1], lost: true, returnYards: 38 });
  // Without the recovery this read "#7 A.Miller sacked -7 · TD" - the offense scoring.
  expect(d).toBe("#7 A.Miller sacked -7 · Fumble rec #44 M.Stone, ret 38 yds · TD");
});

it("names a fumble the offense kept, with no return", () => {
  const tagged = [tag("rusher", 22, "Jordan Reed")];
  expect(buildDescription(type("rush"), tagged, 4, false, null, "", undefined, undefined,
    { lost: false, returnYards: 0 })).toBe("#22 J.Reed rush +4 · Fumble kept");
});

it("does not say Fumble twice on the standalone fumble play", () => {
  const tagged = [tag("fumble_recovery", 9, "Parker Cole")];
  expect(buildDescription(type("fumble"), tagged, 0, true, null, "", undefined, undefined,
    { recoveredBy: tagged[0], lost: true, returnYards: 55 })).toBe("Fumble · rec #9 P.Cole, ret 55 yds · TD");
});

it("leaves a play without a fumble as it was", () => {
  expect(buildDescription(type("rush"), [tag("rusher", 22, "Jordan Reed")], 4, false, null, ""))
    .toBe("#22 J.Reed rush +4");
});
