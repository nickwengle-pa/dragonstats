import type { SyncQueueItem } from "./offlineDb";

export function sameSyncEntity(a: SyncQueueItem, b: SyncQueueItem): boolean {
  return a.playId === b.playId && (a.op === "game") === (b.op === "game");
}

/** Never discard a newer edit or a write already in flight. */
export function canDiscardSnapshot(expected: SyncQueueItem[], current: SyncQueueItem[]): boolean {
  return expected.length > 0 && current.length === expected.length && current.every(item =>
    item.status !== "syncing" && expected.some(old => old.id === item.id && JSON.stringify(old) === JSON.stringify(item)),
  );
}
