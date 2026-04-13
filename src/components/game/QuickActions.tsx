import { PLAY_TYPES, type PlayTypeDef } from "./types";

interface Props {
  onSelect: (pt: PlayTypeDef) => void;
  possession: "us" | "them";
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
  run: 0, pass: 1, scoring: 2, kicking: 3, turnover: 4, other: 5,
};

const CATEGORY_LABELS: Record<string, string> = {
  run: "Run", pass: "Pass", scoring: "Scoring", kicking: "Kicking", turnover: "Turnover", other: "Other",
};

export default function QuickActions({ onSelect, possession }: Props) {
  const grouped = PLAY_TYPES.reduce<Record<string, PlayTypeDef[]>>((acc, pt) => {
    (acc[pt.category] ??= []).push(pt);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort((a, b) => {
    if (possession === "them") {
      const defPriority: Record<string, number> = {
        kicking: 0, turnover: 1, other: 2, run: 3, pass: 4, scoring: 5,
      };
      return (defPriority[a] ?? 99) - (defPriority[b] ?? 99);
    }
    return (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99);
  });

  return (
    <div className="space-y-4">
      {possession === "them" && (
        <div className="flex items-center gap-2 mb-1">
          <div className="live-dot" style={{ width: 6, height: 6 }} />
          <span className="text-[10px] font-display font-bold text-red-400 uppercase tracking-widest">
            Opponent Possession
          </span>
        </div>
      )}
      {categories.map(cat => (
        <div key={cat}>
          <div className="section-title text-[10px] mb-2">
            {CATEGORY_LABELS[cat] ?? cat}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {grouped[cat].map(pt => (
              <button
                key={pt.id}
                onClick={() => onSelect(pt)}
                className={`py-2.5 px-1 rounded-xl text-[11px] font-display font-bold border transition-all active:scale-95 cursor-pointer uppercase tracking-wide ${COLOR_MAP[pt.color] ?? COLOR_MAP.neutral}`}
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
