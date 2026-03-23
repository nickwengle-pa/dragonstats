import { supabase } from "@/lib/supabase";

/* ─────────────────────────────────────────────
   Types — match your Supabase schema
   ───────────────────────────────────────────── */

export interface PlayInsert {
  game_id: string;
  season_id: string;
  quarter: number;
  clock_seconds: number;
  possession: "us" | "them";
  down: number;
  distance: number;
  ball_on: number;
  play_type: string;        // "rush" | "pass_comp" | "pass_inc" | "sack" | etc.
  play_category: string;    // "offense" | "defense" | "special"
  yards: number;
  result: string | null;    // "Complete" | "Incomplete" | null
  is_touchdown: boolean;
  is_first_down: boolean;
  is_turnover: boolean;
  penalty_type: string | null;
  penalty_yards: number;
  description: string;
}

export interface PlayPlayerInsert {
  play_id: string;
  player_id: string;
  season_roster_id: string;
  role: string;             // "carrier" | "passer" | "receiver" | "tackler" | etc.
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
      season_roster_id: p.season_roster_id,
      role: p.role,
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
    roster_entry?: {
      jersey_number: number | null;
      position: string | null;
      player: { first_name: string; last_name: string };
    };
  })[];
}

export async function loadGamePlays(gameId: string): Promise<PlayWithPlayers[]> {
  const { data, error } = await supabase
    .from("plays")
    .select(`
      *,
      play_players (
        *,
        roster_entry:season_rosters (
          jersey_number,
          position,
          player:players ( first_name, last_name )
        )
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

export async function updateGameScore(
  gameId: string,
  ourScore: number,
  theirScore: number,
  status: "scheduled" | "in_progress" | "final" = "in_progress"
): Promise<void> {
  const { error } = await supabase
    .from("games")
    .update({
      home_score: ourScore,   // Adjust if away — see note below
      away_score: theirScore,
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
    // Penalty-only scoring (PAT, FG, safety) tracked via play_type
    if (play.play_type === "pat" && play.result === "Good") {
      if (play.possession === "us") state.ourScore += 1;
      else state.theirScore += 1;
    }
    if (play.play_type === "fg" && play.result === "Good") {
      if (play.possession === "us") state.ourScore += 3;
      else state.theirScore += 3;
    }

    poss = play.possession;
  }

  // Use the last play to set current situational state
  const last = plays[plays.length - 1];
  state.quarter = last.quarter;
  state.clock = last.clock_seconds;
  state.possession = poss;

  // Replay the last play's outcome to get the next down/distance/ball
  const newBall = Math.min(100, Math.max(0, last.ball_on + last.yards));

  if (last.is_touchdown) {
    state.ballOn = 97; // PAT spot
    state.down = 1;
    state.distance = 3;
  } else if (last.is_first_down) {
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
    state.distance = last.distance - last.yards;
  }

  return state;
}
