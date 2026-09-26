import { expect, it } from "vitest";
import { opponentsForPicker, quickAddOpponentId } from "./types";

const row = (id: string, jersey: number | null, name: string, position: string | null = null) =>
  ({ id, jersey_number: jersey, name, position });

it("offers a saved quick-add row under the id the play it was added on was tagged with", () => {
  // The uuid is what the database hands back after the quick-add saves.
  const [seven] = opponentsForPicker([row("4f1c-uuid", 7, "#7")]);
  expect(seven.id).toBe(quickAddOpponentId(7));
  expect(seven.id).toBe("opp_UNK_7");
});

it("keeps the uuid on a real roster row, which recorded plays are tagged with", () => {
  const players = [row("a-uuid", 12, "Sam Davis", "QB"), row("b-uuid", 7, "#7", "RB"), row("c-uuid", 21, "Jo Fox")];
  expect(opponentsForPicker(players).map(p => p.id)).toEqual(["a-uuid", "b-uuid", "c-uuid"]);
});

it("lists one player for a number saved twice", () => {
  const players = [row("opp_UNK_7", 7, "#7"), row("d-uuid", 7, "#7")];
  expect(opponentsForPicker(players)).toHaveLength(1);
});

it("leaves a numberless row alone", () => {
  expect(opponentsForPicker([row("e-uuid", null, "#null")])[0].id).toBe("e-uuid");
});
