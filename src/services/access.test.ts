/**
 * Run with: node src/services/access.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * The app's copy of the role rules. The database enforces them
 * (supabase/tests/program_roles.sql checks that side); this checks the screens
 * hide the same things, and that the two cases that cost a game night stay
 * open: an old 'member' row and a role this device never cached both record.
 */
import assert from "node:assert/strict";
import { normalizeRole, permissionsFor, canEditGameStats, readOnlyReason } from "./access.ts";

// Rows written before the migration ran still map to a role.
assert.equal(normalizeRole("owner"), "admin");
assert.equal(normalizeRole("member"), "assistant");
assert.equal(normalizeRole("head_coach"), "head_coach");
assert.equal(normalizeRole(null), null);
// Anything unrecognised gets the least access, not the most.
assert.equal(normalizeRole("superuser"), "staff");

const admin = permissionsFor("admin");
const head = permissionsFor("head_coach");
const asst = permissionsFor("assistant");
const staff = permissionsFor("staff");
const unknown = permissionsFor(null);

// The final lock.
for (const status of ["scheduled", "live", "completed"]) {
  assert.equal(canEditGameStats(admin, status), true, `admin ${status}`);
  assert.equal(canEditGameStats(head, status), true, `head coach ${status}`);
  assert.equal(canEditGameStats(staff, status), false, `staff ${status}`);
}
assert.equal(canEditGameStats(asst, "live"), true);
assert.equal(canEditGameStats(asst, null), true);
assert.equal(canEditGameStats(asst, "completed"), false);
assert.equal(canEditGameStats(asst, "cancelled"), false);
assert.equal(canEditGameStats(head, "cancelled"), true);

// Offline on a device that never cached the role: the scorekeeper keeps
// recording, but nothing that manages the program is offered.
assert.equal(canEditGameStats(unknown, "live"), true);
assert.equal(unknown.managePeople, false);
assert.equal(unknown.dangerZone, false);
assert.equal(unknown.editProgram, false);

// Who may hand out which role. A head coach can't make an admin.
assert.deepEqual([...admin.assignableRoles], ["admin", "head_coach", "assistant", "staff"]);
assert.deepEqual([...head.assignableRoles], ["assistant", "staff"]);
assert.deepEqual([...asst.assignableRoles], []);
assert.equal(head.dangerZone, false);
assert.equal(admin.dangerZone, true);

// Staff can look at everything and change nothing.
for (const [key, value] of Object.entries(staff)) {
  if (key === "role" || key === "assignableRoles") continue;
  assert.equal(value, false, `staff.${key}`);
}

// Same role, same object - screens list these as effect dependencies.
assert.equal(permissionsFor("assistant"), permissionsFor("assistant"));

assert.equal(readOnlyReason(head, "completed"), null);
assert.match(readOnlyReason(asst, "completed") ?? "", /final/);
assert.match(readOnlyReason(staff, "live") ?? "", /View only/);
assert.match(readOnlyReason(asst, "cancelled") ?? "", /cancelled/);

console.log("access: all checks passed");
