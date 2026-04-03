import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import {
  Calendar, Users, BarChart3, Settings, ChevronRight, Zap, Trophy,
} from "lucide-react";

interface QuickStats {
  totalGames: number;
  wins: number;
  losses: number;
  rosterCount: number;
  nextGame: { opponent_name: string; game_date: string; is_home: boolean } | null;
}

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const { program, season } = useProgramContext();
  const navigate = useNavigate();
  const [stats, setStats] = useState<QuickStats>({ totalGames: 0, wins: 0, losses: 0, rosterCount: 0, nextGame: null });

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
      setStats({
        totalGames: games.length,
        wins, losses,
        rosterCount: rosterRes.data?.length ?? 0,
        nextGame: nextGame ? {
          opponent_name: (nextGame as any).opponent?.name ?? "TBD",
          game_date: nextGame.game_date,
          is_home: nextGame.is_home,
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
            <h1 className="text-2xl font-black tracking-tight">{program?.abbreviation ?? "DRAGON"} STATS</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              {programName}{mascot ? ` ${mascot}` : ""}
            </p>
          </div>
          <button onClick={signOut} className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">
            Sign out
          </button>
        </div>

        {/* Record card */}
        {stats.totalGames > 0 && (
          <div className="card p-4 mb-4 flex items-center gap-4">
            <Trophy className="w-8 h-8 shrink-0" style={{ color: program?.primary_color ?? "#dc2626" }} />
            <div>
              <div className="text-2xl font-black">{stats.wins} – {stats.losses}</div>
              <div className="text-xs text-neutral-500 font-semibold">{season?.name ?? "Season"} Record</div>
            </div>
          </div>
        )}

        {/* Next game */}
        {stats.nextGame && (
          <button
            onClick={() => navigate("/schedule")}
            className="w-full card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform mb-4"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: (program?.primary_color ?? "#dc2626") + "20" }}>
              <Zap className="w-6 h-6" style={{ color: program?.primary_color ?? "#dc2626" }} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold">Next Game</div>
              <div className="text-sm text-neutral-500">
                {stats.nextGame.is_home ? "vs" : "@"} {stats.nextGame.opponent_name} ·{" "}
                {new Date(stats.nextGame.game_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-neutral-600" />
          </button>
        )}

        {!stats.nextGame && stats.totalGames === 0 && (
          <button
            onClick={() => navigate("/schedule")}
            className="w-full card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform mb-4"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: (program?.primary_color ?? "#dc2626") + "20" }}>
              <Zap className="w-6 h-6" style={{ color: program?.primary_color ?? "#dc2626" }} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-bold">Get Started</div>
              <div className="text-sm text-neutral-500">Add your roster and schedule</div>
            </div>
            <ChevronRight className="w-5 h-5 text-neutral-600" />
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
            { label: "Settings", icon: Settings, path: "/settings", desc: "Program setup" },
          ].map(item => (
            <button key={item.label} onClick={() => navigate(item.path)}
              className="card p-4 text-left active:scale-[0.97] transition-transform">
              <item.icon className="w-6 h-6 mb-3" style={{ color: program?.primary_color ?? "#dc2626" }} />
              <div className="font-bold text-sm">{item.label}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 text-center">
        <p className="text-xs text-neutral-700">Dragon Stats v0.1.0</p>
      </div>
    </div>
  );
}
