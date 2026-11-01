import { describe, expect, it } from "vitest";
import { SAMPLE_PROGRAM, sampleSeasonGames } from "./sampleSeason";
import { bookPlayers, seasonModel } from "./seasonBook";
import { buildSeasonBookBytes, pdfText } from "./seasonBookPdf";

/* The point of the Season Book is that it can be tapped through, so the
   test that matters is that every link lands on a page of the book. */

async function build(gameCount: number) {
  const games = sampleSeasonGames(gameCount);
  const bytes = await buildSeasonBookBytes(seasonModel(SAMPLE_PROGRAM, games), {
    seasonLabel: "2026 Varsity",
    generatedLabel: "Nov 1, 2026 at 7:00 PM",
  });
  return { games, pdf: Buffer.from(bytes).toString("latin1") };
}

describe("Season Book PDF", () => {
  it("links every game, player and contents line to a page of the book", async () => {
    const { games, pdf } = await build(3);
    const pages = [...pdf.matchAll(/(\d+) 0 obj\s*<<\/Type \/Page\b(?!s)/g)].map(m => m[1]);
    // Link annotations only: the sidebar's entries carry a /Dest too.
    const dests = [...pdf.matchAll(/\/Subtype \/Link[^>]*?\/Dest \[(\d+) 0 R \/XYZ/g)].map(m => m[1]);
    expect(pages.length).toBeGreaterThan(games.length * 4);
    expect(dests.length).toBeGreaterThan(200);
    const known = new Set(pages);
    expect(dests.filter(d => !known.has(d))).toEqual([]);
    // Every footer's "Contents" goes to the contents page, not the cover.
    expect(dests.filter(d => d === pages[1]).length).toBeGreaterThan(pages.length - 4);
    expect(dests.filter(d => d === pages[0])).toEqual([]);
  });

  it("has a sidebar entry for every game and player", async () => {
    const { games, pdf } = await build(2);
    const titles = pdf.match(/\/Title \(/g)?.length ?? 0;
    const players = bookPlayers(SAMPLE_PROGRAM, games).length;
    // Cover, contents, season + 4, games + 4 each, players + 1 each.
    expect(titles).toBeGreaterThanOrEqual(2 + 5 + 1 + games.length * 4 + 1 + players);
  });

  it("refuses a season with no final games", async () => {
    const games = sampleSeasonGames(1).map(g => ({ ...g, meta: { ...g.meta, status: "live" } }));
    await expect(buildSeasonBookBytes(seasonModel(SAMPLE_PROGRAM, games), { seasonLabel: "x", generatedLabel: "y" }))
      .rejects.toThrow(/no final games/);
  });

  it("spells out what Helvetica cannot draw", () => {
    expect(pdfText("#7 C.Ellis → #4 O.Castillo +10")).toBe("#7 C.Ellis to #4 O.Castillo +10");
    expect(pdfText("Tkl #90 (½) · PBU")).toBe("Tkl #90 (½) · PBU");
    expect(pdfText("1st ⇄ 2nd")).toBe("1st <> 2nd");
  });
});
