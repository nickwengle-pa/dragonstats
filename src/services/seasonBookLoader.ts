/**
 * Fetching a season for the Season Stats screen and the Season Book.
 *
 * Each game's plays, roster and opponent are read once (loadGameStatsInputs);
 * everything after that is computed on the device from what was read. A game
 * with no plays still comes back, so the schedule and the record stay whole,
 * with no stats to show.
 */

import { supabase } from "@/lib/supabase";
import { loadGameStatsInputs, type RosterCache } from "./statsService";
import type { BookGame, BookGameMeta } from "./seasonBook";

/** Games read at once. Enough to overlap the round trips on press-box wifi
 *  without asking the server for a whole season in one burst. */
const PARALLEL = 3;

export async function loadSeasonGames(
  seasonId: string,
  options: { statuses?: string[]; onProgress?: (done: number, total: number) => void; signal?: { cancelled: boolean } } = {},
): Promise<BookGame[]> {
  const statuses = options.statuses ?? ["completed", "live"];
  const { data, error } = await supabase
    .from("games")
    .select("id, game_date, kickoff_time, status, is_home, our_score, opponent_score, opponent:opponents(name, abbreviation, primary_color, logo_url)")
    .eq("season_id", seasonId)
    .in("status", statuses)
    .order("game_date", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, any>>;
  const metas: BookGameMeta[] = rows.map(row => {
    const opp = (row.opponent ?? {}) as { name?: string; abbreviation?: string | null; primary_color?: string | null; logo_url?: string | null };
    const name = opp.name ?? "Opponent";
    return {
      id: String(row.id),
      date: row.game_date ?? null,
      kickoff: row.kickoff_time ?? null,
      opponentName: name,
      opponentAbbr: opp.abbreviation?.trim() || name.slice(0, 3).toUpperCase(),
      opponentColor: opp.primary_color ?? "#6b7280",
      opponentLogo: opp.logo_url ?? null,
      isHome: Boolean(row.is_home),
      ourScore: Number(row.our_score ?? 0),
      theirScore: Number(row.opponent_score ?? 0),
      status: String(row.status ?? ""),
    };
  });

  const rosters: RosterCache = new Map();
  const games: BookGame[] = metas.map((meta, i) => ({ meta, number: i + 1, inputs: null, periods: new Map() }));
  let done = 0;
  options.onProgress?.(0, games.length);
  let next = 0;
  const worker = async () => {
    while (next < games.length) {
      if (options.signal?.cancelled) return;
      const game = games[next++];
      const inputs = await loadGameStatsInputs(game.meta.id, rosters);
      game.inputs = inputs && inputs.plays.length > 0 ? inputs : null;
      done += 1;
      options.onProgress?.(done, games.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, games.length) }, worker));
  return games;
}
