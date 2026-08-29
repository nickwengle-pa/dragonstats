/**
 * Run with: node src/components/game/playEntrySeed.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * The cases that matter are the historical kicks: plays recorded before the
 * landing and return spots were stored as numbers, which have to come back out
 * of the description or every old kickoff and punt opens on the wrong yard
 * line the moment somebody edits one.
 */
import assert from "node:assert/strict";
import { buildEditSeed } from "./playEntrySeed.ts";
import { buildDescription, PLAY_TYPES, type PlayRecord, type TaggedPlayer } from "./types.ts";

const tag = (role: string, jersey: number, name: string): TaggedPlayer => ({
  id: `p${jersey}`,
  player_id: `p${jersey}`,
  jersey_number: jersey,
  name,
  role,
});

const play = (over: Partial<PlayRecord> = {}): PlayRecord => ({
  id: "x",
  quarter: 1,
  clock: 600,
  type: "rush",
  yards: 0,
  result: "",
  penalty: null,
  flagYards: 0,
  isTouchdown: false,
  firstDown: false,
  turnover: false,
  tagged: [],
  ballOn: 35,
  down: 1,
  distance: 10,
  description: "",
  possession: "us",
  ...over,
});

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

console.log("playEntrySeed");

/* ── Historical kicks: spots recovered from the description ─────────────── */

test("a returned kickoff recovers both the landing spot and the return", () => {
  // Kicked from our 35, came down on their 10, brought out 10 yards to their 20.
  // Exactly the case in the question: a 10-yard return ending on the 20 landed
  // on the 10.
  const kickType = PLAY_TYPES.find(p => p.id === "kickoff")!;
  const tags = [tag("kicker", 21, "Ryan Matko"), tag("returner", 3, "Matt Johnston")];
  const description = buildDescription(kickType, tags, 55, false, null, "", {
    kickDistance: 55,
    kickedToYard: 10,
    returnYards: 10,
    isTouchback: false,
    landingLabel: "UV 10",
  });

  const seed = buildEditSeed(play({
    type: "kickoff",
    ballOn: 35,
    yards: 45, // net: 55 kicked minus 10 returned
    tagged: tags,
    description,
  }));

  assert.equal(seed.kickedToYard, 10, "landing spot");
  // Our kickoff, so the receiving side is the opponent's half.
  assert.equal(seed.returnToTeam, "opponent");
  assert.equal(seed.returnToYardLine, 20, "returned to their 20");
});

test("a punt with no return puts the return on the landing spot", () => {
  const puntType = PLAY_TYPES.find(p => p.id === "punt")!;
  const tags = [tag("punter", 21, "Victor B")];
  const description = buildDescription(puntType, tags, 38, false, null, "", {
    kickDistance: 38,
    kickedToYard: 27,
    returnYards: 0,
    isTouchback: false,
    landingLabel: "UV 27",
  });

  const seed = buildEditSeed(play({
    type: "punt", ballOn: 35, yards: 38, tagged: tags, description,
  }));

  assert.equal(seed.kickedToYard, 27);
  assert.equal(seed.returnToYardLine, 27);
});

test("a return past midfield flips to the other side of the field", () => {
  const kickType = PLAY_TYPES.find(p => p.id === "kickoff")!;
  const tags = [tag("kicker", 21, "K"), tag("returner", 3, "R")];
  // Caught on their 40, returned 30 to our 30 (their 70).
  const description = buildDescription(kickType, tags, 25, false, null, "", {
    kickDistance: 25,
    kickedToYard: 40,
    returnYards: 30,
    isTouchback: false,
    landingLabel: "UV 40",
  });

  const seed = buildEditSeed(play({
    type: "kickoff", ballOn: 35, yards: -5, tagged: tags, description,
  }));

  assert.equal(seed.kickedToYard, 40);
  assert.equal(seed.returnToTeam, "program", "crossed midfield onto our half");
  assert.equal(seed.returnToYardLine, 30);
});

test("a touchback still recovers where the ball came down", () => {
  const kickType = PLAY_TYPES.find(p => p.id === "kickoff")!;
  const tags = [tag("kicker", 21, "K")];
  const description = buildDescription(kickType, tags, 65, false, null, "", {
    kickDistance: 65,
    kickedToYard: 0,
    returnYards: 0,
    isTouchback: true,
  });

  const seed = buildEditSeed(play({
    type: "kickoff", ballOn: 35, yards: 65, tagged: tags,
    description, isTouchback: true,
  }));

  assert.equal(seed.kickedToYard, 0);
  assert.equal(seed.kickOutcome, "touchback");
});

test("a stored spot always beats the description", () => {
  const seed = buildEditSeed(play({
    type: "punt", ballOn: 35, yards: 38,
    description: "Punt #21 Victor 38 yds to UV 27",
    playData: { kicked_to_yard: 12, return_to_ball_on: 74 },
  }));
  assert.equal(seed.kickedToYard, 12, "the number wins over the prose");
});

test("a description with no kick distance falls back rather than guessing", () => {
  const seed = buildEditSeed(play({
    type: "punt", ballOn: 35, yards: 38, description: "Punt #21 Victor",
  }));
  assert.equal(seed.kickedToYard, 5);
});

test("a jersey number in a name is never mistaken for the kick distance", () => {
  const seed = buildEditSeed(play({
    type: "punt", ballOn: 35, yards: 38,
    description: "Punt #38 Smith 42 yds to UV 23",
  }));
  assert.equal(seed.kickedToYard, 23, "42-yard punt from the 35 lands on their 23");
});

/* ── The rest of the seed ───────────────────────────────────────────────── */

test("the ball spot comes back where the play actually ended", () => {
  const seed = buildEditSeed(play({ type: "rush", ballOn: 35, yards: 9 }));
  // Our ball on our 35, gained 9, so our 44.
  assert.equal(seed.resultSide, "our");
  assert.equal(seed.resultYardLine, 44);
});

test("a touchdown seeds the spot to the snap, with the flag carrying it", () => {
  const seed = buildEditSeed(play({ type: "rush", ballOn: 42, yards: 58, isTouchdown: true }));
  assert.equal(seed.isTD, true);
  assert.equal(seed.resultYardLine, 42);
});

test("tacklers are split out of the tag list", () => {
  const seed = buildEditSeed(play({
    type: "rush",
    tagged: [tag("rusher", 21, "V B"), tag("tackler", 55, "P G"), tag("sacker", 77, "P K")],
  }));
  assert.equal(seed.tagged.length, 1);
  assert.equal(seed.tacklers.length, 2);
});

test("a lost fumble reads as lost, a kept one as kept", () => {
  assert.equal(buildEditSeed(play({ type: "fumble", turnover: true })).fumbleRecoveredByUs, false);
  assert.equal(buildEditSeed(play({ type: "fumble", turnover: false })).fumbleRecoveredByUs, true);
});

test("a two-point try remembers whether it was run or thrown", () => {
  assert.equal(buildEditSeed(play({ type: "two_pt", tagged: [tag("rusher", 21, "V")] })).twoPointStyle, "run");
  assert.equal(buildEditSeed(play({ type: "two_pt", tagged: [tag("passer", 21, "V")] })).twoPointStyle, "pass");
});

test("a play recorded before direction and wristband existed still opens", () => {
  const seed = buildEditSeed(play({ type: "rush", playData: {} }));
  assert.equal(seed.playDirection, null);
  assert.equal(seed.wristbandCall, "");
});

test("an interception keeps both of its spots", () => {
  const seed = buildEditSeed(play({
    type: "int",
    ballOn: 40,
    playData: {
      interception_spot: { field_side: "opponent", yard_line: 30 },
      interception_return_to: { field_side: "program", yard_line: 45 },
    },
  }));
  assert.equal(seed.intCaughtTeam, "opponent");
  assert.equal(seed.intCaughtYardLine, 30);
  assert.equal(seed.intReturnTeam, "program");
  assert.equal(seed.intReturnYardLine, 45);
});

console.log(`\n${passed}/${total} passed`);
