import { describe, expect, it } from "vitest";
import { enforcePenalty, type EnforcementInput } from "./penaltyEnforcement";

const input: EnforcementInput = {
  side: "offense",
  flagYards: 5,
  before: { ballOn: 40, down: 2, distance: 10 },
  foulSpotBallOn: 36,
  playEndBallOn: 52,
  kind: "running",
  possessionAtEnd: "offense",
  firstDownDistance: 10,
};

describe("the official's penalty ruling", () => {
  it("enforces a false start from the previous spot without a played down", () => {
    expect(enforcePenalty({
      ...input,
      kind: "dead_ball",
      playEndBallOn: null,
      enforcementFrom: "previous_spot",
      downOutcome: "repeat",
    })).toEqual({
      ballOn: 35,
      down: 2,
      distance: 15,
      possessionFlips: false,
      from: "from the snap",
      newSeries: false,
      enforcementSpot: 40,
      actualYards: 5,
    });
  });

  it("honors a chosen foul spot even when automatic enforcement would use the end", () => {
    const ruling = enforcePenalty({
      ...input,
      side: "defense",
      foulSpotBallOn: 45,
      enforcementFrom: "spot_of_foul",
      downOutcome: "repeat",
    });
    expect(ruling).toMatchObject({ enforcementSpot: 45, ballOn: 50, actualYards: 5, down: 2, distance: 1 });
  });

  it("honors end-of-play enforcement even when automatic enforcement would use the foul", () => {
    expect(enforcePenalty({ ...input, enforcementFrom: "end_of_play", downOutcome: "next" }))
      .toMatchObject({ enforcementSpot: 52, ballOn: 47, actualYards: 5, down: 3, distance: 3 });
  });

  it("requires the selected spot instead of guessing from another available spot", () => {
    expect(enforcePenalty({ ...input, foulSpotBallOn: null, enforcementFrom: "spot_of_foul" })).toBeNull();
    expect(enforcePenalty({ ...input, playEndBallOn: null, enforcementFrom: "end_of_play" })).toBeNull();
    expect(enforcePenalty({ ...input, playEndBallOn: null, enforcementFrom: "previous_spot" }))
      .toMatchObject({ enforcementSpot: 40, ballOn: 35 });
  });

  it("limits a foul at own five to half the distance and reports actual yardage", () => {
    expect(enforcePenalty({
      ...input,
      flagYards: 15,
      foulSpotBallOn: 5,
      enforcementFrom: "spot_of_foul",
    })).toMatchObject({ enforcementSpot: 5, ballOn: 3, actualYards: 2 });
  });

  it("uses the receiving team's frame for distance after a return-team foul", () => {
    const ruling = enforcePenalty({
      ...input,
      side: "defense",
      flagYards: 15,
      before: { ballOn: 40, down: 1, distance: 10 },
      foulSpotBallOn: 74,
      playEndBallOn: 48,
      possessionAtEnd: "defense",
    });
    expect(ruling).toMatchObject({ enforcementSpot: 74, ballOn: 87, actualYards: 13, possessionFlips: true, down: 1, distance: 10 });
    expect(enforcePenalty({
      ...input,
      side: "defense",
      flagYards: 15,
      foulSpotBallOn: 90,
      possessionAtEnd: "defense",
      enforcementFrom: "spot_of_foul",
    })).toMatchObject({ ballOn: 95, possessionFlips: true, distance: 10 });
  });

  it("caps a new series at the receiving team's attacking goal", () => {
    expect(enforcePenalty({
      ...input,
      side: "offense",
      flagYards: 5,
      playEndBallOn: 10,
      possessionAtEnd: "defense",
      enforcementFrom: "end_of_play",
    })).toMatchObject({ ballOn: 5, possessionFlips: true, distance: 5 });
  });

  it("lets the scorer repeat a down or grant a first after reaching the line to gain", () => {
    const flag = { ...input, side: "defense" as const, enforcementFrom: "end_of_play" as const };
    expect(enforcePenalty({ ...flag, downOutcome: "repeat" }))
      .toMatchObject({ down: 2, distance: 1, newSeries: false });
    expect(enforcePenalty({ ...flag, downOutcome: "first" }))
      .toMatchObject({ down: 1, distance: 10, newSeries: true });
    expect(enforcePenalty(flag)).toMatchObject({ down: 1, distance: 10, newSeries: true });
  });

  it("keeps the original line to gain for the next down", () => {
    expect(enforcePenalty({ ...input, enforcementFrom: "previous_spot", downOutcome: "next" }))
      .toMatchObject({ ballOn: 35, down: 3, distance: 15, possessionFlips: false });
    expect(enforcePenalty({
      ...input,
      before: { ballOn: 95, down: 2, distance: 10 },
      enforcementFrom: "previous_spot",
      downOutcome: "next",
    })).toMatchObject({ ballOn: 90, down: 3, distance: 10 });
  });

  it("changes possession when the next ruling consumes fourth down", () => {
    expect(enforcePenalty({
      ...input,
      before: { ballOn: 8, down: 4, distance: 5 },
      enforcementFrom: "previous_spot",
      downOutcome: "next",
    })).toMatchObject({ ballOn: 4, down: 1, distance: 4, possessionFlips: true, newSeries: true });
  });

  it("awards a new series when a counted run still reaches the sticks after an offensive tack-on foul", () => {
    expect(enforcePenalty({
      ...input,
      before: { ballOn: 30, down: 1, distance: 10 },
      playEndBallOn: 50,
      flagYards: 10,
      enforcementFrom: "end_of_play",
      playCounts: true,
    })).toMatchObject({ ballOn: 40, down: 1, distance: 10, possessionFlips: false, newSeries: true });
  });

  it("advances the down when a counted run does not reach the sticks after enforcement", () => {
    expect(enforcePenalty({
      ...input,
      before: { ballOn: 30, down: 1, distance: 10 },
      playEndBallOn: 35,
      enforcementFrom: "end_of_play",
      playCounts: true,
    })).toMatchObject({ ballOn: 30, down: 2, distance: 10, possessionFlips: false, newSeries: false });
  });

  it("evaluates the line to gain before consuming a counted fourth down", () => {
    const fourth = {
      ...input,
      before: { ballOn: 30, down: 4, distance: 10 },
      enforcementFrom: "end_of_play" as const,
      playCounts: true,
    };
    expect(enforcePenalty({ ...fourth, playEndBallOn: 50, flagYards: 10 }))
      .toMatchObject({ ballOn: 40, down: 1, distance: 10, possessionFlips: false, newSeries: true });
    expect(enforcePenalty({ ...fourth, playEndBallOn: 35, flagYards: 5 }))
      .toMatchObject({ ballOn: 30, down: 1, distance: 10, possessionFlips: true, newSeries: true });
  });

  it("uses rule down effects unless the scorer explicitly chooses a different outcome", () => {
    const flag = { ...input, enforcementFrom: "previous_spot" as const };
    expect(enforcePenalty({ ...flag, side: "defense", autoFirstDown: true }))
      .toMatchObject({ down: 1, distance: 10, newSeries: true });
    expect(enforcePenalty({ ...flag, lossOfDown: true }))
      .toMatchObject({ down: 3, distance: 15, newSeries: false });
    expect(enforcePenalty({ ...flag, lossOfDown: true, downOutcome: "repeat" }))
      .toMatchObject({ down: 2, distance: 15, newSeries: false });
    expect(enforcePenalty({ ...flag, side: "defense", autoFirstDown: true, downOutcome: "repeat" }))
      .toMatchObject({ down: 2, distance: 5, newSeries: false });
  });

  it("refuses invalid selected spots and penalty yardage", () => {
    for (const foulSpotBallOn of [-1, 101, Number.NaN]) {
      expect(enforcePenalty({ ...input, foulSpotBallOn, enforcementFrom: "spot_of_foul" })).toBeNull();
    }
    for (const flagYards of [-5, Number.NaN]) {
      expect(enforcePenalty({ ...input, flagYards })).toBeNull();
    }
  });
});
