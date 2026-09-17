import { useLocation, useNavigate } from "react-router-dom";
import { GoalpostIcon, CalendarIcon, JerseyIcon, StatsIcon, HeadsetIcon } from "@/components/icons/BroadcastIcons";
import "@/screens/homeBroadcast.css";

const TABS = [
  { id: "/", Icon: GoalpostIcon, label: "Home" },
  { id: "/schedule", Icon: CalendarIcon, label: "Schedule" },
  { id: "/roster", Icon: JerseyIcon, label: "Roster" },
  { id: "/season-stats", Icon: StatsIcon, label: "Stats" },
  { id: "/settings", Icon: HeadsetIcon, label: "Program" },
] as const;

/** The bottom tab bar, shared by every top-level screen. Black on both
 *  palettes so it reads the same over the dark screens and the studio stage. */
export function TabBar() {
  const navigate = useNavigate();
  const current = useLocation().pathname;
  return (
    <nav className="bc-tabbar" aria-label="Main">
      {TABS.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => navigate(id)}
          className={`bc-tab ${current === id ? "active" : ""}`}
          aria-current={current === id ? "page" : undefined}
        >
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
