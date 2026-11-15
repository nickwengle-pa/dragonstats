// @vitest-environment jsdom
/**
 * Live punts and kickoffs on one screen, and no made-up landing spot.
 *
 * A new kick used to start on the receivers' 5 wherever it was kicked from,
 * so a punt saved untouched was a long punt nobody made. The spot is now
 * asked for, on the one-screen kick and on the step-by-step screens alike.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import { findPlayTypeDef, type RosterPlayer, type OpponentPlayerRef } from "@/components/game/types";

beforeAll(() => {
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= function () {};
  (Element.prototype as any).scrollTo ??= function () {};
  window.confirm = () => true;
});
afterEach(() => cleanup());

const roster: RosterPlayer[] = [[7, "Alex", "Miller"], [22, "Jordan", "Reed"], [2, "Sam", "Two"]].map(([n, f, l]) => ({
  id: `p${n}`, player_id: `p${n}`, jersey_number: Number(n), position: null, positions: null,
  player: { id: `p${n}`, first_name: String(f), last_name: String(l), preferred_name: null },
}));
const opp: OpponentPlayerRef[] = [{ id: "o20", name: "Visitor 20", jersey_number: 20, position: null }];
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const byText = (text: string | RegExp) => {
  const found = screen.getAllByRole("button").find(b => typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? ""));
  expect(found, `no ${text} button`).toBeTruthy();
  return found!;
};

function renderPunt(extra: Partial<Parameters<typeof PlayEntryModal>[0]> = {}) {
  const sink: { out: PlaySubmitData | null } = { out: null };
  const utils = render(
    <PlayEntryModal
      playType={findPlayTypeDef("punt")!}
      gameState={{ quarter: 2, clock: 300, possession: "us", ourScore: 0, theirScore: 0, down: 4, distance: 6, ballOn: 35 }}
      roster={roster}
      opponentPlayers={opp}
      progName="Dragons" oppName="Visitors" progAbbr="DRG" oppAbbr="VIS"
      onSubmit={(d) => { sink.out = d; }}
      onClose={() => {}}
      {...extra}
    />,
  );
  return { sink, ...utils };
}

/** Type a jersey on the picker's keypad and tap Done, without touching the row. */
async function typeAndDone(label: RegExp, jersey: string) {
  await click(screen.getByRole("button", { name: label }));
  const popup = document.querySelector(".player-picker-popup") as HTMLElement;
  for (const digit of jersey) await click(within(popup).getAllByRole("button").find(b => b.textContent?.trim() === digit)!);
  await click(within(popup).getAllByRole("button").find(b => /Done/.test(b.textContent ?? ""))!);
}

describe("one-screen punt", () => {
  it("cannot save until the landing spot is given", async () => {
    renderPunt({ inlineSimple: true });
    const save = byText(/Save Play/i) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText("Not set")).toBeTruthy();
  });

  it("saves a punt from the spot typed and the players typed on the keypad", async () => {
    const { sink } = renderPunt({ inlineSimple: true });
    await typeAndDone(/Open Punter list/, "7");
    await typeAndDone(/Open Returner list/, "20");
    await act(async () => { fireEvent.change(screen.getByLabelText("Caught at yard line"), { target: { value: "20" } }); });
    await act(async () => { fireEvent.change(screen.getByLabelText("Return yards"), { target: { value: "8" } }); });
    await click(byText(/Save Play/i));
    expect(sink.out).toBeTruthy();
    const out = sink.out!;
    expect(out.tagged.find(t => t.role === "punter")?.player_id).toBe("p7");
    expect(out.tagged.find(t => t.role === "returner")?.player_id).toBe("o20");
    expect(out.playData?.kicked_to_yard).toBe(20);
    expect(out.description).toMatch(/45 yds/);
  });

  it("holds Save for our punter, the way a run holds it for the runner", async () => {
    renderPunt({ inlineSimple: true });
    await act(async () => { fireEvent.change(screen.getByLabelText("Caught at yard line"), { target: { value: "20" } }); });
    expect((byText(/Save Play/i) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Choose the punter or identify on film later/)).toBeTruthy();
  });

  it("a touchback needs no spot", async () => {
    const { sink } = renderPunt({ inlineSimple: true });
    await typeAndDone(/Open Punter list/, "7");
    await click(byText("Touchback"));
    await click(byText(/Save Play/i));
    expect(sink.out?.playData?.kick_outcome).toBe("touchback");
  });
});

describe("step-by-step punt", () => {
  it("Next waits on the landing spot instead of saving a punt to the 5", async () => {
    renderPunt();
    // Punter step: Next goes on (a blank punter is still TEAM here).
    await click(byText(/^Next/));
    const next = byText(/^Next/) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    await act(async () => { fireEvent.change(screen.getByPlaceholderText("e.g. 5"), { target: { value: "20" } }); });
    expect((byText(/^Next/) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("player picker Done", () => {
  it("takes the one player wearing the number typed", async () => {
    renderPunt({ inlineSimple: true });
    await typeAndDone(/Open Punter list/, "22");
    expect((screen.getByRole("combobox", { name: /Punter/ }) as HTMLInputElement).value).toBe("#22 Jordan Reed");
  });

  it("takes nobody from a number nobody wears", async () => {
    renderPunt({ inlineSimple: true });
    await typeAndDone(/Open Punter list/, "9");
    expect((screen.getByRole("combobox", { name: /Punter/ }) as HTMLInputElement).value).toBe("");
  });
});
