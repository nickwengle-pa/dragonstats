// @vitest-environment jsdom
/**
 * A bad snap can be marked on any snapped play, and every report counts it.
 *
 * The Bad Snap play type covers a snap nobody had. A punt snapped over the
 * punter's head that he still got off, or a low snap the quarterback scooped
 * and threw, is a different play with a bad snap in it - marked by a toggle
 * that rides in play_data.bad_snap.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import { countBadSnaps, findPlayTypeDef, isBadSnap, type PlayRecord } from "@/components/game/types";

beforeAll(() => {
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= function () {};
  (Element.prototype as any).scrollTo ??= function () {};
  window.confirm = () => true;
});
afterEach(() => cleanup());

const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };
const next = () => within(document.body).getAllByRole("button").find(b => /^\s*Next\s*$/.test(b.textContent ?? ""));

async function record(playTypeId: string, opts: { toggle?: boolean; editing?: PlayRecord } = {}): Promise<PlaySubmitData | null> {
  let out: PlaySubmitData | null = null;
  render(
    <PlayEntryModal
      playType={findPlayTypeDef(playTypeId)!}
      gameState={{ quarter: 1, clock: 600, possession: "us", ourScore: 0, theirScore: 0, down: 4, distance: 10, ballOn: 30 }}
      roster={[]}
      opponentPlayers={[]}
      progName="Us" oppName="Them" progAbbr="US" oppAbbr="TH"
      editing={opts.editing ?? null}
      onSubmit={(d) => { out = d; }}
      onClose={() => {}}
    />,
  );
  for (let i = 0; i < 20 && !out; i++) {
    const toggle = screen.queryByRole("button", { name: /Bad snap/ });
    if (toggle && opts.toggle) { await click(toggle); opts = { ...opts, toggle: false }; }
    const save = screen.queryByRole("button", { name: /Record Play|Save Changes/ });
    if (save) { await click(save); break; }
    const n = next();
    if (!n) break;
    await click(n);
  }
  return out;
}

describe("bad snap flag", () => {
  it("marks a punt off a bad snap", async () => {
    const out = await record("punt", { toggle: true });
    expect(out).toBeTruthy();
    expect(out!.playData?.bad_snap).toBe(true);
  });

  it("writes false when it was not toggled, so an edit can clear it", async () => {
    const out = await record("punt");
    expect(out).toBeTruthy();
    expect(out!.playData?.bad_snap).toBe(false);
  });

  it("counts by the team that snapped it, the Bad Snap play type included", () => {
    const rows = [
      { play_type: "bad_snap", possession: "us", play_data: {} },
      { play_type: "punt", possession: "us", play_data: { bad_snap: true } },
      { play_type: "pass_comp", possession: "them", play_data: { bad_snap: true } },
      { play_type: "rush", possession: "us", play_data: { bad_snap: false } },
      // Nothing is snapped on a kickoff, whatever a stray flag says.
      { play_type: "kickoff", possession: "us", play_data: { bad_snap: true } },
    ];
    expect(countBadSnaps(rows, "us")).toBe(2);
    expect(countBadSnaps(rows, "them")).toBe(1);
    expect(isBadSnap("fg", { bad_snap: true })).toBe(true);
    expect(isBadSnap("fg", null)).toBe(false);
  });
});
