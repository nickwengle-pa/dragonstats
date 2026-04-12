import { useState, useEffect } from "react";
import { PLAY_TYPES, type PlayTypeDef } from "./types";

interface Props {
  onSelect: (pt: PlayTypeDef) => void;
  possession: "us" | "them";
  suggestedPhase?: PhaseFilter;
}

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-900/60 text-emerald-400 border-emerald-700/50",
  blue: "bg-blue-900/60 text-blue-400 border-blue-700/50",
  red: "bg-red-900/60 text-red-400 border-red-700/50",
  amber: "bg-amber-900/60 text-amber-400 border-amber-700/50",
  purple: "bg-purple-900/60 text-purple-400 border-purple-700/50",
  orange: "bg-orange-900/60 text-orange-400 border-orange-700/50",
  yellow: "bg-yellow-900/60 text-yellow-400 border-yellow-700/50",
  neutral: "bg-slate-800 text-slate-400 border-slate-700/50",
};

const CATEGORY_ORDER: Record<string, number> = {
  run: 0, pass: 1, scoring: 2, kicking: 3, turnover: 4, other: 5,
};

const CATEGORY_LABELS: Record<string, string> = {
  run: "RUN", pass: "PASS", scoring: "SCORING", kicking: "KICKING", turnover: "TURNOVER", other: "OTHER",
};

type PhaseFilter = "all" | "offense" | "defense" | "special";

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

export default function QuickActions({ onSelect, possession, suggestedPhase }: Props) {
  const [phase, setPhase] = useState<PhaseFilter>(suggestedPhase ?? "all");
  const [manualOverride, setManualOverride] = useState(false);

  // Auto-select phase when game state changes, unless user manually overrode
  useEffect(() => {
    if (!manualOverride && suggestedPhase) {
      setPhase(suggestedPhase);
    }
  }, [suggestedPhase, manualOverride]);

  // Reset manual override when suggested phase changes (new play recorded)
  useEffect(() => {
    setManualOverride(false);
  }, [suggestedPhase]);

  // Group play types by category
  const grouped = PLAY_TYPES.reduce<Record<string, PlayTypeDef[]>>((acc, pt) => {
    (acc[pt.category] ??= []).push(pt);
    return acc;
  }, {});

  const allowedCategories = PHASE_CATEGORIES[phase];

  // When opponent has ball, show defensive-relevant categories first, but still show everything
  const categories = Object.keys(grouped)
    .filter(cat => allowedCategories.has(cat))
    .sort((a, b) => {
      if (possession === "them") {
        const defPriority: Record<string, number> = {
          kicking: 0, turnover: 1, other: 2, run: 3, pass: 4, scoring: 5,
        };
        return (defPriority[a] ?? 99) - (defPriority[b] ?? 99);
      }
      return (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99);
    });

  return (
    <div className="space-y-3">
      {/* Phase filter tabs */}
      <div className="flex gap-1">
        {PHASE_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setPhase(tab.value); setManualOverride(true); }}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              phase === tab.value
                ? "bg-dragon-primary/20 text-dragon-primary border border-dragon-primary/30 shadow-glow-sm"
                : "bg-surface-bg text-slate-500 border border-transparent active:bg-surface-hover hover:text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {possession === "them" && (
        <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider font-mono">
          Opponent has ball
        </div>
      )}
      {categories.map(cat => (
        <div key={cat}>
          <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1.5 font-mono">
            {CATEGORY_LABELS[cat] ?? cat}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {grouped[cat].map(pt => (
              <button
                key={pt.id}
                onClick={() => onSelect(pt)}
                className={`py-2.5 px-1 rounded-xl text-[11px] font-bold border transition-all duration-200 active:scale-95 cursor-pointer ${COLOR_MAP[pt.color] ?? COLOR_MAP.neutral}`}
              >
                {pt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
