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
import { markHandSetStarts, rebuildPlaySituations } from "./gameFlow";
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

  /* Audit finding #10. This used to assert the opposite - that a stored
     next-state outranks the recomputed chain - on the reasoning that every
     edit rewrites every play's stored situation straight afterwards, so a
     stale value never lives long enough to matter.

     It does not: the rewrite runs on the output of this very rebuild, which
     had already let the stale value win. Correct play 1 from +10 to +3 and
     play 2 moved back seven yards but still handed on the spot it was stored
     with - "+4" on a play whose own spots said +11 - and 3 onward never moved
     at all. A cached next-state is now worked out again; only a stated or
     enforced one is taken as read. */
  it("does not let a cached next-state outrank a recomputed chain", () => {
    const stale = chain(3);
    stale[0] = {
      ...stale[0],
      nextPossession: "us",
      nextDown: 1,
      nextDistance: 10,
      nextBallOn: 99,
      playData: { next_situation_source: "auto" },
    };

    const out = rebuild(stale);
    expect(out[1].ballOn).toBe(rebuild(chain(3))[1].ballOn);
  });

  /* The game screen's own edit path, end to end: rebuild (as on load), change
     play 1's gain the way handleSaveEdit does, rebuild again. */
  it("re-chains every later play after an edit made from a rebuilt list", () => {
    const loaded = rebuild(chain(10));
    const edited = [...loaded];
    edited[0] = { ...loaded[0], yards: 3, nextPossession: undefined, nextDown: undefined, nextDistance: undefined, nextBallOn: undefined };
    const after = rebuild(edited);
    for (const i of [1, 2]) expect(after[i].ballOn).toBe(loaded[i].ballOn - 7);
    // And each play's own spots agree with its own gain.
    for (const p of after) expect(p.nextBallOn).toBe(p.ballOn + p.yards);
  });

  /* The scoreboard's ball buttons move where the next snap starts without
     touching the play before it. Flagged, that correction outranks the chain -
     and an edit upstream of it still stops there, because the operator said
     where the ball was. */
  it("keeps a hand-set start and re-chains from it", () => {
    const plays = rebuild(chain(10));
    plays[1] = { ...plays[1], ballOn: plays[1].ballOn + 5, playData: { start_override: true } };
    const out = rebuild(plays);
    expect(out[1].ballOn).toBe(plays[1].ballOn);
    expect(out[2].ballOn).toBe(plays[1].ballOn + 4);
  });

  /* The other half, and the reason this cannot simply be deleted: a spot the
     operator typed in by hand is a fact the replay cannot derive, and it has
     to survive. */
  it("keeps a hand-entered spot flagged as a manual override", () => {
    // Stated against the play's real start, as the adjust sheet does.
    const overridden = rebuild(chain(3));
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

  /* Nearly every flag and turnover carries a stated spot, because the adjust
     sheet stores one even when it is confirmed unchanged. Absolute, each was a
     wall an upstream edit could not get past. It travels with its play. */
  it("carries an override with its play when an edit upstream moves it", () => {
    const plays = rebuild([...chain(10), play({ id: "p4", yards: 4 })]);
    plays[2] = {
      ...plays[2],
      nextPossession: "us", nextDown: 1, nextDistance: 10, nextBallOn: plays[2].ballOn + 15,
      playData: { next_situation_source: "manual_override" },
    };
    const settled = rebuild(plays);
    const edited = [...settled];
    edited[0] = { ...settled[0], yards: 3, nextPossession: undefined, nextDown: undefined, nextDistance: undefined, nextBallOn: undefined };
    const out = rebuild(edited);
    expect(out[2].ballOn).toBe(settled[2].ballOn - 7);
    expect(out[2].nextBallOn).toBe(settled[2].nextBallOn! - 7);
    expect(out[3].ballOn).toBe(settled[3].ballOn - 7);
  });

  /* What an override records is whether the offense kept the ball, not
     which team it named. An upstream edit that changes who had it at the snap
     must not hand the ball back to the old offense mid-drive. */
  it("keeps an override relative to the offense when an edit changes who had the ball", () => {
    const plays = rebuild([...chain(10), play({ id: "p4", yards: 4 })]);
    plays[2] = {
      ...plays[2],
      nextPossession: plays[2].possession, nextDown: 1, nextDistance: 10, nextBallOn: plays[2].ballOn + 15,
      playData: { next_situation_source: "manual_override" },
    };
    const settled = rebuild(plays);
    const edited = [...settled];
    // Play 1 becomes a lost fumble: plays 2 and 3 now belong to the other team.
    edited[0] = { ...settled[0], turnover: true, nextPossession: undefined, nextDown: undefined, nextDistance: undefined, nextBallOn: undefined };
    const out = rebuild(edited);
    expect(out[2].possession).not.toBe(settled[2].possession);
    expect(out[2].nextPossession).toBe(out[2].possession);
    expect(out[3].possession).toBe(out[2].possession);
  });

  /* Hand-set starts in games already recorded were never flagged. They show
     up in stored data as a play that starts somewhere other than where the
     play before it said the ball went - and nowhere else. */
  it("reads hand-set starts back off stored rows", () => {
    const stored = rebuild(chain(10));
    stored[2] = { ...stored[2], ballOn: stored[2].ballOn + 5 };
    const marked = markHandSetStarts(stored, null, DEFAULT_GAME_CONFIG);
    expect(marked.map(p => p.playData?.start_override === true)).toEqual([false, false, true]);
    // A consistent chain flags nothing.
    expect(markHandSetStarts(rebuild(chain(10)), null, DEFAULT_GAME_CONFIG).some(p => p.playData?.start_override)).toBe(false);
  });

  /* A film-chart edit clears the edited play's stored next-state and leaves
     the next play's stored start behind. That stale start must re-chain, not
     be mistaken for one set by hand. */
  it("does not mistake a start left behind by a cleared next-state for a hand-set one", () => {
    const stored = rebuild(chain(10));
    stored[0] = { ...stored[0], yards: 3, nextPossession: undefined, nextDown: undefined, nextDistance: undefined, nextBallOn: undefined };
    const marked = markHandSetStarts(stored, null, DEFAULT_GAME_CONFIG);
    expect(marked.some(p => p.playData?.start_override)).toBe(false);
    expect(rebuild(marked)[1].ballOn).toBe(stored[1].ballOn - 7);
  });
});
