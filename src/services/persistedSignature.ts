/**
 * What a play looks like in the database, as one comparable string.
 *
 * Every change on the game screen - an edit, an undo, a play slotted into the
 * middle, the Adjust sheet - replays the whole game and used to write every
 * play back, changed or not: about 140 network writes and 140 IndexedDB
 * write-aheads for one fixed tackler late in a game. On press-box wifi the
 * next save queued behind that burst and looked like a dead button. The game
 * screen now remembers what it last wrote (or loaded) for each play and only
 * writes the plays whose stored situation actually moved.
 *
 * jsonb does not keep key order, so keys are sorted before comparing; a play
 * read back from the server and the same play rebuilt here compare equal.
 */
export interface PersistedSituation {
  sequence?: number | null;
  quarter?: number | null;
  clock?: string | null;
  possession?: string | null;
  down?: number | null;
  distance?: number | null;
  yard_line?: number | null;
  end_yard_line?: number | null;
  play_start_time?: number | null;
  play_end_time?: number | null;
  play_data?: unknown;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      // undefined never reaches the server, so it cannot differ there.
      if (v !== undefined) out[key] = stable(v);
    }
    return out;
  }
  return value;
}

export function persistedSignature(row: PersistedSituation): string {
  return JSON.stringify(stable({
    sequence: row.sequence ?? null,
    quarter: row.quarter ?? null,
    clock: row.clock ?? null,
    possession: row.possession ?? null,
    down: row.down ?? null,
    distance: row.distance ?? null,
    yard_line: row.yard_line ?? null,
    end_yard_line: row.end_yard_line ?? null,
    play_start_time: row.play_start_time ?? null,
    play_end_time: row.play_end_time ?? null,
    play_data: row.play_data ?? null,
  }));
}
