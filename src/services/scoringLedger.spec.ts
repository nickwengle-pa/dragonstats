/**
 * The scoring ledger, and the invariant that makes it worth having:
 * the quarter totals add up to the final score.
 *
 * A box score that prints 7-14-0-6 across the top and 28 in the total column
 * is not a rounding difference, it is two different answers to the same
 * question, and a coach hands that sheet to people.
 */
import { describe, it, expect } from "vitest";
import {
  scoringEvents,
  totalScore,
  scoreByQuarter,
  type ScorablePlay,
} from "./scoringLedger";

const play = (over: Partial<ScorablePlay>): ScorablePlay => ({
  quarter: 1,
  type: "rush",
  possession: "us",
  ...over,
});

describe("scoring ledger", () => {
  it("gives an ordinary touchdown to the team that snapped it", () => {
    const s = totalScore(scoringEvents([play({ type: "rush", isTouchdown: true })]));
    expect(s).toEqual({ us: 6, them: 0 });
  });

  /* The case the engine ledger got wrong, and the reason the line score put
     six points in the wrong column. */
  it("gives a strip-sack returned for a score to the defence", () => {
    const s = totalScore(scoringEvents([
      play({ type: "sack", possession: "us", turnover: true, isTouchdown: true }),
    ]));
    expect(s).toEqual({ us: 0, them: 6 });
  });

  it("scores a two-point conversion, which the engine ledger never did", () => {
    const s = totalScore(scoringEvents([
      play({ type: "two_pt", possession: "us", result: "Good" }),
    ]));
    expect(s).toEqual({ us: 2, them: 0 });
  });

  it("scores a safety for the team that did NOT concede it", () => {
    const s = totalScore(scoringEvents([play({ type: "safety", possession: "us" })]));
    expect(s).toEqual({ us: 0, them: 2 });
  });

  it("scores a returned conversion for the defence", () => {
    const s = totalScore(scoringEvents([
      play({ type: "pat", possession: "us", result: "Returned" }),
    ]));
    expect(s).toEqual({ us: 0, them: 2 });
  });

  it("keeps a manual score correction, so a replay cannot drop it", () => {
    const s = totalScore(scoringEvents([
      play({ type: "score_correction", playData: { score_delta_team: "them", score_delta: 3 } }),
    ]));
    expect(s).toEqual({ us: 0, them: 3 });
  });

  it("ignores a missed kick", () => {
    const s = totalScore(scoringEvents([
      play({ type: "fg", possession: "us", result: "No Good" }),
      play({ type: "pat", possession: "us", result: "No Good" }),
    ]));
    expect(s).toEqual({ us: 0, them: 0 });
  });

  /* ── the invariant ─────────────────────────────────────────────────── */

  it("quarter totals sum to the final score, across every scoring type", () => {
    const events = scoringEvents([
      // Q1: we score a touchdown and kick the point.
      play({ quarter: 1, type: "rush", possession: "us", isTouchdown: true }),
      play({ quarter: 1, type: "pat", possession: "us", result: "Good" }),
      // Q2: they score, go for two and get it.
      play({ quarter: 2, type: "pass_comp", possession: "them", isTouchdown: true }),
      play({ quarter: 2, type: "two_pt", possession: "them", result: "Good" }),
      // Q2: our defence takes a strip-sack back.
      play({ quarter: 2, type: "sack", possession: "them", turnover: true, isTouchdown: true }),
      // Q3: a field goal, and a safety conceded by them.
      play({ quarter: 3, type: "fg", possession: "us", result: "Good" }),
      play({ quarter: 3, type: "safety", possession: "them" }),
      // Q4: a kickoff return the other way.
      play({ quarter: 4, type: "kickoff", possession: "us", isTouchdown: true }),
    ]);

    const total = totalScore(events);
    const byQ = scoreByQuarter(events);

    const sum = (b: Record<number, number>) => Object.values(b).reduce((a, v) => a + v, 0);
    expect(sum(byQ.us)).toBe(total.us);
    expect(sum(byQ.them)).toBe(total.them);

    // And the numbers themselves, so a change that breaks both halves equally
    // still gets caught.
    expect(byQ.us).toEqual({ 1: 7, 2: 6, 3: 5 });
    expect(byQ.them).toEqual({ 2: 8, 4: 6 });
    expect(total).toEqual({ us: 18, them: 14 });
  });
});
