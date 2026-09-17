import { lazy, Suspense } from "react";
import { ProgramContext } from "@/hooks/useProgramContext";
import type { Program } from "@/services/programService";
import type { Season } from "@/services/seasonService";

/* A development-only stage for the four tab screens, mounted from main.tsx at
   /screens-preview?screen=schedule|roster|stats|program. It renders the real
   screen with no program context, so nothing loads — the point is to see the
   header and the Broadcast palette on the real markup in both themes without
   standing up auth. `?theme=dark` is honoured the same way as /home-preview. */

{
  const t = new URLSearchParams(window.location.search).get("theme");
  if (t === "light" || t === "dark") { try { localStorage.setItem("ds-theme", t); } catch { /* ignore */ } }
}

const SCREENS = {
  schedule: lazy(() => import("./ScheduleScreen")),
  roster: lazy(() => import("./RosterScreen")),
  stats: lazy(() => import("./SeasonStatsScreen")),
  program: lazy(() => import("./SettingsScreen")),
};

const PROGRAM: Program = {
  id: "preview-program", name: "Purchase Line", abbreviation: "PL", mascot: "Dragons",
  primary_color: "#dc2626", secondary_color: "#f59e0b", accent_color: null, logo_url: null, wordmark_url: null,
  city: "Commodore", state: "PA", owner_id: null, game_config: null,
};
const SEASON: Season = {
  id: "preview-season", program_id: PROGRAM.id, year: 2026, name: "2026 Varsity", level: "varsity",
  is_active: true, start_date: null, end_date: null,
};

export default function ScreensPreview() {
  const which = (new URLSearchParams(window.location.search).get("screen") ?? "schedule") as keyof typeof SCREENS;
  const Screen = SCREENS[which] ?? SCREENS.schedule;
  /* A fake program and season so the screens get past their guards. The
     data reads behind them hit Supabase unauthenticated and come back empty,
     which is the empty state — fine for looking at chrome. */
  return (
    <ProgramContext.Provider value={{
      program: PROGRAM, season: SEASON, seasons: [SEASON],
      branding: { primaryColor: PROGRAM.primary_color, secondaryColor: PROGRAM.secondary_color, accentColor: null, logoUrl: null, wordmarkUrl: null },
      loading: false, offline: false, joinError: null, refresh: async () => {}, setSeason: async () => false,
    }}>
      <Suspense fallback={<p>Loading {which}…</p>}>
        <Screen />
      </Suspense>
    </ProgramContext.Provider>
  );
}
