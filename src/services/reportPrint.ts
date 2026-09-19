/**
 * Printing a report from the installed app.
 *
 * iOS ignores window.print() inside a home-screen app: there is no Safari
 * behind it to own the print dialog, so the call returns and nothing at all
 * happens. The same tap in a Safari tab, or on a laptop, prints fine — which
 * is why the print icon looked broken only on the iPad after the app went
 * onto the home screen.
 *
 * On that platform the report is rasterized into a letter PDF here and handed
 * to the share sheet, which carries Print, Save to Files, AirDrop and Mail.
 * Each .game-report-sheet is already an 8in × 10.5in box laid out in inches,
 * so one sheet maps onto one page at the same quarter-inch margins the @page
 * rule uses, and the PDF matches the screen the way the printed sheet does.
 */

/** Letter is 612 × 792 pt; the sheets leave a quarter inch (18 pt) all round. */
const MARGIN_PT = 18;
const PAGE_W_PT = 612;
const PAGE_H_PT = 792;
const CONTENT_W_PT = PAGE_W_PT - 2 * MARGIN_PT;
const CONTENT_H_PT = PAGE_H_PT - 2 * MARGIN_PT;

/** A share-sheet file name: the characters no filesystem accepts become dashes. */
export function pdfFilename(stem: string): string {
  return `${stem.replace(/[\/:*?"<>|]+/g, "-").trim()}.pdf`;
}

/** Only an iOS home-screen app sets navigator.standalone; an installed Chrome
 *  or Edge PWA on a laptop still prints from window.print(). */
export function printBlockedByStandalone(nav: Navigator = navigator): boolean {
  return (nav as Navigator & { standalone?: boolean }).standalone === true;
}

/** Rasterize each sheet to one PDF page. The libraries load on first use so
 *  a laptop that just calls window.print() never pays for them. */
export async function renderSheetsToPdf(sheets: HTMLElement[], filename: string): Promise<File> {
  if (sheets.length === 0) throw new Error("There is no report on the page to print.");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  await document.fonts?.ready;

  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait", compress: true });
  for (let i = 0; i < sheets.length; i++) {
    // Twice the CSS pixel density keeps 8.5pt table type legible on paper.
    const canvas = await html2canvas(sheets[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
    const height = Math.min(CONTENT_H_PT, (canvas.height / canvas.width) * CONTENT_W_PT);
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", MARGIN_PT, MARGIN_PT, CONTENT_W_PT, height);
  }
  return new File([pdf.output("blob")], filename, { type: "application/pdf" });
}

export type ShareOutcome = "shared" | "cancelled" | "needs-gesture" | "downloaded";

/** Hand the PDF to the share sheet. Safari only allows share() during a tap,
 *  and rendering four pages can outlast that window; "needs-gesture" tells
 *  the caller to keep the file and offer a button that shares it directly. */
export async function shareReportPdf(file: File, nav: Navigator = navigator): Promise<ShareOutcome> {
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError" || name === "InvalidStateError") return "needs-gesture";
      throw error;
    }
  }
  downloadFile(file);
  return "downloaded";
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
