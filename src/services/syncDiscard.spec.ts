import { describe, expect, it } from "vitest";
import type { SyncQueueItem } from "./offlineDb";
import { canDiscardSnapshot, sameSyncEntity } from "./syncDiscard";

const item: SyncQueueItem = { id: "q", playId: "p", gameId: "g", op: "insert", payload: { play: { description: "Run" } }, status: "failed", attempts: 5, createdAt: 1 };
describe("discarding a local sync change", () => {
  it("accepts only the unchanged reviewed queue", () => {
    expect(canDiscardSnapshot([item], [structuredClone(item)])).toBe(true);
    expect(canDiscardSnapshot([item], [])).toBe(false);
    expect(canDiscardSnapshot([], [])).toBe(false);
  });
  it("rejects an in-flight sync or newer edit", () => {
    const syncing = { ...item, status: "syncing" as const };
    expect(canDiscardSnapshot([syncing], [syncing])).toBe(false);
    expect(canDiscardSnapshot([item], [{ ...item, payload: { changed: true } }])).toBe(false);
    expect(canDiscardSnapshot([item], [item, { ...item, id: "new-edit" }])).toBe(false);
  });
  it("groups a play's insert and edits without affecting another play or game update", () => {
    expect(sameSyncEntity(item, { ...item, op: "update" })).toBe(true);
    expect(sameSyncEntity(item, { ...item, playId: "other" })).toBe(false);
    expect(sameSyncEntity(item, { ...item, op: "game" })).toBe(false);
  });
});
