import type { GameStatsBundle } from "./statsService";
import { buildGameReport, type BuildReportInput } from "./gameReport";

/** Aggregate by player ID, retaining season bests and recomputing report averages. */
export function combineSeasonBundles(bundles: GameStatsBundle[], programId: string): GameStatsBundle {
  if (!bundles.length) throw new Error("No completed games to report.");
  const result = structuredClone(bundles[0]);
  const summary = result.summary;
  const merge = (rows: Record<string, any>[]) => {
    const out: Record<string, any> = {};
    for (const row of rows) for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number") out[key] = /long/i.test(key) ? Math.max(out[key] ?? 0, value) : (out[key] ?? 0) + value;
      else if (!(key in out)) out[key] = value;
    }
    return out;
  };
  for (const category of ["rushing", "passing", "receiving", "defense", "kicking", "punting", "returns"] as const) {
    const ids = new Set(bundles.flatMap(b => Object.keys(b.summary[category])));
    (summary as any)[category] = Object.fromEntries([...ids].map(id => [id, merge(bundles.map(b => (b.summary[category] as any)[id]).filter(Boolean))]));
  }
  const own = bundles.map(b => b.summary.homeTeamStats.teamId === programId ? b.summary.homeTeamStats : b.summary.awayTeamStats);
  const other = bundles.map(b => b.summary.homeTeamStats.teamId === programId ? b.summary.awayTeamStats : b.summary.homeTeamStats);
  summary.homeTeamStats = { ...merge(own), teamId: programId } as typeof summary.homeTeamStats;
  summary.awayTeamStats = { ...merge(other), teamId: "season-opponents" } as typeof summary.awayTeamStats;
  result.plays = bundles.flatMap(b => b.plays);
  result.roster = [...new Map(bundles.flatMap(b => b.roster).map(r => [r.player_id, r])).values()];
  return result;
}

export function buildSeasonReport(bundles: GameStatsBundle[], input: Omit<BuildReportInput, "bundle">) {
  return buildGameReport({ ...input, bundle: combineSeasonBundles(bundles, input.program.id) });
}

export interface ReportSection { title: string; headers: string[]; rows: (string | number)[][]; total?: (string | number)[] }
/** Split long rosters and pack sections into bounded printable pages. */
export function paginateSeasonSections(sections: ReportSection[]): ReportSection[][] {
  const pages: ReportSection[][] = []; let page: ReportSection[] = []; let used = 0;
  for (const section of sections) {
    const rows = section.rows.length ? section.rows : [["None recorded", ...section.headers.slice(1).map(() => "")]];
    for (let start = 0; start < rows.length; start += 24) {
      const last = start + 24 >= rows.length;
      const part = { ...section, title: section.title + (start ? " (continued)" : ""), rows: rows.slice(start, start + 24), total: last ? section.total : undefined };
      const cost = part.rows.length + 5 + (part.total ? 1 : 0);
      if (used + cost > 38 && page.length) { pages.push(page); page = []; used = 0; }
      page.push(part); used += cost;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}
