import type { SyncQueueItem } from "./offlineDb";
import type { PlayWithPlayers } from "./gameService";

/** A queued edit may only contain one changed field. Keep the cached identity
 * and overlay the actual queued values so the operator sees what is owed. */
export function syncPlayDetails(item: SyncQueueItem, cached?: Partial<PlayWithPlayers>) {
  if (item.op === "game") return null;
  const play: Partial<PlayWithPlayers> = {
    ...cached, ...item.payload?.play, ...item.payload?.patch,
  };
  return {
    ...play,
    play_data: { ...cached?.play_data, ...item.payload?.play?.play_data, ...item.payload?.patch?.play_data, ...item.payload?.playData },
  };
}

export const syncOperationLabel = {
  insert: "New play", update: "Play edit", delete: "Play deletion", game: "Game score / situation update",
} as const;
