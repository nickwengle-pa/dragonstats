/**
 * Printing a report from the installed app.
 *
 * iOS ignores window.print() inside a home-screen app, so the print icon did
 * nothing on the iPad once Dragon Stats went onto the home screen while the
 * same tap in Safari or on a laptop printed fine. On that platform the page is
 * rasterized into a letter PDF here and handed to the share sheet instead
 * (see deliverFile.ts).
 *
 * The screens were written for the browser's print engine, not for a canvas:
 * they are dark app screens that the @media print stylesheet turns into
 * paper, and html2canvas knows nothing about print media. So the page is
 * rebuilt in a hidden 8-inch-wide iframe that carries the app's stylesheets
 * plus every @media print rule unwrapped into an ordinary rule. Inside it the
 * document looks exactly the way the print engine would see it — white,
 * chrome hidden, .screen unclamped — and that is what gets rasterized.
 *
 * A report laid out in .game-report-sheet boxes (game report, season report)
 * is already 8in × 10.5in per sheet, so each sheet is one page. Anything else
 * is one tall capture sliced into letter pages, cutting on a blank row where
 * one falls near the page edge so a table row is not split in half.
 */

import { pageBreakRows } from "./pdfPagination";

/** Letter is 612 × 792 pt; the sheets leave a quarter inch (18 pt) all round. */
const MARGIN_PT = 18;
const CONTENT_W_PT = 612 - 2 * MARGIN_PT;
const CONTENT_H_PT = 792 - 2 * MARGIN_PT;
/** 8in at CSS resolution: the printable width the @page rule leaves. */
const PAGE_W_PX = 768;
/** Twice the CSS pixel density keeps 8.5pt table type legible on paper. */
const SCALE = 2;

/** A share-sheet file name: the characters no filesystem accepts become dashes. */
export function pdfFilename(stem: string): string {
  return `${stem.replace(/[\\/:*?"<>|]+/g, "-").trim()}.pdf`;
}

/** Rasterize the screen under `root` to a PDF. The libraries load on first
 *  use so a laptop that just calls window.print() never pays for them. */
export async function renderReportPdf(root: HTMLElement, filename: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const stage = await stagePrintDocument(root);
  try {
    const capture = (el: HTMLElement) => html2canvas(el, {
      scale: SCALE, useCORS: true, backgroundColor: "#ffffff", logging: false,
      windowWidth: PAGE_W_PX, windowHeight: Math.max(el.offsetHeight, 1),
    });
    const sheets = Array.from(stage.doc.querySelectorAll<HTMLElement>(".game-report-sheet"));
    const pages: HTMLCanvasElement[] = sheets.length > 0
      ? await Promise.all(sheets.map(capture))
      : sliceIntoPages(await capture(stage.root));
    if (pages.length === 0) throw new Error("There is no report on the page to print.");

    const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait", compress: true });
    pages.forEach((canvas, i) => {
      const height = Math.min(CONTENT_H_PT, (canvas.height / canvas.width) * CONTENT_W_PT);
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", MARGIN_PT, MARGIN_PT, CONTENT_W_PT, height);
    });
    return new File([pdf.output("blob")], filename, { type: "application/pdf" });
  } finally {
    stage.dispose();
  }
}

/** Build the hidden iframe: the app's stylesheets, the print rules unwrapped,
 *  and a copy of the screen's markup laid out at the printable width. */
async function stagePrintDocument(root: HTMLElement): Promise<{ doc: Document; root: HTMLElement; dispose: () => void }> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("scrolling", "no");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W_PX}px;height:1000px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  const dispose = () => iframe.remove();

  const styles = Array.from(document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style'))
    .map(el => el.outerHTML).join("\n");
  doc.open();
  doc.write(`<!doctype html><html class="${document.documentElement.className}"><head><meta charset="utf-8">${styles}` +
    `<style>${printRulesUnwrapped()}\nhtml,body{margin:0;padding:0;overflow:hidden;width:${PAGE_W_PX}px;background:#fff}</style>` +
    `</head><body>${root.outerHTML}</body></html>`);
  doc.close();

  await new Promise<void>(resolve => {
    if (doc.readyState === "complete") resolve();
    else iframe.addEventListener("load", () => resolve(), { once: true });
  });
  await doc.fonts?.ready;
  await Promise.all(Array.from(doc.images).map(img =>
    img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = img.onerror = () => res(); })));
  iframe.style.height = `${doc.documentElement.scrollHeight}px`;
  return { doc, root: doc.body.firstElementChild as HTMLElement, dispose };
}

/** Every rule under @media print in the app's stylesheets, as plain CSS, in
 *  source order so the cascade resolves the way it does on paper. Tailwind's
 *  print: utilities are in here too. */
function printRulesUnwrapped(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin (Google Fonts)
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSMediaRule) || !/\bprint\b/.test(rule.media.mediaText)) continue;
      for (const inner of Array.from(rule.cssRules)) {
        if (!(inner instanceof CSSPageRule)) out.push(inner.cssText);
      }
    }
  }
  return out.join("\n");
}

/** Cut a tall capture into page-sized canvases. */
function sliceIntoPages(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const pageH = Math.floor((CONTENT_H_PT / CONTENT_W_PT) * canvas.width);
  const ctx = canvas.getContext("2d")!;
  const isBlank = (y: number) => {
    const row = ctx.getImageData(0, y, canvas.width, 1).data;
    for (let i = 0; i < row.length; i += 16) {
      if (row[i] < 245 || row[i + 1] < 245 || row[i + 2] < 245) return false;
    }
    return true;
  };
  return pageBreakRows(canvas.height, pageH, isBlank).map(([top, bottom]) => {
    const page = document.createElement("canvas");
    page.width = canvas.width;
    page.height = bottom - top;
    page.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, bottom - top, 0, 0, canvas.width, bottom - top);
    return page;
  });
}
