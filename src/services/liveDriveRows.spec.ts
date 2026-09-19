import { describe, expect, it } from "vitest";
import type { DriveStats } from "football-stats-engine";
import type { PlayRecord } from "@/components/game/types";
import { liveDriveRows } from "./liveDriveRows";

const play = (id: string, patch: Partial<PlayRecord> = {}): PlayRecord => ({
  id, possession: "us", quarter: 1, clock: 600, type: "rush", yards: 5,
  result: "", penalty: null, flagYards: 0, isTouchdown: false, firstDown: false,
  turnover: false, tagged: [], ballOn: 25, down: 1, distance: 10, description: "Run", ...patch,
});
const drive = (patch: Partial<DriveStats> = {}): DriveStats => ({
  driveNumber: 1, startQuarter: 1, startTime: "10:00", plays: 3, yards: 24,
  timeOfPossessionSeconds: 0, ...patch,
} as DriveStats);

describe("live play list drive summaries", () => {
  it("shows the finished drive immediately on a possession change, before the next snap", () => {
    const rows = liveDriveRows([play("first"), play("punt", {
      type: "punt", clock: 510, playData: { recorded_end_clock_seconds: 502 },
    })], [drive()], "them", false, 720);
    expect([...rows.keys()]).toEqual(["punt"]);
    expect(rows.get("punt")).toEqual({ possession: "us", plays: 3, yards: 24, seconds: 98 });
  });
  it("does not show an ongoing drive, and removes the divider after undoing the possession change", () => {
    expect(liveDriveRows([play("first")], [drive()], "us", false, 720).size).toBe(0);
  });
  it("keeps kickoff-only possessions out and matches later drives by number", () => {
    const plays = [play("kick", { type: "kickoff" }), play("run", { possession: "them", clock: 590 }), play("return", { clock: 500 })];
    const rows = liveDriveRows(plays, [drive({ driveNumber: 2, startTime: "9:50", yards: 11 })], "us", false, 720);
    expect([...rows.keys()]).toEqual(["run"]);
    expect(rows.get("run")).toMatchObject({ possession: "them", yards: 11, seconds: 90 });
  });
  it("keeps a quarter marker inside the same drive and counts time across quarters", () => {
    const plays = [play("first", { clock: 30 }), play("period", { type: "quarter_change", quarter: 2, clock: 720 }), play("last", { quarter: 2, clock: 680, playData: { recorded_end_clock_seconds: 675 } })];
    const rows = liveDriveRows(plays, [drive({ startTime: "0:30" })], "them", false, 720);
    expect([...rows.keys()]).toEqual(["last"]);
    expect(rows.get("last")?.seconds).toBe(75);
  });
  it("includes the final possession of a completed game", () => {
    const rows = liveDriveRows([play("last", { clock: 0 })], [drive()], "us", true, 720);
    expect(rows.get("last")?.seconds).toBe(600);
  });
});
