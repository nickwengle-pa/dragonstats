/**
 * The NFHS fouls that do more than walk off yards.
 *
 * Roughing the kicker is the reported one: "roughing the kicker gives a 1st
 * down and punt yards don't count". Before this, an accepted roughing on a
 * punt was enforced like any return foul - the receiving team took the ball
 * and the punter kept his yards - and nothing in the list could say "first
 * down" because NFHS was modelled as having no automatic first downs at all.
 * It has exactly two: roughing the passer and roughing the kicker or holder.
 */
import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";
import { replayLiveGame } from "./liveGameSession";
import { advanceSituationAfterPlay } from "./gameFlow";
import { enforcePenalty, type EnforcementInput } from "./penaltyEnforcement";
import { DEFAULT_GAME_CONFIG } from "./programService";
import {
  PENALTIES,
  PENALTY_RULES,
  grantsAutoFirstDown,
  kickVoidedByPenalty,
  penaltiesFor,
  penaltyCostsDown,
  type PlayRecord,
} from "@/components/game/types";

const tags = (...roles: string[]) => roles.map((role, i) => ({ player_id: `${role}${i}`, role, credit: null }));
function row(over: Record<string, unknown> = {}): PlayWithPlayers {
  return {
    id: "p1", game_id: "kick", sequence: 1, quarter: 1, clock: "10:00", down: 4, distance: 20,
    yard_line: 30, possession: "us", play_type: "punt", play_data: {}, yards_gained: 0,
    is_touchdown: false, is_turnover: false, is_penalty: false, description: "", play_start_time: 600,
    play_players: tags("punter", "returner", "tackler"), ...over,
  } as unknown as PlayWithPlayers;
}

/** A 40-yard punt from our 30, returned 10 yards, with a flag on it. */
const puntWithFlag = (penalty: string, enforcement: string, side = "defense") => row({
  is_penalty: true,
  play_data: {
    kick_outcome: "returned", kicked_to_yard: 30, return_to_ball_on: 60,
    penalty_type: penalty, penalty_yards: PENALTY_RULES[penalty]?.yards ?? 15,
    play_category: side, penalty_enforcement: enforcement,
  },
});

/** Report and live stats for the same plays, checked against each other. */
function run(...plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ rules: "high_school", trackDrives: true });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  engine.processPlays(transformPlays(plays, { gameId: "kick", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
  const summary = engine.getGameSummary();
  const live = replayLiveGame(plays.map(p => ({
    id: p.id, type: p.play_type, possession: p.possession, ballOn: p.yard_line,
    quarter: p.quarter, clock: 600, down: p.down, distance: p.distance,
    yards: p.yards_gained, isTouchdown: p.is_touchdown, turnover: p.is_turnover,
    playData: p.play_data, penalty: p.play_data?.penalty_type,
    flagYards: p.play_data?.penalty_yards, penaltyEnforcement: p.play_data?.penalty_enforcement,
    penaltyCategory: p.play_data?.play_category,
    tagged: p.play_players.map(t => ({ ...t, id: t.player_id, name: t.player_id })),
  } as unknown as PlayRecord)), {
    gameId: "kick", programTeamId: "us", programName: "Us", programAbbreviation: "US",
    opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH",
    isHome: true, gameConfig: DEFAULT_GAME_CONFIG, pregame: null,
  }).summary!;
  return { summary, live };
}

describe("the penalty list", () => {
  it("keeps every label it has ever stored - they are saved verbatim on plays", () => {
    for (const label of [
      "Offsides", "False Start", "Holding-OFF", "Holding-DEF", "PI-OFF", "PI-DEF",
      "Facemask", "Unsportsmanlike", "Delay of Game", "Illegal Formation",
      "Block in Back", "Clipping", "Encroachment", "Illegal Shift", "Illegal Motion",
    ]) expect(PENALTIES).toContain(label);
  });

  it("has a rule for every penalty it lists", () => {
    for (const label of PENALTIES) expect(PENALTY_RULES[label], label).toBeDefined();
  });

  it("offers the kick fouls first on a kick, and loses nothing between the groups", () => {
    const { likely, rest } = penaltiesFor("kick");
    expect(likely).toContain("Roughing the Kicker");
    expect(likely).toContain("Running Into Kicker");
    expect(likely).not.toContain("False Start");
    expect([...likely, ...rest].sort()).toEqual([...PENALTIES].sort());
  });
});

describe("NFHS automatic first downs", () => {
  it("come only with the roughing fouls", () => {
    expect(grantsAutoFirstDown("Roughing the Kicker", "defense")).toBe(true);
    expect(grantsAutoFirstDown("Roughing the Passer", "defense")).toBe(true);
    const others = PENALTIES.filter(p => grantsAutoFirstDown(p, "defense"));
    expect(others.sort()).toEqual(["Roughing the Kicker", "Roughing the Passer"]);
  });

  it("running into the kicker is five yards and no first down", () => {
    expect(grantsAutoFirstDown("Running Into Kicker", "defense")).toBe(false);
    expect(PENALTY_RULES["Running Into Kicker"].yards).toBe(5);
  });
});

describe("roughing the kicker on a punt", () => {
  it("wipes out the punt only when accepted against the receiving team", () => {
    expect(kickVoidedByPenalty("punt", "Roughing the Kicker", "defense", "accepted")).toBe(true);
    expect(kickVoidedByPenalty("fair_catch", "Running Into Kicker", "defense", "accepted")).toBe(true);
    expect(kickVoidedByPenalty("punt", "Roughing the Kicker", "defense", "declined")).toBe(false);
    expect(kickVoidedByPenalty("punt", "Roughing the Kicker", "defense", "offset")).toBe(false);
    expect(kickVoidedByPenalty("punt", "Holding-DEF", "defense", "accepted")).toBe(false);
    // A made field goal would lose its points; that stays the operator's call.
    expect(kickVoidedByPenalty("fg", "Roughing the Kicker", "defense", "accepted")).toBe(false);
  });

  it("gives the kicking team the ball and a first down on 4th and 20", () => {
    const input: EnforcementInput = {
      side: "defense", flagYards: 15,
      before: { ballOn: 30, down: 4, distance: 20 },
      foulSpotBallOn: 30, playEndBallOn: 30,
      // What the entry modal passes once the kick is voided.
      kind: "loose_ball", possessionAtEnd: "offense",
      firstDownDistance: 10, autoFirstDown: true,
    };
    expect(enforcePenalty(input)).toMatchObject({ ballOn: 45, down: 1, distance: 10, possessionFlips: false });
  });

  it("does the same when the next spot is replayed from the play list", () => {
    const next = advanceSituationAfterPlay({
      type: "punt", yards: 30, result: "", penalty: "Roughing the Kicker",
      penaltyCategory: "defense", penaltyEnforcement: "accepted", flagYards: 15,
      isTouchdown: false, firstDown: false,
    }, { possession: "us", down: 4, distance: 20, ballOn: 30 }, DEFAULT_GAME_CONFIG);
    expect(next).toEqual({ possession: "us", down: 1, distance: 10, ballOn: 45 });
  });

  it("credits the punter and returner nothing, and charges the flag", () => {
    const { summary, live } = run(puntWithFlag("Roughing the Kicker", "accepted"));
    for (const s of [summary, live]) {
      expect(s.punting.punter0?.punts ?? 0).toBe(0);
      expect(s.homeTeamStats.puntCount ?? 0).toBe(0);
      expect(s.awayTeamStats.penalties).toBe(1);
      expect(s.awayTeamStats.penaltyYards).toBe(15);
    }
  });

  it("control: declined, the punt and its yards stand", () => {
    const { summary, live } = run(puntWithFlag("Roughing the Kicker", "declined"));
    for (const s of [summary, live]) {
      expect(s.punting.punter0.punts).toBe(1);
      expect(s.punting.punter0.puntYards).toBeGreaterThan(0);
    }
  });
});

describe("loss of down", () => {
  it("is carried by grounding and an illegal forward pass, on the offense only", () => {
    expect(penaltyCostsDown("Intentional Grounding", "offense")).toBe(true);
    expect(penaltyCostsDown("Illegal Forward Pass", "offense")).toBe(true);
    expect(penaltyCostsDown("Holding-OFF", "offense")).toBe(false);
    expect(penaltyCostsDown("Intentional Grounding", "defense")).toBe(false);
  });

  const grounding: EnforcementInput = {
    side: "offense", flagYards: 5,
    before: { ballOn: 30, down: 2, distance: 10 },
    foulSpotBallOn: null, playEndBallOn: 30,
    kind: "loose_ball", possessionAtEnd: "offense",
    firstDownDistance: 10, lossOfDown: true,
  };

  it("walks off the yards and uses up the down", () => {
    expect(enforcePenalty(grounding)).toMatchObject({ ballOn: 25, down: 3, distance: 15, possessionFlips: false });
  });

  it("on fourth down, turns the ball over at the enforced spot", () => {
    expect(enforcePenalty({ ...grounding, before: { ballOn: 30, down: 4, distance: 10 } }))
      .toMatchObject({ ballOn: 25, down: 1, possessionFlips: true });
  });

  it("agrees when replayed from the play list", () => {
    const flag = {
      type: "pass_inc", yards: 0, result: "", penalty: "Intentional Grounding",
      penaltyCategory: "offense" as const, penaltyEnforcement: "accepted" as const, flagYards: 5,
      isTouchdown: false, firstDown: false,
    };
    expect(advanceSituationAfterPlay(flag, { possession: "us", down: 2, distance: 10, ballOn: 30 }, DEFAULT_GAME_CONFIG))
      .toEqual({ possession: "us", down: 3, distance: 15, ballOn: 25 });
    expect(advanceSituationAfterPlay(flag, { possession: "us", down: 4, distance: 10, ballOn: 30 }, DEFAULT_GAME_CONFIG))
      .toEqual({ possession: "them", down: 1, distance: 10, ballOn: 75 });
  });
});

describe("a flag on a return that changes possession", () => {
  it("measures the new series toward the goal the returning team attacks", () => {
    // Returned to the kicking team's 8, then a 15-yard foul on the kickers
    // marks it to the 4: goal to go from the 4, not 1st and 10.
    const e = enforcePenalty({
      side: "offense", flagYards: 15,
      before: { ballOn: 30, down: 4, distance: 10 },
      foulSpotBallOn: null, playEndBallOn: 8,
      kind: "running", possessionAtEnd: "defense", firstDownDistance: 10,
    });
    expect(e).toMatchObject({ ballOn: 4, down: 1, distance: 4, possessionFlips: true });
  });
});
