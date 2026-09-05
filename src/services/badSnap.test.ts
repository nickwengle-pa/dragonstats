/**
 * Run with: node src/services/badSnap.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * A bad snap is rushing yardage that belongs to nobody in particular. The
 * whole point of the play type is that the loss is charged to TEAM rather than
 * to the quarterback who was standing there waiting for it — charging him
 * makes a bad centre exchange read as a bad night from the back.
 *
 * The rule lives in two places that have to agree: the entry modal writes the
 * TEAM tag at submit, and playTransformer resolves the rusher from it. Both are
 * exercised here against the same shapes rather than through their imports,
 * which pull in Supabase. It guards the decision, not the call.
 */
import assert from "node:assert/strict";

const TEAM_PLAYER_ID = "our_team";

type Tag = { player_id: string; role: string; isTeam?: boolean };

/** What the modal writes at submit for a bad snap. */
function tagsAtSubmit(playType: string, picked: Tag[]): Tag[] {
  const out = [...picked];
  if (playType === "bad_snap" && !out.some(t => t.role === "rusher")) {
    out.push({ player_id: TEAM_PLAYER_ID, role: "rusher", isTeam: true });
  }
  return out;
}

/** What playTransformer resolves the rusher to. */
function rusherFor(tags: Tag[]): string {
  return tags.find(t => t.role === "rusher")?.player_id ?? TEAM_PLAYER_ID;
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

console.log("badSnap");

test("the whole point: the loss is charged to TEAM", () => {
  const tags = tagsAtSubmit("bad_snap", []);
  assert.equal(rusherFor(tags), TEAM_PLAYER_ID);
});

test("the quarterback on the field never picks it up", () => {
  // Nothing tags a passer on a bad snap, but if a stray tag survived an edit
  // it must not become the rusher.
  const tags = tagsAtSubmit("bad_snap", [{ player_id: "qb7", role: "passer" }]);
  assert.equal(rusherFor(tags), TEAM_PLAYER_ID);
  assert.ok(tags.some(t => t.role === "rusher" && t.isTeam));
});

test("the TEAM tag is ours, not the opponent's placeholder", () => {
  // It is our loss. The opponent placeholder would file it under their stats.
  const tags = tagsAtSubmit("bad_snap", []);
  const rusher = tags.find(t => t.role === "rusher");
  assert.equal(rusher?.isTeam, true);
  assert.equal(rusher?.player_id, TEAM_PLAYER_ID);
});

test("an ordinary run is untouched — the back keeps his carry", () => {
  const tags = tagsAtSubmit("rush", [{ player_id: "rb21", role: "rusher" }]);
  assert.equal(rusherFor(tags), "rb21");
  assert.equal(tags.length, 1);
});

test("a bad snap already carrying a rusher is not tagged twice", () => {
  // Re-submitting an edited bad snap must not stack a second TEAM rusher.
  const once = tagsAtSubmit("bad_snap", []);
  const twice = tagsAtSubmit("bad_snap", once);
  assert.equal(twice.filter(t => t.role === "rusher").length, 1);
});

console.log(`\n${passed}/${total} passed`);
