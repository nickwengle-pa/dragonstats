import { useEffect, useState } from "react";
import { PLAY_TYPES, type PlayTypeDef } from "./types";

type PhaseFilter = "all" | "offense" | "defense" | "special";

interface Props {
  onSelect: (pt: PlayTypeDef) => void;
  possession: "us" | "them";
  progName: string;
  oppName: string;
  suggestedPhase?: PhaseFilter;
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

const CATEGORY_LABELS: Record<string, string> = {
  run: "Run",
  pass: "Pass",
  scoring: "Scoring",
  kicking: "Kicking",
  turnover: "Turnover",
  other: "Other",
};

const PHASE_CATEGORIES: Record<PhaseFilter, Set<string>> = {
  all: new Set(["run", "pass", "scoring", "kicking", "turnover", "other"]),
  offense: new Set(["run", "pass", "other"]),
  defense: new Set(["turnover", "other"]),
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
}: Props) {
  const [phase, setPhase] = useState<PhaseFilter>(suggestedPhase ?? "all");
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride && suggestedPhase) {
      setPhase(suggestedPhase);
    }
  }, [suggestedPhase, manualOverride]);

  useEffect(() => {
    setManualOverride(false);
  }, [suggestedPhase]);

  const grouped = PLAY_TYPES.reduce<Record<string, PlayTypeDef[]>>((acc, pt) => {
    (acc[pt.category] ??= []).push(pt);
    return acc;
  }, {});

  const allowedCategories = PHASE_CATEGORIES[phase];
  const categories = Object.keys(grouped)
    .filter((category) => allowedCategories.has(category))
    .sort((a, b) => {
      if (possession === "them") {
        const defensePriority: Record<string, number> = {
          kicking: 0,
          turnover: 1,
          other: 2,
          run: 3,
          pass: 4,
          scoring: 5,
        };
        return (defensePriority[a] ?? 99) - (defensePriority[b] ?? 99);
      }

      return (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99);
    });

  const possessionLabel = possession === "us" ? `${progName} possession` : `${oppName} possession`;

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {PHASE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setPhase(tab.value); setManualOverride(true); }}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-display font-black uppercase tracking-wider transition-colors ${
              phase === tab.value
                ? "bg-dragon-primary/20 text-dragon-primary border border-dragon-primary/30"
                : "bg-surface-bg text-surface-muted border border-transparent active:bg-surface-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {possession === "them" && (
        <div className="text-[10px] font-display font-bold text-red-400 uppercase tracking-widest">
          {possessionLabel}
        </div>
      )}

      {categories.map((category) => (
        <div key={category}>
          <div className="section-title text-[10px] mb-2">
            {CATEGORY_LABELS[category] ?? category}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {grouped[category].map((playType) => (
              <button
                key={playType.id}
                onClick={() => onSelect(playType)}
                className={`py-2.5 px-1 rounded-xl text-[11px] font-display font-bold border transition-all active:scale-95 cursor-pointer uppercase tracking-wide ${
                  COLOR_MAP[playType.color] ?? COLOR_MAP.neutral
                }`}
              >
                {playType.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
