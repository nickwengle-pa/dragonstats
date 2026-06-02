/**
 * Post-game film-charting layer.
 *
 * This service is ADDITIVE: it reads and writes ONLY the `play_charting` table
 * and never touches `plays`, `play_players`, or the live game workflow. Each
 * row is an optional bundle of film-review detail for one play, keyed by
 * play_id, added by a coach during film breakdown.
 */

import { supabase } from "@/lib/supabase";

export interface PlayCharting {
  id?: string;
  play_id: string;
  game_id: string;
  hash_mark: string | null;
  personnel: string | null;
  offensive_formation: string | null;
  defensive_formation: string | null;
  motion: string | null;
  play_call: string | null;
  passer: string | null;
  receiver: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

/** The editable subset (everything except server-managed columns). */
export type PlayChartingDraft = Omit<PlayCharting, "id" | "created_at" | "updated_at">;

/**
 * Load all charting rows for a game, keyed by play_id for O(1) lookup while
 * rendering the play list. Returns an empty map on error so the review screen
 * still renders the (read-only) live play data.
 */
export async function loadGameCharting(
  gameId: string,
): Promise<Record<string, PlayCharting>> {
  const { data, error } = await supabase
    .from("play_charting")
    .select("*")
    .eq("game_id", gameId);

  if (error) {
    console.warn("loadGameCharting failed:", error);
    return {};
  }

  const byPlay: Record<string, PlayCharting> = {};
  for (const row of (data ?? []) as PlayCharting[]) {
    byPlay[row.play_id] = row;
  }
  return byPlay;
}

/**
 * Insert or update a play's charting row. Upserts on the unique play_id so a
 * coach can edit the same play repeatedly. Empty strings / empty arrays are
 * stored as NULL to keep rows clean. Returns the saved row, or null on failure.
 */
export async function saveCharting(
  draft: PlayChartingDraft,
): Promise<PlayCharting | null> {
  const payload: Record<string, unknown> = { ...draft };

  for (const key of Object.keys(payload)) {
    if (payload[key] === "" || payload[key] === undefined) {
      payload[key] = null;
    }
  }
  if (Array.isArray(payload.tags) && (payload.tags as string[]).length === 0) {
    payload.tags = null;
  }

  const { data, error } = await supabase
    .from("play_charting")
    .upsert(payload, { onConflict: "play_id" })
    .select()
    .single();

  if (error) {
    console.error("saveCharting failed:", error);
    return null;
  }
  return data as PlayCharting;
}

/**
 * Derive a readable personnel breakdown from a grouping code.
 * "11" → "1 RB · 1 TE · 3 WR" (WR = 5 − backs − TEs). Returns null when the
 * input isn't a standard two-digit code.
 */
export function describePersonnel(
  personnel: string | null | undefined,
): string | null {
  if (!personnel) return null;
  const digits = personnel.replace(/\D/g, "");
  if (digits.length !== 2) return null;
  const backs = Number(digits[0]);
  const tes = Number(digits[1]);
  const wrs = 5 - backs - tes;
  if (wrs < 0) return null;
  return `${backs} RB · ${tes} TE · ${wrs} WR`;
}

/** True when a charting row carries any meaningful film detail. */
export function hasChartingDetail(c: PlayCharting | undefined): boolean {
  if (!c) return false;
  return Boolean(
    c.hash_mark ||
      c.personnel ||
      c.offensive_formation ||
      c.defensive_formation ||
      c.motion ||
      c.play_call ||
      c.passer ||
      c.receiver ||
      c.notes ||
      (c.tags && c.tags.length > 0),
  );
}
