import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";
import { readSeasonGames, readSeasonRoster } from "@/services/offlineCache";
import { supabase } from "@/lib/supabase";
import {
  Calendar, Users, BarChart3, Settings, ChevronRight, Trophy, SlidersHorizontal,
  Home, LogOut, ClipboardList, FileText, Film, ChevronDown,
} from "lucide-react";

interface LiveGame {
  id: string;
  opponent_name: string;
  our_score: number;
  opponent_score: number;
}

/** A finished game, and the four ways of reading it back. */
interface CompletedGame {
  id: string;
  opponent_name: string;
  our_score: number;
  opponent_score: number;
  game_date: string;
  is_home: boolean;
}

/** Everything recorded about a game, in the order you would want it after
 *  one: the sheet you hand round, the short version, the whole picture, the
 *  play-by-play you take to film. */
const GAME_VIEWS = [
  { label: "Game Report", desc: "Full stat sheet", icon: ClipboardList, path: "report" },
  { label: "Box Score", desc: "Line & team stats", icon: FileText, path: "boxscore" },
  { label: "Summary", desc: "Drives & leaders", icon: BarChart3, path: "summary" },
  { label: "Play by Play", desc: "Every play", icon: Film, path: "review" },
] as const;

interface QuickStats {
  totalGames: number;
  wins: number;
  losses: number;
  ties: number;
  rosterCount: number;
  nextGame: { opponent_name: string; game_date: string; is_home: boolean } | null;
  liveGame: LiveGame | null;
}

/* ── Bottom Tab Bar ── */

function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const current = location.pathname;

  const tabs = [
    { id: "/", icon: Home, label: "Home" },
    { id: "/schedule", icon: Calendar, label: "Schedule" },
    { id: "/roster", icon: Users, label: "Roster" },
    { id: "/season-stats", icon: BarChart3, label: "Stats" },
    { id: "/settings", icon: Settings, label: "Program" },
  ];

  return (
    <nav className="tab-bar">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => navigate(tab.id)}
          className={`tab-bar-item ${current === tab.id ? "active" : ""}`}
        >
          <tab.icon className="w-5 h-5" strokeWidth={current === tab.id ? 2.5 : 1.5} />
          <span className="tab-bar-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export { TabBar };

/* ── Dashboard ── */

export default function DashboardScreen() {
  const { signOut } = useAuth();
  const { program, season } = useProgramContext();
  const navigate = useNavigate();
  const [stats, setStats] = useState<QuickStats>({ totalGames: 0, wins: 0, losses: 0, ties: 0, rosterCount: 0, nextGame: null, liveGame: null });
  /* The tiles start at zero and are filled in by an async load, so every
     visit to this screen flashed "0 games, 0 players" before the real numbers
     landed. Harmless online — for about 300ms. Offline the load never
     populates and those zeros just sit there, which is indistinguishable from
     a season with no games in it. Show a dash until we actually know. */
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [completedGames, setCompletedGames] = useState<CompletedGame[]>([]);
  /* One game open at a time. Four buttons per game on a phone would otherwise
     push the list off the screen before the second result. */
  const [openGameId, setOpenGameId] = useState<string | null>(null);

  useEffect(() => {
    if (!season) return;
    (async () => {
      /* Both go through the shared cached readers. This is the screen the app
         opens on, so it is also where the cache gets warmed in practice — and
         it was the screen reporting "0 games and 0 players" offline, because
         it ran its own uncached queries. */
      const [gamesRead, rosterRead] = await Promise.all([
        readSeasonGames<any>(season.id),
        readSeasonRoster<any>(season.id),
      ]);
      const games = gamesRead.value ?? [];
      const rosterRows = rosterRead.value ?? [];
      const completed = games.filter((g: any) => g.status === "completed");
      const wins = completed.filter((g: any) => g.our_score > g.opponent_score).length;
      const losses = completed.filter((g: any) => g.our_score < g.opponent_score).length;
      const ties = completed.filter((g: any) => g.our_score === g.opponent_score).length;
      const nextGame = games.find((g: any) => g.status === "scheduled");
      const live = games.find((g: any) => g.status === "live");
      setStats({
        totalGames: games.length,
        wins, losses, ties,
        rosterCount: rosterRows.length,
        nextGame: nextGame ? {
          opponent_name: (nextGame as any).opponent?.name ?? "TBD",
          game_date: nextGame.game_date,
          is_home: nextGame.is_home,
        } : null,
        liveGame: live ? {
          id: live.id,
          opponent_name: (live as any).opponent?.name ?? "Opponent",
          our_score: live.our_score,
          opponent_score: live.opponent_score,
        } : null,
      });
      /* Most recent first: the game you want to read about is almost always
         the one just played. game_date is a date string, so it sorts. */
      setCompletedGames(
        [...completed]
          .sort((a: any, b: any) => String(b.game_date ?? "").localeCompare(String(a.game_date ?? "")))
          .map((g: any) => ({
            id: g.id,
            opponent_name: g.opponent?.name ?? "Opponent",
            our_score: g.our_score ?? 0,
            opponent_score: g.opponent_score ?? 0,
            game_date: g.game_date,
            is_home: g.is_home,
          })),
      );
      setStatsLoaded(true);
    })();
  }, [season]);

  const programName = program?.name ?? "DRAGON STATS";
  const mascot = program?.mascot ?? "";
  const primaryColor = program?.primary_color ?? "#dc2626";
  const record = statsLoaded ? `${stats.wins}-${stats.losses}` : "\u2013";
  const ties = statsLoaded && stats.ties > 0 ? `-${stats.ties}` : "";

  return (
    <div className="screen safe-top lg:max-w-tablet lg:mx-auto pb-20">
      {/* Header */}
      <div className="px-5 pt-6 pb-2 lg:px-8 lg:pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {program?.logo_url ? (
              <img src={program.logo_url} alt={programName} className="w-10 h-10 object-contain rounded-xl" />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-sm text-white italic"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}bb)` }}>
                {(program?.abbreviation ?? "DS").slice(0, 2)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-display font-extrabold tracking-[0.1em] uppercase">
                {program?.abbreviation ?? "DRAGON"} STATS
              </h1>
              <p className="text-[11px] font-display font-semibold text-surface-muted uppercase tracking-wider">
                {season?.name ?? "Season"}{mascot ? ` \u00b7 ${mascot}` : ""}
              </p>
            </div>
          </div>
          <button onClick={signOut} className="p-2 text-surface-muted hover:text-white transition-colors cursor-pointer" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Accent line */}
      <div className="mx-5 mt-3 mb-5 accent-line" />

      <div className="px-5 lg:px-8 space-y-4">
        {/* Live game banner */}
        {stats.liveGame && (
          <button
            onClick={() => navigate(`/game/${stats.liveGame!.id}`)}
            className="w-full rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer border border-red-500/20 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.12), rgba(220,38,38,0.03))" }}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, #dc2626, transparent)" }} />
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-900/40 relative">
              <div className="live-dot absolute" />
              <span className="text-red-400 text-[9px] font-display font-black uppercase tracking-wider mt-4">LIVE</span>
            </div>
            <div className="flex-1 text-left">
              <div className="font-display font-bold text-sm uppercase tracking-wide">vs {stats.liveGame.opponent_name}</div>
              <div className="text-xl font-display font-extrabold tabular-nums mt-0.5" style={{ color: primaryColor }}>
                {stats.liveGame.our_score} <span className="text-surface-muted text-base">&ndash;</span> {stats.liveGame.opponent_score}
              </div>
            </div>
            <div className="text-[10px] font-display font-bold text-red-400 uppercase tracking-wider">Return</div>
            <ChevronRight className="w-4 h-4 text-red-400/60" />
          </button>
        )}

        {/* Record + Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center col-span-1">
            <div className="stat-value" style={{ color: primaryColor }}>{record}{ties}</div>
            <div className="stat-label mt-1">Record</div>
          </div>
          <div className="card p-4 text-center col-span-1">
            <div className="stat-value text-white">{statsLoaded ? stats.totalGames : "\u2013"}</div>
            <div className="stat-label mt-1">Games</div>
          </div>
          <div className="card p-4 text-center col-span-1">
            <div className="stat-value text-white">{statsLoaded ? stats.rosterCount : "\u2013"}</div>
            <div className="stat-label mt-1">Players</div>
          </div>
        </div>

        {/* Next game card */}
        {stats.nextGame && (
          <button
            onClick={() => navigate("/schedule")}
            className="w-full card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer card-hover"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${primaryColor}18` }}>
              <Calendar className="w-5 h-5" style={{ color: primaryColor }} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-[10px] font-display font-bold text-surface-muted uppercase tracking-widest">Next Game</div>
              <div className="font-display font-bold text-sm uppercase tracking-wide mt-0.5">
                {stats.nextGame.is_home ? "vs" : "@"} {stats.nextGame.opponent_name}
              </div>
              <div className="text-xs text-surface-muted font-medium mt-0.5">
                {new Date(stats.nextGame.game_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-surface-muted/40" />
          </button>
        )}

        {!stats.nextGame && stats.totalGames === 0 && (
          <button
            onClick={() => navigate("/schedule")}
            className="w-full card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer card-hover"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${primaryColor}18` }}>
              <Calendar className="w-5 h-5" style={{ color: primaryColor }} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-display font-bold text-sm uppercase tracking-wide">Get Started</div>
              <div className="text-xs text-surface-muted font-medium mt-0.5">Add your roster and schedule</div>
            </div>
            <ChevronRight className="w-4 h-4 text-surface-muted/40" />
          </button>
        )}

        {/* Completed games — every finished game, and the four ways of reading
            one back. The reports existed and were reachable only by walking
            Schedule to a game to its summary, which is three taps to find out
            how many carries somebody had last Friday. */}
        {completedGames.length > 0 && (
          <>
            <div className="section-title mt-6">Completed Games</div>
            <div className="space-y-2">
              {completedGames.map(g => {
                const open = openGameId === g.id;
                const won = g.our_score > g.opponent_score;
                const tied = g.our_score === g.opponent_score;
                return (
                  <div key={g.id} className="card overflow-hidden">
                    <button
                      onClick={() => setOpenGameId(open ? null : g.id)}
                      className="w-full p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform cursor-pointer"
                    >
                      <span
                        className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-display font-black ${
                          tied
                            ? "bg-slate-500/15 text-slate-400"
                            : won
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {tied ? "T" : won ? "W" : "L"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold text-sm uppercase tracking-wide truncate">
                          {g.is_home ? "vs" : "@"} {g.opponent_name}
                        </div>
                        <div className="text-[11px] text-surface-muted font-medium mt-0.5">
                          {g.game_date
                            ? new Date(g.game_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </div>
                      </div>
                      <div className="text-base font-display font-extrabold tabular-nums shrink-0">
                        {g.our_score}<span className="text-surface-muted/50 mx-0.5">&ndash;</span>{g.opponent_score}
                      </div>
                      {open
                        ? <ChevronDown className="w-4 h-4 text-surface-muted/40 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-surface-muted/40 shrink-0" />}
                    </button>

                    {open && (
                      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                        {GAME_VIEWS.map(view => (
                          <button
                            key={view.path}
                            onClick={() => navigate(`/game/${g.id}/${view.path}`)}
                            className="rounded-xl border border-surface-border bg-surface-bg p-3 text-left active:scale-[0.97] transition-transform cursor-pointer"
                          >
                            <view.icon className="w-4 h-4 mb-2" style={{ color: primaryColor }} />
                            <div className="font-display font-bold text-[12px] uppercase tracking-wide leading-tight">
                              {view.label}
                            </div>
                            <div className="text-[10px] text-surface-muted font-medium mt-0.5 leading-tight">
                              {view.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Nav Grid */}
        <div className="section-title mt-6">Quick Access</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Schedule", icon: Calendar, path: "/schedule", desc: `${stats.totalGames} games` },
            { label: "Roster", icon: Users, path: "/roster", desc: `${stats.rosterCount} players` },
            { label: "Season Stats", icon: BarChart3, path: "/season-stats", desc: "Full breakdown" },
            { label: "Game Setup", icon: SlidersHorizontal, path: "/game-settings", desc: "Rules & config" },
          ].map(item => (
            <button key={item.label} onClick={() => navigate(item.path)}
              className="card p-4 text-left active:scale-[0.97] transition-transform cursor-pointer card-hover group">
              <div className="flex items-center justify-between mb-3">
                <item.icon className="w-5 h-5 transition-colors" style={{ color: primaryColor }} />
                <ChevronRight className="w-3.5 h-3.5 text-surface-muted/30 group-hover:text-surface-muted transition-colors" />
              </div>
              <div className="font-display font-bold text-sm uppercase tracking-wide">{item.label}</div>
              <div className="text-[11px] text-surface-muted font-medium mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Version */}
      <div className="px-5 py-6 mt-4 text-center">
        <p className="text-[10px] font-display font-semibold text-surface-muted/30 uppercase tracking-[0.2em]">Dragon Stats v1.0.0</p>
      </div>

      <TabBar />
    </div>
  );
}
