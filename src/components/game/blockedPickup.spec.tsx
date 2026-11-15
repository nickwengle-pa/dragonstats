// @vitest-environment jsdom
/**
 * Blocked punts: where the other side picked it up, and the kickers keeping
 * their own down alive.
 *
 * The pickup spot splits the return between the blocker (the roll back) and
 * the runner (the run after), as the stat manual does. And a punt the kickers
 * fall on behind the line is still their down: "Kept playing" ends the block
 * where they picked it up and hands the next snap the same down from there.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
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

const roster: RosterPlayer[] = ["blk", "run", "p"].map((id, i) => ({
  id, player_id: id, jersey_number: 50 + i, position: null, positions: null,
  player: { id, first_name: id.toUpperCase(), last_name: "Us", preferred_name: null },
}));
const opp: OpponentPlayerRef[] = [{ id: "o_p", name: "o_p", jersey_number: 9, position: null }];

const button = (text: string | RegExp) => screen.getAllByRole("button")
  .find(b => typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? ""));

async function click(text: string | RegExp) {
  const b = button(text);
  expect(b, `no ${text} button`).toBeTruthy();
  await act(async () => { fireEvent.click(b!); });
}

async function typeYards(n: number) {
  const input = screen.getByPlaceholderText("+7 or -2");
  await act(async () => { fireEvent.change(input, { target: { value: String(n) } }); });
}

/** Next until the yards step shows its spot controls. */
async function toYards() {
  for (let i = 0; i < 12 && !screen.queryByPlaceholderText("+7 or -2"); i++) {
    await click(/^\s*Next\s*$/);
  }
  expect(screen.queryByPlaceholderText("+7 or -2")).toBeTruthy();
}

async function record(): Promise<void> {
  for (let i = 0; i < 12; i++) {
    // Ball inside the 10 next: the goal-to-go question comes first.
    const goal = button("1st & G");
    if (goal) await act(async () => { fireEvent.click(goal); });
    const rec = screen.queryByRole("button", { name: /Record Play/ });
    if (rec) { await act(async () => { fireEvent.click(rec); }); return; }
    await click(/^\s*Next\s*$/);
  }
}

function open(possession: "us" | "them", onSubmit: (d: PlaySubmitData) => void) {
  render(
    <PlayEntryModal
      playType={findPlayTypeDef("blocked_kick")!}
      gameState={{ quarter: 2, clock: 300, possession, ourScore: 0, theirScore: 0, down: 4, distance: 8, ballOn: 40 }}
      roster={roster}
      opponentPlayers={opp}
      progName="Us" oppName="Them"
      onSubmit={onSubmit}
      onClose={() => {}}
    />,
  );
}

describe("blocked punt pickup spot", () => {
  it("saves where the blocking team picked it up", async () => {
    let out: PlaySubmitData | null = null;
    open("them", d => { out = d; });
    await toYards();
    // Rolled back 10 to their 30, then run 20 more to their 10.
    await typeYards(-10);
    await click(/Where it was picked up/);
    await typeYards(-30);
    expect(screen.getByText(/Rolled back/).parentElement!.textContent).toMatch(/10 yds/);
    expect(screen.getByText(/Run after/).parentElement!.textContent).toMatch(/20 yds/);
    await record();
    expect(out).not.toBeNull();
    expect(out!.yards).toBe(-30);
    expect(out!.playData?.blocked_pickup_ball_on).toBe(30);
    expect(out!.playData?.blocked_kick_continued).toBe(false);
    expect(out!.nextSituation ?? null).toBeNull();
  });

  it("asks for no pickup spot when nobody set one", async () => {
    let out: PlaySubmitData | null = null;
    open("them", d => { out = d; });
    await toYards();
    await typeYards(-12);
    await record();
    expect(out!.playData?.blocked_pickup_ball_on).toBeNull();
  });
});

describe("kickers keep their own blocked punt alive", () => {
  it("ends the block at the pickup and keeps the same down", async () => {
    let out: PlaySubmitData | null = null;
    open("us", d => { out = d; });
    await click(/kicking team/);
    await toYards();
    await click("Kept playing");
    await typeYards(-7);
    await record();
    expect(out).not.toBeNull();
    expect(out!.playData?.blocked_recovered_by_kicking).toBe(true);
    expect(out!.playData?.blocked_kick_continued).toBe(true);
    // 4th & 8 at the 40, picked up at the 33: 4th & 15 from the 33.
    expect(out!.nextSituation).toMatchObject({ possession: "us", down: 4, distance: 15, ballOn: 33, source: "manual_override" });
  });

  it("still goes to the review when they were downed", async () => {
    let out: PlaySubmitData | null = null;
    open("us", d => { out = d; });
    await click(/kicking team/);
    await toYards();
    await typeYards(-7);
    await record();
    expect(out!.playData?.blocked_kick_continued).toBe(false);
    expect(out!.nextSituation ?? null).toBeNull();
  });
});
