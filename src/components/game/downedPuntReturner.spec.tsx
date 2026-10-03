// @vitest-environment jsdom
/**
 * A downed punt has no returner, whatever the last kick's returner was.
 *
 * The returner is a sticky role, so a new punt opens with the previous
 * kick's returner already tagged. Downed / out of bounds / touchback skip the
 * returner step, so that carry-over was never shown and was saved - and read
 * as a 0-yard punt return.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import { findPlayTypeDef, type RosterPlayer, type OpponentPlayerRef, type TaggedPlayer } from "@/components/game/types";

beforeAll(() => {
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= function () {};
  (Element.prototype as any).scrollTo ??= function () {};
  window.confirm = () => true;
});
afterEach(() => cleanup());

const roster: RosterPlayer[] = ["p", "kr"].map((id, i) => ({
  id, player_id: id, jersey_number: i + 1, position: null, positions: null,
  player: { id, first_name: id.toUpperCase(), last_name: "Us", preferred_name: null },
}));
const opp: OpponentPlayerRef[] = [{ id: "o_p", name: "o_p", jersey_number: 50, position: null }];
const lastReturner: TaggedPlayer = { id: "kr", player_id: "kr", jersey_number: 2, name: "KR Us", role: "returner" };

async function recordTheirPunt(outcome: string): Promise<PlaySubmitData | null> {
  let out: PlaySubmitData | null = null;
  render(
    <PlayEntryModal
      playType={findPlayTypeDef("punt")!}
      gameState={{ quarter: 2, clock: 300, possession: "them", ourScore: 0, theirScore: 0, down: 4, distance: 8, ballOn: 30 }}
      roster={roster}
      opponentPlayers={opp}
      progName="Us" oppName="Them"
      lastPlayerByRole={{ "returner:us": lastReturner }}
      onSubmit={(d) => { out = d; }}
      onClose={() => {}}
    />,
  );
  const pick = screen.getAllByRole("button").find(b => b.textContent?.trim() === outcome);
  expect(pick, `no ${outcome} button`).toBeTruthy();
  await act(async () => { fireEvent.click(pick!); });
  for (let i = 0; i < 20 && !out; i++) {
    const record = screen.queryByRole("button", { name: /Record Play/ });
    if (record) { await act(async () => { fireEvent.click(record); }); break; }
    const next = screen.queryAllByRole("button").find(b => /^\s*Next\s*$/.test(b.textContent ?? ""));
    if (!next) break;
    await act(async () => { fireEvent.click(next); });
  }
  return out;
}

describe("a kick nobody fielded saves no returner", () => {
  for (const outcome of ["Downed", "Out of Bounds", "Touchback"]) {
    it(outcome, async () => {
      const out = await recordTheirPunt(outcome);
      expect(out).not.toBeNull();
      expect(out!.tagged.filter(t => t.role === "returner")).toEqual([]);
      expect(out!.description).not.toMatch(/ret /);
    });
  }

  it("drops the carried returner when the kick is blocked", async () => {
    const out = await recordTheirPunt("Blocked");
    expect(out).not.toBeNull();
    expect(out!.tagged.filter(t => t.role === "returner")).toEqual([]);
  });

  it("still keeps the carried returner on a fair catch", async () => {
    const out = await recordTheirPunt("Fair Catch");
    expect(out!.tagged.find(t => t.role === "returner")?.player_id).toBe("kr");
  });
});
