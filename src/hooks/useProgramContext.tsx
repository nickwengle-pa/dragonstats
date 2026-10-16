import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import type { Program } from "@/services/programService";
import { seasonService, type Season } from "@/services/seasonService";
import { cachedRead, cacheKeys, warmGamedayCache } from "@/services/offlineCache";
import { completeProgramJoin } from "@/services/completeProgramJoin";
import { normalizeRole, permissionsFor, type Permissions, type ProgramRole } from "@/services/access";

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
  joinError: string | null;
  /** The signed-in person's role in `program`. Null while loading, with no
   *  program, or offline on a device that never cached it - permissionsFor
   *  treats that last case as able to record, never as able to manage. */
  role: ProgramRole | null;
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

/* Exported for the dev-only screen previews, which stand up a fake program
   and season so a screen can be looked at without auth. App code should use
   ProgramProvider and the hook. */
export const ProgramContext = createContext<ProgramContextValue>({
  program: null,
  season: null,
  seasons: [],
  branding: DEFAULT_BRANDING,
  loading: true,
  offline: false,
  joinError: null,
  role: null,
  refresh: async () => {},
  setSeason: async () => false,
});

export function useProgramContext() {
  return useContext(ProgramContext);
}

/** What the signed-in person may do in the current program. See access.ts. */
export function usePermissions(): Permissions {
  return permissionsFor(useContext(ProgramContext).role);
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
  const { user, loading: authLoading } = useAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [season, setSeasonState] = useState<Season | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [role, setRole] = useState<ProgramRole | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  // Once a program has loaded, background refreshes (auth event echoes,
  // manual refresh()) must not flip `loading` back to true — that swaps the
  // route content for a spinner and unmounts live screens mid-game.
  const hasLoadedRef = useRef(false);
  const refreshSequence = useRef(0);

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
    const sequence = ++refreshSequence.current;
    setJoinError(null);
    if (!user) {
      setProgram(null);
      setSeasonState(null);
      setSeasons([]);
      setRole(null);
      // Must clear, not leave stale. Signing out while offline would otherwise
      // keep `offline` true with a null program, and the router would answer
      // every route with the no-connection card — including /login, locking
      // the user out of signing back in.
      setOffline(false);
      hasLoadedRef.current = false;
      setLoading(false);
      setLoadedUserId(null);
      return;
    }

    if (!hasLoadedRef.current) setLoading(true);

    // Get program. cachedRead needs the fetcher to THROW on failure: a network
    // error that came back as a plain null would look exactly like "this coach
    // has no program yet", and the router answers that with the first-time
    // setup screen. At a field with no signal that misread is the whole app.
    const readProgram = () => cachedRead<Program>(cacheKeys.program(user.id), async () => {
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

    let programRead;
    try {
      programRead = await completeProgramJoin(user, readProgram);
    } catch (error) {
      if (sequence !== refreshSequence.current) return;
      setJoinError(error instanceof Error ? error.message : "Could not join your team. Please try again.");
      setLoadedUserId(user.id);
      setLoading(false);
      return;
    }

    if (sequence !== refreshSequence.current) return;

    const prog = programRead.value;
    let couldNotReachServer = programRead.offline;

    setProgram((prev) => keepIfEqual(prev, prog));

    if (prog) {
      const [seasonsRead, roleRead] = await Promise.all([
        cachedRead<Season[]>(cacheKeys.seasons(prog.id), async () => {
          const { data, error } = await supabase
            .from("seasons").select("*")
            .eq("program_id", prog.id)
            .order("year", { ascending: false })
            .order("created_at", { ascending: false });
          if (error) throw error;
          return data ?? [];
        }),
        // Cached per user and program so the press box knows who is holding
        // the iPad without signal. Your own membership row is always readable.
        cachedRead<string>(cacheKeys.role(user.id, prog.id), async () => {
          const { data, error } = await supabase
            .from("program_members").select("role")
            .eq("program_id", prog.id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (error) throw error;
          return (data?.role as string | undefined) ?? null;
        }),
      ]);
      const programSeasons = seasonsRead.value ?? [];
      if (sequence !== refreshSequence.current) return;
      couldNotReachServer = couldNotReachServer || seasonsRead.offline || roleRead.offline;
      const myRole = normalizeRole(roleRead.value);
      setRole(myRole);

      /* Which season is active is program-wide, and only a head coach or admin
         may change it. Anyone else who opens the app on a program with no (or
         two) active seasons gets the right one picked on this device only,
         rather than a refused write that strands them on Settings. */
      const mayActivate = !couldNotReachServer && permissionsFor(myRole).editProgram;

      const activeSeasons = programSeasons.filter((entry) => entry.is_active);

      if (activeSeasons.length > 1) {
        const canonicalSeason = activeSeasons[0];
        // `activate` is a write. Offline it cannot succeed, and there is no
        // point queueing a tidy-up — just run with the season we have.
        const updated = mayActivate
          ? await seasonService.activate(prog.id, canonicalSeason.id)
          : false;
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
        const updated = mayActivate
          ? await seasonService.activate(prog.id, fallbackSeason.id)
          : false;
        if (updated) {
          applyActiveSeason(programSeasons, fallbackSeason.id);
        } else {
          setSeasons(programSeasons);
          // Offline, leaving this null would strand the user on the settings
          // screen with a perfectly good cached season sitting right there.
          // The same goes for a role that could not have activated it anyway.
          setSeasonState((prev) =>
            mayActivate ? null : keepIfEqual(prev, fallbackSeason),
          );
        }
      } else {
        setSeasons([]);
        setSeasonState(null);
      }
    } else {
      setSeasons([]);
      setSeasonState(null);
      setRole(null);
    }

    if (sequence !== refreshSequence.current) return;
    setOffline(couldNotReachServer);
    hasLoadedRef.current = true;
    setLoadedUserId(user.id);
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
  const changingUser = loadedUserId !== (user?.id ?? null);
  const setSeason = useCallback(async (nextSeason: Season) => {
    if (!program) return false;

    // Below head coach this is "let me look at last season", on this device
    // only. Everyone else's "this season" stays where the head coach put it.
    if (permissionsFor(role).editProgram) {
      const updated = await seasonService.activate(program.id, nextSeason.id);
      if (!updated) return false;
    }

    const nextSeasons = seasons.some((entry) => entry.id === nextSeason.id)
      ? seasons
      : [nextSeason, ...seasons];
    applyActiveSeason(nextSeasons, nextSeason.id);
    return true;
  }, [applyActiveSeason, program, seasons, role]);

  return (
    <ProgramContext.Provider value={{ program: changingUser ? null : program, season: changingUser ? null : season, seasons: changingUser ? [] : seasons, branding, loading: loading || authLoading || changingUser, offline, joinError, role: changingUser ? null : role, refresh, setSeason }}>
      {children}
    </ProgramContext.Provider>
  );
}
