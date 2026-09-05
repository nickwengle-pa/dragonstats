/**
 * Run with: node src/services/foulSpot.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * Where a foul happened, and what it should prefill to.
 *
 * Almost every foul is marked off from the previous spot, so the field
 * prefills to the line of scrimmage and the common case costs nothing. A SPOT
 * foul is the exception the field exists for: a block in the back on a
 * thirty-yard return brings the ball back to the block, not to the end of the
 * return, and the app previously could place the ball but had nowhere to
 * record where the block actually was.
 *
 * The classification lives in types.ts and the prefill in PlayEntryModal, both
 * of which pull in the app. The decision is exercised here against the same
 * shapes — it guards the rule, not the call.
 */
import assert from "node:assert/strict";
import { SPOT_FOULS, isSpotFoul, PENALTIES } from "../components/game/types.ts";

/** The prefill rule as it stands in selectPenalty. */
function prefill(penalty: string, los: number, playEnd: number): number {
  return isSpotFoul(penalty) ? playEnd : los;
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

console.log("foulSpot");

test("a line-of-scrimmage foul prefills to the snap", () => {
  // Kicked off a drive at our 30, play ended at the 45: a false start is
  // marked from the 30 and the operator should not have to say so.
  assert.equal(prefill("False Start", 30, 45), 30);
  assert.equal(prefill("Delay of Game", 30, 45), 30);
  assert.equal(prefill("Offsides", 30, 45), 30);
  assert.equal(prefill("Illegal Motion", 30, 45), 30);
});

test("the reported case: a block in the back prefills to where the play ended", () => {
  // A thirty-yard return ending at the 60. The block was somewhere along it,
  // so the end of the return is the right neighbourhood and a nudge from
  // exact — far better than starting at the snap, twenty yards away.
  assert.equal(prefill("Block in Back", 30, 60), 60);
});

test("clipping is a spot foul too", () => {
  assert.equal(prefill("Clipping", 30, 60), 60);
});

test("pass interference is NOT a spot foul under NFHS", () => {
  // College and professional rules differ; this app is high school, where DPI
  // is marked off from the previous spot. Getting this wrong would put the
  // ball twenty yards from where the officials put it.
  assert.equal(isSpotFoul("PI-DEF"), false);
  assert.equal(isSpotFoul("PI-OFF"), false);
  assert.equal(prefill("PI-DEF", 30, 60), 30);
});

test("every spot foul is a real penalty in the catalogue", () => {
  // A typo here would silently classify nothing, and the prefill would quietly
  // fall back to the line of scrimmage on the one foul that needs otherwise.
  for (const foul of SPOT_FOULS) {
    assert.ok(
      PENALTIES.includes(foul),
      `"${foul}" is in SPOT_FOULS but not in PENALTIES — it can never match`,
    );
  }
});

test("nothing and nonsense are not spot fouls", () => {
  assert.equal(isSpotFoul(null), false);
  assert.equal(isSpotFoul(undefined), false);
  assert.equal(isSpotFoul(""), false);
  assert.equal(isSpotFoul("Holding-OFF"), false);
});

console.log(`\n${passed}/${total} passed`);
