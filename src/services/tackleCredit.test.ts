/**
 * Run with: node src/services/tackleCredit.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * The reported bug: assisted tackles never appeared on the report.
 *
 * A shared tackle is recorded as several "tackler" tags carrying credit 0.5
 * each — that is what tapping a second name in the modal does. Both consumers
 * looked instead for the role "assist", which nothing has ever written, so a
 * shared tackle came out as a set of full solo tackles and the assist column
 * stayed empty on every game ever recorded.
 *
 * This used to re-declare the rule locally, because reaching it meant importing
 * gameService and therefore Supabase — "a guard on the decision, not on the
 * call". The rule now lives in tackleCredit.ts on its own, so this tests the
 * real function.
 *
 * calcDefenseStats in gameService.ts still carries its own copy: there the
 * split is interleaved with pass-breakup and tackle-for-loss derivation, which
 * needs the tag objects rather than ids. It agrees with this one today.
 */
import assert from "node:assert/strict";
import { splitTackleCredit } from "./tackleCredit.ts";

type Tag = { player_id: string; role: string; credit?: number | null };

/** Adapts the stored tag shape to the shared rule's. */
function splitTackles(tags: Tag[]) {
  const { tackledBy, assistedTackle } = splitTackleCredit(
    tags.map(t => ({ id: t.player_id, role: t.role, credit: t.credit ?? null })),
  );
  return { solo: tackledBy, assists: assistedTackle };
}

/** What the engine does with those two arrays, from defense.js. */
function engineTotals(solo: string[], assists: string[]) {
  const stat: Record<string, { solo: number; assists: number; total: number }> = {};
  const get = (id: string) => (stat[id] ??= { solo: 0, assists: 0, total: 0 });
  for (const id of solo) {
    const s = get(id);
    if (solo.length === 1 && assists.length === 0) s.solo++;
    s.total++;
  }
  for (const id of assists) {
    const s = get(id);
    s.assists++;
    s.total += 0.5;
  }
  return stat;
}

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
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

console.log("tackleCredit");

test("a solo tackle is one solo and one total", () => {
  const { solo, assists } = splitTackles([{ player_id: "a", role: "tackler", credit: 1 }]);
  const t = engineTotals(solo, assists);
  assert.deepEqual(t.a, { solo: 1, assists: 0, total: 1 });
});

test("the reported bug: two shared tacklers are two assists, half a tackle each", () => {
  const { solo, assists } = splitTackles([
    { player_id: "a", role: "tackler", credit: 0.5 },
    { player_id: "b", role: "tackler", credit: 0.5 },
  ]);
  // Before the fix both landed in tackledBy, which gave 0 solo, 0 assists and
  // 1.0 total each — no assists anywhere and the team total doubled.
  const t = engineTotals(solo, assists);
  assert.deepEqual(t.a, { solo: 0, assists: 1, total: 0.5 });
  assert.deepEqual(t.b, { solo: 0, assists: 1, total: 0.5 });
});

test("three in on one carry share it three ways", () => {
  const { solo, assists } = splitTackles([
    { player_id: "a", role: "tackler", credit: 0.5 },
    { player_id: "b", role: "tackler", credit: 0.5 },
    { player_id: "c", role: "tackler", credit: 0.5 },
  ]);
  assert.equal(solo.length, 0);
  assert.equal(assists.length, 3);
});

test("a tag with no credit at all is treated as a solo, not a share", () => {
  // Older plays and the TEAM placeholder can arrive with credit null. Reading
  // that as a share would silently halve a tackle nobody split.
  const { solo, assists } = splitTackles([{ player_id: "a", role: "tackler", credit: null }]);
  assert.deepEqual(solo, ["a"]);
  assert.deepEqual(assists, []);
});

test("an explicitly tagged assist still counts", () => {
  const { solo, assists } = splitTackles([
    { player_id: "a", role: "tackler", credit: 1 },
    { player_id: "b", role: "assist" },
  ]);
  const t = engineTotals(solo, assists);
  // A tackler alongside an assist is no longer a solo, which is correct.
  assert.deepEqual(t.a, { solo: 0, assists: 0, total: 1 });
  assert.deepEqual(t.b, { solo: 0, assists: 1, total: 0.5 });
});

test("the team total for one shared tackle is one tackle, not two", () => {
  const { solo, assists } = splitTackles([
    { player_id: "a", role: "tackler", credit: 0.5 },
    { player_id: "b", role: "tackler", credit: 0.5 },
  ]);
  const t = engineTotals(solo, assists);
  const teamTotal = Object.values(t).reduce((s, v) => s + v.total, 0);
  assert.equal(teamTotal, 1);
});

console.log(`\n${passed}/${total} passed`);
