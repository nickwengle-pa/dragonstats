import { PLAY_TYPES, type PlayTypeDef } from "./types";

interface Props {
  onSelect: (pt: PlayTypeDef) => void;
  possession: "us" | "them";
}

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-900/60 text-emerald-400 border-emerald-700/50",
  blue: "bg-blue-900/60 text-blue-400 border-blue-700/50",
  red: "bg-red-900/60 text-red-400 border-red-700/50",
  amber: "bg-amber-900/60 text-amber-400 border-amber-700/50",
  purple: "bg-purple-900/60 text-purple-400 border-purple-700/50",
  orange: "bg-orange-900/60 text-orange-400 border-orange-700/50",
  yellow: "bg-yellow-900/60 text-yellow-400 border-yellow-700/50",
  neutral: "bg-neutral-800 text-neutral-400 border-neutral-700/50",
};

const CATEGORY_ORDER: Record<string, number> = {
  run: 0, pass: 1, scoring: 2, kicking: 3, turnover: 4, other: 5,
};

const CATEGORY_LABELS: Record<string, string> = {
  run: "RUN", pass: "PASS", scoring: "SCORING", kicking: "KICKING", turnover: "TURNOVER", other: "OTHER",
};

export default function QuickActions({ onSelect, possession }: Props) {
  // Group play types by category
  const grouped = PLAY_TYPES.reduce<Record<string, PlayTypeDef[]>>((acc, pt) => {
    (acc[pt.category] ??= []).push(pt);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort((a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99));

  // If opponent has ball, show kicking/turnover/other more prominently
  const showCategories = possession === "them"
    ? categories.filter(c => ["kicking", "turnover", "other"].includes(c))
    : categories;

  return (
    <div className="space-y-3">
      {possession === "them" && (
        <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
          Opponent has ball — record kicking / turnovers / penalties
        </div>
      )}
      {showCategories.map(cat => (
        <div key={cat}>
          <div className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest mb-1.5">
            {CATEGORY_LABELS[cat] ?? cat}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {grouped[cat].map(pt => (
              <button
                key={pt.id}
                onClick={() => onSelect(pt)}
                className={`py-2.5 px-1 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${COLOR_MAP[pt.color] ?? COLOR_MAP.neutral}`}
              >
                {pt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {possession === "them" && (
        <button
          onClick={() => {/* show all */}}
          className="text-[10px] font-bold text-neutral-500 underline"
        >
          Show all play types
        </button>
      )}
    </div>
  );
}
