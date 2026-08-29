/**
 * Run with: node src/services/driveResults.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * Covers the reported bug: a drive that ended in a made field goal showed PUNT.
 * The cause is that possession belongs to the KICKING team on a kickoff, so the
 * last play of a scoring drive is the kickoff that followed it, not the score.
 */
import assert from "node:assert/strict";
import { resolveDriveResults, type DriveResultPlay } from "./driveResults.ts";

type Side = "us" | "them";

const p = (
  possession: Side,
  playType: string,
  extra: Partial<DriveResultPlay> = {},
): DriveResultPlay => ({
  possession,
  playType,
  quarter: 1,
  down: 1,
  isTouchdown: false,
  isTurnover: false,
  result: "",
  ...extra,
});

/** One placeholder drive per possession run, so the counts line up. */
const drivesFor = (plays: DriveResultPlay[]) => {
  const out: any[] = [];
  let last: Side | null = null;
  for (const play of plays) {
    if (play.possession !== last) {
      out.push({ driveNumber: out.length + 1, team: play.possession, result: "punt" });
      last = play.possession;
    }
  }
  return out;
};

const resultsOf = (plays: DriveResultPlay[]) =>
  resolveDriveResults(drivesFor(plays) as any, plays).map(d => d.result).join(",");

/** Just the drive under test. The trailing possession in these fixtures is the
 *  last of the game and correctly reports end_of_game, which is not the point
 *  of any of these cases. */
const firstResultOf = (plays: DriveResultPlay[]) =>
  resolveDriveResults(drivesFor(plays) as any, plays)[0].result;

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

console.log("driveResults");

test("the reported bug: a made field goal is FG, not PUNT", () => {
  // The kickoff that follows belongs to the same possession run, and was the
  // play the engine was reading.
  const plays = [
    p("us", "rush"),
    p("us", "fg", { down: 4, result: "Good" }),
    p("us", "kickoff"),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "field_goal");
});

test("a missed field goal is its own result, not a turnover", () => {
  const plays = [
    p("us", "rush"),
    p("us", "fg", { down: 4, result: "No Good" }),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "missed_field_goal");
});

test("a touchdown survives the PAT and the kickoff that follow it", () => {
  const plays = [
    p("us", "rush", { isTouchdown: true }),
    p("us", "pat", { result: "Good" }),
    p("us", "kickoff"),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "touchdown");
});

test("a two-point try does not become the deciding play either", () => {
  const plays = [
    p("us", "rush", { isTouchdown: true }),
    p("us", "two_pt", { result: "Good" }),
    p("us", "kickoff"),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "touchdown");
});

test("a punt is still a punt", () => {
  const plays = [p("us", "rush"), p("us", "punt", { down: 4 }), p("them", "rush")];
  assert.equal(firstResultOf(plays), "punt");
});

test("an interception is a turnover", () => {
  const plays = [
    p("us", "rush"),
    p("us", "int", { isTurnover: true }),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "turnover");
});

test("failing on fourth down is a turnover on downs, not a punt", () => {
  const plays = [
    p("us", "rush"),
    p("us", "rush", { down: 4 }),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "turnover_on_downs");
});

test("a blocked punt the kicking team recovered is a punt, not a turnover", () => {
  const plays = [
    p("us", "blocked_kick", { down: 4, isTurnover: false }),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "punt");
});

test("a blocked punt the other team recovered is a turnover", () => {
  const plays = [
    p("us", "blocked_kick", { down: 4, isTurnover: true }),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "turnover");
});

test("timeouts and flags never decide a drive", () => {
  const plays = [
    p("us", "rush", { isTouchdown: true }),
    p("us", "timeout"),
    p("us", "penalty_only"),
    p("them", "rush"),
  ];
  assert.equal(firstResultOf(plays), "touchdown");
});

test("running out the half is end of half, not a punt", () => {
  const plays = [
    p("us", "rush", { quarter: 2 }),
    p("them", "rush", { quarter: 3 }),
    p("us", "rush", { quarter: 3 }),
  ];
  assert.equal(resultsOf(plays), "end_of_half,punt,end_of_game");
});

test("a mismatch between drives and possession runs leaves the labels alone", () => {
  const plays = [p("us", "fg", { down: 4, result: "Good" }), p("them", "rush")];
  const tooMany = [
    { driveNumber: 1, team: "us", result: "punt" },
    { driveNumber: 2, team: "them", result: "punt" },
    { driveNumber: 3, team: "us", result: "punt" },
  ];
  const out = resolveDriveResults(tooMany as any, plays);
  assert.equal(out.map(d => d.result).join(","), "punt,punt,punt");
});

console.log(`\n${passed}/${total} passed`);
