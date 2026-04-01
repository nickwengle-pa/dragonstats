import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { Program } from "@/services/programService";
import type { Season } from "@/services/seasonService";

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string | null;
  logoUrl: string | null;
  wordmarkUrl: string | null;
}

interface ProgramContextValue {
  program: Program | null;
  season: Season | null;
  branding: Branding;
  loading: boolean;
  /** Reload program + season from DB */
  refresh: () => Promise<void>;
  /** Set active season manually */
  setSeason: (s: Season) => void;
}

const DEFAULT_BRANDING: Branding = {
  primaryColor: "#dc2626",
  secondaryColor: "#f59e0b",
  accentColor: null,
  logoUrl: null,
  wordmarkUrl: null,
};

const ProgramContext = createContext<ProgramContextValue>({
  program: null,
  season: null,
  branding: DEFAULT_BRANDING,
  loading: true,
  refresh: async () => {},
  setSeason: () => {},
});

export function useProgramContext() {
  return useContext(ProgramContext);
}

function deriveBranding(program: Program | null): Branding {
  if (!program) return DEFAULT_BRANDING;
  return {
    primaryColor: program.primary_color,
    secondaryColor: program.secondary_color,
    accentColor: program.accent_color ?? null,
    logoUrl: program.logo_url ?? null,
    wordmarkUrl: program.wordmark_url ?? null,
  };
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

  const branding = deriveBranding(program);

  return (
    <ProgramContext.Provider value={{ program, season, branding, loading, refresh, setSeason }}>
      {children}
    </ProgramContext.Provider>
  );
}
