/**
 * Run with: node src/services/penaltyEnforcement.test.ts
 * (no test framework - plain node, node strips the types)
 *
 * The reported play is the first test and the reason the module exists:
 * "kick return had a big return for 30 yards but had a penalty on the play of
 * block in the back which is a spot foul", and then, when review still showed
 * the mechanical answer, "this is also show next spot still at the 50".
 */
import assert from "node:assert/strict";
import { enforcePenalty, type EnforcementInput } from "./penaltyEnforcement.ts";

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

/** The same mapping formatFieldSpot uses, so assertions read like the screen. */
const spot = (ballOn: number, off: string, def: string) => {
  if (ballOn === 50) return "50";
  return ballOn < 50 ? `${off} ${ballOn}` : `${def} ${100 - ballOn}`;
};

const base: EnforcementInput = {
  side: "defense",
  flagYards: 10,
  before: { ballOn: 40, down: 1, distance: 10 },
  foulSpotBallOn: null,
  playEndBallOn: null,
  kind: "running",
  possessionAtEnd: "defense",
  firstDownDistance: 10,
};

console.log("penaltyEnforcement");

/* ── The reported play ───────────────────────────────────────────────────────
   PLH kicks off from their own 40. NC returns 32 yards, from the NC 20 to the
   PLH 48. Clipping on NC at the NC 26. Possession sits with the KICKING team
   pre-snap, so NC is "defense" and ballOn counts up from PLH's goal:
     kickoff spot   PLH 40  -> 40
     return ended   PLH 48  -> 48
     foul spot      NC 26   -> 74                                            */
const REPORTED: EnforcementInput = {
  ...base,
  side: "defense",
  flagYards: 10,
  playEndBallOn: 48,
  foulSpotBallOn: 74,
};

test("the reported play: clipping on the return is enforced from the foul spot", () => {
  const e = enforcePenalty(REPORTED);
  assert.ok(e);
  assert.equal(spot(e.ballOn, "PLH", "NC"), "NC 16"); // NC 26 marked back 10
  assert.equal(e.from, "from the foul spot");
});

test("the reported play is emphatically not the 50", () => {
  // The old answer, and the whole reason for this module: 40 + 10 = 50, with
  // the return and the foul spot both ignored.
  assert.notEqual(enforcePenalty(REPORTED)?.ballOn, 50);
});

test("the reported play gives the receiving team a new series", () => {
  const e = enforcePenalty(REPORTED);
  assert.equal(e?.possessionFlips, true);
  assert.equal(e?.down, 1);
  assert.equal(e?.distance, 10);
});

test("a KICKING team foul on the same return marks off from the end of the run", () => {
  // All-but-one only excepts the team in possession. A facemask by the kicking
  // team is enforced from the basic spot however far back it happened, and it
  // moves the ball further downfield for the returners.
  const e = enforcePenalty({
    ...REPORTED,
    side: "offense",
    flagYards: 15,
    foulSpotBallOn: 74,
  });
  assert.ok(e);
  assert.equal(spot(e.ballOn, "PLH", "NC"), "PLH 33"); // 48 - 15
  assert.equal(e.from, "from the end of the run");
});

test("a foul by the carrier AHEAD of the basic spot uses the basic spot", () => {
  // The exception is only for fouls BEHIND the basic spot, and which way that
  // points depends on who is carrying. A returner runs toward DECREASING
  // ballOn, so a foul at the PLH 40 (ballOn 40) is downfield of the PLH 48
  // where the run ended - a spot the returner never reached. Not the
  // exception, so the basic spot stands.
  const e = enforcePenalty({ ...REPORTED, foulSpotBallOn: 40 });
  assert.equal(e?.from, "from the end of the run");
  assert.equal(e?.ballOn, 58); // 48 + 10
});

test("the NC 45 is BEHIND a returner who finished at the PLH 48", () => {
  // The direction trap, pinned down: a higher ballOn is behind a returner, so
  // this IS the all-but-one exception even though the number went up.
  const e = enforcePenalty({ ...REPORTED, foulSpotBallOn: 55 });
  assert.equal(e?.from, "from the foul spot");
  assert.equal(e?.ballOn, 65); // 55 + 10
});

/* ── Scrimmage downs ─────────────────────────────────────────────────────── */

test("offensive holding on a run is enforced from the foul spot behind the run", () => {
  // 1st and 10 from the 20, run to the 32, holding at the 24.
  const e = enforcePenalty({
    side: "offense", flagYards: 10,
    before: { ballOn: 20, down: 1, distance: 10 },
    foulSpotBallOn: 24, playEndBallOn: 32,
    kind: "running", possessionAtEnd: "offense", firstDownDistance: 10,
  });
  assert.equal(e?.ballOn, 14);      // 24 - 10
  assert.equal(e?.down, 1);         // the down replays
  assert.equal(e?.distance, 16);    // line to gain is still the 30
  assert.equal(e?.from, "from the foul spot");
});

test("defensive holding on a run is enforced from the end of the run", () => {
  const e = enforcePenalty({
    side: "defense", flagYards: 5,
    before: { ballOn: 20, down: 1, distance: 10 },
    foulSpotBallOn: 24, playEndBallOn: 32,
    kind: "running", possessionAtEnd: "offense", firstDownDistance: 10,
  });
  assert.equal(e?.ballOn, 37);      // 32 + 5
  assert.equal(e?.down, 1);         // 17 yards from the snap clears the 10
  assert.equal(e?.distance, 10);
});

test("a pass is a loose-ball play - the basic spot is the snap, not the catch", () => {
  // Defensive pass interference, 15 from the previous spot under NFHS.
  const e = enforcePenalty({
    side: "defense", flagYards: 15,
    before: { ballOn: 20, down: 2, distance: 10 },
    foulSpotBallOn: 38, playEndBallOn: 20,
    kind: "loose_ball", possessionAtEnd: "offense", firstDownDistance: 10,
  });
  assert.equal(e?.ballOn, 35);      // 20 + 15, NOT from the 38
  assert.equal(e?.from, "from the snap");
});

test("NFHS grants no automatic first down - short defensive fouls replay the down", () => {
  // 2nd and 15, defensive holding for 5. The yardage does not reach the line
  // to gain, so it is 2nd and 10, not a fresh set.
  const e = enforcePenalty({
    side: "defense", flagYards: 5,
    before: { ballOn: 20, down: 2, distance: 15 },
    foulSpotBallOn: 20, playEndBallOn: 20,
    kind: "loose_ball", possessionAtEnd: "offense", firstDownDistance: 10,
  });
  assert.equal(e?.down, 2);
  assert.equal(e?.distance, 10);
  assert.equal(e?.newSeries, false);
});

/* ── Half the distance ───────────────────────────────────────────────────── */

test("half the distance applies toward the offending team's own goal", () => {
  const e = enforcePenalty({
    side: "offense", flagYards: 10,
    before: { ballOn: 6, down: 1, distance: 10 },
    foulSpotBallOn: 6, playEndBallOn: 6,
    kind: "dead_ball", possessionAtEnd: "offense", firstDownDistance: 10,
  });
  assert.equal(e?.ballOn, 3); // half of 6, not the full 10 into the end zone
});

test("half the distance also caps a defensive foul near the goal line", () => {
  const e = enforcePenalty({
    side: "defense", flagYards: 10,
    before: { ballOn: 96, down: 1, distance: 4 },
    foulSpotBallOn: 96, playEndBallOn: 96,
    kind: "dead_ball", possessionAtEnd: "offense", firstDownDistance: 10,
  });
  assert.equal(e?.ballOn, 98); // half of the 4 remaining
});

/* ── Refusals ────────────────────────────────────────────────────────────── */

test("a running play with no recorded end spot returns null, not a guess", () => {
  assert.equal(enforcePenalty({ ...REPORTED, playEndBallOn: null }), null);
});

test("no foul spot falls back to the basic spot rather than refusing", () => {
  const e = enforcePenalty({ ...REPORTED, foulSpotBallOn: null });
  assert.equal(e?.ballOn, 58); // 48 + 10, from the end of the run
  assert.equal(e?.from, "from the end of the run");
});

test("a dead-ball flag needs no play and marks off from the snap", () => {
  const e = enforcePenalty({
    side: "offense", flagYards: 5,
    before: { ballOn: 30, down: 1, distance: 10 },
    foulSpotBallOn: 30, playEndBallOn: null,
    kind: "dead_ball", possessionAtEnd: "offense", firstDownDistance: 10,
  });
  assert.equal(e?.ballOn, 25);
  assert.equal(e?.distance, 15);
  assert.equal(e?.from, "from the snap");
});

test("the ball never lands in an end zone", () => {
  for (const yards of [5, 10, 15, 50]) {
    for (const side of ["offense", "defense"] as const) {
      for (const ballOn of [1, 2, 50, 98, 99]) {
        const e = enforcePenalty({
          side, flagYards: yards,
          before: { ballOn, down: 1, distance: 10 },
          foulSpotBallOn: ballOn, playEndBallOn: ballOn,
          kind: "dead_ball", possessionAtEnd: "offense", firstDownDistance: 10,
        });
        assert.ok(e && e.ballOn >= 1 && e.ballOn <= 99, `${side} ${yards} at ${ballOn}`);
      }
    }
  }
});

console.log(`\n${passed}/${total} passed`);
