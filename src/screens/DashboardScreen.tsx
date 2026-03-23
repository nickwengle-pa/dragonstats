import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Calendar, Users, BarChart3, Settings, ChevronRight, Zap,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Schedule", icon: Calendar, path: "/schedule", desc: "Games & scores" },
  { label: "Roster", icon: Users, path: "/roster", desc: "Players & positions" },
  { label: "Stats", icon: BarChart3, path: "/schedule", desc: "Season stats" },
  { label: "Settings", icon: Settings, path: "/settings", desc: "Program setup" },
];

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight">DRAGON STATS</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              {user?.email}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Quick Action */}
        <button
          onClick={() => navigate("/schedule")}
          className="w-full card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-dragon-primary/20 flex items-center justify-center">
            <Zap className="w-6 h-6 text-dragon-primary" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-bold">Start Tracking</div>
            <div className="text-sm text-neutral-500">Open a game and record plays</div>
          </div>
          <ChevronRight className="w-5 h-5 text-neutral-600" />
        </button>
      </div>

      {/* Navigation Grid */}
      <div className="px-5 flex-1">
        <div className="grid grid-cols-2 gap-3">
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="card p-4 text-left active:scale-[0.97] transition-transform"
            >
              <item.icon className="w-6 h-6 text-dragon-primary mb-3" />
              <div className="font-bold text-sm">{item.label}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 text-center">
        <p className="text-xs text-neutral-700">Dragon Stats v0.1.0</p>
      </div>
    </div>
  );
}
