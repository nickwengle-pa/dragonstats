// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FastPlayEntry from "./FastPlayEntry";
import { findPlayTypeDef, type TaggedPlayer } from "./types";
import { canChooseGoalToGo } from "@/services/goalToGo";

afterEach(() => cleanup());

type Props = Parameters<typeof FastPlayEntry>[0];
const runner: TaggedPlayer = {
  id: "runner", player_id: "runner", jersey_number: 22, name: "Jordan Reed", role: "rusher",
};

function props(overrides: Partial<Props> = {}): Props {
  const base: Props = {
    inline: true,
    playType: findPlayTypeDef("rush")!,
    situation: { quarter: 1, clock: 600, down: 1, distance: 10, ballOn: 80,
      possession: "us", ourScore: 0, theirScore: 0 },
    offenseName: "Dragons", defenseName: "Visitors",
    offensePlayers: [runner], defensePlayers: [], tagged: [runner], tacklers: [],
    noTackle: true, trackTacklers: false, trackFormations: false, isTD: false, yards: 10,
    offenseDirection: "right", accentColor: "#164e63", defenseAccentColor: "#854d0e",
    formatSpot: ballOn => `${ballOn > 50 ? "Visitors" : "Dragons"} ${ballOn > 50 ? 100 - ballOn : ballOn}`,
    onTag: vi.fn(), onClearTag: vi.fn(), onTackler: vi.fn(), onNoTackle: vi.fn(),
    onUnknownTackle: vi.fn(), onYards: vi.fn(), onTouchdown: vi.fn(), onDetailed: vi.fn(),
    offFormation: null, defFormation: null, hashMark: null,
    onOffFormation: vi.fn(), onDefFormation: vi.fn(), onHash: vi.fn(),
    onSetNextGoalToGo: vi.fn(), onSubmit: vi.fn(), onClose: vi.fn(), onBadSnap: vi.fn(), onKneel: vi.fn(),
    ...overrides,
  };
  const firstDown = base.yards >= base.situation.distance;
  const endSpot = base.situation.ballOn + base.yards;
  return { ...base, goalChoiceRequired: canChooseGoalToGo({ ballOn: endSpot,
    down: firstDown ? 1 : base.situation.down + 1,
    distance: firstDown ? Math.min(10, 100 - endSpot) : base.situation.distance - base.yards }) };
}

describe("fast entry goal-to-go choice", () => {
  it("offers both rulings after a run earns first down at the opponent's ten", () => {
    render(<FastPlayEntry {...props()} />);
    expect(screen.getByRole("group", { name: "Next down at the 10" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1st & 10" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "1st & G" }).getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByRole("button", { name: "Save Play" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Select 1st & 10 or 1st & G.")).toBeTruthy();
  });

  for (const goalToGo of [false, true]) {
    it(`enables saving when the operator chooses ${goalToGo ? "goal" : "ten"}`, async () => {
      const onChoice = vi.fn();
      const onSubmit = vi.fn();
      const entry = props({ onSetNextGoalToGo: onChoice, onSubmit });
      const { rerender } = render(<FastPlayEntry {...entry} />);
      fireEvent.click(screen.getByRole("button", { name: goalToGo ? "1st & G" : "1st & 10" }));
      expect(onChoice).toHaveBeenCalledExactlyOnceWith(goalToGo);
      rerender(<FastPlayEntry {...entry} nextGoalToGo={goalToGo} />);
      const save = screen.getByRole("button", { name: "Save Play" }) as HTMLButtonElement;
      expect(save.disabled).toBe(false);
      expect(screen.getByText(`Next: 1 & ${goalToGo ? "G" : "10"} · Visitors 10`)).toBeTruthy();
      await act(async () => { fireEvent.click(save); });
      expect(onSubmit).toHaveBeenCalledOnce();
    });
  }

  it("does not ask for a new-series ruling when a run to the ten stops short of the sticks", () => {
    render(<FastPlayEntry {...props({ yards: 5, situation: {
      quarter: 1, clock: 600, down: 1, distance: 10, ballOn: 85,
      possession: "us", ourScore: 0, theirScore: 0,
    } })} />);
    expect(screen.queryByRole("group", { name: "Next down at the 10" })).toBeNull();
    expect((screen.getByRole("button", { name: "Save Play" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Next: 2 & 5 · Visitors 10")).toBeTruthy();
  });

  it("previews goal-to-go automatically for a fresh first down inside the ten", () => {
    render(<FastPlayEntry {...props({ yards: 11 })} />);
    expect(screen.queryByRole("group", { name: "Next down at the 10" })).toBeNull();
    expect((screen.getByRole("button", { name: "Save Play" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Next: 1 & G · Visitors 9")).toBeTruthy();
  });
});
