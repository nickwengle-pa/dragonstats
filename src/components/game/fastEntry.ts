import type { TaggedPlayer } from "./types";

export const FAST_PLAY_IDS = new Set(["rush", "bad_snap", "pass_comp", "pass_inc", "sack"]);

/** Replacing an unidentified tackle must not create an extra assist. */
export function toggleFastTackler(current: TaggedPlayer[], pick: TaggedPlayer): TaggedPlayer[] {
  const named = current.filter(t => !t.isTeam && t.player_id !== "opp_team");
  const exists = named.some(t => t.player_id === pick.player_id && !!t.isOpponent === !!pick.isOpponent);
  const next = exists
    ? named.filter(t => !(t.player_id === pick.player_id && !!t.isOpponent === !!pick.isOpponent))
    : named.length < 3 ? [...named, pick] : named;
  return next.map(t => ({ ...t, credit: next.length === 1 ? 1 : 0.5 }));
}
