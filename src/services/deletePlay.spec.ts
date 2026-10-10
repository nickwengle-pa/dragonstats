/**
 * Deleting a play from the middle of a game.
 *
 * The River Valley case: a touchdown run that a pre-snap False Start wiped
 * out, then the False Start with its spot typed by hand (PL 11), then the run
 * that really scored. Deleting the touchdown has to leave the False Start
 * starting where the play before the touchdown left the ball, and ending on
 * the spot that was typed - on the game screen and on the film chart.
 */
import { describe, it, expect } from "vitest";
import { rebuildPlaySituations, withoutPlay } from "./gameFlow";
import { rechainStoredPlays } from "./rechainStored";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";

const config = DEFAULT_GAME_CONFIG;

const play = (over: Partial<PlayRecord>): PlayRecord => ({
  id: "p",
  quarter: 1,
  clock: 600,
  type: "rush",
  yards: 0,
  result: "",
  penalty: null,
  flagYards: 0,
  isTouchdown: false,
  firstDown: false,
  turnover: false,
  tagged: [],
  ballOn: 20,
  down: 1,
  distance: 10,
  description: "",
  possession: "us",
  ...over,
} as PlayRecord);

/** Recorded the way the game screen leaves them: every start and next
 *  chained, and the flag play's next stated by hand as the real spot. */
function recorded(): PlayRecord[] {
  const chained = rebuildPlaySituations([
    play({ id: "gain", yards: 20 }),
    play({ id: "wiped", yards: 3 }),
    play({ id: "flag", type: "penalty_only", penalty: "False Start", flagYards: 5 }),
    play({ id: "after", yards: 4 }),
  ], null, config).plays;
  const realStart = chained[1].ballOn;
  return chained.map((p) => p.id === "flag"
    ? {
        ...p,
        // Five back from where the wiped-out play really started.
        nextPossession: p.possession,
        nextDown: 1,
        nextDistance: 15,
        nextBallOn: realStart - 5,
        playData: { ...(p.playData ?? {}), next_situation_source: "manual_override" },
      }
    : p);
}

const toRow = (p: PlayRecord, i: number): PlayWithPlayers => ({
  id: p.id, sequence: i + 1, quarter: p.quarter, clock: "12:00", possession: p.possession, down: p.down,
  distance: p.distance, yard_line: p.ballOn, play_type: p.type, yards_gained: p.yards, is_touchdown: p.isTouchdown,
  is_turnover: p.turnover, is_penalty: !!p.penalty, description: p.description, play_players: [],
  play_data: {
    ...p.playData, penalty_type: p.penalty, penalty_yards: p.flagYards, is_first_down: p.firstDown,
    next_possession: p.nextPossession ?? null, next_down: p.nextDown ?? null,
    next_distance: p.nextDistance ?? null, next_yard_line: p.nextBallOn ?? null,
  },
} as unknown as PlayWithPlayers);

describe("deleting a play from the middle of a game", () => {
  it("keeps the spot typed on the play after it, on the game screen", () => {
    const plays = recorded();
    const typed = plays[2].nextBallOn;
    const realStart = plays[1].ballOn;

    const rebuilt = rebuildPlaySituations(withoutPlay(plays, "wiped", null, config), null, config).plays;
    const flag = rebuilt.find((p) => p.id === "flag")!;
    expect(flag.ballOn).toBe(realStart);
    expect(flag.nextBallOn).toBe(typed);
    expect(rebuilt.find((p) => p.id === "after")!.ballOn).toBe(typed);

    // What a plain filter did: the typed spot walked by the deleted gain.
    const filtered = rebuildPlaySituations(plays.filter((p) => p.id !== "wiped"), null, config).plays;
    expect(filtered.find((p) => p.id === "flag")!.nextBallOn).toBe(typed! - 3);
  });

  it("leaves a play with no typed spot to the replay", () => {
    const plays = recorded().map((p) => p.id === "flag"
      ? { ...p, playData: { ...(p.playData ?? {}), next_situation_source: "auto" } }
      : p);
    expect(withoutPlay(plays, "wiped", null, config)).toEqual(plays.filter((p) => p.id !== "wiped"));
  });

  it("does not freeze the next play's start, or leave a gap in the numbers, on the film chart", () => {
    const rows = recorded().map(toRow);
    const typed = rows[2].play_data?.next_yard_line;
    const realStart = rows[1].yard_line;

    const rewrites = rechainStoredPlays(rows, null, config, "wiped");
    expect(rewrites.some((w) => w.id === "wiped")).toBe(false);
    const flag = rewrites.find((w) => w.id === "flag")!;
    expect(flag.playData.start_override).toBeUndefined();
    expect(flag.fields.yard_line).toBe(realStart);
    expect(flag.fields.end_yard_line).toBe(typed);
    expect(flag.fields.sequence).toBe(2);
    expect(rewrites.find((w) => w.id === "after")!.fields.sequence).toBe(3);

    // Written back, there is nothing left for a second pass to change.
    const byId = new Map(rewrites.map((w) => [w.id, w]));
    const written = rows.filter((r) => r.id !== "wiped").map((r) => {
      const w = byId.get(r.id);
      return w ? { ...r, ...w.fields, play_data: w.playData } : r;
    });
    expect(rechainStoredPlays(written, null, config)).toEqual([]);
  });
});
