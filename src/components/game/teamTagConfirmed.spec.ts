import { expect, it } from "vitest";
import { teamTagConfirmed } from "./types";

it("reads the Team choice off each stored TEAM tag, so a TEAM runner reloads as Team", () => {
  expect(teamTagConfirmed({ role: "rusher", confirmed: true }, {})).toBe(true);
  expect(teamTagConfirmed({ role: "passer", confirmed: true }, {})).toBe(true);
  // "Identify on film later" is stored without it.
  expect(teamTagConfirmed({ role: "rusher" }, {})).toBe(false);
});

it("still honours the old play-level flag, which only ever covered tackles and sacks", () => {
  const legacy = { team_tackle_confirmed: true };
  expect(teamTagConfirmed({ role: "tackler" }, legacy)).toBe(true);
  expect(teamTagConfirmed({ role: "sacker" }, legacy)).toBe(true);
  expect(teamTagConfirmed({ role: "rusher" }, legacy)).toBe(false);
});
