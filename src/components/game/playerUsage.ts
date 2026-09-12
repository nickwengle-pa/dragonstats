import type { TaggedPlayer } from "./types";

export type PlayerUsage = Record<string, number>;
const roleGroup = (role: string) => role === "target" ? "receiver" : role;
export function playerUsageKey(role: string, playerId: string, opponent = false) {
  return `${opponent ? "opp" : "us"}:${roleGroup(role)}:${playerId}`;
}

/** Derive from saved plays so reloads, edits, and undo keep the ordering accurate. */
export function countPlayerUsage(plays: Array<{ tagged: TaggedPlayer[] }>): PlayerUsage {
  const counts: PlayerUsage = {};
  for (const play of plays) {
    const seen = new Set<string>();
    for (const tag of play.tagged ?? []) {
      if (tag.isTeam || tag.player_id === "opp_team") continue;
      seen.add(playerUsageKey(tag.role, tag.player_id, tag.isOpponent));
    }
    for (const key of seen) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function playerUseCount(usage: PlayerUsage | undefined, role: string, playerId: string, opponent = false) {
  return usage?.[playerUsageKey(role, playerId, opponent)] ?? 0;
}
