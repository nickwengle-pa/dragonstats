/**
 * Run with: node src/services/kickSpots.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * Gross kick distance, return yardage, inside-20 and net. These four numbers
 * are every special-teams stat on the report, and none of them ever reached
 * the engine before: kickDistance was never passed at all, so punt yards, punt
 * average and average kickoff distance sat at zero, and returnYards was fed
 * the net kick instead of the return.
 */
import assert from "node:assert/strict";
import { resolveKickSpots, isInsideTwenty, netKickYards, puntInsideTwenty, receiverFoulSpot } from "./kickSpots.ts";

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

console.log("kickSpots");

test("stored spots: a kickoff from the 35 caught on their 10, back to their 20", () => {
  // return_to_ball_on is offense-relative and the offense is the kicking team,
  // so their 20 is 80 from the kicking team's goal line.
  const spots = resolveKickSpots({
    ballOn: 35,
    playData: { kicked_to_yard: 10, return_to_ball_on: 80 },
    description: "",
  });
  assert.ok(spots);
  assert.equal(spots.kickDistance, 55, "gross: 35 to their 10");
  assert.equal(spots.returnYards, 10, "their 10 out to their 20");
  assert.equal(spots.exact, true);
});

test("a punt downed with no return has zero return yards", () => {
  const spots = resolveKickSpots({
    ballOn: 35,
    playData: { kicked_to_yard: 12, return_to_ball_on: 88 },
    description: "",
  });
  assert.ok(spots);
  assert.equal(spots.kickDistance, 53);
  assert.equal(spots.returnYards, 0);
});

test("a return past midfield gives back more yards than the kick travelled", () => {
  // Caught on their 40, returned to the kicking team's 30 — a 30-yard return.
  const spots = resolveKickSpots({
    ballOn: 35,
    playData: { kicked_to_yard: 40, return_to_ball_on: 30 },
    description: "",
  });
  assert.ok(spots);
  assert.equal(spots.kickDistance, 25);
  assert.equal(spots.returnYards, 30);
});

test("a play with no stored spots falls back to the description", () => {
  const spots = resolveKickSpots({
    ballOn: 35,
    playData: {},
    description: "Punt #21 Smith 38 yds to UV 27, ret #3 Jones 6 yds",
  });
  assert.ok(spots);
  assert.equal(spots.kickDistance, 38);
  assert.equal(spots.kickedToYard, 27);
  assert.equal(spots.returnYards, 6);
  assert.equal(spots.exact, false, "flagged as recovered from prose");
});

test("a play carrying neither returns null rather than guessing", () => {
  assert.equal(resolveKickSpots({ ballOn: 35, playData: {}, description: "Punt #21 Smith" }), null);
});

test("inside the 20 is a landing spot, and a touchback is not one", () => {
  const pinned = { kickDistance: 45, kickedToYard: 12, returnYards: 0, exact: true };
  assert.equal(isInsideTwenty(pinned, false), true);
  assert.equal(isInsideTwenty(pinned, true), false, "a touchback is the opposite result");
  const short = { kickDistance: 30, kickedToYard: 35, returnYards: 0, exact: true };
  assert.equal(isInsideTwenty(short, false), false);
  const endZone = { kickDistance: 65, kickedToYard: 0, returnYards: 0, exact: true };
  assert.equal(isInsideTwenty(endZone, false), false, "the end zone is not inside the 20");
  const onIt = { kickDistance: 30, kickedToYard: 20, returnYards: 0, exact: true };
  assert.equal(isInsideTwenty(onIt, false), false, "on the 20 is not inside it");
});

test("a punt is inside the 20 when the other team's next snap is", () => {
  const punt = (nextYard: number, nextPossession = "them", extra: Record<string, unknown> = {}) =>
    ({ possession: "us", play_data: { next_possession: nextPossession, next_yard_line: nextYard, ...extra } });
  assert.equal(puntInsideTwenty(punt(15), null), true);
  assert.equal(puntInsideTwenty(punt(20), null), false, "starting on the 20 is not inside it");
  assert.equal(puntInsideTwenty(punt(30), null), false, "run out past the 20");
  assert.equal(puntInsideTwenty(punt(15, "us"), null), false, "the kicking team got it back");
  assert.equal(puntInsideTwenty(punt(15, "them", { is_touchback: true }), null), false);
});

test("a punt row with no next snap falls back to the landing spot plus the return", () => {
  const row = { possession: "us", play_data: {} };
  assert.equal(puntInsideTwenty(row, { kickDistance: 40, kickedToYard: 12, returnYards: 0, exact: true }), true);
  assert.equal(puntInsideTwenty(row, { kickDistance: 40, kickedToYard: 12, returnYards: 10, exact: true }), false);
  assert.equal(puntInsideTwenty(row, null), false);
});

test("an older row's return-team foul spot is read off the next snap", () => {
  // Fielded at their 11, a hold at their 36 (64 from the kickers' goal line),
  // ten yards back: the receiving team starts on its own 26.
  const pd = {
    penalty_type: "Holding-OFF", play_category: "defense", penalty_enforcement: "accepted",
    penalty_yards: 10, foul_spot_ball_on: 64, next_yard_line: 26,
  };
  assert.equal(receiverFoulSpot(pd), 64);
  assert.equal(receiverFoulSpot({ ...pd, penalty_enforcement_from: "auto" }), 64);
  assert.equal(receiverFoulSpot({ ...pd, next_yard_line: 40 }), null, "not marched from that spot");
  assert.equal(receiverFoulSpot({ ...pd, penalty_enforcement_from: "previous_spot" }), null);
  assert.equal(receiverFoulSpot({ ...pd, next_yard_line: 40, penalty_enforcement_from: "spot_of_foul" }), 64, "a recorded spot still wins");
});

test("net subtracts the return", () => {
  const spots = { kickDistance: 55, kickedToYard: 10, returnYards: 10, exact: true };
  assert.equal(netKickYards(spots, 35, false, 20), 45);
});

test("a touchback nets to the touchback line, not to where it came down", () => {
  // Kicked from the 35 into the end zone. Gross is 65; net is to their 20.
  const spots = { kickDistance: 65, kickedToYard: 0, returnYards: 0, exact: true };
  assert.equal(netKickYards(spots, 35, true, 20), 45);
});

console.log(`\n${passed}/${total} passed`);
