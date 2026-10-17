/**
 * Settling a games patch that was sent straight to the server.
 *
 * The queue keeps one coalesced entry per game. When live state is written
 * while End Game is still queued (held behind a play the drain is retrying),
 * the live patch comes back merged with the final. Sending the live fields
 * must clear only those, or the final, its official copy and its score are
 * dropped without ever reaching the server.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("idb", () => ({ openDB: vi.fn() }));
vi.mock("./syncDiscard", () => ({ canDiscardSnapshot: vi.fn(), sameSyncEntity: vi.fn() }));

describe("what is left of a queued games patch after a direct send", () => {
  it("keeps a queued End Game when only the live state was sent", async () => {
    const { unsentPatch } = await import("./offlineDb");
    const queued = { status: "completed", our_score: 21, final_snapshot: { v: 1 }, current_quarter: 4, clock: "0:00" };
    const sent = { current_quarter: 4, clock: "0:00" };
    expect(unsentPatch(queued, sent)).toEqual({ status: "completed", our_score: 21, final_snapshot: { v: 1 } });
  });

  it("clears everything when the send carried it all", async () => {
    const { unsentPatch } = await import("./offlineDb");
    const patch = { status: "completed", our_score: 21, final_snapshot: { v: 1 } };
    expect(unsentPatch(patch, { ...patch })).toEqual({});
  });

  it("keeps a newer value merged in while the request was in flight", async () => {
    const { unsentPatch } = await import("./offlineDb");
    expect(unsentPatch({ our_score: 28, clock: "1:10" }, { our_score: 21, clock: "1:10" })).toEqual({ our_score: 28 });
  });
});
