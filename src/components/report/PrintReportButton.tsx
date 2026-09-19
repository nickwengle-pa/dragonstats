import { useState, type ReactNode } from "react";
import { Loader2, Share } from "lucide-react";
import { printBlockedByStandalone, shareFile } from "@/services/deliverFile";
import { renderReportPdf } from "@/services/reportPrint";

type Phase =
  | { kind: "idle" }
  | { kind: "building" }
  // Built, but Safari refused the share because the tap had expired; the
  // next tap on this same button shares it synchronously.
  | { kind: "ready"; file: File }
  | { kind: "error"; message: string };

/** The print control for a screen. On a laptop or in a browser tab it is
 *  window.print(); in the iOS home-screen app, where that call is a silent
 *  no-op, it renders the screen to a PDF and opens the share sheet instead. */
export default function PrintReportButton({ root, filename, disabled, className, children }: {
  /** The element to print — the whole screen; the print stylesheet hides its chrome. */
  root: () => HTMLElement | null;
  filename: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const share = async (file: File) => {
    try {
      const outcome = await shareFile(file);
      setPhase(outcome === "needs-gesture" ? { kind: "ready", file } : { kind: "idle" });
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "Could not share the report." });
    }
  };

  const onClick = async () => {
    if (phase.kind === "building") return;
    if (phase.kind === "ready") { await share(phase.file); return; }
    if (!printBlockedByStandalone()) { window.print(); return; }
    const el = root();
    if (!el) return;
    setPhase({ kind: "building" });
    try {
      await share(await renderReportPdf(el, filename));
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "Could not build the report PDF." });
    }
  };

  const ready = phase.kind === "ready";
  return (
    <>
      <button
        onClick={onClick}
        className={className}
        disabled={disabled || phase.kind === "building"}
        aria-busy={phase.kind === "building"}
        title={ready ? "Share the report PDF" : "Print / Save as PDF"}
      >
        {phase.kind === "building" ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Preparing PDF" />
          : ready ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Share className="w-4 h-4" />Share PDF</span>
          : children}
      </button>
      {phase.kind === "error" && (
        <span role="alert" className="text-xs text-red-400 max-w-[12rem]">{phase.message}</span>
      )}
    </>
  );
}
