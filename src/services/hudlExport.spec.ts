import { expect, it } from "vitest";
import { buildHudlCsv, HUDL_COLUMNS, hudlRow } from "./hudlExport";
import type { PlayRecord, TaggedPlayer } from "@/components/game/types";

const play: PlayRecord = {
  id: "p", sequence: 117, quarter: 4, clock: 500, type: "rush", yards: -3,
  result: "", penalty: null, flagYards: 0, isTouchdown: false, firstDown: false,
  turnover: false, tagged: [], ballOn: 11, down: 4, distance: 9,
  description: "", possession: "us",
};
const tag = (role: string, jersey: number, name: string): TaggedPlayer => ({
  id: String(jersey), player_id: String(jersey), jersey_number: jersey, name, role,
});
const values = (p: PlayRecord) => Object.fromEntries(HUDL_COLUMNS.map((h, i) => [h, hudlRow(p)[i]]));

it("exports 37 columns and keeps original play numbers, including timeout entries", () => {
  expect(HUDL_COLUMNS).toHaveLength(37);
  expect(hudlRow(play)).toHaveLength(37);
  const csv = buildHudlCsv([play, { ...play, sequence: 121, type: "timeout" }], {});
  expect(csv.split("\r\n")[0]).toBe("\uFEFF" + HUDL_COLUMNS.join(","));
  expect(csv.split("\r\n")[1]).toMatch(/^117,O,/);
  expect(csv.split("\r\n")[2]).toMatch(/^121,O,/);
  expect(values(play)["OFF STR"]).toBe("");
  expect(values(play)["EFF"]).toBe("");
});

it("includes tagged players and both tacklers, escapes names and preserves negative gains", () => {
  const p = { ...play, tagged: [tag("rusher", 8, 'Nick, "Jr"'), tag("tackler", 11, "Opponent"), tag("assist", 2, "Helper")] };
  expect(values(p)).toMatchObject({ RUSHER_Jersey: 8, TACKLER1_Jersey: 11, TACKLER2_Jersey: 2, "GN/LS": -3 });
  expect(buildHudlCsv([p], {})).toContain('"Nick, ""Jr"""');
});

it("separates gross kicking and return yards from net gain", () => {
  const p = { ...play, type: "punt", ballOn: 40, yards: 22,
    description: "Punt #3 Smith 32 yds to NC 28, ret #11 Jones 10 yds",
    tagged: [tag("punter", 3, "Smith"), tag("returner", 11, "Jones")] };
  expect(values(p)).toMatchObject({ ODK: "K", "KICK YARDS": 32, "RET YARDS": 10, "GN/LS": 22, KICKER_Jersey: 3 });
});

it("exports interceptions, recoveries and penalty enforcement", () => {
  const p = { ...play, type: "int", turnover: true, isTouchdown: true, penalty: "Holding",
    flagYards: 0, penaltyEnforcement: "declined" as const,
    playData: { interception_return_yards: 27 }, tagged: [tag("interceptor", 22, "Davis")] };
  expect(values(p)).toMatchObject({ "INTERCEPTED BY_Jersey": 22, "RET YARDS": 27, RESULT: "TD; TURNOVER", PENALTY: "Holding; Declined" });
  expect(values({ ...play, type: "blocked_kick", yards: -11, isTouchdown: true,
    tagged: [tag("recoverer", 7, "Recovery")] })).toMatchObject({ ODK: "K", "RECOVERED BY_Jersey": 7, "GN/LS": -11, RESULT: "TD" });
  expect(values({ ...play, type: "fumble", playData: { fumble_return_yards: 12 },
    tagged: [tag("fumble_recovery", 8, "Recovery")] })).toMatchObject({ "RECOVERED BY_Jersey": 8, "RET YARDS": 12 });
});
