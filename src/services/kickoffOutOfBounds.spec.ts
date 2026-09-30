import { describe, expect, it } from "vitest";
import { advanceSituationAfterPlay } from "./gameFlow";
import { DEFAULT_GAME_CONFIG } from "./programService";
import { isKickoffDue } from "@/components/game/specialTeamsPrompt";
import { isOutOfBoundsKickoff } from "./kickoffOutOfBounds";
import { transformPlays } from "./playTransformer";

describe("kickoff out of bounds", () => {
  for (const possession of ["us", "them"] as const) {
    const before = { possession, down: 1, distance: 10, ballOn: 40 };
    const base = { type: "kickoff", yards: 55, result: "", penalty: "Kickoff Out of Bounds", flagYards: 5, isTouchdown: false, firstDown: false };
    it(`gives the receiver the 35 when ${possession} kicks`, () => {
      const play = { ...base, playData: { kickoff_out_of_bounds_choice: "take_35" } };
      const after = advanceSituationAfterPlay(play, before, DEFAULT_GAME_CONFIG);
      expect(after).toEqual({ possession: possession === "us" ? "them" : "us", down: 1, distance: 10, ballOn: 35 });
      expect(isKickoffDue({ ...after, quarter: 1 }, { ...play, quarter: 1 }, DEFAULT_GAME_CONFIG)).toBe(false);
    });
    it(`keeps ${possession} kicking after a five-yard penalty`, () => {
      const play = { ...base, playData: { kickoff_out_of_bounds_choice: "rekick" } };
      const after = advanceSituationAfterPlay(play, before, DEFAULT_GAME_CONFIG);
      expect(after).toEqual({ ...before, ballOn: 35 });
      expect(isKickoffDue({ ...after, quarter: 1 }, { ...play, quarter: 1 }, DEFAULT_GAME_CONFIG)).toBe(true);
      expect(advanceSituationAfterPlay(play, after, DEFAULT_GAME_CONFIG).ballOn).toBe(30);
    });
  }
});

/* NFHS 6-1-9 gives the receiving team four answers. The app offered two, and
   placed the 25-yard one on the receiving 35 whatever the kick - right only
   from the usual K-40. */
describe("kickoff out of bounds - every NFHS choice", () => {
  const kick = (choice: string, kickedToYard: number | null = 38) => ({
    type: "kickoff", yards: 0, result: "", penalty: "Kickoff Out of Bounds", flagYards: 0, isTouchdown: false, firstDown: false,
    playData: { kickoff_out_of_bounds_choice: choice, kick_outcome: "out_of_bounds", ...(kickedToYard == null ? {} : { kicked_to_yard: kickedToYard }) },
  });
  const from = (ballOn: number) => ({ possession: "us" as const, down: 1, distance: 10, ballOn });
  const after = (choice: string, kickFrom = 40, wentOut: number | null = 38) =>
    advanceSituationAfterPlay(kick(choice, wentOut), from(kickFrom), DEFAULT_GAME_CONFIG);

  it("25 yards beyond the previous spot: from the K-40, the R-35", () => {
    expect(after("take_35")).toEqual({ possession: "them", down: 1, distance: 10, ballOn: 35 });
  });

  it("25 yards beyond a kickoff moved back by a penalty is not the 35", () => {
    // Kicked from the K-30: 25 beyond is the K-55, the R-45.
    expect(after("take_35", 30).ballOn).toBe(45);
    // Kicked from midfield: the R-25.
    expect(after("take_35", 50).ballOn).toBe(25);
  });

  it("5 yards from where it went out: out at the R-38, ball on the R-43", () => {
    expect(after("succeeding_spot")).toEqual({ possession: "them", down: 1, distance: 10, ballOn: 43 });
  });

  it("declined: the ball where it went out", () => {
    expect(after("decline")).toEqual({ possession: "them", down: 1, distance: 10, ballOn: 38 });
  });

  it("re-kick: 5 yards back, same team kicks", () => {
    expect(after("rekick")).toEqual({ possession: "us", down: 1, distance: 10, ballOn: 35 });
  });

  it("without a recorded out-of-bounds spot, falls back to the 25-yard spot rather than invent one", () => {
    expect(after("succeeding_spot", 40, null).ballOn).toBe(35);
  });

  it("every choice marks the kick as out of bounds for the kicking stats", () => {
    for (const choice of ["take_35", "succeeding_spot", "rekick", "decline"]) {
      expect(isOutOfBoundsKickoff({ play_type: "kickoff", play_data: { kickoff_out_of_bounds_choice: choice } })).toBe(true);
    }
  });

  it("the five-yard choices charge the kicking team; the placement and a decline do not", () => {
    const penaltiesFor = (choice: string, yards: number) => {
      const [out] = transformPlays([{
        id: choice, game_id: "g", sequence: 1, quarter: 1, clock: "12:00", down: 1, distance: 10, yard_line: 40,
        possession: "us", play_type: "kickoff", yards_gained: 0, is_touchdown: false, is_turnover: false, is_penalty: true,
        description: "", play_players: [],
        play_data: {
          kickoff_out_of_bounds_choice: choice, kick_outcome: "out_of_bounds", kicked_to_yard: 38,
          penalty_type: "Kickoff Out of Bounds", play_category: "offense", penalty_yards: yards,
          penalty_enforcement: choice === "decline" ? "declined" : "accepted",
        },
      } as never], { gameId: "g", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" });
      return (out as { penalties?: Array<{ yards: number; team: string }> } | undefined)?.penalties ?? [];
    };
    expect(penaltiesFor("succeeding_spot", 5)).toMatchObject([{ yards: 5, team: "us" }]);
    expect(penaltiesFor("rekick", 5)).toMatchObject([{ yards: 5, team: "us" }]);
    expect(penaltiesFor("take_35", 0)).toEqual([]);
    expect(penaltiesFor("decline", 0)).toEqual([]);
  });
});
