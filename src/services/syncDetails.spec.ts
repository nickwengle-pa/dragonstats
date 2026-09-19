import { describe, expect, it } from "vitest";
import { syncPlayDetails } from "./syncDetails";
import type { SyncQueueItem } from "./offlineDb";

const item = (op: SyncQueueItem["op"], payload: unknown): SyncQueueItem => ({
  id: "queue", playId: "play", gameId: "game", op, payload,
  status: "failed", attempts: 5, createdAt: 100, lastError: "Server rejected the row",
});
describe("sync play identification", () => {
  it("identifies a stuck insertion from its saved payload even without a cached row", () => {
    const play = { quarter: 3, clock: "4:21", description: "Pass complete to #8", yards_gained: 11 };
    expect(syncPlayDetails(item("insert", { play }))).toMatchObject(play);
  });
  it("keeps the play identity when a queued edit contains only changed fields", () => {
    const cached = { sequence: 25, quarter: 2, clock: "1:03", description: "Run", yards_gained: 4, play_data: { result: "Gain", old: true } };
    const edit = item("update", { patch: { yards_gained: 7 }, playData: { result: "First down" } });
    expect(syncPlayDetails(edit, cached)).toMatchObject({ sequence: 25, clock: "1:03", yards_gained: 7, play_data: { result: "First down", old: true } });
  });
  it("does not mistake a game update for a missing play", () => {
    expect(syncPlayDetails(item("game", { patch: { status: "completed" } }))).toBeNull();
  });
  it("leaves missing details blank for an old deletion instead of inventing a play", () => {
    expect(syncPlayDetails(item("delete", { id: "play" }))).toEqual({ play_data: {} });
  });
});
