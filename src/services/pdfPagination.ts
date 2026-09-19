/** Where to cut a tall capture into pages of at most `pageHeight` rows.
 *  A cut prefers a blank row within the bottom fifth of the page so a table
 *  row or a heading is not split across two sheets; failing that it cuts at
 *  the page edge, which is what the browser's print engine would do. */
export function pageBreakRows(
  totalHeight: number, pageHeight: number, isBlank: (row: number) => boolean,
): Array<[number, number]> {
  const pages: Array<[number, number]> = [];
  let top = 0;
  while (top < totalHeight) {
    let bottom = Math.min(totalHeight, top + pageHeight);
    if (bottom < totalHeight) {
      const floor = top + Math.floor(pageHeight * 0.8);
      for (let y = bottom; y > floor; y--) {
        if (isBlank(y)) { bottom = y; break; }
      }
    }
    pages.push([top, bottom]);
    top = bottom;
  }
  return pages;
}
