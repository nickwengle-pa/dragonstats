import type { TaggedPlayer } from "./types";

export const FAST_PLAY_IDS = new Set(["rush", "bad_snap", "pass_comp", "pass_inc", "sack"]);

/**
 * Add or remove one tackler, re-splitting the credit: alone is a solo (1),
 * shared is half each.
 *
 * "Identify on film later" is a placeholder for the whole tackle, so a real
 * pick replaces it rather than turning it into an invented assist. TEAM credit
 * the operator confirmed is different - it is a tackler like any other, so it
 * can share a tackle ("#44 and somebody else in the pile": half each).
 */
export function toggleFastTackler(current: TaggedPlayer[], pick: TaggedPlayer): TaggedPlayer[] {
  const isPlaceholder = (t: TaggedPlayer) => (t.isTeam && !t.teamCreditConfirmed) || t.player_id === "opp_team";
  const real = current.filter(t => !isPlaceholder(t));
  const same = (t: TaggedPlayer) => t.player_id === pick.player_id && !!t.isOpponent === !!pick.isOpponent;
  const next = real.some(same)
    ? real.filter(t => !same(t))
    : real.length < 3 ? [...real, pick] : real;
  return next.map(t => ({ ...t, credit: next.length === 1 ? 1 : 0.5 }));
}
