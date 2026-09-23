/**
 * The clock-at-0:00 prompt at the end of the 4th used to ask "go to
 * overtime?" and offer Start OT whatever the score. Overtime only settles a
 * tie, so a 21-14 final must offer End Game alone.
 */
import { describe, expect, it } from "vitest";
import { canStartOvertime, MAX_QUARTER } from "./gameFlow";

describe("overtime at the end of a period", () => {
  it("is offered for a tie at the end of regulation", () => {
    expect(canStartOvertime(4, 14, 14)).toBe(true);
  });

  it("is not offered when either team leads", () => {
    expect(canStartOvertime(4, 21, 14)).toBe(false);
    expect(canStartOvertime(4, 7, 10)).toBe(false);
  });

  it("is offered again after an overtime period that ends level", () => {
    expect(canStartOvertime(5, 21, 21)).toBe(true);
    expect(canStartOvertime(5, 28, 21)).toBe(false);
  });

  it("is not offered before the 4th or once no overtime period is left", () => {
    expect(canStartOvertime(3, 7, 7)).toBe(false);
    expect(canStartOvertime(MAX_QUARTER, 35, 35)).toBe(false);
  });
});
