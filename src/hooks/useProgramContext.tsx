import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { Program } from "@/services/programService";
import type { Season } from "@/services/seasonService";

interface ProgramContextValue {
  program: Program | null;
  season: Season | null;
  loading: boolean;
  /** Reload program + season from DB */
  refresh: () => Promise<void>;
  /** Set active season manually */
  setSeason: (s: Season) => void;
}

const ProgramContext = createContext<ProgramContextValue>({
  program: null,
  season: null,
  loading: true,
  refresh: async () => {},
  setSeason: () => {},
});

export function useProgramContext() {
  return useContext(ProgramContext);
}

export function ProgramProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProgram(null);
      setSeason(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Get program
    const { data: prog } = await supabase
      .from("programs")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    setProgram(prog);

    // Get active season
    if (prog) {
      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("*")
        .eq("program_id", prog.id)
        .eq("is_active", true)
        .maybeSingle();

      setSeason(activeSeason);
    } else {
      setSeason(null);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ProgramContext.Provider value={{ program, season, loading, refresh, setSeason }}>
      {children}
    </ProgramContext.Provider>
  );
}
