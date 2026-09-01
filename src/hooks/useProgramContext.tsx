import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { Program } from "@/services/programService";
import { seasonService, type Season } from "@/services/seasonService";
import { cachedRead, cacheKeys, warmGamedayCache } from "@/services/offlineCache";

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
  /** The server could not be reached on the last load. Anything above may be
   *  a cached copy from this device — and a null `program` here means "could
   *  not look", NOT "no program exists". Routing must not treat it as the
   *  latter or an offline coach lands in first-time setup. */
  offline: boolean;
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
  offline: false,
  refresh: async () => {},
  setSeason: async () => false,
});

export function useProgramContext() {
  return useContext(ProgramContext);
}

/** Keep the previous object reference when a refetch returned identical data.
 *  Screens key data-loading effects on these objects; a fresh-but-identical
 *  object forces them to reload (and reset live game state) for nothing. */
function keepIfEqual<T>(prev: T | null, next: T | null): T | null {
  return prev && next && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
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
  const [offline, setOffline] = useState(false);
  // Once a program has loaded, background refreshes (auth event echoes,
  // manual refresh()) must not flip `loading` back to true — that swaps the
  // route content for a spinner and unmounts live screens mid-game.
  const hasLoadedRef = useRef(false);

  const applyActiveSeason = useCallback((programSeasons: Season[], activeSeasonId: string | null) => {
    const nextSeasons = programSeasons.map((entry) => ({
      ...entry,
      is_active: entry.id === activeSeasonId,
    }));

    setSeasons(nextSeasons);
    const nextActive = nextSeasons.find((entry) => entry.id === activeSeasonId) ?? null;
    setSeasonState((prev) => keepIfEqual(prev, nextActive));
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setProgram(null);
      setSeasonState(null);
      setSeasons([]);
      // Must clear, not leave stale. Signing out while offline would otherwise
      // keep `offline` true with a null program, and the router would answer
      // every route with the no-connection card — including /login, locking
      // the user out of signing back in.
      setOffline(false);
      hasLoadedRef.current = false;
      setLoading(false);
      return;
    }

    if (!hasLoadedRef.current) setLoading(true);

    // Get program. cachedRead needs the fetcher to THROW on failure: a network
    // error that came back as a plain null would look exactly like "this coach
    // has no program yet", and the router answers that with the first-time
    // setup screen. At a field with no signal that misread is the whole app.
    const programRead = await cachedRead<Program>(cacheKeys.program(user.id), async () => {
      /* Membership, not ownership. This used to filter on owner_id, which was
         fine while the only account was the one that created the program - but
         a coach who joins with an invite code is a MEMBER, and would have been
         told they had no program at all and shown first-time setup. RLS already
         restricts this table to programs the caller belongs to, so no filter is
         needed here; the ordering just makes "first program" deterministic for
         an account that belongs to more than one. */
      const { data, error } = await supabase
        .from("programs")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return ((data as Program[] | null)?.[0]) ?? null;
    });

    const prog = programRead.value;
    let couldNotReachServer = programRead.offline;

    setProgram((prev) => keepIfEqual(prev, prog));

    if (prog) {
      const seasonsRead = await cachedRead<Season[]>(cacheKeys.seasons(prog.id), async () => {
        const { data, error } = await supabase
          .from("seasons").select("*")
          .eq("program_id", prog.id)
          .order("year", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      });
      const programSeasons = seasonsRead.value ?? [];
      couldNotReachServer = couldNotReachServer || seasonsRead.offline;

      const activeSeasons = programSeasons.filter((entry) => entry.is_active);

      if (activeSeasons.length > 1) {
        const canonicalSeason = activeSeasons[0];
        // `activate` is a write. Offline it cannot succeed, and there is no
        // point queueing a tidy-up — just run with the season we have.
        const updated = couldNotReachServer
          ? false
          : await seasonService.activate(prog.id, canonicalSeason.id);
        if (updated) {
          applyActiveSeason(programSeasons, canonicalSeason.id);
        } else {
          setSeasons(programSeasons);
          setSeasonState((prev) => keepIfEqual(prev, canonicalSeason));
        }
      } else if (activeSeasons.length === 1) {
        setSeasons(programSeasons);
        setSeasonState((prev) => keepIfEqual(prev, activeSeasons[0]));
      } else if (programSeasons.length > 0) {
        const fallbackSeason = programSeasons[0];
        const updated = couldNotReachServer
          ? false
          : await seasonService.activate(prog.id, fallbackSeason.id);
        if (updated) {
          applyActiveSeason(programSeasons, fallbackSeason.id);
        } else {
          setSeasons(programSeasons);
          // Offline, leaving this null would strand the user on the settings
          // screen with a perfectly good cached season sitting right there.
          setSeasonState((prev) =>
            couldNotReachServer ? keepIfEqual(prev, fallbackSeason) : null,
          );
        }
      } else {
        setSeasons([]);
        setSeasonState(null);
      }
    } else {
      setSeasons([]);
      setSeasonState(null);
    }

    setOffline(couldNotReachServer);
    hasLoadedRef.current = true;
    setLoading(false);
  }, [applyActiveSeason, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* Pull the roster and schedule down as soon as a season is known, rather
     than waiting for the user to happen to visit those screens while still in
     signal. Seeding the device used to be a ritual — open the schedule, open
     a game, back out — and the first real test of it came back "0 games and 0
     players" because the ritual is easy to get wrong. Opening the app with
     service is now enough. */
  useEffect(() => {
    if (season?.id) warmGamedayCache(season.id);
  }, [season?.id]);

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
    <ProgramContext.Provider value={{ program, season, seasons, branding, loading, offline, refresh, setSeason }}>
      {children}
    </ProgramContext.Provider>
  );
}
