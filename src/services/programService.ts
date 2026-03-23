import { supabase } from "@/lib/supabase";

export interface Program {
  id: string;
  name: string;
  abbreviation: string;
  mascot: string | null;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  owner_id: string | null;
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
