import { supabase } from "@/lib/supabase";

/* ── Game configuration defaults ── */

export interface GameConfig {
  /** "split" = 0.5 each when 2+ tacklers, "full" = 1.0 each */
  tackle_credit: "split" | "full";
  /** Kickoff yard line (our side, e.g. 40 = own 40) */
  kickoff_yard_line: number;
  /** Kickoff yard line after a safety */
  safety_kick_yard_line: number;
  /** Touchback yard line */
  touchback_yard_line: number;
  /** Quarter length in seconds */
  quarter_length_secs: number;
  /** Overtime type */
  overtime_type: "nfhs" | "college" | "nfl";
  /** PAT distance (yards from goal line) */
  pat_distance: number;
  /** Default field goal snap distance added to LOS */
  fg_snap_add: number;
  /** First down distance */
  first_down_distance: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  tackle_credit: "split",
  kickoff_yard_line: 40,
  safety_kick_yard_line: 20,
  touchback_yard_line: 20,
  quarter_length_secs: 720,
  overtime_type: "nfhs",
  pat_distance: 3,
  fg_snap_add: 17,
  first_down_distance: 10,
};

export function getGameConfig(program: Program | null): GameConfig {
  if (!program?.game_config) return { ...DEFAULT_GAME_CONFIG };
  return { ...DEFAULT_GAME_CONFIG, ...(program.game_config as Partial<GameConfig>) };
}

export interface Program {
  id: string;
  name: string;
  abbreviation: string;
  mascot: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string | null;
  logo_url: string | null;
  wordmark_url: string | null;
  city: string | null;
  state: string | null;
  owner_id: string | null;
  game_config: Record<string, unknown> | null;
}

export const programService = {
  async getMyProgram(userId: string): Promise<Program | null> {
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) { console.error("Error fetching program:", error); return null; }
    return data;
  },

  async create(program: Omit<Program, "id">): Promise<Program | null> {
    const { data, error } = await supabase
      .from("programs")
      .insert(program)
      .select()
      .single();
    if (error) { console.error("Error creating program:", error); return null; }
    return data;
  },

  async update(id: string, updates: Partial<Program>): Promise<Program | null> {
    const { data, error } = await supabase
      .from("programs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) { console.error("Error updating program:", error); return null; }
    return data;
  },
};
