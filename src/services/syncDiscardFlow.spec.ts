import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncQueueItem } from "./offlineDb";

const mocks = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn(), discard: vi.fn(), queue: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("./gameService", () => ({ savePlayAtomic: vi.fn() }));
vi.mock("./offlineDb", () => ({
  getUnsyncedForGame: mocks.queue, discardQueuedEntity: mocks.discard,
  getPendingCount: async () => 0, getStuckCount: async () => 0,
}));
import { discardSyncChange } from "./syncWorker";

const item: SyncQueueItem = { id: "queued", playId: "play", gameId: "game", op: "insert", payload: { play: { description: "Run" } }, status: "failed", attempts: 5, createdAt: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  mocks.queue.mockResolvedValue([item]);
  mocks.discard.mockResolvedValue(undefined);
  // The fake server deliberately exposes only reads. A server mutation fails.
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) });
});
afterEach(() => vi.unstubAllGlobals());
describe("local sync discard", () => {
  it("restores the server play while removing only the reviewed local intent", async () => {
    const serverPlay = { id: "play", description: "Already saved on iPad" };
    mocks.read.mockResolvedValue({ data: serverPlay, error: null });
    await discardSyncChange(item);
    expect(mocks.discard).toHaveBeenCalledWith([item], serverPlay);
    expect(mocks.from).toHaveBeenCalledWith("plays");
  });
  it("removes a local-only play without creating a server delete", async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    await discardSyncChange(item);
    expect(mocks.discard).toHaveBeenCalledWith([item], null);
  });
  it("keeps everything queued if the server copy cannot be checked", async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: "Network error" } });
    await expect(discardSyncChange(item)).rejects.toThrow("Nothing was removed");
    expect(mocks.discard).not.toHaveBeenCalled();
  });
  it("rejects a stale confirmation after a queue entry changes", async () => {
    mocks.queue.mockResolvedValue([{ ...item, payload: { changed: true } }]);
    await expect(discardSyncChange(item)).rejects.toThrow("changed");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
  });
});
