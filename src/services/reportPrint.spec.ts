import { describe, expect, it } from "vitest";
import { pdfFilename } from "./reportPrint";
import { pageBreakAfter, pageBreakRows } from "./pdfPagination";

describe("pdf file names", () => {
  it("strips the characters a filesystem rejects", () => {
    expect(pdfFilename("PL vs OPP 9/19/2026")).toBe("PL vs OPP 9-19-2026.pdf");
  });
});

describe("slicing a tall capture into pages", () => {
  it("cuts on a blank row near the foot of the page rather than through a table row", () => {
    const blank = new Set([180, 181, 370]);
    expect(pageBreakRows(500, 200, y => blank.has(y))).toEqual([[0, 181], [181, 370], [370, 500]]);
  });

  it("cuts at the page edge when the bottom fifth has no blank row", () => {
    expect(pageBreakRows(450, 200, () => false)).toEqual([[0, 200], [200, 400], [400, 450]]);
  });

  it("does not look for a break above the bottom fifth, which would waste most of a sheet", () => {
    expect(pageBreakRows(300, 200, y => y === 150)).toEqual([[0, 200], [200, 300]]);
  });

  it("is a single page when the capture fits", () => {
    expect(pageBreakRows(120, 200, () => true)).toEqual([[0, 120]]);
  });

  /* The iPad cannot hold a long screen as one canvas, so each page is
     captured on its own: rows top..top+pageHeight and nothing else. That only
     works if a break never needs to look outside that window. */
  it("decides each break from the page's own rows plus the one below it", () => {
    const blank = new Set([180, 181, 370, 555, 560]);
    let top = 0;
    const pages: Array<[number, number]> = [];
    while (top < 700) {
      const start = top;
      const bottom = pageBreakAfter(start, 700, 200, y => {
        expect(y).toBeGreaterThan(start + 160);
        expect(y).toBeLessThanOrEqual(start + 200);
        return blank.has(y);
      });
      pages.push([start, bottom]);
      top = bottom;
    }
    expect(pages).toEqual(pageBreakRows(700, 200, y => blank.has(y)));
    expect(pages).toEqual([[0, 181], [181, 370], [370, 560], [560, 700]]);
  });
});
