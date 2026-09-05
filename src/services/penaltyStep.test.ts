/**
 * Run with: node src/services/penaltyStep.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * A flag gets its own step now, rather than unfolding underneath the yardage
 * controls. The step only exists once a flag is wanted, so the ordinary snap
 * stays exactly as short as it was — which means the Add Penalty button has to
 * work out where the step WILL be before it exists.
 *
 * That arithmetic is the fiddly part and the reason for this file: the step is
 * inserted immediately before review, so it takes review's current index, and
 * being one out sends the operator to the wrong screen.
 */
import assert from "node:assert/strict";

type Step = string;

/** The steps array as PlayEntryModal builds it, for the cases that matter. */
function buildSteps(o: {
  kind: "scrimmage" | "kick" | "penaltyOnly";
  hasRoles?: boolean;
  tacklers?: boolean;
  formations?: boolean;
  returned?: boolean;
  ourKick?: boolean;
  wantsPenalty?: boolean;
}): Step[] {
  const steps: Step[] = [];
  if (o.kind === "kick") {
    if (o.ourKick) steps.push("kick_kicker");
    steps.push("kick_location");
    if (o.returned) {
      steps.push("kick_returner", "kick_return_yards");
      if (o.tacklers) steps.push("defense");
    }
    if (o.wantsPenalty) steps.push("penalty");
    steps.push("review");
  } else if (o.kind === "penaltyOnly") {
    steps.push("penalty", "review");
  } else {
    if (o.hasRoles) steps.push("players");
    steps.push("yards");
    if (o.tacklers) steps.push("defense");
    if (o.formations) steps.push("formations");
    if (o.wantsPenalty) steps.push("penalty");
    steps.push("review");
  }
  return steps;
}

/** openPenaltyStep: where the button sends you. */
function targetIndex(stepsWithoutPenalty: Step[]): number {
  const already = stepsWithoutPenalty.indexOf("penalty");
  if (already >= 0) return already;
  return Math.max(0, stepsWithoutPenalty.length - 1);
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

/** The button's target must be the penalty step in the array it creates. */
function assertLandsOnPenalty(opts: Parameters<typeof buildSteps>[0], label: string) {
  const before = buildSteps({ ...opts, wantsPenalty: false });
  const idx = targetIndex(before);
  const after = buildSteps({ ...opts, wantsPenalty: true });
  assert.equal(
    after[idx], "penalty",
    `${label}: landed on "${after[idx]}" (index ${idx} of ${JSON.stringify(after)})`,
  );
}

console.log("penaltyStep");

test("a run with formations and tacklers lands on the flag", () => {
  assertLandsOnPenalty(
    { kind: "scrimmage", hasRoles: true, tacklers: true, formations: true },
    "full scrimmage",
  );
});

test("a bare scrimmage play — no roles, no tacklers, no formations", () => {
  assertLandsOnPenalty({ kind: "scrimmage" }, "minimal scrimmage");
});

test("our kick, returned, with tacklers", () => {
  assertLandsOnPenalty(
    { kind: "kick", ourKick: true, returned: true, tacklers: true },
    "our returned kick",
  );
});

test("their kick, no return — the shortest kick flow there is", () => {
  // Two steps before review, and the arithmetic still has to land.
  assertLandsOnPenalty({ kind: "kick", ourKick: false }, "their unreturned kick");
});

test("the flag always sits immediately before review", () => {
  const s = buildSteps({ kind: "scrimmage", hasRoles: true, wantsPenalty: true });
  assert.equal(s[s.length - 2], "penalty");
  assert.equal(s[s.length - 1], "review");
});

test("a play that already has a flag jumps to the existing step, not past it", () => {
  const withFlag = buildSteps({ kind: "scrimmage", hasRoles: true, wantsPenalty: true });
  const idx = targetIndex(withFlag);
  assert.equal(withFlag[idx], "penalty");
});

test("adding a flag never skips review", () => {
  // The insertion must push review along, never replace it.
  const before = buildSteps({ kind: "scrimmage", hasRoles: true, formations: true });
  const after = buildSteps({ kind: "scrimmage", hasRoles: true, formations: true, wantsPenalty: true });
  assert.equal(after.length, before.length + 1);
  assert.ok(after.includes("review"));
});

test("a dead-ball penalty play is unchanged — the flag IS the play", () => {
  assert.deepEqual(buildSteps({ kind: "penaltyOnly" }), ["penalty", "review"]);
});

console.log(`\n${passed}/${total} passed`);
