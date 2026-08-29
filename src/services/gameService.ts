import { supabase } from "@/lib/supabase";
import {
  advanceSituationAfterPlay,
  createInitialSituation,
  getRecordedNextSituation,
  normalizeQuarter,
  type PregameConfig,
} from "./gameFlow";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "./programService";
import { mergeQueuedPlays } from "./mergeQueuedPlays";

const APP_META_KEY = "_dragonstats";
const LIVE_STATE_VERSION = 1;

type RulesConfig = Record<string, unknown>;

function asRecord(value: unknown): RulesConfig | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RulesConfig
    : null;
}

export function withManagedLiveState(
  rulesConfig: RulesConfig | null | undefined,
): RulesConfig {
  const nextRules = { ...(rulesConfig ?? {}) };
  const currentMeta = asRecord(nextRules[APP_META_KEY]);

  nextRules[APP_META_KEY] = {
    ...(currentMeta ?? {}),
    liveStateVersion: LIVE_STATE_VERSION,
  };

  return nextRules;
}

export function hasManagedLiveState(
  rulesConfig: RulesConfig | null | undefined,
): boolean {
  const meta = asRecord(asRecord(rulesConfig)?.[APP_META_KEY]);
  return Number(meta?.liveStateVersion) >= LIVE_STATE_VERSION;
}

/* ─────────────────────────────────────────────
   Types — match your Supabase schema
   ───────────────────────────────────────────── */

export interface PlayInsert {
  game_id: string;
  quarter: number;
  clock: string | null;           // "11:42" text format
  possession: "us" | "them";
  down: number;
  distance: number;
  yard_line: number;
  play_type: string;              // "rush" | "pass_comp" | "pass_inc" | "sack" | etc.
  play_data: Record<string, any>; // extra structured data
  yards_gained: number;
  is_touchdown: boolean;
  is_turnover: boolean;
  is_penalty: boolean;
  primary_player_id?: string | null;
  description: string;
  // Extended fields (FSA merge)
  end_yard_line?: number | null;
  hash_mark?: string | null;            // "left" | "middle" | "right"
  offensive_formation?: string | null;
  defensive_formation?: string | null;
  play_start_time?: number | null;      // clock seconds at snap
  play_end_time?: number | null;        // clock seconds at whistle
  tags?: string[] | null;
}

export interface PlayPlayerInsert {
  play_id: string;
  player_id: string;
  role: string;             // "rusher" | "passer" | "receiver" | "tackler" | "sacker" | "interceptor" | "fumble_recovery" | "pass_rusher" | "kicker" | "punter" | "returner" | etc.
  credit?: number | null;  // tackle weighting: 1.0 solo, 0.5 shared
}

export interface PlayRow extends PlayInsert {
  id: string;
  sequence: number;
  created_at: string;
}

export interface PlayPlayerRow extends PlayPlayerInsert {
  id: string;
}

export interface CurrentGameStateUpdate {
  quarter: number;
  clock: string | null;
  possession: "us" | "them";
  down: number;
  distance: number;
  yard_line: number;
}

/* ─────────────────────────────────────────────
   Insert a play + its tagged players
   Offline-safe: writes to local IndexedDB cache first, attempts network,
   queues for later if offline. Always returns the locally-constructed
   PlayRow so callers see a consistent saved state.
   ───────────────────────────────────────────── */

function genUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Minimal RFC4122 v4 fallback.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function nextSequenceFor(gameId: string): Promise<number> {
  // Prefer the local cache to compute sequence — survives offline.
  try {
    const { getCachedPlays } = await import("./offlineDb");
    const cached = await getCachedPlays(gameId);
    const maxLocal = cached.reduce((m, p) => Math.max(m, p.sequence ?? 0), 0);
    if (maxLocal > 0) return maxLocal + 1;
  } catch { /* fall through to network */ }

  try {
    const { count } = await supabase
      .from("plays")
      .select("*", { count: "exact", head: true })
      .eq("game_id", gameId);
    return (count ?? 0) + 1;
  } catch {
    return 1;
  }
}

export interface InsertPlayOptions {
  /** Return as soon as the play is in the local cache and push to Supabase in
   *  the background. The row carries a client-generated id, so the optimistic
   *  row and the eventual server row are the same row. Use this on live entry:
   *  a press-box round trip must not hold the play modal open. */
  optimistic?: boolean;
}

export async function insertPlay(
  play: PlayInsert,
  players: Omit<PlayPlayerInsert, "play_id">[],
  options: InsertPlayOptions = {}
): Promise<PlayRow | null> {
  // Lazy-import to avoid pulling offlineDb into modules that don't need it.
  const { cachePlay, enqueueInsert, isOfflineSupported } = await import("./offlineDb");
  const { refreshSyncStatus } = await import("./syncWorker");

  const playId = genUuid();
  const sequence = await nextSequenceFor(play.game_id);
  const now = new Date().toISOString();

  // Build the row we want everywhere (cache, network, return value).
  const insertData: Record<string, unknown> = { ...play, id: playId, sequence };
  for (const key of Object.keys(insertData)) {
    if (insertData[key] === undefined) delete insertData[key];
  }

  const playerRows: PlayPlayerInsert[] = players.map((p) => ({
    play_id: playId,
    player_id: p.player_id,
    role: p.role,
    credit: p.credit ?? null,
  }));

  const localRow: PlayRow = {
    ...(insertData as unknown as PlayRow),
    created_at: now,
  };

  const queueIt = async () => {
    await enqueueInsert({
      gameId: play.game_id,
      playId,
      play: insertData as unknown as PlayInsert,
      players: playerRows as unknown as Array<Record<string, unknown>>,
    });
    await refreshSyncStatus();
  };

  // 1) Cache locally with denormalized player rows so reads work offline.
  if (isOfflineSupported()) {
    const cachedShape: PlayWithPlayers = {
      ...localRow,
      play_players: playerRows.map((pp) => ({ ...pp, id: genUuid(), player: undefined })),
    };
    await cachePlay(cachedShape);
  }

  // 2) Push to the server. Returns the server row on success, null when the
  //    write failed (or we're offline) and the play went to the sync queue.
  const push = async (): Promise<PlayRow | null> => {
    const goOnline = typeof navigator === "undefined" || navigator.onLine;
    if (goOnline) {
      try {
        const { data: playRow, error: playErr } = await supabase
          .from("plays")
          .upsert(insertData, { onConflict: "id" })
          .select()
          .single();

        if (!playErr && playRow) {
          if (playerRows.length > 0) {
            // No delete-before-insert: `playId` was generated a few lines up,
            // so there is nothing stale to clear. Retries go through the sync
            // queue, and `pushItem` there does clear tags before re-inserting.
            const { error: ppErr } = await supabase.from("play_players").insert(playerRows);
            if (ppErr) {
              console.warn("play_players insert failed; queueing for retry:", ppErr);
              await queueIt();
              return playRow as PlayRow;
            }
          }
          await refreshSyncStatus();
          return playRow as PlayRow;
        }
        console.warn("insertPlay network failed, queueing:", playErr);
      } catch (err) {
        console.warn("insertPlay network threw, queueing:", err);
      }
    }

    // 3) Queue for later sync.
    await queueIt();
    return null;
  };

  // Live entry returns on the local write and syncs behind the operator;
  // callers that need the server version of the row still wait for it.
  // The IndexedDB guard matters: without a cached local row, the next play
  // has nothing to take its sequence from and two plays claim the same one.
  if (options.optimistic && isOfflineSupported()) {
    void push().catch((err) => console.warn("insertPlay background push threw:", err));
    return localRow;
  }

  return (await push()) ?? localRow;
}

/* ─────────────────────────────────────────────
   Delete the last play (undo)
   Removes play_players first, then the play.
   ───────────────────────────────────────────── */

export async function deletePlay(playId: string, gameId?: string): Promise<boolean> {
  const { deleteCachedPlay, enqueueDelete } = await import("./offlineDb");
  const { refreshSyncStatus } = await import("./syncWorker");

  // Always remove from local cache first so the UI updates immediately.
  await deleteCachedPlay(playId);

  const goOnline = typeof navigator === "undefined" || navigator.onLine;
  if (goOnline) {
    try {
      await supabase.from("play_players").delete().eq("play_id", playId);
      const { error } = await supabase.from("plays").delete().eq("id", playId);
      if (!error) {
        await refreshSyncStatus();
        return true;
      }
      console.warn("deletePlay network failed, queueing:", error);
    } catch (err) {
      console.warn("deletePlay network threw, queueing:", err);
    }
  }

  await enqueueDelete({ gameId: gameId ?? "", playId });
  await refreshSyncStatus();
  return true;
}

/* ─────────────────────────────────────────────
   Load all plays for a game (resume support)
   Returns plays in sequence order with their
   tagged players attached.
   ───────────────────────────────────────────── */

export interface PlayWithPlayers extends PlayRow {
  play_players: (PlayPlayerRow & {
    player?: { first_name: string; last_name: string };
  })[];
}

export async function loadGamePlays(gameId: string): Promise<PlayWithPlayers[]> {
  const { cachePlays, getCachedPlays, getQueuedPlayIds, isOfflineSupported } =
    await import("./offlineDb");

  const goOnline = typeof navigator === "undefined" || navigator.onLine;
  if (goOnline) {
    try {
      const { data, error } = await supabase
        .from("plays")
        .select(`
          *,
          play_players (
            *,
            player:players ( first_name, last_name )
          )
        `)
        .eq("game_id", gameId)
        .order("sequence", { ascending: true });

      if (!error && data) {
        const serverPlays = data as PlayWithPlayers[];
        if (!isOfflineSupported()) return serverPlays;

        const { upserts, deletes } = await getQueuedPlayIds(gameId);

        // Refresh local cache so offline reads stay fresh — but skip any play
        // with unpushed work, or the stale server copy clobbers the newer
        // local one and the edit is lost the moment the queue drains.
        await cachePlays(
          serverPlays.filter((p) => !upserts.has(p.id) && !deletes.has(p.id)),
        );

        if (upserts.size === 0 && deletes.size === 0) return serverPlays;
        return mergeQueuedPlays(
          serverPlays,
          await getCachedPlays(gameId),
          upserts,
          deletes,
        );
      }
      console.warn("loadGamePlays network failed, falling back to cache:", error);
    } catch (err) {
      console.warn("loadGamePlays network threw, falling back to cache:", err);
    }
  }

  // Offline or network failed — read from local cache.
  if (isOfflineSupported()) {
    return await getCachedPlays(gameId);
  }
  return [];
}

/* ─────────────────────────────────────────────
   Sync score to the games table
   Call after each scoring play or undo.
   ───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   Update a play's core fields after the fact
   ───────────────────────────────────────────── */

export async function updatePlay(
  playId: string,
  fields: {
    yards_gained?: number;
    is_touchdown?: boolean;
    is_penalty?: boolean;
    description?: string;
  },
  playDataPatch?: Record<string, unknown>
): Promise<boolean> {
  const { updateCachedPlay, enqueueUpdate, isOfflineSupported, getCachedPlays } = await import("./offlineDb");
  const { refreshSyncStatus } = await import("./syncWorker");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateObj: Record<string, any> = { ...fields };

  // For the cache patch we need the merged play_data; compute it from cache
  // (or from network if available) so the local view is consistent.
  let mergedPlayData: Record<string, unknown> | undefined;
  if (playDataPatch) {
    // Try cache first
    if (isOfflineSupported()) {
      try {
        // Read cached play to find current play_data
        const cached = await getCachedPlays((fields as { game_id?: string }).game_id ?? "");
        const found = cached.find((p) => p.id === playId);
        if (found?.play_data) {
          mergedPlayData = { ...(found.play_data as Record<string, unknown>), ...playDataPatch };
        }
      } catch { /* ignore */ }
    }
    if (!mergedPlayData) {
      try {
        const { data } = await supabase
          .from("plays")
          .select("play_data")
          .eq("id", playId)
          .single();
        if (data) {
          mergedPlayData = {
            ...(data.play_data as Record<string, unknown>),
            ...playDataPatch,
          };
        }
      } catch { /* offline */ }
    }
    if (mergedPlayData) updateObj.play_data = mergedPlayData;
  }

  // Apply to cache immediately.
  await updateCachedPlay(playId, updateObj);

  const goOnline = typeof navigator === "undefined" || navigator.onLine;
  if (goOnline) {
    try {
      const { error } = await supabase.from("plays").update(updateObj).eq("id", playId);
      if (!error) {
        await refreshSyncStatus();
        return true;
      }
      console.warn("updatePlay network failed, queueing:", error);
    } catch (err) {
      console.warn("updatePlay network threw, queueing:", err);
    }
  }

  await enqueueUpdate({ gameId: "", playId, patch: updateObj, playData: mergedPlayData });
  await refreshSyncStatus();
  return true;
}

/* ─────────────────────────────────────────────
   Full play edit — update ALL play fields and
   replace play_players in one operation.
   ───────────────────────────────────────────── */

export async function updatePlayFull(
  playId: string,
  fields: {
    play_type?: string;
    quarter?: number;
    clock?: string | null;
    possession?: "us" | "them";
    down?: number;
    distance?: number;
    yard_line?: number;
    yards_gained?: number;
    is_touchdown?: boolean;
    is_turnover?: boolean;
    is_penalty?: boolean;
    primary_player_id?: string | null;
    description?: string;
    offensive_formation?: string | null;
    defensive_formation?: string | null;
    hash_mark?: string | null;
    play_data?: Record<string, unknown>;
  },
  players: { player_id: string; role: string; credit?: number | null }[],
  gameId?: string,
): Promise<boolean> {
  const { updateCachedPlay, enqueueUpdate } = await import("./offlineDb");
  const { refreshSyncStatus } = await import("./syncWorker");

  // Strip undefined optional fields to avoid missing-column errors.
  const cleanFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) cleanFields[k] = v;
  }

  const rows: PlayPlayerInsert[] = players.map((p) => ({
    play_id: playId,
    player_id: p.player_id,
    role: p.role,
    credit: p.credit ?? null,
  }));

  // Patch the local cache first so the corrected play reads back correctly
  // even with no network — same order insertPlay and deletePlay use.
  await updateCachedPlay(playId, {
    ...cleanFields,
    play_players: rows.map((r) => ({ ...r, id: genUuid(), player: undefined })),
  } as unknown as Partial<PlayWithPlayers>);

  const goOnline = typeof navigator === "undefined" || navigator.onLine;
  if (goOnline) {
    try {
      const { error: updateErr } = await supabase
        .from("plays")
        .update(cleanFields)
        .eq("id", playId);

      if (!updateErr) {
        // Replace the tag set wholesale — an edit can add, remove, or re-role
        // players, so a partial merge would leave stale credit behind.
        const { error: deleteErr } = await supabase
          .from("play_players")
          .delete()
          .eq("play_id", playId);

        if (!deleteErr) {
          if (rows.length === 0) {
            await refreshSyncStatus();
            return true;
          }
          const { error: insertErr } = await supabase.from("play_players").insert(rows);
          if (!insertErr) {
            await refreshSyncStatus();
            return true;
          }
          console.warn("updatePlayFull play_players insert failed, queueing:", insertErr);
        } else {
          console.warn("updatePlayFull play_players delete failed, queueing:", deleteErr);
        }
      } else {
        console.warn("updatePlayFull network failed, queueing:", updateErr);
      }
    } catch (err) {
      console.warn("updatePlayFull threw, queueing:", err);
    }
  }

  // Offline, or the write failed partway: queue it. The edit is already in the
  // local cache, so the UI stays correct and the sync badge shows it pending.
  // Previously this path returned false and the edit was silently discarded.
  await enqueueUpdate({
    gameId: gameId ?? "",
    playId,
    patch: cleanFields,
    players: rows as unknown as Array<Record<string, unknown>>,
  });
  await refreshSyncStatus();

  return true;
}

export interface UpdatePlaySituationOptions {
  /** Game the play belongs to. Required for an offline edit to ever sync —
   *  the queue drains by game, so an entry filed under "" is invisible. */
  gameId?: string;
  /** Return once the cache is patched and push in the background. */
  optimistic?: boolean;
}

export async function updatePlaySituation(
  playId: string,
  fields: {
    possession: "us" | "them";
    down: number;
    distance: number;
    yard_line: number;
    quarter?: number;
    clock?: string | null;
    end_yard_line?: number | null;
    play_start_time?: number | null;
    play_end_time?: number | null;
  },
  playData?: Record<string, unknown>,
  options: UpdatePlaySituationOptions = {},
): Promise<boolean> {
  const { updateCachedPlay, enqueueUpdate } = await import("./offlineDb");
  const { refreshSyncStatus } = await import("./syncWorker");

  const updateObj: Record<string, unknown> = { ...fields };
  if (playData) {
    updateObj.play_data = playData;
  }

  for (const [key, value] of Object.entries(updateObj)) {
    if (value === undefined) {
      delete updateObj[key];
    }
  }

  // Patch the cache so the offline UI shows the corrected situation.
  await updateCachedPlay(playId, updateObj);

  const push = async (): Promise<boolean> => {
    const goOnline = typeof navigator === "undefined" || navigator.onLine;
    if (goOnline) {
      try {
        const { error } = await supabase
          .from("plays")
          .update(updateObj)
          .eq("id", playId);

        if (!error) {
          await refreshSyncStatus();
          return true;
        }
        console.warn("updatePlaySituation network failed, queueing:", error);
      } catch (err) {
        console.warn("updatePlaySituation network threw, queueing:", err);
      }
    }

    await enqueueUpdate({ gameId: options.gameId ?? "", playId, patch: updateObj, playData });
    await refreshSyncStatus();
    return true;
  };

  if (options.optimistic) {
    void push().catch((err) => console.warn("updatePlaySituation background push threw:", err));
    return true;
  }

  return push();
}

export async function updateCurrentGameState(
  gameId: string,
  state: CurrentGameStateUpdate,
  rulesConfig?: RulesConfig | null,
): Promise<boolean> {
  const updateObj: Record<string, unknown> = {
    current_quarter: normalizeQuarter(state.quarter),
    current_clock: state.clock,
    current_possession: state.possession,
    current_down: state.down,
    current_distance: state.distance,
    current_yard_line: state.yard_line,
  };

  if (rulesConfig !== undefined) {
    updateObj.rules_config = withManagedLiveState(rulesConfig);
  }

  const { error } = await supabase
    .from("games")
    .update(updateObj)
    .eq("id", gameId);

  if (error) {
    console.error("Failed to update current game state:", error);
    return false;
  }

  return true;
}

export async function updateGameScore(
  gameId: string,
  ourScore: number,
  theirScore: number,
  status: "scheduled" | "live" | "completed" | "cancelled" = "live"
): Promise<void> {
  const { error } = await supabase
    .from("games")
    .update({
      our_score: ourScore,
      opponent_score: theirScore,
      status,
    })
    .eq("id", gameId);

  if (error) console.error("Failed to update game score:", error);
}

/* ─────────────────────────────────────────────
   Derive game state from stored plays
   Use when resuming a game to restore down,
   distance, ball position, and score.
   ───────────────────────────────────────────── */

export interface ResumedGameState {
  quarter: number;
  clock: number;
  possession: "us" | "them";
  ourScore: number;
  theirScore: number;
  down: number;
  distance: number;
  ballOn: number;
}

function clockToSeconds(clock: string | null, fallback: number): number {
  if (!clock) return fallback;

  const [mins, secs] = clock.split(":").map(Number);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return fallback;
  return mins * 60 + secs;
}

export function deriveGameState(
  plays: PlayWithPlayers[],
  options?: { config?: GameConfig; pregame?: PregameConfig | null },
): ResumedGameState {
  const config = options?.config ?? DEFAULT_GAME_CONFIG;
  const initialSituation = createInitialSituation(options?.pregame ?? null, config);
  const state: ResumedGameState = {
    quarter: 1,
    clock: config.quarter_length_secs,
    possession: initialSituation.possession,
    ourScore: 0,
    theirScore: 0,
    down: initialSituation.down,
    distance: initialSituation.distance,
    ballOn: initialSituation.ballOn,
  };

  if (plays.length === 0) return state;

  // Accumulate score
  for (const play of plays) {
    const pd = play.play_data ?? {};
    if (play.is_touchdown) {
      const isReturnTd =
        play.play_type === "int" ||
        (play.play_type === "fumble" && play.is_turnover !== false) ||
        play.play_type === "kickoff" ||
        play.play_type === "punt" ||
        play.play_type === "blocked_kick";
      const scoringSide = isReturnTd
        ? (play.possession === "us" ? "them" : "us")
        : play.possession;
      if (scoringSide === "us") state.ourScore += 6; else state.theirScore += 6;
    }
    if (play.play_type === "pat" && pd.result === "Good") { if (play.possession === "us") state.ourScore += 1; else state.theirScore += 1; }
    if (play.play_type === "fg" && pd.result === "Good") { if (play.possession === "us") state.ourScore += 3; else state.theirScore += 3; }
    if (play.play_type === "two_pt" && pd.result === "Good") { if (play.possession === "us") state.ourScore += 2; else state.theirScore += 2; }
    if (play.play_type === "safety") { if (play.possession === "us") state.theirScore += 2; else state.ourScore += 2; }
    if ((play.play_type === "pat" || play.play_type === "two_pt") && pd?.result === "Returned") {
      // Defensive 2pt return — credit the opposite side.
      if (play.possession === "us") state.theirScore += 2; else state.ourScore += 2;
    }
    if (play.play_type === "score_correction") {
      const team = pd?.score_delta_team;
      const delta = Number(pd?.score_delta ?? 0);
      if (delta !== 0 && (team === "us" || team === "them")) {
        if (team === "us") state.ourScore = Math.max(0, state.ourScore + delta);
        else state.theirScore = Math.max(0, state.theirScore + delta);
      }
    }
  }

  // Use last play to derive next situational state
  const last = plays[plays.length - 1];
  state.quarter = normalizeQuarter(last.quarter);
  state.clock = clockToSeconds(last.clock, config.quarter_length_secs);

  const playData = (last.play_data ?? {}) as Record<string, unknown>;
  const after = getRecordedNextSituation({
    nextPossession: playData.next_possession === "us" || playData.next_possession === "them"
      ? playData.next_possession
      : undefined,
    nextDown: typeof playData.next_down === "number" ? playData.next_down : undefined,
    nextDistance: typeof playData.next_distance === "number" ? playData.next_distance : undefined,
    nextBallOn: typeof playData.next_yard_line === "number" ? playData.next_yard_line : undefined,
  }) ?? advanceSituationAfterPlay({
    type: last.play_type,
    yards: last.yards_gained,
    turnover: last.is_turnover,
    result: typeof playData.result === "string" ? playData.result : "",
    penalty: typeof playData.penalty_type === "string" ? playData.penalty_type : null,
    penaltyCategory: playData.play_category === "offense" || playData.play_category === "defense"
      ? playData.play_category
      : null,
    penaltyEnforcement: playData.penalty_enforcement === "declined" || playData.penalty_enforcement === "offset"
      ? playData.penalty_enforcement
      : "accepted",
    flagYards: Number(playData.penalty_yards ?? 0),
    isTouchdown: last.is_touchdown,
    firstDown: Boolean(playData.is_first_down),
    isTouchback: Boolean(playData.is_touchback),
    blockedKickType: typeof playData.blocked_kick_type === "string" ? playData.blocked_kick_type : null,
  }, {
    possession: last.possession,
    down: last.down,
    distance: last.distance,
    ballOn: last.yard_line,
  }, config);

  state.ballOn = after.ballOn;
  state.down = after.down;
  state.distance = after.distance;
  state.possession = after.possession;
  return state;
}

/* ─────────────────────────────────────────────
   Defense stats calculator
   ───────────────────────────────────────────── */

export interface PlayerDefenseStats {
  soloTackles: number;
  assistTackles: number;
  /** soloTackles * 1.0 + assistTackles * 0.5 */
  totalTackles: number;
  tfl: number;
  sacks: number;
  ints: number;
  fumbleRecoveries: number;
  forcedFumbles: number;
  pbus: number;
  hurries: number;
  safeties: number;
}

/**
 * Calculates per-player defensive stats from a game's plays.
 * Tackle weighting: solo tackle = 1.0, each player in an assisted tackle = 0.5
 * (Assist is when both a "tackler" and an "assist" role are on the same play)
 */
/* ─────────────────────────────────────────────
   Time of possession calculator
   Uses the clock snapshots recorded on possession-
   change plays to sum seconds per team.
   ───────────────────────────────────────────── */

export interface TimeOfPossession {
  /** seconds "us" held the ball */
  us: number;
  /** seconds "them" held the ball */
  them: number;
  /** formatted "us" e.g. "18:42" */
  usFormatted: string;
  /** formatted "them" e.g. "9:18" */
  themFormatted: string;
}

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function clockToSecs(clockStr: string | null): number | null {
  if (!clockStr) return null;
  const [m, s] = clockStr.split(":").map(Number);
  return isNaN(m) || isNaN(s) ? null : m * 60 + s;
}

export function calcTimeOfPossession(plays: PlayWithPlayers[]): TimeOfPossession {
  let us = 0;
  let them = 0;

  // Walk plays in order. When we see a possession-change play that has a clock,
  // the time between the PREVIOUS clock snapshot and THIS clock snapshot belongs
  // to whoever had the ball BEFORE the change.
  // NFHS quarters = 720 seconds (12 min). We track per-quarter.
  const QUARTER_SECS = 720;

  for (let i = 0; i < plays.length; i++) {
    const cur = plays[i];
    const curClockSecs = clockToSecs(cur.clock);
    if (curClockSecs === null) continue;

    // Find previous play in same quarter that also has a clock
    let prev: PlayWithPlayers | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (plays[j].quarter === cur.quarter && clockToSecs(plays[j].clock) !== null) {
        prev = plays[j];
        break;
      }
    }

    const prevSecs = prev ? clockToSecs(prev.clock)! : QUARTER_SECS;
    const elapsed = Math.max(0, prevSecs - curClockSecs);

    if (cur.possession === "us") us += elapsed;
    else them += elapsed;
  }

  return { us, them, usFormatted: fmtSecs(us), themFormatted: fmtSecs(them) };
}

export function calcDefenseStats(
  plays: PlayWithPlayers[],
  opts?: { tackleCredit?: "split" | "full" },
): Map<string, PlayerDefenseStats> {
  const tackleCredit = opts?.tackleCredit ?? "split";
  const map = new Map<string, PlayerDefenseStats>();

  const get = (id: string): PlayerDefenseStats => {
    if (!map.has(id)) {
      map.set(id, {
        soloTackles: 0, assistTackles: 0, totalTackles: 0,
        tfl: 0, sacks: 0, ints: 0,
        fumbleRecoveries: 0, forcedFumbles: 0,
        pbus: 0, hurries: 0, safeties: 0,
      });
    }
    return map.get(id)!;
  };

  for (const play of plays) {
    /* Shared tackles are recorded as several "tackler" tags carrying credit
       0.5 each - that is what tapping a second name in the modal does. The
       role "assist" is read here and by the engine transformer, and NOTHING
       has ever written it, so every shared tackle was scored as a set of solos
       and the assist column stayed empty on every report.

       Credit is the fact. A tag under full credit is a solo; anything less is
       a share. The explicit role is still honoured in case a play somewhere
       carries one. */
    const allTacklerTags = play.play_players.filter(p => p.role === "tackler");
    const sharedTags = allTacklerTags.filter(p => (p.credit ?? 1) < 1);
    const soloTags = allTacklerTags.filter(p => (p.credit ?? 1) >= 1);
    const assists = [
      ...play.play_players.filter(p => p.role === "assist"),
      ...sharedTags,
    ];
    // Derived credit: a tackler tagged on an incompletion is a pass breakup,
    // not a tackle — nobody got tackled on an incomplete pass.
    const isIncompletion = ["pass_inc", "drop"].includes(play.play_type);
    if (isIncompletion) {
      for (const t of allTacklerTags) get(t.player_id).pbus += 1;
    }
    // Only the full-credit tags are solo candidates; the shared ones are
    // counted in the assists loop below so they are never counted twice.
    const tacklers = isIncompletion ? [] : soloTags;
    const isAssisted = tacklers.length > 0 && assists.length > 0;
    // TFL is derived from play context, not a special play type: any tackle
    // on a scrimmage play that lost yardage is a tackle for loss.
    const lostYards = (play.yards_gained ?? 0) < 0;
    const isTfl = ["tfl", "sack"].includes(play.play_type)
      || (["rush", "pass_comp"].includes(play.play_type) && lostYards);
    const assistCredit = tackleCredit === "full" ? 1 : 0.5;

    // Tacklers
    for (const t of tacklers) {
      const s = get(t.player_id);
      if (isAssisted) {
        s.assistTackles += 1;
        s.totalTackles  += assistCredit;
      } else {
        s.soloTackles  += 1;
        s.totalTackles += 1;
      }
      if (isTfl) s.tfl += 1;
      if (play.play_type === "safety") s.safeties += 1;
    }

    // Assists — the explicitly tagged ones and the shared-credit tacklers.
    for (const a of (isIncompletion ? [] : assists)) {
      const s = get(a.player_id);
      s.assistTackles += 1;
      s.totalTackles  += assistCredit;
      if (isTfl) s.tfl += 1;
    }

    // Role-based credits
    for (const pp of play.play_players) {
      const s = get(pp.player_id);
      if (pp.role === "sacker") {
        s.sacks += 1;
        // NFHS scoring: a sack is also a solo tackle and a TFL. Live entry
        // tags only the sacker role, so derive the rest — unless the same
        // player is also tagged tackler/assist on this play (already counted).
        const alsoTagged = tacklers.some(t => t.player_id === pp.player_id)
          || assists.some(a => a.player_id === pp.player_id);
        if (!alsoTagged) {
          s.soloTackles += 1;
          s.totalTackles += 1;
          s.tfl += 1;
        }
      }
      if (pp.role === "interceptor")     s.ints            += 1;
      if (pp.role === "fumble_recovery") s.fumbleRecoveries += 1;
      if (pp.role === "forced_fumble")   s.forcedFumbles   += 1;
      if (pp.role === "defender")        s.pbus            += 1;
      if (pp.role === "pass_rusher")     s.hurries         += 1;
    }
  }

  return map;
}
