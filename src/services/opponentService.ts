import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// OPPONENTS
// ---------------------------------------------------------------------------

export interface Opponent {
  id: string;
  program_id: string;
  name: string;
  abbreviation: string | null;
  mascot: string | null;
  primary_color: string;
  secondary_color: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
}

export const opponentService = {
  async getByProgram(programId: string): Promise<Opponent[]> {
    const { data } = await supabase
      .from("opponents").select("*")
      .eq("program_id", programId)
      .order("name");
    return data ?? [];
  },

  async create(opponent: Omit<Opponent, "id">): Promise<Opponent | null> {
    const { data, error } = await supabase
      .from("opponents").insert(opponent).select().single();
    if (error) { console.error("Error creating opponent:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<Opponent>): Promise<Opponent | null> {
    const { data, error } = await supabase
      .from("opponents").update(updates).eq("id", id).select().single();
    if (error) { console.error("Error updating opponent:", error); return null; }
    return data;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from("opponents").delete().eq("id", id);
    return !error;
  },
};

// ---------------------------------------------------------------------------
// OPPONENT PLAYERS (rosters for opponent teams)
// ---------------------------------------------------------------------------

export interface OpponentPlayer {
  id: string;
  opponent_id: string;
  name: string;
  jersey_number: number | null;
  position: string | null;
}

export const opponentPlayerService = {
  async getByOpponent(opponentId: string): Promise<OpponentPlayer[]> {
    const { data } = await supabase
      .from("opponent_players").select("*")
      .eq("opponent_id", opponentId)
      .order("jersey_number", { ascending: true, nullsFirst: false });
    return data ?? [];
  },

  async create(player: Omit<OpponentPlayer, "id">): Promise<OpponentPlayer | null> {
    const { data, error } = await supabase
      .from("opponent_players").insert(player).select().single();
    if (error) { console.error("Error creating opponent player:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<OpponentPlayer>): Promise<OpponentPlayer | null> {
    const { data, error } = await supabase
      .from("opponent_players").update(updates).eq("id", id).select().single();
    if (error) { console.error("Error updating opponent player:", error); return null; }
    return data;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from("opponent_players").delete().eq("id", id);
    return !error;
  },

  async bulkCreate(players: Omit<OpponentPlayer, "id">[]): Promise<OpponentPlayer[]> {
    if (players.length === 0) return [];
    const { data, error } = await supabase
      .from("opponent_players").insert(players).select();
    if (error) { console.error("Error bulk creating opponent players:", error); return []; }
    return data ?? [];
  },
};
