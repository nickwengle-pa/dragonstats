/**
 * A slice of a game - one quarter, one half, or all of it.
 *
 * Every stat screen reads its numbers through computeGameStatsBundle, so the
 * period is applied there, once, by dropping the plays outside it before the
 * engine sees them. That keeps the box score, the report, player pages and
 * season totals agreeing with each other for any period.
 *
 * Halves are regulation only: overtime is its own period, the way a stat
 * sheet splits it.
 */
export type StatPeriod = "game" | "h1" | "h2" | "q1" | "q2" | "q3" | "q4" | "ot";

export const STAT_PERIODS: StatPeriod[] = ["game", "h1", "h2", "q1", "q2", "q3", "q4", "ot"];

/** Short labels for the switch. */
export const PERIOD_SHORT: Record<StatPeriod, string> = {
  game: "Game", h1: "1st Half", h2: "2nd Half",
  q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4", ot: "OT",
};

/** Long labels for headers and printed sheets. */
export const PERIOD_LONG: Record<StatPeriod, string> = {
  game: "Full Game", h1: "1st Half", h2: "2nd Half",
  q1: "1st Quarter", q2: "2nd Quarter", q3: "3rd Quarter", q4: "4th Quarter", ot: "Overtime",
};

export function parsePeriod(raw: string | null | undefined): StatPeriod {
  return STAT_PERIODS.includes(raw as StatPeriod) ? (raw as StatPeriod) : "game";
}

export function inPeriod(quarter: number, period: StatPeriod): boolean {
  const q = Number(quarter) || 1;
  switch (period) {
    case "game": return true;
    case "h1": return q <= 2;
    case "h2": return q === 3 || q === 4;
    case "q1": return q === 1;
    case "q2": return q === 2;
    case "q3": return q === 3;
    case "q4": return q === 4;
    case "ot": return q > 4;
  }
}

/** The quarters a period covers, for screens laid out by quarter. */
export function periodQuarters(period: StatPeriod, quarters: number[]): number[] {
  return quarters.filter((q) => inPeriod(q, period));
}
