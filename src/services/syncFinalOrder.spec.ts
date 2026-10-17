/**
 * A final must not overtake the plays it is the final of.
 *
 * Once a game is final the server refuses an assistant's plays. So when a
 * queued play fails on this drain (and will be retried on the next one), the
 * End Game patch queued behind it has to wait too - pushing it would turn a
 * play that could still land into one that never can.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SyncQueueItem } from "./offlineDb";

const queue: SyncQueueItem[] = [];
const pushed: string[] = [];
let failPlays = new Set<string>();

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("./syncDiscard", () => ({ sameSyncEntity: () => false }));
vi.mock("./gameService", () => ({
  savePlayAtomic: async (play: { id: string }) => {
    pushed.push(play.id);
    return failPlays.has(play.id)
      ? { ok: false, unsupported: false, error: { code: "23503", message: "insert or update violates foreign key" } }
      : { ok: true };
  },
}));
vi.mock("./gamesRowWrite", () => ({
  updateGamesRow: async () => {
    pushed.push("final");
    return { error: null };
  },
}));
vi.mock("./offlineDb", () => ({
  isOfflineSupported: () => true,
  getDrainableForGame: async () => queue.filter((i) => !(i.status === "failed" && i.attempts >= 5)),
  getGamesWithUnsynced: async () => [],
  resetStuckForGame: async () => {},
  markSyncing: async (id: string) => { const i = queue.find((q) => q.id === id)!; i.attempts++; },
  markSynced: async (id: string) => { queue.splice(queue.findIndex((q) => q.id === id), 1); },
  markFailed: async (id: string) => { queue.find((q) => q.id === id)!.status = "failed"; },
  markRetryable: async () => {},
  getPendingCount: async () => queue.length,
  getStuckCount: async () => 0,
}));

const play = (id: string, createdAt: number) => ({
  id: `q-${id}`, gameId: "g", playId: id, op: "insert", status: "pending", attempts: 0, createdAt,
  payload: { play: { id }, players: [] },
} as unknown as SyncQueueItem);
const final = (createdAt: number) => ({
  id: "q-final", gameId: "g", op: "game", status: "pending", attempts: 0, createdAt,
  payload: { patch: { status: "completed", our_score: 21 } },
} as unknown as SyncQueueItem);

describe("draining a game whose End Game is queued behind its plays", () => {
  beforeEach(() => {
    queue.length = 0;
    pushed.length = 0;
    failPlays = new Set();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("sends the plays, then the final", async () => {
    const { drainQueue } = await import("./syncWorker");
    queue.push(play("a", 1), play("b", 2), final(3));
    await drainQueue("g");
    expect(pushed).toEqual(["a", "b", "final"]);
  });

  it("holds the final while a play before it is still being retried", async () => {
    const { drainQueue } = await import("./syncWorker");
    failPlays = new Set(["a"]);
    queue.push(play("a", 1), play("b", 2), final(3));
    await drainQueue("g");
    expect(pushed).toEqual(["a", "b"]);
    expect(queue.find((i) => i.id === "q-final")!.status).toBe("pending");
  });

  it("sends the final last even when an older build queued it ahead of later plays", async () => {
    const { drainQueue } = await import("./syncWorker");
    queue.push(play("a", 1), final(2), play("b", 3), play("c", 4));
    await drainQueue("g");
    expect(pushed).toEqual(["a", "b", "c", "final"]);
  });

  it("lets the final go once the failing play has been given up on", async () => {
    const { drainQueue } = await import("./syncWorker");
    failPlays = new Set(["a"]);
    queue.push(play("a", 1), final(2));
    for (let i = 0; i < 6; i++) await drainQueue("g");
    expect(pushed.filter((p) => p === "a")).toHaveLength(5);
    expect(pushed[pushed.length - 1]).toBe("final");
    expect(queue.some((i) => i.id === "q-final")).toBe(false);
  });
});
