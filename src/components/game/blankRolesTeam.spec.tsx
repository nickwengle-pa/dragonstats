// @vitest-environment jsdom
/**
 * A role left blank records as TEAM, on either side of the ball.
 *
 * "If the player to force isn't mentioned just report as team, anytime we
 * don't fill something in that needs a placeholder" - a blank used to vanish
 * from the stats when it was ours, and only their side fell back to TEAM.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import { findPlayTypeDef } from "@/components/game/types";

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

async function recordBlank(playTypeId: string, possession: "us" | "them"): Promise<PlaySubmitData | null> {
  let out: PlaySubmitData | null = null;
  render(
    <PlayEntryModal
      playType={findPlayTypeDef(playTypeId)!}
      gameState={{ quarter: 1, clock: 600, possession, ourScore: 0, theirScore: 0, down: 1, distance: 10, ballOn: 40 }}
      roster={[]}
      opponentPlayers={[]}
      progName="Us" oppName="Them" progAbbr="US" oppAbbr="TH"
      onSubmit={(d) => { out = d; }}
      onClose={() => {}}
    />,
  );
  for (let i = 0; i < 15 && !out; i++) {
    const record = screen.queryByRole("button", { name: /Record Play/ });
    if (record) { await click(record); break; }
    const n = next();
    if (!n) break;
    await click(n);
  }
  return out;
}

describe("blank roles record as TEAM", () => {
  it("credits our TEAM with a forced fumble and a recovery nobody named", async () => {
    const out = await recordBlank("fumble", "them");
    expect(out).toBeTruthy();
    const ours = out!.tagged.filter(t => t.isTeam).map(t => t.role).sort();
    expect(ours).toEqual(expect.arrayContaining(["forced_fumble", "fumble_recovery"]));
    // Their runner, nobody named, is their TEAM as before.
    expect(out!.tagged.find(t => t.role === "rusher")).toMatchObject({ isOpponent: true, name: "TEAM" });
    // Each role once - fumble_recovery is both a play role and the recovery step's.
    const roles = out!.tagged.map(t => t.role);
    expect(roles.length).toBe(new Set(roles.filter(r => r !== "tackler")).size + roles.filter(r => r === "tackler").length);
  });

  it("leaves an unnamed interceptor as ? rather than TEAM", async () => {
    const out = await recordBlank("int", "them");
    expect(out).toBeTruthy();
    expect(out!.tagged.find(t => t.role === "interceptor")).toBeUndefined();
    expect(out!.description).toMatch(/INT by \?/);
  });
});
