import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
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
  // Once a program has loaded, background refreshes (auth event echoes,
  // manual refresh()) must not flip `loading` back to true — that swaps the
  // route content for a spinner and unmounts live screens mid-game, wiping
  // any play entry in progress.
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setProgram(null);
      setSeason(null);
      hasLoadedRef.current = false;
      setLoading(false);
      return;
    }

    if (!hasLoadedRef.current) setLoading(true);

    // Get program
    const { data: prog } = await supabase
      .from("programs")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    // Keep object identity stable when the row hasn't changed — screens key
    // data-loading effects on these objects, and a fresh-but-identical object
    // forces them to reload (and reset live game state) for nothing.
    setProgram(prev =>
      prev && prog && JSON.stringify(prev) === JSON.stringify(prog) ? prev : prog
    );

    // Get active season
    if (prog) {
      const { data: activeSeason } = await supabase
        .from("seasons")
        .select("*")
        .eq("program_id", prog.id)
        .eq("is_active", true)
        .maybeSingle();

      setSeason(prev =>
        prev && activeSeason && JSON.stringify(prev) === JSON.stringify(activeSeason) ? prev : activeSeason
      );
    } else {
      setSeason(null);
    }

    hasLoadedRef.current = true;
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
