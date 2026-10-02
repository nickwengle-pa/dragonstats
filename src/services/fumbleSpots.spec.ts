/**
 * A finalized 35-14 game reopened on the game screen as 28-21.
 *
 * Its plays were saved by a build that wrote fumble_recovered_at: 0 and
 * fumble_return_yards: 0 on every play. Read back as numbers, every snap
 * became "loose ball recovered on the offense's own goal line": the opening
 * 0-yard completion left the ball on the 0 at 2nd and 37, the chain drifted
 * off the recorded possessions, and touchdowns were scored for the wrong
 * team. The box score stayed right because it scores the stored spots.
 *
 * The rows below are the opening plays of that game, as stored.
 */
import { describe, it, expect } from "vitest";
import { readFumbleSpots } from "./fumbleSpots";
import { rebuildPlaySituations } from "./gameFlow";
import { scoringEvents, totalScore } from "./scoringLedger";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";

describe("readFumbleSpots", () => {
  it("reads the zeros older builds stored on every play as never set", () => {
    expect(readFumbleSpots({ fumble_recovered_at: 0, fumble_return_yards: 0 }))
      .toEqual({ fumbleRecoveredAt: null, fumbleReturnYards: null });
  });

  it("reads nulls and missing fields as never set", () => {
    expect(readFumbleSpots({ fumble_recovered_at: null, fumble_return_yards: null }))
      .toEqual({ fumbleRecoveredAt: null, fumbleReturnYards: null });
    expect(readFumbleSpots({})).toEqual({ fumbleRecoveredAt: null, fumbleReturnYards: null });
    expect(readFumbleSpots(null)).toEqual({ fumbleRecoveredAt: null, fumbleReturnYards: null });
  });

  it("keeps a real recovery, including one returned zero yards", () => {
    expect(readFumbleSpots({ fumble_recovered_at: 81, fumble_return_yards: 0 }))
      .toEqual({ fumbleRecoveredAt: 81, fumbleReturnYards: 0 });
    expect(readFumbleSpots({ fumble_recovered_at: 25, fumble_return_yards: 25 }))
      .toEqual({ fumbleRecoveredAt: 25, fumbleReturnYards: 25 });
  });

  it("keeps a return recorded before recovery spots existed", () => {
    expect(readFumbleSpots({ fumble_recovered_at: null, fumble_return_yards: 12 }))
      .toEqual({ fumbleRecoveredAt: null, fumbleReturnYards: 12 });
  });
});

type Row = [type: string, possession: "us" | "them", yards: number, extra?: Partial<PlayRecord>];

/* Plays 1-10 of the game, with the zero-filled play_data they were saved with. */
const OPENING: Row[] = [
  ["kickoff", "us", 33],
  ["pass_comp", "them", 0, { result: "Complete" }],
  ["pass_comp", "them", -1, { result: "Complete" }],
  ["pass_inc", "them", 0, { result: "Incomplete" }],
  ["punt", "them", 9],
  ["rush", "us", 9],
  ["rush", "us", 18, { firstDown: true }],
  ["rush", "us", 7],
  ["rush", "us", 1, { isTouchdown: true, firstDown: true }],
  ["pat", "us", 0, { result: "Good" }],
];

function storedPlays(rows: Row[]): PlayRecord[] {
  return rows.map(([type, possession, yards, extra], i) => ({
    id: `p${i + 1}`,
    sequence: i + 1,
    quarter: 1,
    clock: 720,
    type,
    yards,
    result: "",
    penalty: null,
    flagYards: 0,
    isTouchdown: false,
    firstDown: false,
    turnover: false,
    tagged: [],
    ballOn: 0,
    down: 1,
    distance: 10,
    description: "",
    possession,
    ...extra,
    ...readFumbleSpots({ fumble_recovered_at: 0, fumble_return_yards: 0 }),
    playData: { fumble_recovered_at: 0, fumble_return_yards: 0, next_situation_source: "auto" },
  } as PlayRecord));
}

const PREGAME = {
  tossWinner: "us" as const,
  tossChoice: "defer" as const,
  openingKickoffReceiver: "them" as const,
  ourDriveDirectionQ1: "left" as const,
};

describe("a game saved with zero-filled fumble fields", () => {
  const rebuilt = rebuildPlaySituations(storedPlays(OPENING), PREGAME, DEFAULT_GAME_CONFIG).plays;

  it("keeps the opening 0-yard completion at 2nd and 10, not on the goal line", () => {
    expect(rebuilt[1]).toMatchObject({ possession: "them", down: 1, distance: 10, ballOn: 27 });
    expect(rebuilt[1]).toMatchObject({ nextDown: 2, nextDistance: 10, nextBallOn: 27 });
  });

  it("re-derives the same spots the game recorded", () => {
    // Recorded starts of plays 5-9: punt from their 26, our drive from 65.
    expect(rebuilt.slice(4, 9).map((p) => [p.possession, p.down, p.distance, p.ballOn])).toEqual([
      ["them", 4, 11, 26],
      ["us", 1, 10, 65],
      ["us", 2, 1, 74],
      ["us", 1, 8, 92],
      ["us", 2, 1, 99],
    ]);
  });

  it("scores the opening touchdown for the team that scored it", () => {
    const scorable = rebuilt.map((p) => ({ ...p, clock: undefined, playData: p.playData ?? null }));
    expect(totalScore(scoringEvents(scorable))).toEqual({ us: 7, them: 0 });
  });
});
