import { afterEach, describe, expect, it, vi } from "vitest";
import { pdfFilename, printBlockedByStandalone, shareReportPdf } from "./reportPrint";

const file = new File(["%PDF"], "PL vs OPP.pdf", { type: "application/pdf" });
const nav = (overrides: Record<string, unknown>) => overrides as unknown as Navigator;

afterEach(() => { vi.unstubAllGlobals(); });

describe("standalone print detection", () => {
  it("is blocked only by the iOS home-screen flag, not by an installed desktop PWA", () => {
    expect(printBlockedByStandalone(nav({ standalone: true }))).toBe(true);
    expect(printBlockedByStandalone(nav({ standalone: false }))).toBe(false);
    expect(printBlockedByStandalone(nav({}))).toBe(false);
  });
});

describe("sharing the report PDF", () => {
  it("hands the file to the share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareReportPdf(file, nav({ share, canShare: () => true }))).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file], title: "PL vs OPP.pdf" });
  });

  it("treats the user dismissing the sheet as nothing to report", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    expect(await shareReportPdf(file, nav({ share, canShare: () => true }))).toBe("cancelled");
  });

  it("asks for a fresh tap when the render outlasted the gesture Safari requires", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("no gesture", "NotAllowedError"));
    expect(await shareReportPdf(file, nav({ share, canShare: () => true }))).toBe("needs-gesture");
  });

  it("falls back to a download where files cannot be shared", async () => {
    const click = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("document", {
      createElement: () => ({ click, set href(_: string) {}, set download(_: string) {} }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    expect(await shareReportPdf(file, nav({ share: vi.fn(), canShare: () => false }))).toBe("downloaded");
    expect(click).toHaveBeenCalled();
  });
});

describe("pdf file names", () => {
  it("strips the characters a filesystem rejects", () => {
    expect(pdfFilename("PL vs OPP 9/19/2026")).toBe("PL vs OPP 9-19-2026.pdf");
  });
});
