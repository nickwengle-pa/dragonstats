/**
 * Who gets the six.
 *
 * A touchdown on a play where the ball changed hands belongs to the team that
 * did NOT have it at the snap. The live replay decided that from a list of
 * play types — int, fumble, kickoff, punt, blocked_kick — which misses the way
 * most fumbles are actually recorded.
 *
 * A fumble on a run, a sack or a completed pass is entered with the "+ Fumble"
 * modifier, so the play type stays "sack" or "rush". Only the standalone
 * Fumble button produces type "fumble". A strip-sack returned for a score
 * therefore failed the check and six points went to the offence that had just
 * lost the ball — on the scoreboard the operator is watching, and in the score
 * written to the game row.
 *
 * `turnover` is the honest signal: the modal sets it from whether the offence
 * recovered its own fumble, so it is true for a strip-sack and false for a
 * fumble the offence fell on.
 */
import { describe, it, expect } from "vitest";
import { replayLiveGame } from "./liveGameSession";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";

const CONFIG = {
  gameId: "g",
  programTeamId: "us",
  programName: "Us",
  programAbbreviation: "US",
  opponentTeamId: "them",
  opponentName: "Them",
  opponentAbbreviation: "TH",
  isHome: true,
  gameConfig: DEFAULT_GAME_CONFIG,
  rulesConfig: null,
  pregame: null,
} as never;

function play(over: Partial<PlayRecord>): PlayRecord {
  return {
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
    ballOn: 30,
    down: 1,
    distance: 10,
    description: "",
    possession: "us",
    ...over,
  } as PlayRecord;
}

const score = (plays: PlayRecord[]) => replayLiveGame(plays, CONFIG).score;

describe("a return touchdown is scored by the team that did not have the ball", () => {
  /* The one that was broken. Our QB is strip-sacked and they return it: the
     play type is "sack", not "fumble", so the old type list missed it and gave
     US the six. */
  it("credits the defence for a strip-sack returned for a score", () => {
    const s = score([
      play({ type: "sack", possession: "us", turnover: true, isTouchdown: true, yards: -7 }),
    ]);
    expect(s.them).toBe(6);
    expect(s.us).toBe(0);
  });

  /* Same shape on a completed pass — receiver fumbles, they take it back. */
  it("credits the defence for a fumble on a completed pass returned for a score", () => {
    const s = score([
      play({ type: "pass_comp", possession: "us", turnover: true, isTouchdown: true, yards: 12 }),
    ]);
    expect(s.them).toBe(6);
    expect(s.us).toBe(0);
  });

  it("still credits the defence for an interception returned for a score", () => {
    const s = score([
      play({ type: "int", possession: "us", turnover: true, isTouchdown: true }),
    ]);
    expect(s.them).toBe(6);
  });

  /* The other direction has to keep working: a fumble the offence recovers and
     carries in is still the offence's touchdown. */
  it("credits the offence when it recovers its own fumble and scores", () => {
    const s = score([
      play({ type: "rush", possession: "us", turnover: false, isTouchdown: true, yards: 20 }),
    ]);
    expect(s.us).toBe(6);
    expect(s.them).toBe(0);
  });

  it("credits the returning team on a kickoff return", () => {
    // A kickoff is recorded with the KICKING team in possession.
    const s = score([
      play({ type: "kickoff", possession: "us", isTouchdown: true }),
    ]);
    expect(s.them).toBe(6);
  });

  it("leaves an ordinary rushing touchdown with the offence", () => {
    const s = score([
      play({ type: "rush", possession: "them", isTouchdown: true, yards: 8 }),
    ]);
    expect(s.them).toBe(6);
    expect(s.us).toBe(0);
  });
});
