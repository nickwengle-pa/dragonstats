import { useCallback, useRef, useState } from "react";
import { Loader2, Share } from "lucide-react";
import { SheetIcon } from "@/components/icons/BroadcastIcons";
import { deliverFile, shareFile } from "@/services/deliverFile";
import { pdfFilename } from "@/services/reportPrint";
import type { SeasonModel } from "@/services/seasonBook";

/* ═══════════════════════════════════════════════════════════════════════════
   SEASON BOOK — the button that makes the linked season PDF, and the strip
   under the header that says how far along it is.

   The PDF is drawn on the device from the season already loaded for the
   screen (seasonBookPdf.ts), so making it needs no network. Its code loads
   on the first tap, which keeps jsPDF out of the screen's own bundle.

   In the iOS home-screen app the file goes to the share sheet. Safari only
   allows that during a tap, and a long season can take a few seconds to lay
   out, so when the tap has gone stale the button turns into "Share PDF" and
   the next tap hands it over directly (the same dance PrintReportButton does).
   ═══════════════════════════════════════════════════════════════════════════ */

type Phase =
  | { kind: "idle" }
  | { kind: "building"; message: string; fraction: number }
  | { kind: "ready"; file: File }
  | { kind: "done"; name: string }
  | { kind: "error"; message: string };

export interface SeasonBookState {
  phase: Phase;
  run: () => void;
  dismiss: () => void;
}

/** "Nov 1, 2026 at 7:42 PM", in the device's time. */
function madeLabel(now = new Date()): string {
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}

/** Longest side of the logo as it goes into the book, in pixels. */
const LOGO_MAX = 512;

/** The program logo as a PNG data URL for the cover. Anything that will not
 *  load in time, or will not draw, is left off. */
async function logoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith("image/") ? await redrawLogo(blob) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Redrawn through a canvas, which always hands back an 8-bit PNG: jsPDF
   scrambles the soft edges of a 16-bit PNG (the letters of a logo came out
   fringed in green and blue), and a full-size upload would be carried in
   every copy of the book. */
async function redrawLogo(blob: Blob): Promise<string | null> {
  const src = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return null;
    const scale = Math.min(1, LOGO_MAX / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function useSeasonBook(model: SeasonModel | null, opts: { seasonLabel: string; abbreviation: string }): SeasonBookState {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = useRef(false);

  const share = useCallback(async (file: File) => {
    try {
      const outcome = await shareFile(file);
      setPhase(outcome === "needs-gesture" ? { kind: "ready", file } : outcome === "cancelled" ? { kind: "idle" } : { kind: "done", name: file.name });
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "Could not share the Season Book." });
    }
  }, []);

  const run = useCallback(() => {
    if (phase.kind === "ready") { void share(phase.file); return; }
    if (!model || busy.current) return;
    busy.current = true;
    setPhase({ kind: "building", message: "Getting ready…", fraction: 0 });
    void (async () => {
      try {
        const [{ buildSeasonBookPdf }, logo] = await Promise.all([
          import("@/services/seasonBookPdf"),
          logoDataUrl(model.program.logoUrl),
        ]);
        const blob = await buildSeasonBookPdf(model, {
          seasonLabel: opts.seasonLabel,
          generatedLabel: madeLabel(),
          logoDataUrl: logo,
          onProgress: (message, fraction) => setPhase({ kind: "building", message, fraction }),
        });
        const file = new File([blob], pdfFilename(`${opts.abbreviation} ${opts.seasonLabel} Season Book`), { type: "application/pdf" });
        const outcome = await deliverFile(file);
        setPhase(outcome === "needs-gesture" ? { kind: "ready", file } : outcome === "cancelled" ? { kind: "idle" } : { kind: "done", name: file.name });
      } catch (error) {
        setPhase({ kind: "error", message: error instanceof Error ? error.message : "Could not make the Season Book." });
      } finally {
        busy.current = false;
      }
    })();
  }, [model, opts.seasonLabel, opts.abbreviation, phase, share]);

  const dismiss = useCallback(() => setPhase({ kind: "idle" }), []);
  return { phase, run, dismiss };
}

/** The header button. */
export function SeasonBookButton({ book, disabled }: { book: SeasonBookState; disabled?: boolean }) {
  const { phase } = book;
  const building = phase.kind === "building";
  return (
    <button type="button" className="bc-btn bc-btn-primary ss-book-btn" onClick={book.run}
      disabled={disabled || building} aria-busy={building}
      title={phase.kind === "ready" ? "Share the Season Book PDF" : "Make the Season Book: one PDF with every game, player and play, linked"}>
      {building ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        : phase.kind === "ready" ? <Share className="w-4 h-4" aria-hidden />
        : <SheetIcon size={15} />}
      {phase.kind === "ready" ? <span>Share PDF</span> : <span>Season Book</span>}
    </button>
  );
}

/** Under the header: progress while it builds, then what happened. */
export function SeasonBookStatus({ book }: { book: SeasonBookState }) {
  const { phase } = book;
  if (phase.kind === "idle") return null;
  if (phase.kind === "building") {
    return (
      <div className="ss-book-status" role="status">
        <div className="ss-book-bar"><i style={{ width: `${Math.round(Math.max(0.04, phase.fraction) * 100)}%` }} /></div>
        <span>Season Book · {phase.message}</span>
      </div>
    );
  }
  return (
    <div className={`ss-book-status ${phase.kind === "error" ? "bad" : ""}`} role={phase.kind === "error" ? "alert" : "status"}>
      <span>
        {phase.kind === "ready" && "The Season Book is ready. Tap Share PDF to save or send it."}
        {phase.kind === "done" && `Saved ${phase.name}. Every game, player and contents line in it is a link.`}
        {phase.kind === "error" && phase.message}
      </span>
      <button type="button" className="ss-book-x" onClick={book.dismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
