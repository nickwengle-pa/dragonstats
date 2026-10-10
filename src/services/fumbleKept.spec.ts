/**
 * A fumble is a turnover only when the other team recovers it.
 *
 * Seen in a real game: a run fumbled and fallen on by the offense was saved
 * with "Recovered by" left on the defense, then corrected with the situation
 * editor to the offense's ball, 2nd and 8. The spot was right and the play
 * still wore a TO label, and counted as a lost fumble and a team turnover.
 */
import { describe, it, expect } from "vitest";
import { fumbleKeptByOffense, rebuildPlaySituations, storedRowTurnover } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";

const row = (over: Record<string, unknown> = {}, pd: Record<string, unknown> = {}) => ({
  play_type: "rush",
  possession: "us" as const,
  is_turnover: true,
  is_touchdown: false,
  ...over,
  play_data: {
    next_possession: "us",
    next_down: 2,
    next_distance: 8,
    next_yard_line: 32,
    next_situation_source: "manual_override",
    ...pd,
  },
});

describe("a fumble the offense kept", () => {
  it("is not a turnover when the stated next situation keeps the ball", () => {
    expect(storedRowTurnover(row())).toBe(false);
    expect(storedRowTurnover(row({ play_type: "sack" }))).toBe(false);
    expect(storedRowTurnover(row({ play_type: "fumble" }))).toBe(false);
  });

  it("stays a turnover when the other team got the ball", () => {
    expect(storedRowTurnover(row({}, { next_possession: "them", next_yard_line: 68 }))).toBe(true);
  });

  it("trusts only a stated next situation, not a cached one", () => {
    expect(storedRowTurnover(row({}, { next_situation_source: "auto" }))).toBe(true);
  });

  it("leaves a muffed punt the kicking team recovered as a turnover", () => {
    // The ball stays with the punting team, and that IS the receiving team's turnover.
    expect(storedRowTurnover(row({ play_type: "punt" }))).toBe(true);
  });

  it("leaves picks and scores alone", () => {
    expect(storedRowTurnover(row({ play_type: "int" }))).toBe(true);
    expect(storedRowTurnover(row({ is_touchdown: true }))).toBe(true);
  });

  it("never invents a turnover", () => {
    expect(storedRowTurnover(row({ is_turnover: false }, { next_possession: "them" }))).toBe(false);
  });

  it("is cleared on the game screen as soon as the situation is corrected", () => {
    const base = {
      id: "p1", quarter: 1, clock: 600, type: "rush", yards: 6, result: "", penalty: null,
      flagYards: 0, isTouchdown: false, firstDown: false, turnover: true, tagged: [],
      ballOn: 30, down: 1, distance: 10, description: "", possession: "us",
      playData: { start_override: true },
    } as unknown as PlayRecord;
    const kept = { ...base, nextPossession: "us", nextDown: 2, nextDistance: 8, nextBallOn: 32,
      playData: { start_override: true, next_situation_source: "manual_override" } } as PlayRecord;
    const [rebuilt] = rebuildPlaySituations([kept], null, DEFAULT_GAME_CONFIG).plays;
    expect(rebuilt.turnover).toBe(false);
    expect(rebuilt.nextPossession).toBe("us");

    const [lost] = rebuildPlaySituations([base], null, DEFAULT_GAME_CONFIG).plays;
    expect(lost.turnover).toBe(true);
    expect(fumbleKeptByOffense(lost)).toBe(false);
  });
});
