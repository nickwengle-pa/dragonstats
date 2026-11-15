import { describe, expect, it, vi } from "vitest";
import { persistedSignature } from "./persistedSignature";
import { mapLimited } from "./statsService";

describe("persistedSignature", () => {
  const row = {
    sequence: 12, quarter: 2, clock: "7:41", possession: "us", down: 2, distance: 6,
    yard_line: 34, end_yard_line: 38, play_start_time: 461, play_end_time: 430,
    play_data: { next_down: 3, worksheet_row: { b: 1, a: [1, { y: 2, x: 1 }] }, season_id: "s" },
  };

  it("matches a play read back from jsonb with its keys in another order", () => {
    const fromServer = { ...row, play_data: { season_id: "s", worksheet_row: { a: [1, { x: 1, y: 2 }], b: 1 }, next_down: 3 } };
    expect(persistedSignature(fromServer)).toBe(persistedSignature(row));
  });

  it("treats a missing key and an undefined one as the same, since neither is sent", () => {
    expect(persistedSignature({ ...row, play_data: { ...row.play_data, hash_mark: undefined } })).toBe(persistedSignature(row));
  });

  it("differs when the spot, the order or anything in play_data moves", () => {
    expect(persistedSignature({ ...row, yard_line: 35 })).not.toBe(persistedSignature(row));
    expect(persistedSignature({ ...row, sequence: 13 })).not.toBe(persistedSignature(row));
    expect(persistedSignature({ ...row, play_data: { ...row.play_data, next_down: 4 } })).not.toBe(persistedSignature(row));
  });
});

describe("mapLimited", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let running = 0, peak = 0;
    const out = await mapLimited([30, 5, 20, 1, 10], 3, async (ms, i) => {
      running += 1; peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, ms));
      running -= 1;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(3);
  });
});

describe("sync badge counts", () => {
  it("shares one count read among the asks that arrive while it runs", async () => {
    vi.resetModules();
    let reads = 0;
    let release: () => void = () => {};
    vi.doMock("./gameService", () => ({ savePlayAtomic: vi.fn() }));
    vi.doMock("@/lib/supabase", () => ({ supabase: {} }));
    vi.doMock("./offlineDb", () => ({
      getPendingCount: () => { reads += 1; return new Promise<number>(r => { release = () => r(0); }); },
      getStuckCount: async () => 0,
    }));
    const { refreshSyncStatus } = await import("./syncWorker");
    const asks = Array.from({ length: 50 }, () => refreshSyncStatus());
    await Promise.resolve();
    release();                     // first read finishes; one more covers the 49 that waited
    await new Promise(r => setTimeout(r, 0));
    release();
    await Promise.all(asks);
    expect(reads).toBe(2);
  });
});
