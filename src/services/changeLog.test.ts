/**
 * Run with: node src/services/changeLog.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * The database decides what goes in the Change Log
 * (supabase/tests/game_activity.sql checks that side); this checks the words
 * a coach reads for each entry.
 */
import assert from "node:assert/strict";
import { actorLabel, changeLines, changeTitle, isAfterGame, playChanges, type ChangeRow } from "./changeLog.ts";

const row = (over: Partial<ChangeRow>): ChangeRow => ({
  id: 1, program_id: "p", game_id: "g", game_info: { opponent: "Rival", date: "2026-10-17T23:00:00Z", is_home: true },
  play_id: null, play_number: null, action: "game_started", game_status: "live",
  actor_id: "u", actor_email: "coach@test", actor_name: null, before: null, after: null,
  created_at: "2026-10-18T00:00:00Z", ...over,
});

// A tackle moved from one player to another, and the yards changed.
const before = {
  n: 34, q: 3, clock: "4:12", type: "rush", yards: 4, desc: "#7 Runner 4 yd run",
  credits: [
    { role: "rusher", jersey: 7, name: "Pat Runner" },
    { role: "tackler", jersey: 22, name: "Sam Tackle", credit: 1 },
  ],
};
const after = {
  ...before, yards: 7, desc: "#7 Runner 7 yd run",
  credits: [
    { role: "rusher", jersey: 7, name: "Pat Runner" },
    { role: "tackler", jersey: 44, name: "Lee Other", credit: 0.5 },
  ],
  pd: { opp_tagged: [{ role: "forced_fumble", jersey_number: 55, name: "Big Guy" }] },
};
assert.deepEqual(playChanges(before, after), [
  { label: "Yards", before: "4", after: "7" },
  { label: "Forced fumble", before: "None", after: "#55 Big Guy (opponent)" },
  { label: "Tackler", before: "#22 Sam Tackle", after: "#44 Lee Other (shared)" },
]);
assert.equal(changeTitle(row({ action: "play_edited", play_number: 34, before, after })), "Changed play 34 (Q3 4:12)");

// Nothing a coach would see changed: no lines.
assert.deepEqual(playChanges(before, before), []);

// Unrostered jerseys and TEAM are named too.
assert.deepEqual(
  playChanges({ pd: { pending_tagged: [{ role: "tackler", jersey_number: 31 }] } }, { pd: { team_tagged: [{ role: "tackler" }] } }),
  [{ label: "Tackler", before: "#31 (not on roster)", after: "TEAM" }],
);

// End Game and changes to a final.
assert.equal(changeTitle(row({ action: "game_ended", after: { us: 21, them: 14 } })), "Pressed End Game, final 21-14");
const changed = row({
  action: "final_changed", game_status: "completed", before: { us: 21, them: 14 },
  after: { us: 28, them: 14, entry: { source: "change", stats: [{ label: "#22 Sam Tackle Solo tackles", before: 3, after: 4 }] } },
});
assert.deepEqual(changeLines(changed), [
  { label: "Score", before: "21-14", after: "28-14" },
  { label: "#22 Sam Tackle Solo tackles", before: "3", after: "4" },
]);
assert.equal(isAfterGame(changed), true);
assert.equal(isAfterGame(row({ action: "game_ended", game_status: "completed" })), false);
assert.equal(isAfterGame(row({ action: "play_edited", game_status: "live" })), false);
assert.equal(isAfterGame(row({ action: "play_deleted", game_status: "completed" })), true);

// Who: the email, else a plain word for the database itself.
assert.equal(actorLabel({ actor_email: "coach@test", actor_name: null, actor_id: "u" }), "coach@test");
assert.equal(actorLabel({ actor_email: null, actor_name: null, actor_id: null }), "Outside the app (database)");

console.log("changeLog: all checks passed");
