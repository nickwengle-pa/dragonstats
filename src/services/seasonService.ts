import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// SEASON
// ---------------------------------------------------------------------------

export interface Season {
  id: string;
  program_id: string;
  year: number;
  name: string | null;
  level: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export const seasonService = {
  async getByProgram(programId: string): Promise<Season[]> {
    const { data } = await supabase
      .from("seasons").select("*")
      .eq("program_id", programId)
      .order("year", { ascending: false });
    return data ?? [];
  },

  async getActive(programId: string): Promise<Season | null> {
    const { data } = await supabase
      .from("seasons").select("*")
      .eq("program_id", programId)
      .eq("is_active", true)
      .maybeSingle();
    return data;
  },

  async create(season: Omit<Season, "id">): Promise<Season | null> {
    const { data, error } = await supabase
      .from("seasons").insert(season).select().single();
    if (error) { console.error("Error creating season:", error); return null; }
    return data;
  },
};

// ---------------------------------------------------------------------------
// PLAYER (program-level, persists across seasons)
// ---------------------------------------------------------------------------

export interface Player {
  id: string;
  program_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  graduation_year: number | null;
}

export const playerService = {
  async getByProgram(programId: string): Promise<Player[]> {
    const { data } = await supabase
      .from("players").select("*")
      .eq("program_id", programId)
      .order("last_name");
    return data ?? [];
  },

  async create(player: Omit<Player, "id">): Promise<Player | null> {
    const { data, error } = await supabase
      .from("players").insert(player).select().single();
    if (error) { console.error("Error creating player:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<Player>): Promise<Player | null> {
    const { data, error } = await supabase
      .from("players").update(updates).eq("id", id).select().single();
    if (error) { console.error("Error updating player:", error); return null; }
    return data;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from("players").delete().eq("id", id);
    return !error;
  },
};

// ---------------------------------------------------------------------------
// SEASON ROSTER (player ↔ season link with jersey/position)
// ---------------------------------------------------------------------------

export interface RosterEntry {
  id: string;
  season_id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  positions: string[] | null;
  classification: string | null;
  is_active: boolean;
  // Joined fields
  player?: Player;
}

export const rosterService = {
  async getBySeason(seasonId: string): Promise<RosterEntry[]> {
    const { data } = await supabase
      .from("season_rosters")
      .select("*, player:players(*)")
      .eq("season_id", seasonId)
      .eq("is_active", true)
      .order("jersey_number", { ascending: true, nullsFirst: false });
    return data ?? [];
  },

  async add(entry: Omit<RosterEntry, "id" | "player">): Promise<RosterEntry | null> {
    const { data, error } = await supabase
      .from("season_rosters").insert(entry).select().single();
    if (error) { console.error("Error adding to roster:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<RosterEntry>): Promise<RosterEntry | null> {
    const { data, error } = await supabase
      .from("season_rosters").update(updates).eq("id", id).select().single();
    if (error) { console.error("Error updating roster entry:", error); return null; }
    return data;
  },
};

// ---------------------------------------------------------------------------
// COACHES (per-season coaching staff)
// ---------------------------------------------------------------------------

export interface Coach {
  id: string;
  season_id: string;
  name: string;
  role: "head" | "assistant" | "coordinator" | "other";
  email: string | null;
  phone: string | null;
}

export const coachService = {
  async getBySeason(seasonId: string): Promise<Coach[]> {
    const { data } = await supabase
      .from("coaches").select("*")
      .eq("season_id", seasonId)
      .order("role", { ascending: true });
    return data ?? [];
  },

  async create(coach: Omit<Coach, "id">): Promise<Coach | null> {
    const { data, error } = await supabase
      .from("coaches").insert(coach).select().single();
    if (error) { console.error("Error creating coach:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<Coach>): Promise<Coach | null> {
    const { data, error } = await supabase
      .from("coaches").update(updates).eq("id", id).select().single();
    if (error) { console.error("Error updating coach:", error); return null; }
    return data;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await supabase.from("coaches").delete().eq("id", id);
    return !error;
  },
};
