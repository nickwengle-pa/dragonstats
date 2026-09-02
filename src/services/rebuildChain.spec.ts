/**
 * Editing an early play must re-chain everything after it.
 *
 * Down, distance, spot and score are derived by replaying the play list, so
 * correcting play 1 has to move plays 2 and 3. `rebuildPlaySituations` does
 * recompute each play's STARTING situation from the running state — but the
 * situation it carries FORWARD comes from the play's stored `next*` fields
 * whenever they are present, and only falls back to deriving it.
 *
 * That stored value was written when the play was first recorded. If it
 * survives an edit, the correction lands on the edited play and stops there:
 * play 1 shows the fix, plays 2 and 3 carry on from where the old play 1 ended.
 *
 * These tests establish which of those actually happens before anything is
 * changed. CLAUDE.md says a hand-entered spot flagged `manual_override` should
 * outrank the replay — the question is whether ONLY that should, or whether
 * stored next-state is deliberately authoritative for plays the replay cannot
 * derive (kicks, returns), which is why this is measured rather than assumed.
 */
import { describe, it, expect } from "vitest";
import { rebuildPlaySituations } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";

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

/** Three straight runs from our own 20, no stored next-state at all. */
const chain = (firstGain: number): PlayRecord[] => [
  play({ id: "p1", yards: firstGain }),
  play({ id: "p2", yards: 4 }),
  play({ id: "p3", yards: 4 }),
];

const rebuild = (plays: PlayRecord[]) =>
  rebuildPlaySituations(plays, null, DEFAULT_GAME_CONFIG).plays;

describe("rebuilding the chain after an edit", () => {
  /* Asserted as a DIFFERENCE between two rebuilds rather than against absolute
     spots: the opening situation comes from the kickoff rules, and this is a
     test about propagation, not about where the game starts. */
  it("moves the plays after an edit by exactly the yardage that changed", () => {
    const before = rebuild(chain(10));
    const after = rebuild(chain(3));

    // Play 1 starts in the same place either way — the edit is downstream.
    expect(after[0].ballOn).toBe(before[0].ballOn);
    // Seven fewer yards gained moves everything after it seven yards back.
    expect(after[1].ballOn).toBe(before[1].ballOn - 7);
    expect(after[2].ballOn).toBe(before[2].ballOn - 7);
    /* Distance-to-go follows too. The DOWN does not change here because a
       first down is a recorded fact on the play (`firstDown`), set by the
       entry modal, not something the replay re-derives from the yardage — so a
       yardage-only edit moves the ball without re-deciding the series. */
    expect(before[1].distance).toBe(1);
    expect(after[1].distance).toBe(7);
  });

  /* Audit finding #10, measured rather than assumed.
     
     Stored next-state DOES outrank recomputation: play 1 is edited down to 3
     yards but still carries the next-state written when it gained far more,
     and that stale value wins. In isolation this is the bug the audit
     describes — a correction that lands on the edited play and stops there.
     
     It is left alone deliberately. Every edit, insert and delete runs
     recalcScoreAndState, which rewrites EVERY play's stored situation from the
     fresh rebuild, so the stale value is overwritten in the same breath that
     creates it. Gating this on `manual_override` — which is what CLAUDE.md
     says should outrank the replay — would change how every play in every game
     replays, mid-season, to fix something the app already repairs.
     
     What would make this dangerous is that repair not running: an edit made
     offline whose situation writes never drain, or a partial failure part-way
     through the rewrite. If stale chains ever show up in a real game, this
     test is where the reasoning is, and the gate is a two-line change. */
  it("currently lets stored next-state outrank a recomputed chain", () => {
    const stale = chain(3);
    stale[0] = {
      ...stale[0],
      nextPossession: "us",
      nextDown: 1,
      nextDistance: 10,
      nextBallOn: 99,
    };

    const out = rebuild(stale);
    // Documents today's behaviour, not the desired one: the stored spot wins.
    expect(out[1].ballOn).toBe(99);
  });

  /* The other half, and the reason this cannot simply be deleted: a spot the
     operator typed in by hand is a fact the replay cannot derive, and it has
     to survive. */
  it("keeps a hand-entered spot flagged as a manual override", () => {
    const overridden = chain(3);
    overridden[0] = {
      ...overridden[0],
      nextPossession: "us",
      nextDown: 1,
      nextDistance: 10,
      nextBallOn: 47,
      playData: { next_situation_source: "manual_override" },
    };

    const out = rebuild(overridden);
    expect(out[1].ballOn).toBe(47);
    expect(out[1].down).toBe(1);
  });
});
