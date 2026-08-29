/**
 * Run with: node src/services/looseTags.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * Tags that cannot be foreign keys still hold stats.
 *
 * play_players only holds our rostered players. The TEAM placeholder, the
 * opponent's players and unrostered jerseys have no players row, so they ride
 * in play_data. Nothing in the transformer read those lists, so every one of
 * those stats was recorded faithfully, rebuilt into the play log, shown in the
 * editor — and then dropped on the way to the engine, which is what every
 * report reads. A tackle credited to TEAM appeared nowhere.
 *
 * The rule is exercised here against the same shapes rather than through the
 * import, which pulls in Supabase. It guards the decision, not the call.
 */
import assert from "node:assert/strict";

const TEAM_PLAYER_ID = "our_team";

type Join = { player_id: string; role: string; credit?: number | null };
type Loose = { id?: string; role?: string; credit?: number | null };
type Play = {
  play_players: Join[];
  play_data?: {
    team_tagged?: Loose[];
    opp_tagged?: Loose[];
    pending_tagged?: Loose[];
  };
};

/** The rule as it now stands in playTransformer.allTagsForRole. */
function allTagsForRole(play: Play, role: string) {
  const pd = play.play_data;
  const loose = (key: "team_tagged" | "opp_tagged" | "pending_tagged") => pd?.[key] ?? [];
  return [
    ...play.play_players
      .filter(pp => pp.role === role)
      .map(pp => ({ id: pp.player_id, credit: pp.credit ?? null })),
    ...loose("team_tagged")
      .filter(t => t.role === role)
      .map(() => ({ id: TEAM_PLAYER_ID, credit: null as number | null })),
    ...loose("opp_tagged")
      .filter(t => t.role === role && t.id)
      .map(t => ({ id: String(t.id), credit: t.credit ?? null })),
    ...loose("pending_tagged")
      .filter(t => t.role === role && t.id)
      .map(t => ({ id: String(t.id), credit: t.credit ?? null })),
  ];
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

console.log("looseTags");

test("the reported gap: a TEAM tackle reaches the engine", () => {
  const play: Play = {
    play_players: [],
    play_data: { team_tagged: [{ role: "tackler", credit: 1 }] },
  };
  assert.deepEqual(allTagsForRole(play, "tackler"), [{ id: TEAM_PLAYER_ID, credit: null }]);
});

test("a TEAM receiver counts too, not just tackles", () => {
  const play: Play = {
    play_players: [{ player_id: "qb", role: "passer" }],
    play_data: { team_tagged: [{ role: "receiver" }] },
  };
  assert.deepEqual(allTagsForRole(play, "receiver").map(t => t.id), [TEAM_PLAYER_ID]);
});

test("an opponent tag reaches the engine under its own id", () => {
  const play: Play = {
    play_players: [],
    play_data: { opp_tagged: [{ id: "opp_team", role: "punter" }] },
  };
  assert.deepEqual(allTagsForRole(play, "punter").map(t => t.id), ["opp_team"]);
});

test("an unrostered jersey keeps its own id, not TEAM's", () => {
  const play: Play = {
    play_players: [],
    play_data: { pending_tagged: [{ id: "pending_42", role: "rusher" }] },
  };
  assert.deepEqual(allTagsForRole(play, "rusher").map(t => t.id), ["pending_42"]);
});

test("rostered and loose tags on one play all come back", () => {
  const play: Play = {
    play_players: [{ player_id: "a", role: "tackler", credit: 0.5 }],
    play_data: { team_tagged: [{ role: "tackler", credit: 0.5 }] },
  };
  assert.deepEqual(allTagsForRole(play, "tackler").map(t => t.id), ["a", TEAM_PLAYER_ID]);
});

test("a role nobody filled stays empty", () => {
  const play: Play = {
    play_players: [{ player_id: "a", role: "rusher" }],
    play_data: { team_tagged: [{ role: "tackler" }] },
  };
  assert.deepEqual(allTagsForRole(play, "receiver"), []);
});

test("a play with no play_data at all does not throw", () => {
  assert.deepEqual(allTagsForRole({ play_players: [] }, "tackler"), []);
});

test("a loose tag with no id is skipped rather than registered as undefined", () => {
  const play: Play = {
    play_players: [],
    play_data: { opp_tagged: [{ role: "tackler" }] },
  };
  assert.deepEqual(allTagsForRole(play, "tackler"), []);
});

console.log(`\n${passed}/${total} passed`);
