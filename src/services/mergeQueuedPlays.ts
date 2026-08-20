import type { PlayWithPlayers } from "./gameService";

/**
 * Overlay the sync queue on top of a server play list.
 *
 * A server read is not the whole truth while the queue is non-empty. The
 * server has never seen a queued insert, still holds the pre-edit row for a
 * queued update, and still holds a row that was deleted offline. For any play
 * with unpushed work the local cache is authoritative; everything else comes
 * from the server.
 *
 * This exists because of a specific press-box failure. Plays entered in a dead
 * spot queue up fine, but the moment the tablet caught a bar of service, a
 * refetch would replace the play list with the server's — which did not have
 * them yet — and they vanished from the log. Worse than the disappearance:
 * down, distance, spot and score are all derived by replaying that list, so
 * they silently recomputed as if those plays never happened.
 *
 * Pure on purpose: the caller does the IndexedDB reads, so this can be tested
 * without a browser.
 */
export function mergeQueuedPlays(
  serverPlays: PlayWithPlayers[],
  cachedPlays: PlayWithPlayers[],
  upserts: Set<string>,
  deletes: Set<string>,
): PlayWithPlayers[] {
  if (upserts.size === 0 && deletes.size === 0) return serverPlays;

  const cachedById = new Map(cachedPlays.map((p) => [p.id, p]));

  const merged: PlayWithPlayers[] = [];
  const seen = new Set<string>();
  for (const play of serverPlays) {
    if (deletes.has(play.id)) continue;
    // A queued update means the server copy is stale. Fall back to the server
    // copy anyway if the cache somehow lost it — a stale play beats no play.
    merged.push((upserts.has(play.id) ? cachedById.get(play.id) : undefined) ?? play);
    seen.add(play.id);
  }

  // Queued inserts the server has not accepted yet: the plays that used to
  // disappear the moment service came back.
  for (const id of upserts) {
    if (seen.has(id)) continue;
    const local = cachedById.get(id);
    if (local) merged.push(local);
  }

  return merged.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}
