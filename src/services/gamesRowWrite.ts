import { supabase } from "@/lib/supabase";

/* Columns a build may write before its migration has reached the server.
   Only these are dropped on a missing-column error; any other missing column
   is a real fault and must fail loudly. */
const OPTIONAL_COLUMNS = new Set(["final_snapshot", "final_history"]);

/** The patch without the column the server says it lacks, or null to give up. */
export function withoutMissingColumn(
  patch: Record<string, unknown>,
  error: { message?: string } | null,
): Record<string, unknown> | null {
  const missing = String(error?.message ?? "").match(/Could not find the '([^']+)' column/)?.[1];
  if (!missing || !OPTIONAL_COLUMNS.has(missing) || !(missing in patch)) return null;
  const rest = { ...patch };
  delete rest[missing];
  return rest;
}

/**
 * Update the games row.
 *
 * The queue coalesces every patch for a game into one entry, so an official
 * copy riding with the final status would hold the status hostage if the
 * server had no column for the copy - the gap between deploying a build and
 * applying its migration. The copy is dropped instead; the game screen takes
 * a new one the next time the game is opened once the column exists.
 */
export async function updateGamesRow(
  gameId: string,
  patch: Record<string, unknown>,
): Promise<{ error: { code?: string; message?: string } | null }> {
  let current = patch;
  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.size + 1; attempt++) {
    if (Object.keys(current).length === 0) return { error: null };
    const { data, error } = await supabase.from("games").update(current).eq("id", gameId).select("id");
    /* Row-level security answers a refused update with zero rows, not an
       error - say an assistant's queued score patch reaching a game the head
       coach has since made final. Reported as a refusal, so the queue shows
       it instead of marking it saved. */
    if (!error && Array.isArray(data) && data.length === 0) {
      return { error: { code: "42501", message: "The server did not update this game (it may be final, or your role may not allow it)." } };
    }
    if (!error) return { error: null };
    const retry = withoutMissingColumn(current, error);
    if (!retry) return { error };
    console.warn("[games] server has no column for part of this patch yet; saving the rest", error.message);
    current = retry;
  }
  return { error: { message: "games update gave up after dropping optional columns" } };
}
