import { lazy, Suspense } from "react";
import { ProgramContext } from "@/hooks/useProgramContext";
import type { Program } from "@/services/programService";
import type { Season } from "@/services/seasonService";
import { normalizeRole } from "@/services/access";

/* A development-only stage for the four tab screens, mounted from main.tsx at
   /screens-preview?screen=schedule|roster|stats|program|changes. It renders the real
   screen with no program context, so nothing loads — the point is to see the
   header and the Broadcast palette on the real markup in both themes without
   standing up auth. `?theme=dark` is honoured the same way as /home-preview,
   and `?role=head_coach|assistant|staff` shows a screen as that role sees it
   (admin by default). */

{
  const t = new URLSearchParams(window.location.search).get("theme");
  if (t === "light" || t === "dark") { try { localStorage.setItem("ds-theme", t); } catch { /* ignore */ } }
}

const SCREENS = {
  schedule: lazy(() => import("./ScheduleScreen")),
  roster: lazy(() => import("./RosterScreen")),
  stats: lazy(() => import("./SeasonStatsScreen")),
  program: lazy(() => import("./SettingsScreen")),
  changes: lazy(() => import("./ChangeLogScreen")),
};

const SeasonStats = SCREENS.stats;
function SeasonStatsSample() {
  return <SeasonStats loader={sampleLoader} />;
}

const PROGRAM: Program = {
  id: "preview-program", name: "Purchase Line", abbreviation: "PL", mascot: "Dragons",
  primary_color: "#dc2626", secondary_color: "#f59e0b", accent_color: null, logo_url: null, wordmark_url: null,
  city: "Commodore", state: "PA", owner_id: null, game_config: null,
};
const SEASON: Season = {
  id: "preview-season", program_id: PROGRAM.id, year: 2026, name: "2026 Varsity", level: "varsity",
  is_active: true, start_date: null, end_date: null,
};

/* `?screen=stats&sample=1` fills Season Stats with the made-up season the
   Season Book tests use (sampleSeason.ts), under that season's own team, so
   the views, the drill-down and the PDF can be tried with no database. */
const SAMPLE_PROGRAM: Program = {
  ...PROGRAM, id: "sample-program", name: "Sample Dragons", abbreviation: "SD", mascot: "Dragons", primary_color: "#d7141a",
};
const sampleLoader = async (_seasonId: string, opts: { onProgress?: (done: number, total: number) => void } = {}) => {
  const { sampleSeasonGames } = await import("@/services/sampleSeason");
  const games = sampleSeasonGames();
  opts.onProgress?.(games.length, games.length);
  return games;
};

export default function ScreensPreview() {
  const params = new URLSearchParams(window.location.search);
  const which = (params.get("screen") ?? "schedule") as keyof typeof SCREENS;
  const sample = which === "stats" && params.get("sample") === "1";
  const Screen = SCREENS[which] ?? SCREENS.schedule;
  const role = normalizeRole(params.get("role") ?? "admin");
  const program = sample ? SAMPLE_PROGRAM : PROGRAM;
  /* A fake program and season so the screens get past their guards. The
     data reads behind them hit Supabase unauthenticated and come back empty,
     which is the empty state — fine for looking at chrome. */
  return (
    <ProgramContext.Provider value={{
      program, season: SEASON, seasons: [SEASON],
      branding: { primaryColor: program.primary_color, secondaryColor: program.secondary_color, accentColor: null, logoUrl: null, wordmarkUrl: null },
      loading: false, offline: false, joinError: null, role, refresh: async () => {}, setSeason: async () => false,
    }}>
      <Suspense fallback={<p>Loading {which}…</p>}>
        {sample ? <SeasonStatsSample /> : <Screen />}
      </Suspense>
    </ProgramContext.Provider>
  );
}
