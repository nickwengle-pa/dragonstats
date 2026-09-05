/**
 * Run with: node src/services/gameCompletion.test.ts
 * (no test framework - plain node, node strips the types)
 *
 * "i need to add a label for completed games that also have the stats finished
 * post game so a coach knows if they're done or not when they login."
 *
 * The rules worth pinning are the two that decide whether the label can be
 * trusted: outstanding work outranks the mark, and an unknown count is not
 * zero.
 */
import assert from "node:assert/strict";
import {
  STATS_FINAL_TAG,
  isMarkedStatsFinal,
  statsState,
  statsStateLabel,
} from "./gameCompletion.ts";

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

console.log("gameCompletion");

test("marked and clean is final", () => {
  assert.equal(statsState({ tags: [STATS_FINAL_TAG], toReview: 0 }), "final");
});

test("clean but unmarked is open, not final", () => {
  // Nobody has said it is done, so the app must not say it for them.
  assert.equal(statsState({ tags: [], toReview: 0 }), "open");
});

test("outstanding plays outrank the mark", () => {
  // The rule that keeps the label honest: a game cannot read green while
  // something is demonstrably unfinished, however long ago someone tapped
  // the button.
  assert.equal(statsState({ tags: [STATS_FINAL_TAG], toReview: 3 }), "review");
});

test("outstanding plays on an unmarked game read the same way", () => {
  assert.equal(statsState({ tags: [], toReview: 3 }), "review");
});

/* ── The unknown count ───────────────────────────────────────────────────── */

test("an unknown count is NOT treated as zero", () => {
  // Offline, or the query has not landed. Treating unknown as clean would
  // turn every game green on a cold start.
  assert.equal(statsState({ tags: [], toReview: null }), "open");
  assert.equal(statsState({ tags: [STATS_FINAL_TAG], toReview: null }), "final");
});

test("an unknown count does not turn a marked game amber either", () => {
  // The other half of the same trap: a coach on a plane should still see the
  // games they finished as finished.
  assert.notEqual(statsState({ tags: [STATS_FINAL_TAG], toReview: null }), "review");
});

/* ── Reading the tag off a real row ──────────────────────────────────────── */

test("tags survives null, undefined and a non-array", () => {
  // games.tags is nullable, and a cached row can come back with anything.
  assert.equal(isMarkedStatsFinal(null), false);
  assert.equal(isMarkedStatsFinal(undefined), false);
  assert.equal(isMarkedStatsFinal("stats_final"), false);
  assert.equal(isMarkedStatsFinal({}), false);
});

test("the tag coexists with whatever else is on the game", () => {
  // TEXT[] is a shared column - a game can be tagged "homecoming" too.
  assert.equal(isMarkedStatsFinal(["homecoming", STATS_FINAL_TAG]), true);
  assert.equal(isMarkedStatsFinal(["homecoming"]), false);
});

/* ── Labels ──────────────────────────────────────────────────────────────── */

test("the review label carries the count", () => {
  assert.equal(statsStateLabel("review", 3), "3 to review");
  assert.equal(statsStateLabel("review", 1), "1 to review");
});

test("the other labels say what they mean", () => {
  assert.equal(statsStateLabel("final", 0), "Stats final");
  assert.equal(statsStateLabel("open", 0), "Stats open");
});

console.log(`\n${passed}/${total} passed`);
