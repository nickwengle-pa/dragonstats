import { useEffect, useState } from "react";
import { PLAY_TYPES, type PlayTypeDef } from "./types";

type PhaseFilter = "all" | "offense" | "defense" | "special";

interface Props {
  onSelect: (pt: PlayTypeDef) => void;
  possession: "us" | "them";
  progName: string;
  oppName: string;
  suggestedPhase?: PhaseFilter;
  /** Current down — drives which buttons get the oversized hit target. */
  down?: number;
  /** Yards to go, shown alongside the down in the possession band. */
  distance?: number;
  /** Team colors, so the band and the active phase tab wear the colors of
   *  whoever has the ball. */
  progColor?: string;
  oppColor?: string;
}

/** "2nd", "3rd" — for the down readout in the possession band. */
function ordinalDown(down: number): string {
  if (down === 1) return "1st";
  if (down === 2) return "2nd";
  if (down === 3) return "3rd";
  return `${down}th`;
}

/**
 * The plays you're overwhelmingly most likely to tap, given the down. These
 * render double-width and taller so they can be hit without looking down at
 * the tablet — the whole point of live entry is keeping your eyes on the field.
 *
 * 1st–3rd: run and the two pass outcomes. 4th: punt and field goal.
 */
function primaryPlayIds(down: number | undefined): Set<string> {
  if (down === 4) return new Set(["punt", "fg"]);
  return new Set(["rush", "pass_comp", "pass_inc"]);
}

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-950/80 text-emerald-400 border-emerald-800/40 hover:bg-emerald-900/60",
  blue: "bg-blue-950/80 text-blue-400 border-blue-800/40 hover:bg-blue-900/60",
  red: "bg-red-950/80 text-red-400 border-red-800/40 hover:bg-red-900/60",
  amber: "bg-amber-950/80 text-amber-400 border-amber-800/40 hover:bg-amber-900/60",
  purple: "bg-purple-950/80 text-purple-400 border-purple-800/40 hover:bg-purple-900/60",
  orange: "bg-orange-950/80 text-orange-400 border-orange-800/40 hover:bg-orange-900/60",
  yellow: "bg-yellow-950/80 text-yellow-400 border-yellow-800/40 hover:bg-yellow-900/60",
  neutral: "bg-neutral-900/80 text-neutral-400 border-neutral-800/40 hover:bg-neutral-800/60",
};

const CATEGORY_ORDER: Record<string, number> = {
  run: 0,
  pass: 1,
  scoring: 2,
  kicking: 3,
  turnover: 4,
  other: 5,
};

/** Rail color per group, matched to the play-button color family inside it. */
const CATEGORY_ACCENT: Record<string, string> = {
  run: "#34d399",       // emerald
  pass: "#60a5fa",      // blue
  scoring: "#fbbf24",   // amber
  kicking: "#c084fc",   // purple
  turnover: "#fb923c",  // orange
  other: "#facc15",     // yellow
};

const CATEGORY_LABELS: Record<string, string> = {
  run: "Run",
  pass: "Pass",
  scoring: "Scoring",
  kicking: "Kicking",
  turnover: "Turnover",
  other: "Other",
};

/**
 * Which play groups each tab shows.
 *
 * OFF and DEF cover the same scrimmage plays on purpose — a snap produces the
 * same set of outcomes whichever sideline you're on. An interception is a pass
 * play by OUR offense, and a run by THEIR offense is still a run you record.
 * The two tabs differ in ORDER, not contents: the category sort below leads
 * with turnovers and kicks when the opponent has the ball.
 *
 * Previously OFF omitted "turnover" (no way to record an INT while we had the
 * ball) and DEF omitted "run"/"pass" (no way to record their snaps) — both
 * forced a detour through the All tab mid-drive.
 */
const SCRIMMAGE_CATEGORIES = ["run", "pass", "turnover", "other"];

const PHASE_CATEGORIES: Record<PhaseFilter, Set<string>> = {
  all: new Set(["run", "pass", "scoring", "kicking", "turnover", "other"]),
  // Recording the opponent's runs and passes IS the defensive operator's job,
  // and an interception is a pass play by OUR offense — so both tabs carry the
  // full scrimmage set and differ only in the order below.
  offense: new Set(SCRIMMAGE_CATEGORIES),
  defense: new Set(SCRIMMAGE_CATEGORIES),
  special: new Set(["kicking", "scoring"]),
};

const PHASE_TABS: Array<{ value: PhaseFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "offense", label: "OFF" },
  { value: "defense", label: "DEF" },
  { value: "special", label: "ST" },
];

export default function QuickActions({
  onSelect,
  possession,
  progName,
  oppName,
  suggestedPhase,
  down,
  distance,
  progColor = "#dc2626",
  oppColor = "#6b7280",
}: Props) {
  const [phase, setPhase] = useState<PhaseFilter>(suggestedPhase ?? "all");
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride && suggestedPhase) {
      setPhase(suggestedPhase);
    }
  }, [suggestedPhase, manualOverride]);

  // A manual filter choice sticks until possession changes (a genuinely new
  // context). Resetting on every suggestion change wiped the operator's pick
  // after each recorded play.
  useEffect(() => {
    setManualOverride(false);
  }, [possession]);

  const grouped = PLAY_TYPES.reduce<Record<string, PlayTypeDef[]>>((acc, pt) => {
    (acc[pt.category] ??= []).push(pt);
    return acc;
  }, {});

  const allowedCategories = PHASE_CATEGORIES[phase];
  const categories = Object.keys(grouped)
    .filter((category) => allowedCategories.has(category))
    .sort((a, b) => {
      if (possession === "them") {
        // Their snaps are still mostly runs and passes, so those lead. This
        // used to open with kicking/turnover, which made sense when the DEF
        // tab ONLY held turnovers — now that run/pass are here, leading with
        // the rare stuff would bury the common one.
        const defensePriority: Record<string, number> = {
          run: 0,
          pass: 1,
          turnover: 2,
          kicking: 3,
          other: 4,
          scoring: 5,
        };
        return (defensePriority[a] ?? 99) - (defensePriority[b] ?? 99);
      }

      return (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99);
    });

  const primaries = primaryPlayIds(down);

  const offenseName = possession === "us" ? progName : oppName;
  const offenseColor = possession === "us" ? progColor : oppColor;

  return (
    <div className="space-y-3">
      {/* Possession band — the single most important fact on this card, and
          previously the least visible (small red text, and only when the
          opponent had the ball). Team-colored, always present, and it carries
          the phase filter so context and filter read as one block. Sticky so
          both stay reachable while the play groups scroll under them. */}
      <div
        className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 rounded-t-2xl border-b"
        style={{
          background: `linear-gradient(180deg, ${offenseColor}26, #111820)`,
          borderColor: `${offenseColor}59`,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: offenseColor, boxShadow: `0 0 8px ${offenseColor}` }}
          />
          <span
            className="text-xs font-display font-black uppercase tracking-wider truncate"
            style={{ color: offenseColor }}
          >
            {offenseName} ball
          </span>
          {down != null && distance != null && (
            <span className="ml-auto text-xs font-display font-black tabular-nums text-white/85 shrink-0">
              {ordinalDown(down)} &amp; {distance}
            </span>
          )}
        </div>

        <div className="flex gap-1">
          {PHASE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setPhase(tab.value); setManualOverride(true); }}
              className={`flex-1 py-2 rounded-lg text-[11px] font-display font-black uppercase tracking-wider transition-colors border-2 ${
                phase === tab.value
                  ? "text-white"
                  : "bg-surface-bg/60 text-surface-muted border-transparent active:bg-surface-hover"
              }`}
              style={phase === tab.value
                ? { backgroundColor: offenseColor, borderColor: offenseColor }
                : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {categories.map((category) => {
        // A colored rail per group, so the boundaries read at a glance instead
        // of relying on a low-contrast 11px header alone.
        const accent = CATEGORY_ACCENT[category] ?? "#64748b";
        return (
          <div key={category} className="border-l-[3px] pl-2.5" style={{ borderColor: accent }}>
            <div
              className="text-[11px] font-display font-bold uppercase tracking-[0.2em] mb-2"
              style={{ color: accent }}
            >
              {CATEGORY_LABELS[category] ?? category}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {grouped[category].map((playType) => {
                const isPrimary = primaries.has(playType.id);
                return (
                  <button
                    key={playType.id}
                    onClick={() => onSelect(playType)}
                    className={`px-1 rounded-xl font-display font-bold border transition-all active:scale-95 cursor-pointer uppercase tracking-wide ${
                      isPrimary
                        ? "col-span-2 py-5 text-sm ring-1 ring-inset ring-white/10"
                        : "py-2.5 text-[11px]"
                    } ${COLOR_MAP[playType.color] ?? COLOR_MAP.neutral}`}
                  >
                    {playType.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}