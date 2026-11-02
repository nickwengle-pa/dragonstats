import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { SAMPLE_PROGRAM, sampleSeasonGames } from "./sampleSeason";
import { bookPlayers, seasonModel } from "./seasonBook";
import { buildSeasonBookBytes, pdfText } from "./seasonBookPdf";

/* The point of the Season Book is that it can be tapped through, so the
   test that matters is that every link lands on a page of the book. */

/** A 1x1 PNG: enough for the cover to make room for a logo. */
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function build(gameCount: number, program = SAMPLE_PROGRAM, logoDataUrl: string | null = null) {
  const games = sampleSeasonGames(gameCount);
  const bytes = await buildSeasonBookBytes(seasonModel(program, games), {
    seasonLabel: "2026 Varsity",
    generatedLabel: "Nov 1, 2026 at 7:00 PM",
    logoDataUrl,
  });
  return { games, pdf: Buffer.from(bytes).toString("latin1") };
}

/** Each page's text lines as drawn: baseline up from the page's foot, and text. */
function pageLines(pdf: string): Array<Array<{ y: number; text: string }>> {
  const starts = [...pdf.matchAll(/\d+ 0 obj\s*<<\/Type \/Page\b(?!s)/g)].map(m => m.index!);
  return starts.map(start => {
    const id = /\/Contents (\d+) 0 R/.exec(pdf.slice(start, pdf.indexOf("endobj", start)))![1];
    const head = new RegExp(`\\b${id} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n`).exec(pdf)!;
    const length = Number(/\/Length (\d+)/.exec(head[1])![1]);
    const from = head.index + head[0].length;
    const ops = inflateSync(Buffer.from(pdf.slice(from, from + length), "latin1")).toString("latin1");
    return [...ops.matchAll(/([\d.]+) ([\d.]+) Td\s*\(((?:\\.|[^\\)])*)\) Tj/g)]
      .map(m => ({ y: Number(m[2]), text: m[3].replace(/\\(.)/g, "$1") }));
  });
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

  it("leaves no page holding just the last few lines of a section", async () => {
    // Six games is where the first cut of the book left seven such pages.
    const { pdf } = await build(6);
    const pages = pageLines(pdf);
    // How far down each page's body reaches, between the header and the footer.
    const reach = pages.map(lines => {
      const body = lines.filter(l => l.y > 40 && l.y < 736).map(l => l.y);
      return body.length ? 792 - 66 - Math.min(...body) : 0;
    });
    const nearlyBlank = reach.flatMap((r, i) => (i > 0 && r < 100 ? [`page ${i + 1}: ${Math.round(r)}pt`] : []));
    expect(nearlyBlank).toEqual([]);
  }, 60000);

  it("prints a long school name in full on the cover", async () => {
    // Beside the logo, where it was cut to "PURCHASE LINE HIGH SCH…".
    const { pdf } = await build(1, { ...SAMPLE_PROGRAM, name: "Purchase Line High School" }, LOGO);
    const cover = pageLines(pdf)[0].map(l => l.text).join(" ");
    expect(cover).toContain("PURCHASE LINE HIGH SCHOOL");
    // An ellipsis is byte 0x85 in the page's WinAnsi text.
    expect(cover).not.toMatch(/\.\.\.|…|\x85/);
  });

  it("spells out what Helvetica cannot draw", () => {
    expect(pdfText("#7 C.Ellis → #4 O.Castillo +10")).toBe("#7 C.Ellis to #4 O.Castillo +10");
    expect(pdfText("Tkl #90 (½) · PBU")).toBe("Tkl #90 (½) · PBU");
    expect(pdfText("1st ⇄ 2nd")).toBe("1st <> 2nd");
  });
});
