/**
 * Pending (unrostered) player resolution.
 *
 * During a game, a jersey number nobody is rostered under gets recorded as a
 * "pending" tag inside `play_data.pending_tagged` — it can't go in
 * `play_players` because there's no `players` row to point at. This service
 * finds those tags after the fact and resolves them one of three ways:
 *
 *   merge   — it was really an existing player (typo, or a jersey swap)
 *   promote — a genuinely new player; create them, then merge
 *   discard — shouldn't exist; drop the tags
 *
 * Every operation is per-play and idempotent: re-running after a partial
 * failure re-does only what's still pending, so a retry is always safe.
 */

import { supabase } from "@/lib/supabase";
import { pendingJerseyFromId } from "@/components/game/types";

export interface PendingTagRow {
  id: string;
  jersey_number: number | null;
  role: string;
  credit: number | null;
}

export interface PendingPlayerSummary {
  /** "pending_42" */
  pendingId: string;
  jersey: number | null;
  /** How many individual role-tags across all plays. */
  tagCount: number;
  /** Distinct plays involved. */
  playCount: number;
  /** Roles seen, most frequent first — "rusher, tackler". */
  roles: string[];
  /** Opponent names of the games involved, for context. */
  games: string[];
}

interface PlayWithPending {
  id: string;
  game_id: string;
  play_data: Record<string, unknown>;
  pending: PendingTagRow[];
}

export interface ResolveResult {
  ok: boolean;
  playsUpdated: number;
  error?: string;
}

function readPendingTags(playData: unknown): PendingTagRow[] {
  const raw = (playData as Record<string, unknown> | null)?.pending_tagged;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const t = entry as Record<string, unknown>;
      const id = typeof t.id === "string" ? t.id : null;
      if (!id) return null;
      return {
        id,
        jersey_number: typeof t.jersey_number === "number"
          ? t.jersey_number
          : pendingJerseyFromId(id),
        role: typeof t.role === "string" ? t.role : "",
        credit: typeof t.credit === "number" ? t.credit : null,
      } as PendingTagRow;
    })
    .filter((t): t is PendingTagRow => t !== null);
}

/**
 * Every play in a season carrying at least one pending tag.
 *
 * Deliberately scans the season's plays client-side rather than filtering on
 * JSONB: the row count for one season is small, and a plain scan can't go
 * stale against the Danger Zone's cascades the way a cached count could.
 */
async function loadSeasonPendingPlays(seasonId: string): Promise<{
  plays: PlayWithPending[];
  gameNameById: Record<string, string>;
}> {
  const { data: games } = await supabase
    .from("games")
    .select("id, opponent:opponents(name)")
    .eq("season_id", seasonId);

  const gameIds = (games ?? []).map((g) => (g as any).id as string);
  const gameNameById: Record<string, string> = {};
  for (const g of (games ?? []) as any[]) {
    gameNameById[g.id] = g.opponent?.name ?? "Opponent";
  }
  if (gameIds.length === 0) return { plays: [], gameNameById };

  const { data: rows } = await supabase
    .from("plays")
    .select("id, game_id, play_data")
    .in("game_id", gameIds);

  const plays: PlayWithPending[] = [];
  for (const row of (rows ?? []) as any[]) {
    const pending = readPendingTags(row.play_data);
    if (pending.length > 0) {
      plays.push({
        id: row.id,
        game_id: row.game_id,
        play_data: (row.play_data ?? {}) as Record<string, unknown>,
        pending,
      });
    }
  }
  return { plays, gameNameById };
}

/** Group a season's pending tags into one summary per jersey. */
export async function loadPendingPlayers(seasonId: string): Promise<PendingPlayerSummary[]> {
  const { plays, gameNameById } = await loadSeasonPendingPlays(seasonId);

  const byPendingId = new Map<string, {
    jersey: number | null;
    tagCount: number;
    playIds: Set<string>;
    roleCounts: Map<string, number>;
    games: Set<string>;
  }>();

  for (const play of plays) {
    for (const tag of play.pending) {
      let entry = byPendingId.get(tag.id);
      if (!entry) {
        entry = {
          jersey: tag.jersey_number,
          tagCount: 0,
          playIds: new Set(),
          roleCounts: new Map(),
          games: new Set(),
        };
        byPendingId.set(tag.id, entry);
      }
      entry.tagCount += 1;
      entry.playIds.add(play.id);
      entry.roleCounts.set(tag.role, (entry.roleCounts.get(tag.role) ?? 0) + 1);
      entry.games.add(gameNameById[play.game_id] ?? "Opponent");
    }
  }

  return [...byPendingId.entries()]
    .map(([pendingId, entry]) => ({
      pendingId,
      jersey: entry.jersey,
      tagCount: entry.tagCount,
      playCount: entry.playIds.size,
      roles: [...entry.roleCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([role]) => role),
      games: [...entry.games],
    }))
    .sort((a, b) => (a.jersey ?? 999) - (b.jersey ?? 999));
}

/** Strip one pending id out of a play's pending_tagged array. */
function withoutPendingId(playData: Record<string, unknown>, pendingId: string) {
  const remaining = readPendingTags(playData).filter((t) => t.id !== pendingId);
  return { ...playData, pending_tagged: remaining };
}

/**
 * Move every tag for one pending id onto a real player.
 *
 * play_players has UNIQUE(play_id, player_id, role), so an insert that would
 * collide (the target player was already tagged in that role on that play) is
 * skipped — the pending entry still gets dropped, which is the intent either
 * way. Upsert with ignoreDuplicates does this in one round trip.
 */
export async function mergePendingIntoPlayer(
  seasonId: string,
  pendingId: string,
  playerId: string,
): Promise<ResolveResult> {
  const { plays } = await loadSeasonPendingPlays(seasonId);
  const affected = plays.filter((p) => p.pending.some((t) => t.id === pendingId));

  let updated = 0;
  for (const play of affected) {
    const tags = play.pending.filter((t) => t.id === pendingId);
    const rows = tags.map((t) => ({
      play_id: play.id,
      player_id: playerId,
      role: t.role,
      credit: t.credit,
    }));

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from("play_players")
        .upsert(rows, { onConflict: "play_id,player_id,role", ignoreDuplicates: true });
      if (insertErr) {
        return { ok: false, playsUpdated: updated, error: insertErr.message };
      }
    }

    const { error: updateErr } = await supabase
      .from("plays")
      .update({ play_data: withoutPendingId(play.play_data, pendingId) })
      .eq("id", play.id);
    if (updateErr) {
      return { ok: false, playsUpdated: updated, error: updateErr.message };
    }
    updated += 1;
  }

  return { ok: true, playsUpdated: updated };
}

/** Drop every tag for one pending id. Stats become untagged. */
export async function discardPending(
  seasonId: string,
  pendingId: string,
): Promise<ResolveResult> {
  const { plays } = await loadSeasonPendingPlays(seasonId);
  const affected = plays.filter((p) => p.pending.some((t) => t.id === pendingId));

  let updated = 0;
  for (const play of affected) {
    const { error } = await supabase
      .from("plays")
      .update({ play_data: withoutPendingId(play.play_data, pendingId) })
      .eq("id", play.id);
    if (error) return { ok: false, playsUpdated: updated, error: error.message };
    updated += 1;
  }

  return { ok: true, playsUpdated: updated };
}

/**
 * Create a real player from a pending jersey, add them to the season roster,
 * then merge the pending tags onto them.
 */
export async function promotePendingToPlayer(
  seasonId: string,
  programId: string,
  pendingId: string,
  details: { firstName: string; lastName: string; position?: string | null; jersey: number | null },
): Promise<ResolveResult> {
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .insert({
      program_id: programId,
      first_name: details.firstName,
      last_name: details.lastName,
    })
    .select()
    .single();

  if (playerErr || !player) {
    return { ok: false, playsUpdated: 0, error: playerErr?.message ?? "Could not create the player." };
  }

  const { error: rosterErr } = await supabase.from("season_rosters").insert({
    season_id: seasonId,
    player_id: player.id,
    jersey_number: details.jersey,
    position: details.position || null,
    is_active: true,
  });

  if (rosterErr) {
    // The player exists but isn't on the roster — surface it rather than
    // merging tags onto someone who won't show up in the roster list.
    return { ok: false, playsUpdated: 0, error: `Player created, but adding to the roster failed: ${rosterErr.message}` };
  }

  return mergePendingIntoPlayer(seasonId, pendingId, player.id);
}
