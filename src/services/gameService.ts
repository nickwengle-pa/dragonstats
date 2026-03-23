import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// OPPONENT
// ---------------------------------------------------------------------------

export interface Opponent {
  id: string;
  program_id: string;
  name: string;
  abbreviation: string | null;
  mascot: string | null;
  primary_color: string;
  logo_url: string | null;
}

export const opponentService = {
  async getByProgram(programId: string): Promise<Opponent[]> {
    const { data } = await supabase
      .from("opponents").select("*")
      .eq("program_id", programId)
      .order("name");
    return data ?? [];
  },

  async create(opp: Omit<Opponent, "id">): Promise<Opponent | null> {
    const { data, error } = await supabase
      .from("opponents").insert(opp).select().single();
    if (error) { console.error("Error creating opponent:", error); return null; }
    return data;
  },
};

// ---------------------------------------------------------------------------
// GAME
// ---------------------------------------------------------------------------

export interface Game {
  id: string;
  season_id: string;
  opponent_id: string;
  game_date: string;
  location: string | null;
  is_home: boolean;
  status: "scheduled" | "live" | "completed" | "cancelled";
  our_score: number;
  opponent_score: number;
  current_quarter: number;
  current_clock: string;
  current_down: number;
  current_distance: number;
  current_yard_line: number;
  current_possession: string;
  rules_config: Record<string, unknown>;
  notes: string | null;
  is_playoff: boolean;
  // Joined
  opponent?: Opponent;
}

export const gameService = {
  async getBySeason(seasonId: string): Promise<Game[]> {
    const { data } = await supabase
      .from("games")
      .select("*, opponent:opponents(*)")
      .eq("season_id", seasonId)
      .order("game_date");
    return data ?? [];
  },

  async getById(id: string): Promise<Game | null> {
    const { data } = await supabase
      .from("games")
      .select("*, opponent:opponents(*)")
      .eq("id", id)
      .single();
    return data ?? null;
  },

  async create(game: Omit<Game, "id" | "opponent">): Promise<Game | null> {
    const { data, error } = await supabase
      .from("games").insert(game).select().single();
    if (error) { console.error("Error creating game:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<Game>): Promise<Game | null> {
    const { data, error } = await supabase
      .from("games").update(updates).eq("id", id).select().single();
    if (error) { console.error("Error updating game:", error); return null; }
    return data;
  },
};

// ---------------------------------------------------------------------------
// PLAY
// ---------------------------------------------------------------------------

export interface PlayRecord {
  id: string;
  game_id: string;
  sequence: number;
  quarter: number;
  clock: string | null;
  down: number | null;
  distance: number | null;
  yard_line: number | null;
  possession: "us" | "them";
  drive_number: number | null;
  play_type: string;
  play_data: Record<string, unknown>;   // engine-compatible JSON
  yards_gained: number;
  is_touchdown: boolean;
  is_turnover: boolean;
  is_penalty: boolean;
  primary_player_id: string | null;
  description: string | null;
}

export const playService = {
  async getByGame(gameId: string): Promise<PlayRecord[]> {
    const { data } = await supabase
      .from("plays").select("*")
      .eq("game_id", gameId)
      .order("sequence");
    return data ?? [];
  },

  async create(play: Omit<PlayRecord, "id">): Promise<PlayRecord | null> {
    const { data, error } = await supabase
      .from("plays").insert(play).select().single();
    if (error) { console.error("Error creating play:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<PlayRecord>): Promise<PlayRecord | null> {
    const { data, error } = await supabase
      .from("plays").update(updates).eq("id", id).select().single();
    if (error) { console.error("Error updating play:", error); return null; }
    return data;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from("plays").delete().eq("id", id);
    return !error;
  },

  async getNextSequence(gameId: string): Promise<number> {
    const { data } = await supabase
      .from("plays").select("sequence")
      .eq("game_id", gameId)
      .order("sequence", { ascending: false })
      .limit(1);
    return (data?.[0]?.sequence ?? 0) + 1;
  },
};

// ---------------------------------------------------------------------------
// PLAY PLAYERS (multi-player attribution)
// ---------------------------------------------------------------------------

export interface PlayPlayer {
  id: string;
  play_id: string;
  player_id: string;
  role: string;
}

export const playPlayerService = {
  async addToPlay(playId: string, playerId: string, role: string): Promise<PlayPlayer | null> {
    const { data, error } = await supabase
      .from("play_players").insert({ play_id: playId, player_id: playerId, role }).select().single();
    if (error) { console.error("Error adding play player:", error); return null; }
    return data;
  },

  async addMultiple(entries: Omit<PlayPlayer, "id">[]): Promise<boolean> {
    const { error } = await supabase.from("play_players").insert(entries);
    return !error;
  },

  async getByPlay(playId: string): Promise<PlayPlayer[]> {
    const { data } = await supabase
      .from("play_players").select("*").eq("play_id", playId);
    return data ?? [];
  },
};
