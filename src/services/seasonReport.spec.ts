import { expect, it } from "vitest";
import { FootballStatsEngine } from "football-stats-engine";
import { combineSeasonBundles, paginateSeasonSections } from "./seasonReport";
import type { GameStatsBundle } from "./statsService";

it("combines players by ID and normalizes home/away totals without adding season bests", () => {
  const make = (home: boolean, yards: number, longest: number) => {
    const engine = new FootballStatsEngine({ rules: "high_school" });
    engine.setTeams({ id: home ? "us" : "them", name: "Home", abbreviation: "H" }, { id: home ? "them" : "us", name: "Away", abbreviation: "A" });
    const summary = engine.getGameSummary();
    summary.rushing.qb = { carries: 2, yards, longRush: longest } as never;
    (home ? summary.homeTeamStats : summary.awayTeamStats).rushingYards = yards;
    return { summary, plays: [], roster: [{ player_id: "qb", first_name: "Q", last_name: "B" }], game: {} } as unknown as GameStatsBundle;
  };
  const a = make(true, 20, 15), b = make(false, 10, 8);
  const merged = combineSeasonBundles([a,b], "us");
  expect(merged.summary.rushing.qb).toMatchObject({ carries: 4, yards: 30, longRush: 15 });
  expect(merged.summary.homeTeamStats.rushingYards).toBe(30);
  expect(merged.roster).toHaveLength(1);
  expect(a.summary.rushing.qb.yards).toBe(20);
});
it("keeps every roster row and prints the total only on the final continuation", () => {
  const rows = Array.from({ length: 70 }, (_,i) => [`Player ${i}`, i]);
  const pages = paginateSeasonSections([{ title: "Defense", headers: ["Player","Tackles"], rows, total: ["Total", 2415] }]);
  expect(pages.flat().flatMap(s => s.rows)).toEqual(rows);
  expect(pages.flat().filter(s => s.total)).toHaveLength(1);
  // No continuation left as a stub, and no page past what a sheet holds.
  expect(pages.flat().every(s => s.rows.length >= 4)).toBe(true);
  for (const page of pages) expect(page.reduce((n, s) => n + 5 + s.rows.length + (s.total ? 1 : 0), 0)).toBeLessThanOrEqual(38);
});

it("keeps a table that fits on one page in one piece", () => {
  // A 27-man defense printed 24 names, a second heading and three more, on a
  // page with room for all of them.
  const table = (title: string, n: number) => ({
    title, headers: ["Player", "Total"], rows: Array.from({ length: n }, (_, i) => [`${title} ${i}`, i]), total: ["Total", n],
  });
  const pages = paginateSeasonSections([table("Receiving", 6), table("Defense", 27), table("Punting", 2)]);
  const defense = pages.flat().filter(s => s.title.startsWith("Defense"));
  expect(defense).toHaveLength(1);
  expect(defense[0].rows).toHaveLength(27);
  expect(defense[0].total).toEqual(["Total", 27]);
  // It moved to the top of a page rather than being split to fill the first.
  expect(pages.findIndex(p => p.includes(defense[0]))).toBe(1);
  expect(pages[1][0]).toBe(defense[0]);
});
