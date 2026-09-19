import { afterEach, describe, expect, it, vi } from "vitest";
import { printBlockedByStandalone, shareFile } from "./deliverFile";

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
    expect(await shareFile(file, nav({ share, canShare: () => true }))).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file], title: "PL vs OPP.pdf" });
  });

  it("treats the user dismissing the sheet as nothing to report", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    expect(await shareFile(file, nav({ share, canShare: () => true }))).toBe("cancelled");
  });

  it("asks for a fresh tap when the render outlasted the gesture Safari requires", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("no gesture", "NotAllowedError"));
    expect(await shareFile(file, nav({ share, canShare: () => true }))).toBe("needs-gesture");
  });

  it("falls back to a download where files cannot be shared", async () => {
    const click = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    vi.stubGlobal("document", {
      createElement: () => ({ click, style: {}, set href(_: string) {}, set download(_: string) {} }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    expect(await shareFile(file, nav({ share: vi.fn(), canShare: () => false }))).toBe("downloaded");
    expect(click).toHaveBeenCalled();
  });
});
