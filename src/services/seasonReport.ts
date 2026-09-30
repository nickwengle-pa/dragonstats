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
/* A printed sheet, in table rows. A section's title band, header row and the
   gap after it cost SECTION_UNITS; its total row one more. */
const PAGE_UNITS = 38;
const SECTION_UNITS = 5;
/** The fewest rows worth a heading of their own. */
const MIN_ROWS = 4;

/**
 * Pack sections onto printable pages, splitting a table only when it cannot
 * fit on one.
 *
 * Every table used to be cut into 24-row pieces whatever the page had room
 * for, so a 27-man defense printed 24 names, a second heading, and three more
 * - on a page with space for all of them. A section that fits on a sheet of
 * its own now stays whole: here if there is room, at the top of the next page
 * if not. Only a section longer than a page is split, and never so that
 * either piece is left with a stub of a few rows under its heading.
 */
export function paginateSeasonSections(sections: ReportSection[]): ReportSection[][] {
  const pages: ReportSection[][] = []; let page: ReportSection[] = []; let used = 0;
  const newPage = () => { if (page.length) { pages.push(page); page = []; used = 0; } };
  for (const section of sections) {
    const rows = section.rows.length ? section.rows : [["None recorded", ...section.headers.slice(1).map(() => "")]];
    const totalUnits = section.total ? 1 : 0;
    const whole = SECTION_UNITS + rows.length + totalUnits;
    if (whole <= PAGE_UNITS && used + whole > PAGE_UNITS) newPage();
    let start = 0;
    while (start < rows.length) {
      const remaining = rows.length - start;
      const room = PAGE_UNITS - used - SECTION_UNITS;
      const title = section.title + (start ? " (continued)" : "");
      if (remaining + totalUnits <= room) {
        page.push({ ...section, title, rows: rows.slice(start) });
        used += SECTION_UNITS + remaining + totalUnits;
        break;
      }
      // Leave the continuation enough rows to be worth its own heading.
      let take = Math.min(room, remaining - MIN_ROWS);
      if (take < MIN_ROWS) {
        if (page.length) { newPage(); continue; }
        take = Math.max(1, Math.min(room, remaining));
      }
      page.push({ ...section, title, rows: rows.slice(start, start + take), total: undefined });
      start += take;
      newPage();
    }
  }
  if (page.length) pages.push(page);
  return pages;
}
