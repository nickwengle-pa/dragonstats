/**
 * Run with: npm test  (no test framework — plain node, node strips the types)
 *
 * Covers the press-box refetch bug: plays entered in a dead spot vanishing
 * from the log the moment the tablet caught service again.
 */
import assert from "node:assert/strict";
import { mergeQueuedPlays } from "./mergeQueuedPlays.ts";

const play = (id: string, sequence: number, extra: Record<string, unknown> = {}) =>
  ({ id, sequence, play_players: [], ...extra }) as any;

const ids = (rows: any[]) => rows.map((r) => r.id).join(",");

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(err as Error).message.split("\n")[0]}`);
    process.exitCode = 1;
  }
};

console.log("mergeQueuedPlays");

test("the dead-spot case: queued inserts the server has not seen survive a refetch", () => {
  const server = [play("p1", 1), play("p2", 2), play("p3", 3)];
  const cached = [...server, play("p4", 4), play("p5", 5), play("p6", 6)];
  const out = mergeQueuedPlays(server, cached, new Set(["p4", "p5", "p6"]), new Set());
  assert.equal(ids(out), "p1,p2,p3,p4,p5,p6");
});

test("a queued edit wins over the stale server row", () => {
  const server = [play("p1", 1, { yards_gained: 3 })];
  const cached = [play("p1", 1, { yards_gained: 11 })];
  const out = mergeQueuedPlays(server, cached, new Set(["p1"]), new Set());
  assert.equal(out.length, 1);
  assert.equal((out[0] as any).yards_gained, 11);
});

test("a play deleted offline stays gone even though the server still has it", () => {
  const server = [play("p1", 1), play("p2", 2), play("p3", 3)];
  const out = mergeQueuedPlays(server, server, new Set(), new Set(["p2"]));
  assert.equal(ids(out), "p1,p3");
});

test("an empty queue returns the server list untouched", () => {
  const server = [play("p1", 1), play("p2", 2)];
  const out = mergeQueuedPlays(server, [], new Set(), new Set());
  assert.equal(out, server, "should be the same array, not a copy");
});

test("an upsert missing from the cache keeps the server row rather than dropping it", () => {
  const server = [play("p1", 1), play("p2", 2)];
  const out = mergeQueuedPlays(server, [play("p1", 1)], new Set(["p1", "p2"]), new Set());
  assert.equal(ids(out), "p1,p2");
});

test("a queued insert with no cached row is skipped, not pushed as undefined", () => {
  const server = [play("p1", 1)];
  const out = mergeQueuedPlays(server, [play("p1", 1)], new Set(["p1", "ghost"]), new Set());
  assert.equal(ids(out), "p1");
  assert.ok(out.every(Boolean));
});

test("the result is ordered by sequence, not by which side it came from", () => {
  // Server returns 1 and 4; 2 and 3 are still queued. Naive concatenation
  // would give 1,4,2,3 — and the replay would chain the game in that order.
  const server = [play("p1", 1), play("p4", 4)];
  const cached = [play("p2", 2), play("p3", 3), play("p1", 1), play("p4", 4)];
  const out = mergeQueuedPlays(server, cached, new Set(["p2", "p3"]), new Set());
  assert.equal(ids(out), "p1,p2,p3,p4");
});

test("delete plus insert on the same list resolves both", () => {
  const server = [play("p1", 1), play("p2", 2)];
  const cached = [play("p1", 1), play("p2", 2), play("p3", 3)];
  const out = mergeQueuedPlays(server, cached, new Set(["p3"]), new Set(["p1"]));
  assert.equal(ids(out), "p2,p3");
});

console.log(`\n${passed}/8 passed`);
