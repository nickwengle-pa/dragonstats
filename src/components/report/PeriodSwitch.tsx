import { useSyncExternalStore } from "react";
import { PERIOD_SHORT, type StatPeriod } from "@/services/statPeriod";

/* ═══════════════════════════════════════════════════════════════════════════
   PERIOD SWITCH — Game · 1st Half · 2nd Half · Q1-Q4 · OT, above a stat view.

   The pick is shared, in memory, by every screen of one kind: choose Q3 on
   the Box Score and the Game Report opens on Q3 too. Game screens and season
   screens keep separate picks, so a quarter looked at in one game does not
   quietly narrow the season totals. Nothing is saved, so reopening the app
   always starts on the full game.
   ═══════════════════════════════════════════════════════════════════════════ */

export type PeriodScope = "game" | "season";

const picks: Record<PeriodScope, StatPeriod> = { game: "game", season: "game" };
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useStatPeriod(scope: PeriodScope): [StatPeriod, (p: StatPeriod) => void] {
  const period = useSyncExternalStore(subscribe, () => picks[scope]);
  const set = (p: StatPeriod) => {
    picks[scope] = p;
    listeners.forEach((fn) => fn());
  };
  return [period, set];
}

const REGULATION: StatPeriod[] = ["game", "h1", "h2", "q1", "q2", "q3", "q4"];

export default function PeriodSwitch({ value, onChange, showOT = false, className = "" }: {
  value: StatPeriod;
  onChange: (p: StatPeriod) => void;
  /** Offer overtime. Games show it only once there was one. */
  showOT?: boolean;
  className?: string;
}) {
  const options: StatPeriod[] = showOT || value === "ot" ? [...REGULATION, "ot"] : REGULATION;
  return (
    <div role="tablist" aria-label="Period" className={`flex gap-1.5 overflow-x-auto print:hidden ${className}`}>
      {options.map((p) => (
        <button key={p} type="button" role="tab" aria-selected={value === p} onClick={() => onChange(p)}
          className={`shrink-0 min-h-10 px-3 rounded-lg text-xs font-display font-extrabold uppercase tracking-wider border transition-colors ${value === p
            ? "bg-dragon-primary text-white border-dragon-primary"
            : "bg-surface-card text-surface-muted border-surface-border"}`}>
          {PERIOD_SHORT[p]}
        </button>
      ))}
    </div>
  );
}
