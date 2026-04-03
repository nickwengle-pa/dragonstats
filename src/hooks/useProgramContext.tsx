import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { Program } from "@/services/programService";
import { seasonService, type Season } from "@/services/seasonService";

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
  seasons: Season[];
  branding: Branding;
  loading: boolean;
  /** Reload program + season from DB */
  refresh: () => Promise<void>;
  /** Set the active season manually */
  setSeason: (s: Season) => Promise<boolean>;
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
  seasons: [],
  branding: DEFAULT_BRANDING,
  loading: true,
  refresh: async () => {},
  setSeason: async () => false,
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
  const [season, setSeasonState] = useState<Season | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);

  const applyActiveSeason = useCallback((programSeasons: Season[], activeSeasonId: string | null) => {
    const nextSeasons = programSeasons.map((entry) => ({
      ...entry,
      is_active: entry.id === activeSeasonId,
    }));

    setSeasons(nextSeasons);
    setSeasonState(nextSeasons.find((entry) => entry.id === activeSeasonId) ?? null);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setProgram(null);
      setSeasonState(null);
      setSeasons([]);
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

    if (prog) {
      const programSeasons = await seasonService.getByProgram(prog.id);
      const activeSeasons = programSeasons.filter((entry) => entry.is_active);

      if (activeSeasons.length > 1) {
        const canonicalSeason = activeSeasons[0];
        const updated = await seasonService.activate(prog.id, canonicalSeason.id);
        if (updated) {
          applyActiveSeason(programSeasons, canonicalSeason.id);
        } else {
          setSeasons(programSeasons);
          setSeasonState(canonicalSeason);
        }
      } else if (activeSeasons.length === 1) {
        setSeasons(programSeasons);
        setSeasonState(activeSeasons[0]);
      } else if (programSeasons.length > 0) {
        const fallbackSeason = programSeasons[0];
        const updated = await seasonService.activate(prog.id, fallbackSeason.id);
        if (updated) {
          applyActiveSeason(programSeasons, fallbackSeason.id);
        } else {
          setSeasons(programSeasons);
          setSeasonState(null);
        }
      } else {
        setSeasons([]);
        setSeasonState(null);
      }
    } else {
      setSeasons([]);
      setSeasonState(null);
    }

    setLoading(false);
  }, [applyActiveSeason, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const branding = deriveBranding(program);
  const setSeason = useCallback(async (nextSeason: Season) => {
    if (!program) return false;

    const updated = await seasonService.activate(program.id, nextSeason.id);
    if (!updated) return false;

    const nextSeasons = seasons.some((entry) => entry.id === nextSeason.id)
      ? seasons
      : [nextSeason, ...seasons];
    applyActiveSeason(nextSeasons, nextSeason.id);
    return true;
  }, [applyActiveSeason, program, seasons]);

  return (
    <ProgramContext.Provider value={{ program, season, seasons, branding, loading, refresh, setSeason }}>
      {children}
    </ProgramContext.Provider>
  );
}
