import { supabase } from "@/lib/supabase";

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

/* ─────────────────────────────────────────────
   Insert a play + its tagged players
   ───────────────────────────────────────────── */

export async function insertPlay(
  play: PlayInsert,
  players: Omit<PlayPlayerInsert, "play_id">[]
): Promise<PlayRow | null> {
  // 1) Get next sequence number for this game
  const { count } = await supabase
    .from("plays")
    .select("*", { count: "exact", head: true })
    .eq("game_id", play.game_id);

  const sequence = (count ?? 0) + 1;

  // 2) Insert the play
  const { data: playRow, error: playErr } = await supabase
    .from("plays")
    .insert({ ...play, sequence })
    .select()
    .single();

  if (playErr || !playRow) {
    console.error("Failed to insert play:", playErr);
    return null;
  }

  // 3) Insert tagged players
  if (players.length > 0) {
    const rows: PlayPlayerInsert[] = players.map(p => ({
      play_id: playRow.id,
      player_id: p.player_id,
      role: p.role,
      credit: p.credit ?? null,
    }));

    const { error: ppErr } = await supabase
      .from("play_players")
      .insert(rows);

    if (ppErr) {
      console.error("Failed to insert play_players:", ppErr);
      // Play is still saved — players just didn't attach.
      // Could retry or flag for correction.
    }
  }

  return playRow as PlayRow;
}

/* ─────────────────────────────────────────────
   Delete the last play (undo)
   Removes play_players first, then the play.
   ───────────────────────────────────────────── */

export async function deletePlay(playId: string): Promise<boolean> {
  // Delete junction rows first
  await supabase
    .from("play_players")
    .delete()
    .eq("play_id", playId);

  const { error } = await supabase
    .from("plays")
    .delete()
    .eq("id", playId);

  if (error) {
    console.error("Failed to delete play:", error);
    return false;
  }
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

  if (error) {
    console.error("Failed to load plays:", error);
    return [];
  }

  return (data ?? []) as PlayWithPlayers[];
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateObj: Record<string, any> = { ...fields };

  if (playDataPatch) {
    const { data } = await supabase
      .from("plays")
      .select("play_data")
      .eq("id", playId)
      .single();
    if (data) {
      updateObj.play_data = {
        ...(data.play_data as Record<string, unknown>),
        ...playDataPatch,
      };
    }
  }

  const { error } = await supabase.from("plays").update(updateObj).eq("id", playId);
  return !error;
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
  players: { player_id: string; role: string; credit?: number | null }[]
): Promise<boolean> {
  // 1) Update the play row with all provided fields
  const { error: updateErr } = await supabase
    .from("plays")
    .update(fields)
    .eq("id", playId);

  if (updateErr) {
    console.error("Failed to update play:", updateErr);
    return false;
  }

  // 2) Delete all existing play_players for this play
  const { error: deleteErr } = await supabase
    .from("play_players")
    .delete()
    .eq("play_id", playId);

  if (deleteErr) {
    console.error("Failed to delete play_players:", deleteErr);
    return false;
  }

  // 3) Insert new play_players rows
  if (players.length > 0) {
    const rows: PlayPlayerInsert[] = players.map((p) => ({
      play_id: playId,
      player_id: p.player_id,
      role: p.role,
      credit: p.credit ?? null,
    }));

    const { error: insertErr } = await supabase
      .from("play_players")
      .insert(rows);

    if (insertErr) {
      console.error("Failed to insert play_players:", insertErr);
      return false;
    }
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

export function deriveGameState(plays: PlayWithPlayers[]): ResumedGameState {
  // Default starting state
  const state: ResumedGameState = {
    quarter: 0,
    clock: 720,
    possession: "us",
    ourScore: 0,
    theirScore: 0,
    down: 1,
    distance: 10,
    ballOn: 25,
  };

  if (plays.length === 0) return state;

  // Walk forward through plays to rebuild current state
  let currentDown = 1;
  let currentDist = 10;
  let currentBall = 25;
  let poss: "us" | "them" = "us";

  for (const play of plays) {
    // Score
    if (play.is_touchdown) {
      if (play.possession === "us") state.ourScore += 6;
      else state.theirScore += 6;
    }
    const pd = play.play_data ?? {};
    if (play.play_type === "pat" && pd.result === "Good") {
      if (play.possession === "us") state.ourScore += 1;
      else state.theirScore += 1;
    }
    if (play.play_type === "fg" && pd.result === "Good") {
      if (play.possession === "us") state.ourScore += 3;
      else state.theirScore += 3;
    }
    if (play.play_type === "two_pt" && pd.result === "Good") {
      if (play.possession === "us") state.ourScore += 2;
      else state.theirScore += 2;
    }
    if (play.play_type === "safety") {
      // Safety: opposite team of possession scores 2
      if (play.possession === "us") state.theirScore += 2;
      else state.ourScore += 2;
    }

    poss = play.possession;
  }

  // Use the last play to set current situational state
  const last = plays[plays.length - 1];
  state.quarter = last.quarter;
  // Convert clock text "M:SS" back to seconds
  if (last.clock) {
    const [m, s] = last.clock.split(":").map(Number);
    state.clock = (m || 0) * 60 + (s || 0);
  }
  state.possession = poss;

  const playData = last.play_data ?? {};
  const isFirstDown = playData.is_first_down ?? false;

  // Replay the last play's outcome to get the next down/distance/ball
  const newBall = Math.min(100, Math.max(0, last.yard_line + last.yards_gained));

  if (last.is_touchdown) {
    state.ballOn = 97; // PAT spot
    state.down = 1;
    state.distance = 3;
  } else if (isFirstDown) {
    state.ballOn = newBall;
    state.down = 1;
    state.distance = Math.min(10, 100 - newBall);
  } else if (last.down >= 4) {
    state.ballOn = 100 - newBall;
    state.down = 1;
    state.distance = 10;
    state.possession = poss === "us" ? "them" : "us";
  } else {
    state.ballOn = newBall;
    state.down = last.down + 1;
    state.distance = last.distance - last.yards_gained;
  }

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
    const tacklers = play.play_players.filter(p => p.role === "tackler");
    const assists  = play.play_players.filter(p => p.role === "assist");
    const isAssisted = tacklers.length > 0 && assists.length > 0;
    const isTfl = ["tfl", "sack"].includes(play.play_type);
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

    // Assists
    for (const a of assists) {
      const s = get(a.player_id);
      s.assistTackles += 1;
      s.totalTackles  += assistCredit;
      if (isTfl) s.tfl += 1;
    }

    // Role-based credits
    for (const pp of play.play_players) {
      const s = get(pp.player_id);
      if (pp.role === "sacker")          s.sacks           += 1;
      if (pp.role === "interceptor")     s.ints            += 1;
      if (pp.role === "fumble_recovery") s.fumbleRecoveries += 1;
      if (pp.role === "forced_fumble")   s.forcedFumbles   += 1;
      if (pp.role === "defender")        s.pbus            += 1;
      if (pp.role === "pass_rusher")     s.hurries         += 1;
    }
  }

  return map;
}
