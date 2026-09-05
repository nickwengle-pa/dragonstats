/**
 * Run with: node src/services/penaltySpot.test.ts
 * (no test framework - plain node, node strips the types)
 *
 * The reported bug, twice: "we are not calculating penalty yardage correct now
 * I clicked the spot, clicked the yardage of the penalty and it seems to be
 * defaulting to the 50", and then again from a live game - a kickoff returned
 * 32 yards with clipping spotted at the receiver's 26 that still reviewed as
 * "Next Spot: 50 - 1 & 10".
 *
 * The first fix silenced the guess on the penalty step but left the review
 * summary printing it, which is why the same 50 came back. These tests are
 * written against the review row specifically.
 */
import assert from "node:assert/strict";
import { flagSideDefault, reviewNextSpot } from "./penaltySpot.ts";
import {
  PENALTIES,
  getPenaltyDefaultSide,
  getPenaltyEngineCode,
  penaltyDefaultYards,
  isSpotFoul,
} from "../components/game/types.ts";

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

console.log("penaltySpot");

/* The exact play from the screenshot. Kicking team is the offense on a kick,
   so the pre-snap spot is the kicking team's 40 and a ten-yard flag enforces
   to the 50 - which is what the engine returns and what must not be shown. */
const THE_KICKOFF = {
  penalty: "Clipping",
  isDeadBall: false,
  override: null,
  projection: { ballOn: 50, down: 1, distance: 10 },
  enforced: null,
};

test("the reported case: a kickoff flag never falls back to the mechanical 50", () => {
  // With no enforcement available it shows nothing. What it must never do is
  // reach for the projection, which marks off from the snap and ignores the
  // return entirely.
  assert.equal(reviewNextSpot(THE_KICKOFF), null);
});

test("a live-ball flag WITH an enforcement shows it, labelled enforced", () => {
  const spot = reviewNextSpot({
    ...THE_KICKOFF,
    enforced: { ballOn: 84, down: 1, distance: 10, from: "from the foul spot" },
  });
  assert.deepEqual(spot, {
    ballOn: 84, down: 1, distance: 10,
    source: "enforced", from: "from the foul spot",
  });
});

test("the enforcement never overrides a spot the operator set", () => {
  const spot = reviewNextSpot({
    ...THE_KICKOFF,
    override: { ballOn: 70, down: 2, distance: 8 },
    enforced: { ballOn: 84, down: 1, distance: 10, from: "from the foul spot" },
  });
  assert.equal(spot?.source, "operator");
  assert.equal(spot?.ballOn, 70);
});

test("a dead-ball flag ignores any enforcement handed to it", () => {
  // Dead-ball enforcement is gameFlow s job and is already correct there;
  // routing it through two paths would let them disagree.
  const spot = reviewNextSpot({
    penalty: "False Start", isDeadBall: true, override: null,
    projection: { ballOn: 25, down: 1, distance: 15 },
    enforced: { ballOn: 99, down: 4, distance: 1, from: "nonsense" },
  });
  assert.equal(spot?.ballOn, 25);
  assert.equal(spot?.source, "computed");
});

test("a live-ball flag on a scrimmage down claims nothing either", () => {
  // Holding on a 12-yard run. The projection would mark off from the snap and
  // ignore the run entirely; same class of wrong, just less obvious.
  assert.equal(
    reviewNextSpot({
      penalty: "Holding-OFF",
      isDeadBall: false,
      override: null,
      enforced: null,
      projection: { ballOn: 20, down: 1, distance: 10 },
    }),
    null,
  );
});

test("a dead-ball flag still shows its enforcement", () => {
  // Nothing happened, so marking off from the previous spot IS the answer.
  // Losing this would make the stand-alone penalty button useless.
  const spot = reviewNextSpot({
    penalty: "False Start",
    isDeadBall: true,
    override: null,
    enforced: null,
    projection: { ballOn: 25, down: 1, distance: 15 },
  });
  assert.deepEqual(spot, { ballOn: 25, down: 1, distance: 15, source: "computed", from: "" });
});

test("a hand-set spot wins on a live-ball flag - that is how the ball gets placed", () => {
  const spot = reviewNextSpot({
    ...THE_KICKOFF,
    override: { ballOn: 84, down: 1, distance: 10 },
  });
  assert.deepEqual(spot, { ballOn: 84, down: 1, distance: 10, source: "operator", from: "" });
});

test("a hand-set spot outranks the engine on a dead-ball flag too", () => {
  const spot = reviewNextSpot({
    penalty: "Delay of Game",
    isDeadBall: true,
    override: { ballOn: 30, down: 2, distance: 5 },
    enforced: null,
    projection: { ballOn: 25, down: 1, distance: 15 },
  });
  assert.equal(spot?.source, "operator");
  assert.equal(spot?.ballOn, 30);
});

test("no flag, no claim - the row must not render on an ordinary play", () => {
  assert.equal(
    reviewNextSpot({
      penalty: null,
      isDeadBall: false,
      override: { ballOn: 40, down: 1, distance: 10 },
      enforced: null,
      projection: { ballOn: 50, down: 1, distance: 10 },
    }),
    null,
  );
});

test("a dead-ball flag with no projection yet claims nothing", () => {
  assert.equal(
    reviewNextSpot({ penalty: "Offsides", isDeadBall: true, override: null, projection: null, enforced: null }),
    null,
  );
});

test("the source is what the label keys off, so it must be exact", () => {
  // The review paints operator spots amber and computed ones emerald; a typo
  // here would silently make a hand-set spot read as computed.
  const operator = reviewNextSpot({ ...THE_KICKOFF, override: { ballOn: 84, down: 1, distance: 10 } });
  const computed = reviewNextSpot({
    penalty: "False Start", isDeadBall: true, override: null, enforced: null,
    projection: { ballOn: 25, down: 1, distance: 15 },
  });
  assert.equal(operator?.source, "operator");
  assert.equal(computed?.source, "computed");
});

/* ── Which team the flag prefills to ─────────────────────────────────────── */

test("EVERY penalty resolves to a side - a null would deadlock Record Play", () => {
  // The prefill-and-swap control has no empty state: it names a team on screen
  // and canGoNext() requires a stored side. A penalty that resolves to null
  // shows a team and then silently refuses to advance.
  for (const label of PENALTIES) {
    for (const kick of [true, false]) {
      const side = flagSideDefault(label, kick);
      assert.ok(
        side === "offense" || side === "defense",
        `"${label}" (isKickPlay=${kick}) resolved to ${JSON.stringify(side)}`,
      );
    }
  }
});

test("the rules table still wins wherever it has an answer", () => {
  // The guess is a fallback, not an override - a false start is always on the
  // offense and must not be reasoned about.
  for (const label of PENALTIES) {
    const fromRules = getPenaltyDefaultSide(label);
    if (fromRules) {
      assert.equal(flagSideDefault(label, true), fromRules, label);
      assert.equal(flagSideDefault(label, false), fromRules, label);
    }
  }
});

test("the four sideless fouls are still sideless - this test is the canary", () => {
  // If the rules table later gains a defaultSide for these, the special case
  // below is dead code and should go. Failing here is the signal to delete it.
  const sideless = PENALTIES.filter(p => getPenaltyDefaultSide(p) === null);
  assert.deepEqual(
    [...sideless].sort(),
    ["Block in Back", "Clipping", "Facemask", "Unsportsmanlike"].sort(),
  );
});

test("blocking fouls on a kick land on the receiving team", () => {
  // The reported case. On a kick possession sits with the KICKING team, so the
  // returners are "defense" - and the returners are the ones blocking.
  assert.equal(flagSideDefault("Block in Back", true), "defense");
  assert.equal(flagSideDefault("Clipping", true), "defense");
});

test("blocking fouls on a scrimmage down land on the offense", () => {
  assert.equal(flagSideDefault("Block in Back", false), "offense");
  assert.equal(flagSideDefault("Clipping", false), "offense");
});

/* ── Custom flags ────────────────────────────────────────────────────────── */

test("a typed flag still resolves to a side", () => {
  // It reaches flagSideDefault as an unknown label, and the prefill-and-swap
  // control has no empty state, so this must never come back null.
  for (const kick of [true, false]) {
    const side = flagSideDefault("Illegal Kicking", kick);
    assert.ok(side === "offense" || side === "defense");
  }
});

test("an empty name resolves too - custom mode starts before anything is typed", () => {
  assert.equal(flagSideDefault("", true), "defense");
});

test("a typed flag is flagged as a guess, so the check warning shows", () => {
  assert.equal(getPenaltyDefaultSide("Illegal Kicking"), null);
});

test("Other is NOT in the penalty table", () => {
  // The table is the rulebook the app knows: default sides, standard
  // distances, engine codes. A free-text entry has none of the three, so
  // listing it there would put a row in that lies about all of them - and it
  // would break the four-sideless-fouls canary above.
  assert.equal(PENALTIES.includes("Other"), false);
});

test("a typed flag has no engine code, so the call sites' fallback takes over", () => {
  // playTransformer and liveGameSession both read
  //   getPenaltyEngineCode(x) ?? x.toLowerCase().replace(/\s+/g, "_")
  // so an unmapped label degrades to a derived code rather than undefined.
  assert.equal(getPenaltyEngineCode("Illegal Kicking"), undefined);
  const derived = "Illegal Kicking".toLowerCase().replace(/\s+/g, "_");
  assert.equal(derived, "illegal_kicking");
});

test("a typed flag takes the default distance and is not a spot foul", () => {
  assert.equal(penaltyDefaultYards("Illegal Kicking"), 5);
  assert.equal(isSpotFoul("Illegal Kicking"), false);
});

console.log(`\n${passed}/${total} passed`);
