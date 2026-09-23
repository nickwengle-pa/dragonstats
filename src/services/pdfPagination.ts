/** Where the page starting at row `top` ends, for pages of at most
 *  `pageHeight` rows. A cut prefers a blank row within the bottom fifth of the
 *  page so a table row or a heading is not split across two sheets; failing
 *  that it cuts at the page edge, which is what the browser's print engine
 *  would do. It reads rows `top + 0.8 * pageHeight` to `top + pageHeight`
 *  only, so a caller can capture one page (plus one row) at a time. */
export function pageBreakAfter(
  top: number, totalHeight: number, pageHeight: number, isBlank: (row: number) => boolean,
): number {
  const bottom = Math.min(totalHeight, top + pageHeight);
  if (bottom < totalHeight) {
    const floor = top + Math.floor(pageHeight * 0.8);
    for (let y = bottom; y > floor; y--) {
      if (isBlank(y)) return y;
    }
  }
  return bottom;
}

/** Every page of a capture `totalHeight` rows tall, as [top, bottom) pairs. */
export function pageBreakRows(
  totalHeight: number, pageHeight: number, isBlank: (row: number) => boolean,
): Array<[number, number]> {
  const pages: Array<[number, number]> = [];
  for (let top = 0; top < totalHeight;) {
    const bottom = pageBreakAfter(top, totalHeight, pageHeight, isBlank);
    pages.push([top, bottom]);
    top = bottom;
  }
  return pages;
}
