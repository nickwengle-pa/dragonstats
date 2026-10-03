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
async function flagOffsides(start = { down: 2, distance: 8, ballOn: 30 }, foul = /^Offsides/): Promise<{ result: HTMLElement; submit: () => Promise<PlaySubmitData | null> }> {
  let out: PlaySubmitData | null = null;
  render(
    <PlayEntryModal
      playType={findPlayTypeDef("penalty_only")!}
      gameState={{ quarter: 1, clock: 600, possession: "us", ourScore: 0, theirScore: 0, ...start }}
      roster={[]}
      opponentPlayers={[]}
      progName="Us" oppName="Them" progAbbr="US" oppAbbr="TH"
      onSubmit={(d) => { out = d; }}
      onClose={() => {}}
    />,
  );
  await click(button(foul));
  const result = screen.getByRole("region", { name: "Penalty result" });
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
  it("starts on the rules' mark-off", async () => {
    const { result } = await flagOffsides();
    expect(result.textContent).toContain("2 & 3");
  });

  it("the other team's side button works at the 50", async () => {
    const { result, submit } = await flagOffsides({ down: 2, distance: 8, ballOn: 45 });
    expect(result.textContent).toMatch(/Enforced to\s*50/);
    await click(button(/Adjust/, result));
    await click(button("THE", result));
    const box = screen.getByLabelText("Ball on yard line") as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "4" } });
    fireEvent.change(box, { target: { value: "45" } });
    fireEvent.blur(box);
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ ballOn: 55, possession: "us", down: 1, distance: 10 });
  });

  it("a Down choice that changes who gets the ball drops the old correction", async () => {
    // 4th & 2 at our 40, false start: 4th & 7 at our 35. Nudge to our 36,
    // then rule it "Next down": a turnover on downs, enforced from the same
    // spot but to the other team, so the nudge no longer means anything.
    const { result, submit } = await flagOffsides({ down: 4, distance: 2, ballOn: 40 }, /^False Start/);
    expect(result.textContent).toContain("4 & 7");
    await click(button("+1", result));
    await click(screen.getByRole("button", { name: "Next down" }));
    expect(result.textContent).toContain("Enforced to");
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ possession: "them", ballOn: 65, source: "penalty_enforced" });
  });

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

  it("lights First down once the spot reaches the chains, and confirming it keeps the spot", async () => {
    const { result, submit } = await flagOffsides();
    await click(button("+5", result));
    const first = screen.getByRole("button", { name: "First down" });
    expect(first.getAttribute("aria-pressed")).toBe("true");
    await click(first);
    expect(result.textContent).toContain("Spotted at");
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ ballOn: 40, down: 1, distance: 10, source: "manual_override" });
  });

  it("typing in the Ball on box follows the rules like the ruler", async () => {
    const { result, submit } = await flagOffsides();
    await click(button(/Adjust/, result));
    const box = screen.getByLabelText("Ball on yard line") as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "3" } });
    fireEvent.change(box, { target: { value: "36" } });
    fireEvent.blur(box);
    expect(result.textContent).toContain("2 & 2");
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ ballOn: 36, down: 2, distance: 2 });
  });

  it("a team picked by hand stays picked when the ball is moved", async () => {
    const { result, submit } = await flagOffsides();
    await click(button(/Adjust/, result));
    await click(within(screen.getByRole("group", { name: "Next possession" })).getByRole("button", { name: "Them" }));
    await click(button("+1", result));
    const out = await submit();
    expect(out?.nextSituation?.possession).toBe("them");
  });

  it("a distance typed by hand stays typed when the ball is moved", async () => {
    const { result, submit } = await flagOffsides();
    await click(button("+1", result));
    const toGo = screen.getByLabelText("To go") as HTMLInputElement;
    fireEvent.focus(toGo);
    fireEvent.change(toGo, { target: { value: "5" } });
    fireEvent.blur(toGo);
    await click(button("+1", result));
    const out = await submit();
    expect(out?.nextSituation).toMatchObject({ ballOn: 37, down: 2, distance: 5 });
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
    return <><NumberField aria-label="yard" value={value} onChange={setValue} min={1} max={50} /><output>{value}</output>
      <button onClick={() => setValue(v => v + 1)}>nudge</button></>;
  }

  it("an emptied box after a nudge keeps the nudged number", () => {
    render(<Harness initial={35} />);
    const box = screen.getByLabelText("yard") as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.click(screen.getByRole("button", { name: "nudge" }));
    expect(box.value).toBe("36");
    fireEvent.change(box, { target: { value: "3" } });
    fireEvent.change(box, { target: { value: "" } });
    expect(screen.getByRole("status").textContent).toBe("36");
  });

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

  it("an emptied box keeps the old number, not the first digit deleting passed through", () => {
    render(<Harness initial={35} />);
    const box = screen.getByLabelText("yard") as HTMLInputElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "3" } });
    fireEvent.change(box, { target: { value: "" } });
    expect(box.value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("35");
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
