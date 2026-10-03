// @vitest-environment jsdom
/**
 * Moving a penalty's result to where the officials spotted it.
 *
 * "In the penalty screen when it shows the result of the penalty on the field
 * I want to be able to adjust that field in case the yards aren't exact." The
 * only way to do it was an unlabelled pin icon. The result now takes the same
 * spot controls as a run - tap the field, drag or nudge the ruler - and the
 * down and distance follow the new spot by the rules.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import NumberField from "@/components/game/NumberField";
import { findPlayTypeDef } from "@/components/game/types";
import { useState } from "react";

beforeAll(() => {
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= function () {};
  (Element.prototype as any).scrollTo ??= function () {};
  window.confirm = () => true;
});
afterEach(() => cleanup());

const button = (name: string | RegExp, scope: HTMLElement = document.body) => {
  const found = within(scope).getAllByRole("button").find(b => typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent ?? ""));
  expect(found, `no ${name} button`).toBeTruthy();
  return found!;
};
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };

/** Our 2nd & 8 at our 30; offsides on them is 5 yards, to our 35, 2nd & 3. */
async function flagOffsides(): Promise<{ result: HTMLElement; submit: () => Promise<PlaySubmitData | null> }> {
  let out: PlaySubmitData | null = null;
  render(
    <PlayEntryModal
      playType={findPlayTypeDef("penalty_only")!}
      gameState={{ quarter: 1, clock: 600, possession: "us", ourScore: 0, theirScore: 0, down: 2, distance: 8, ballOn: 30 }}
      roster={[]}
      opponentPlayers={[]}
      progName="Us" oppName="Them" progAbbr="US" oppAbbr="TH"
      onSubmit={(d) => { out = d; }}
      onClose={() => {}}
    />,
  );
  await click(button(/^Offsides/));
  const result = screen.getByRole("region", { name: "Penalty result" });
  expect(result.textContent).toContain("2 & 3");
  return {
    result,
    submit: async () => {
      for (let i = 0; i < 10 && !out; i++) {
        const record = screen.queryByRole("button", { name: /Record Play/ });
        if (record) { await click(record); break; }
        await click(button(/^\s*Next\s*$/));
      }
      return out;
    },
  };
}

describe("adjusting a penalty's result spot", () => {
  it("offers a labelled Adjust button, not just an icon", async () => {
    const { result } = await flagOffsides();
    expect(button(/Adjust/, result)).toBeTruthy();
  });

  it("a nudge moves the ball and the distance follows the chains", async () => {
    const { result, submit } = await flagOffsides();
    await click(button("+1", result));
    expect(result.textContent).toContain("Spotted at");
    expect(result.textContent).toContain("2 & 2");
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ possession: "us", ballOn: 36, down: 2, distance: 2, source: "manual_override" });
  });

  it("a spot that reaches the chains is a first down", async () => {
    const { result, submit } = await flagOffsides();
    await click(button("+5", result));
    expect(result.textContent).toContain("1 & 10");
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ ballOn: 40, down: 1, distance: 10 });
  });

  it("Use rules puts the ball back on the mark-off", async () => {
    const { result, submit } = await flagOffsides();
    await click(button("-1", result));
    await click(button(/Use rules/, result));
    expect(result.textContent).toContain("Enforced to");
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ ballOn: 35, down: 2, distance: 3, source: "penalty_enforced" });
  });
});

describe("a number box that can be emptied", () => {
  function Harness({ initial }: { initial: number }) {
    const [value, setValue] = useState(initial);
    return <><NumberField aria-label="yard" value={value} onChange={setValue} min={1} max={50} /><output>{value}</output></>;
  }

  it("stays empty while you type, then takes the new number", () => {
    render(<Harness initial={35} />);
    const box = screen.getByLabelText("yard") as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "" } });
    expect(box.value).toBe("");
    fireEvent.change(box, { target: { value: "3" } });
    expect(box.value).toBe("3");
    expect(screen.getByRole("status").textContent).toBe("3");
  });

  it("shows the kept value again when left empty", () => {
    render(<Harness initial={35} />);
    const box = screen.getByLabelText("yard") as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    expect(box.value).toBe("35");
  });

  it("clamps what it passes up, and shows the clamp on leaving", () => {
    render(<Harness initial={35} />);
    const box = screen.getByLabelText("yard") as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "60" } });
    expect(screen.getByRole("status").textContent).toBe("50");
    fireEvent.blur(box);
    expect(box.value).toBe("50");
  });
});
