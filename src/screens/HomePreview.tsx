import { useState } from "react";
import HomeBroadcast, { type HomeData, type HomeGame } from "@/components/home/HomeBroadcast";
import { useTheme } from "@/hooks/useTheme";
import dragon from "@/assets/pl-dragon.png";

/* A development-only stage for the home screen, mounted from main.tsx at
   /home-preview. It renders the real component from fixtures so the layout
   can be checked at phone and iPad widths, in both palettes, and in every
   state the loader can produce — without standing up auth and a season.

   ?state=live      a game in progress (the scorebug replaces the hero)
   ?state=empty     brand-new program, nothing scheduled
   ?state=done      season over, no next game
   ?state=loading   first load, nothing known yet
   ?state=error     the loader failed
   ?theme=dark      start in the dark palette (it is saved like a real toggle) */

{
  const t = new URLSearchParams(window.location.search).get("theme");
  if (t === "light" || t === "dark") { try { localStorage.setItem("ds-theme", t); } catch { /* ignore */ } }
}

const OPP = {
  riverside: { name: "Riverside", abbreviation: "RIV", primary_color: "#1d4ed8", logo_url: null },
  hillcrest: { name: "Hillcrest", abbreviation: "HIL", primary_color: "#047857", logo_url: null },
  central: { name: "Central Valley", abbreviation: "CV", primary_color: "#7c3aed", logo_url: null },
  marion: { name: "Marion", abbreviation: "MAR", primary_color: "#b45309", logo_url: null },
  north: { name: "North County", abbreviation: "NC", primary_color: "#0e7490", logo_url: null },
  bellwood: { name: "Bellwood", abbreviation: "BEL", primary_color: "#4b5563", logo_url: null },
  penns: { name: "Penns Manor", abbreviation: "PM", primary_color: "#9f1239", logo_url: null },
};

function iso(daysFromToday: number): string {
  const d = new Date(); d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const game = (o: Partial<HomeGame> & { id: string }): HomeGame => ({
  status: "completed", opponent: null, our_score: 0, opponent_score: 0, game_date: null, kickoff_time: null,
  is_home: true, tags: null, toReview: null, ...o,
});

const PLAYED: HomeGame[] = [
  game({ id: "g5", opponent: OPP.hillcrest, our_score: 28, opponent_score: 14, game_date: iso(-6), is_home: false, toReview: 3 }),
  game({ id: "g4", opponent: OPP.central, our_score: 35, opponent_score: 7, game_date: iso(-13), tags: ["stats_final"] }),
  game({ id: "g3", opponent: OPP.marion, our_score: 17, opponent_score: 21, game_date: iso(-20), is_home: false, tags: ["stats_final"] }),
  game({ id: "g2", opponent: OPP.north, our_score: 42, opponent_score: 0, game_date: iso(-27), tags: ["stats_final"] }),
  game({ id: "g1", opponent: OPP.bellwood, our_score: 24, opponent_score: 20, game_date: iso(-34), toReview: 0 }),
];

const UPCOMING: HomeGame[] = [
  game({ id: "g6", status: "scheduled", opponent: OPP.riverside, game_date: iso(2), kickoff_time: "19:00" }),
  game({ id: "g7", status: "scheduled", opponent: OPP.penns, game_date: iso(9), kickoff_time: "7:00 PM", is_home: false }),
  game({ id: "g8", status: "scheduled", opponent: OPP.central, game_date: iso(16), kickoff_time: "19:00" }),
  game({ id: "g9", status: "scheduled", opponent: OPP.marion, game_date: iso(23), kickoff_time: "19:00" }),
];

const LIVE: HomeGame = game({
  id: "g6", status: "live", opponent: OPP.riverside, our_score: 21, opponent_score: 14, game_date: iso(0), kickoff_time: "19:00",
  current_quarter: 3, current_clock: "7:42", current_down: 2, current_distance: 7, current_yard_line: 66, current_possession: "us",
});

const BASE: HomeData = {
  abbreviation: "PL",
  programName: "Purchase Line",
  mascot: "Dragons",
  seasonLabel: "2026 Varsity",
  logoUrl: dragon,
  primaryColor: "#dc2626",
  rosterCount: 42,
  games: [...PLAYED, ...UPCOMING],
  loaded: true,
};

export default function HomePreview() {
  const [theme, toggleTheme] = useTheme();
  const [log, setLog] = useState<string[]>([]);
  const state = new URLSearchParams(window.location.search).get("state") ?? "";

  let data = BASE;
  let loading = false;
  let error = "";
  if (state === "live") data = { ...BASE, games: [...PLAYED, LIVE, ...UPCOMING.slice(1)] };
  if (state === "empty") data = { ...BASE, games: [], rosterCount: 0 };
  if (state === "done") data = { ...BASE, games: PLAYED };
  if (state === "loading") { data = { ...BASE, games: [], rosterCount: null, loaded: false }; loading = true; }
  if (state === "error") { data = { ...BASE, games: [], rosterCount: null, loaded: false }; error = "Could not load the schedule and roster. Check your connection and try again."; }

  return (
    <>
      <HomeBroadcast
        data={data}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={(p) => setLog(l => [`navigate ${p}`, ...l].slice(0, 6))}
        onSignOut={() => setLog(l => ["sign out", ...l].slice(0, 6))}
        loading={loading}
        error={error}
        onRetry={() => setLog(l => ["retry", ...l].slice(0, 6))}
        version="v2.0.0 · preview"
      />
      {log.length > 0 && (
        <pre data-testid="nav-log" style={{ position: "fixed", top: 8, right: 8, zIndex: 50, margin: 0, padding: "6px 8px", font: "11px monospace", background: "#0b0d10", color: "#f5a800", opacity: .9 }}>
          {log.join("\n")}
        </pre>
      )}
    </>
  );
}
