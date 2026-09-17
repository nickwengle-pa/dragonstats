import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";
import { useTheme } from "@/hooks/useTheme";
import { readSeasonGames, readSeasonRoster, readSeasonReviewCounts } from "@/services/offlineCache";
import HomeBroadcast, { type HomeGame } from "@/components/home/HomeBroadcast";
import { TabBar } from "@/components/TabBar";

/* Other screens import the tab bar from here; it moved to its own file when
   the home screen was redesigned, and this keeps their imports working. */
export { TabBar };

/** One game row as the cached reader returns it, narrowed to what the home
 *  screen reads. The reader is `select("*, opponent:opponents(*)")`. */
interface GameRow {
  id: string;
  status: string;
  our_score: number | null;
  opponent_score: number | null;
  game_date: string | null;
  kickoff_time?: string | null;
  is_home: boolean;
  tags: unknown;
  current_quarter?: number | null;
  current_clock?: string | null;
  current_down?: number | null;
  current_distance?: number | null;
  current_yard_line?: number | null;
  current_possession?: string | null;
  opponent?: { name?: string; abbreviation?: string | null; primary_color?: string | null; logo_url?: string | null } | null;
}

function toHomeGame(g: GameRow, toReview: number | null): HomeGame {
  return {
    id: g.id,
    status: g.status,
    opponent: g.opponent ? {
      name: g.opponent.name ?? "Opponent",
      abbreviation: g.opponent.abbreviation ?? null,
      primary_color: g.opponent.primary_color ?? null,
      logo_url: g.opponent.logo_url ?? null,
    } : null,
    our_score: g.our_score ?? 0,
    opponent_score: g.opponent_score ?? 0,
    game_date: g.game_date,
    kickoff_time: g.kickoff_time ?? null,
    is_home: g.is_home,
    tags: g.tags,
    toReview,
    current_quarter: g.current_quarter,
    current_clock: g.current_clock,
    current_down: g.current_down,
    current_distance: g.current_distance,
    current_yard_line: g.current_yard_line,
    current_possession: g.current_possession,
  };
}

/* ── Dashboard ──
   The loader. Everything visual is HomeBroadcast, which also renders from
   fixtures at /home-preview in dev. */

export default function DashboardScreen() {
  const { signOut } = useAuth();
  const { program, season } = useProgramContext();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();

  const [games, setGames] = useState<HomeGame[]>([]);
  const [rosterCount, setRosterCount] = useState<number | null>(null);
  /* The record and the counts start unknown and are filled in by an async
     load. Offline the load never populates, and a zero there is
     indistinguishable from a season with no games in it — so the view shows a
     dash until this flips. */
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setLoaded(false); setGames([]); setRosterCount(null);
  }, [season?.id]);

  useEffect(() => {
    if (!season) return;
    let cancelled = false;
    setLoading(true); setLoadError("");
    (async () => {
      try {
        /* Both go through the shared cached readers. This is the screen the
           app opens on, so it is also where the cache gets warmed in practice
           — and it was the screen reporting "0 games and 0 players" offline,
           because it ran its own uncached queries. */
        const [gamesRead, rosterRead] = await Promise.all([
          readSeasonGames<GameRow>(season.id),
          readSeasonRoster<unknown>(season.id),
        ]);
        if (cancelled) return;
        if (!gamesRead.value || !rosterRead.value) throw new Error("Could not load the schedule and roster. Check your connection and try again.");
        const rows = gamesRead.value;
        setRosterCount(rosterRead.value.length);
        setGames(rows.map(g => toHomeGame(g, null)));
        setLoaded(true);
        setLoading(false);

        /* How much post-game work is still outstanding per game. Deliberately
           after the games land, since it needs their ids, and deliberately
           tolerant of failure: a coach who cannot reach the server should
           still get the list, just without the amber counts. */
        const completedIds = rows.filter(g => g.status === "completed").map(g => g.id);
        const reviewRead = await readSeasonReviewCounts(season.id, completedIds)
          .catch((err) => {
            /* Loud rather than silent. A failure here degrades to "count not
               known", which renders as no amber chip at all - indistinguishable
               from a season with nothing outstanding, and so exactly the kind
               of bug that survives for months. */
            console.warn("[dashboard] review counts unavailable:", err);
            return null;
          });
        const reviewCounts = reviewRead?.value ?? null;
        if (cancelled) return;
        setGames(rows.map(g => toHomeGame(g, reviewCounts ? (reviewCounts[g.id] ?? 0) : null)));
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load the home screen. Please try again.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [season, retry]);

  return (
    <HomeBroadcast
      data={{
        abbreviation: program?.abbreviation ?? "DRAGON",
        programName: program?.name ?? "Dragon Stats",
        mascot: program?.mascot ?? null,
        seasonLabel: season?.name ?? (season ? `${season.year} ${season.level}` : "Season"),
        logoUrl: program?.logo_url ?? null,
        primaryColor: program?.primary_color ?? "#dc2626",
        rosterCount,
        games,
        loaded,
      }}
      theme={theme}
      onToggleTheme={toggleTheme}
      onNavigate={(path) => navigate(path)}
      onSignOut={() => { void signOut(); }}
      loading={loading}
      error={loadError}
      onRetry={() => setRetry(n => n + 1)}
      version="v2.0.0"
    />
  );
}
