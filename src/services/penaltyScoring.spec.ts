import { describe, expect, it, vi } from "vitest";
import { deriveGameState, type PlayWithPlayers } from "./gameService";
import { scoringEvents, totalScore } from "./scoringLedger";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

function recorded(type: string, enforcement: "accepted" | "declined" | "offset", counts: boolean | undefined, penalty = "Facemask"): PlayWithPlayers {
  return {
    id: "score", game_id: "penalty-scoring", sequence: 1, quarter: 1, clock: "10:00",
    possession: "us", down: 1, distance: 10, yard_line: 40, play_type: type,
    yards_gained: 0, is_touchdown: type === "rush", is_turnover: false, is_penalty: true,
    description: "Score with penalty", play_start_time: 600, play_players: [],
    play_data: {
      result: "Good", penalty_type: penalty, penalty_enforcement: enforcement,
      penalty_yards: 0, play_category: "defense",
      ...(counts == null ? {} : { penalty_play_counts: counts }),
    },
  } as unknown as PlayWithPlayers;
}

function scores(play: PlayWithPlayers) {
  const resumed = deriveGameState([play]);
  const ledger = totalScore(scoringEvents([{
    quarter: play.quarter, type: play.play_type, possession: play.possession,
    isTouchdown: play.is_touchdown, turnover: play.is_turnover,
    result: String(play.play_data?.result ?? ""), playData: play.play_data, ballOn: play.yard_line,
  }]));
  return [{ us: resumed.ourScore, them: resumed.theirScore }, ledger];
}

describe("penalty scoring on reload and in the score ledger", () => {
  for (const [type, expected] of [
    ["fg", { us: 3, them: 0 }],
    ["pat", { us: 1, them: 0 }],
    ["two_pt", { us: 2, them: 0 }],
    ["safety", { us: 0, them: 2 }],
  ] as const) {
    for (const enforcement of ["accepted", "offset"] as const) {
      it(`does not restore points from a ${type} wiped by ${enforcement} penalties`, () => {
        for (const score of scores(recorded(type, enforcement, false))) {
          expect(score).toEqual({ us: 0, them: 0 });
        }
      });
    }

    it(`keeps ${type} points when the penalty is declined`, () => {
      for (const score of scores(recorded(type, "declined", false))) expect(score).toEqual(expected);
    });

    it(`keeps a counted ${type} score after an accepted tack-on foul`, () => {
      for (const score of scores(recorded(type, "accepted", true))) expect(score).toEqual(expected);
    });
  }

  it("preserves an ordinary score without a penalty", () => {
    const play = recorded("fg", "accepted", undefined);
    play.is_penalty = false;
    play.play_data = { result: "Good" };
    for (const score of scores(play)) expect(score).toEqual({ us: 3, them: 0 });
  });

  it("keeps legacy custom accepted no-play scores wiped", () => {
    for (const score of scores(recorded("rush", "accepted", undefined, "Custom foul"))) {
      expect(score).toEqual({ us: 0, them: 0 });
    }
  });

  it("keeps a legacy custom declined touchdown", () => {
    for (const score of scores(recorded("rush", "declined", undefined, "Custom foul"))) {
      expect(score).toEqual({ us: 6, them: 0 });
    }
  });

  it("keeps a legacy tack-on touchdown without explicit play-count metadata", () => {
    for (const score of scores(recorded("rush", "accepted", undefined))) expect(score).toEqual({ us: 6, them: 0 });
  });

  it("uses the saved snap context for a legacy holding score in the ledger", () => {
    const play = recorded("rush", "accepted", undefined, "Holding-OFF");
    play.play_data = { ...play.play_data, play_category: "offense", foul_spot_ball_on: 35, context_before: { yard_line: 40 } };
    expect(totalScore(scoringEvents([{
      quarter: 1, type: "rush", possession: "us", isTouchdown: true, playData: play.play_data,
    }]))).toEqual({ us: 0, them: 0 });
  });
});
