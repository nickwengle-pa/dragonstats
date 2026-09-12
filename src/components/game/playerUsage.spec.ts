import { expect, it } from "vitest";
import { countPlayerUsage, playerUseCount } from "./playerUsage";
import type { TaggedPlayer } from "./types";

it("counts game selections separately by role and team, combining receiver targets", () => {
  const tag = (role: string, extra: Partial<TaggedPlayer> = {}): TaggedPlayer => ({ id: "22", player_id: "22", name: "Jordan Reed", jersey_number: 22, role, ...extra });
  const plays = [
    { tagged: [tag("rusher"), tag("rusher")] },
    { tagged: [tag("rusher")] },
    { tagged: [tag("receiver")] },
    { tagged: [tag("target")] },
    { tagged: [tag("rusher", { isOpponent: true })] },
    { tagged: [tag("rusher", { isTeam: true })] },
  ];
  const usage = countPlayerUsage(plays);
  expect(playerUseCount(usage, "rusher", "22")).toBe(2);
  expect(playerUseCount(usage, "receiver", "22")).toBe(2);
  expect(playerUseCount(usage, "target", "22")).toBe(2);
  expect(playerUseCount(usage, "rusher", "22", true)).toBe(1);
  expect(playerUseCount(usage, "rusher", "7")).toBe(0);
  expect(playerUseCount(countPlayerUsage(plays.slice(1)), "rusher", "22")).toBe(1);
  expect(countPlayerUsage([])).toEqual({});
});
