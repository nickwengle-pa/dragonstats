import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  Calendar, Users, BarChart3, Settings, ChevronRight, Zap, Trophy, School, SlidersHorizontal,
} from "lucide-react";

interface LiveGame {
  id: string;
  opponent_name: string;
  our_score: number;
  opponent_score: number;
}

interface QuickStats {
  totalGames: number;
  wins: number;
  losses: number;
  rosterCount: number;
  nextGame: { opponent_name: string; game_date: string; is_home: boolean } | null;
  liveGame: LiveGame | null;
}

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const { program, season } = useProgramContext();
  const navigate = useNavigate();
  const [stats, setStats] = useState<QuickStats>({ totalGames: 0, wins: 0, losses: 0, rosterCount: 0, nextGame: null, liveGame: null });

  useEffect(() => {
    if (!season) return;
    (async () => {
      const [gamesRes, rosterRes] = await Promise.all([
        supabase.from("games").select("*, opponent:opponents(name)").eq("season_id", season.id).order("game_date"),
        supabase.from("season_rosters").select("id").eq("season_id", season.id).eq("is_active", true),
      ]);
      const games = gamesRes.data ?? [];
      const completed = games.filter((g: any) => g.status === "completed");
      const wins = completed.filter((g: any) => g.our_score > g.opponent_score).length;
      const losses = completed.filter((g: any) => g.our_score < g.opponent_score).length;
      const nextGame = games.find((g: any) => g.status === "scheduled");
      const live = games.find((g: any) => g.status === "live");
      setStats({
        totalGames: games.length,
        wins, losses,
        rosterCount: rosterRes.data?.length ?? 0,
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
    })();
  }, [season]);

  const programName = program?.name ?? "DRAGON STATS";
  const mascot = program?.mascot ?? "";

  return (
    <div className="screen safe-top safe-bottom lg:max-w-tablet lg:mx-auto">
      <div className="px-5 pt-6 pb-4 lg:px-8 lg:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-50">{program?.abbreviation ?? "DRAGON"} <span className="text-dragon-primary">STATS</span></h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {programName}{mascot ? ` ${mascot}` : ""}
            </p>
          </div>
          <button onClick={signOut} className="text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-pointer">
            Sign out
          </button>
        </div>

        {/* Live game banner */}
        {stats.liveGame && (
          <button
            onClick={() => navigate(`/game/${stats.liveGame!.id}`)}
            className="w-full card p-4 flex items-center gap-4 active:scale-[0.98] transition-all duration-200 mb-4 border-red-500/30 shadow-glow cursor-pointer"
            style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.12), rgba(220,38,38,0.03))" }}
          >
            <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-900/40 shadow-glow-sm">
              <span className="text-red-400 text-[10px] font-black uppercase animate-pulse">LIVE</span>
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-slate-100">vs {stats.liveGame.opponent_name}</div>
              <div className="text-sm font-mono font-bold text-slate-300">
                {stats.liveGame.our_score} – {stats.liveGame.opponent_score}
              </div>
            </div>
            <div className="text-xs font-bold text-red-400">Return to Game</div>
            <ChevronRight className="w-5 h-5 text-red-400" />
          </button>
        )}

        {/* Record card */}
        {stats.totalGames > 0 && (
          <div className="card p-4 mb-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: (program?.primary_color ?? "#dc2626") + "18" }}>
              <Trophy className="w-6 h-6" style={{ color: program?.primary_color ?? "#dc2626" }} />
            </div>
            <div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-50">{stats.wins} – {stats.losses}</div>
              <div className="text-xs text-slate-500 font-semibold">{season?.name ?? "Season"} Record</div>
            </div>
          </div>
        )}

        {/* Next game */}
        {stats.nextGame && (
          <button
            onClick={() => navigate("/schedule")}
            className="w-full card-hover p-4 flex items-center gap-4 active:scale-[0.98] transition-all duration-200 mb-4 cursor-pointer"
          >
            <div className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: (program?.primary_color ?? "#dc2626") + "18" }}>
              <Zap className="w-6 h-6" style={{ color: program?.primary_color ?? "#dc2626" }} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-slate-100">Next Game</div>
              <div className="text-sm text-slate-500">
                {stats.nextGame.is_home ? "vs" : "@"} {stats.nextGame.opponent_name} ·{" "}
                {new Date(stats.nextGame.game_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        )}

        {!stats.nextGame && stats.totalGames === 0 && (
          <button
            onClick={() => navigate("/schedule")}
            className="w-full card-hover p-4 flex items-center gap-4 active:scale-[0.98] transition-all duration-200 mb-4 cursor-pointer"
          >
            <div className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: (program?.primary_color ?? "#dc2626") + "18" }}>
              <Zap className="w-6 h-6" style={{ color: program?.primary_color ?? "#dc2626" }} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold text-slate-100">Get Started</div>
              <div className="text-sm text-slate-500">Add your roster and schedule</div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        )}
      </div>

      {/* Nav Grid */}
      <div className="px-5 lg:px-8 flex-1">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Schedule", icon: Calendar, path: "/schedule", desc: `${stats.totalGames} games` },
            { label: "Roster", icon: Users, path: "/roster", desc: `${stats.rosterCount} players` },
            { label: "Stats", icon: BarChart3, path: "/season-stats", desc: "Season stats" },
            { label: "Program", icon: School, path: "/settings", desc: "Team setup" },
            { label: "Game Setup", icon: SlidersHorizontal, path: "/game-settings", desc: "Rules & config" },
          ].map(item => (
            <button key={item.label} onClick={() => navigate(item.path)}
              className="card-hover p-4 text-left active:scale-[0.97] transition-all duration-200 cursor-pointer group">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-colors"
                style={{ backgroundColor: (program?.primary_color ?? "#dc2626") + "15" }}>
                <item.icon className="w-5 h-5 transition-colors" style={{ color: program?.primary_color ?? "#dc2626" }} />
              </div>
              <div className="font-bold text-sm text-slate-100">{item.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 text-center">
        <p className="text-xs text-slate-700 font-mono">Dragon Stats v0.1.0</p>
      </div>
    </div>
  );
}
