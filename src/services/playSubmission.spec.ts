/* What a saved play becomes: the decisions that settle who is credited and
   where the ball goes next. Pinned as they behaved inside GameScreen's submit
   handler before they were moved out. */
import { describe, expect, it } from "vitest";
import type { PlaySubmitData } from "@/components/game/PlayEntryModal";
import { findPlayTypeDef, type PlayRecord, type TaggedPlayer } from "@/components/game/types";
import {
  buildPlayInsert,
  buildPlayerCredits,
  buildSubmittedPlay,
  needsSituationReview,
  nextSituationSourceFor,
  playsWithSubmitted,
  submittedTurnover,
  type LiveScoreboard,
  type SubmissionContext,
} from "./playSubmission";
import { DEFAULT_GAME_CONFIG } from "./programService";

const type = (id: string) => {
  const def = findPlayTypeDef(id);
  if (!def) throw new Error(`no play type ${id}`);
  return def;
};

const submit = (over: Partial<PlaySubmitData> = {}): PlaySubmitData => ({
  playType: type("rush"),
  tagged: [],
  yards: 4,
  isTouchdown: false,
  isFirstDown: false,
  isTouchback: false,
  clock: 600,
  result: "",
  penalty: null,
  penaltyCategory: null,
  penaltyEnforcement: "accepted",
  flagYards: 0,
  blockedKickType: null,
  offensiveFormation: null,
  defensiveFormation: null,
  hashMark: null,
  description: "#22 run for 4",
  ...over,
});

const tag = (over: Partial<TaggedPlayer>): TaggedPlayer =>
  ({ id: over.player_id ?? "x", player_id: "x", jersey_number: null, name: "", role: "rusher", ...over });

const live: LiveScoreboard = { quarter: 2, clock: 590, possession: "us", down: 2, distance: 6, ballOn: 40 };

const ctx = (over: Partial<SubmissionContext> = {}): SubmissionContext => ({
  seasonId: "season-1",
  plays: [],
  live,
  insertAt: null,
  pregame: null,
  config: DEFAULT_GAME_CONFIG,
  ...over,
});

const recorded = (id: string, over: Partial<PlayRecord> = {}): PlayRecord => ({
  id, quarter: 1, clock: 700, type: "rush", yards: 3, result: "", penalty: null, flagYards: 0,
  isTouchdown: false, firstDown: false, turnover: false, tagged: [], ballOn: 30, down: 1, distance: 10,
  description: "", possession: "us", playData: {}, ...over,
} as PlayRecord);

describe("turnovers", () => {
  it("counts an interception as a turnover without being told", () => {
    expect(submittedTurnover(submit({ playType: type("int") }))).toBe(true);
  });
  it("follows the modal's flag on a fumble: kept is no turnover, lost is", () => {
    expect(submittedTurnover(submit({ playType: type("fumble"), turnover: false }))).toBe(false);
    expect(submittedTurnover(submit({ playType: type("fumble"), turnover: true }))).toBe(true);
  });
  it("treats a fumble with no flag as lost", () => {
    expect(submittedTurnover(submit({ playType: type("fumble") }))).toBe(true);
  });
  it("lets the flag mark a turnover on a play type that is not one, like a sack-fumble", () => {
    expect(submittedTurnover(submit({ playType: type("sack"), turnover: true }))).toBe(true);
    expect(submittedTurnover(submit({ playType: type("rush") }))).toBe(false);
  });
});

describe("credits", () => {
  const mixed = [
    tag({ player_id: "p22", role: "rusher" }),
    tag({ player_id: "opp_7", role: "tackler", isOpponent: true }),
    tag({ player_id: "pending_44", role: "tackler", isPending: true }),
    tag({ player_id: "team", role: "assist", isTeam: true }),
    tag({ player_id: "p55", role: "tackler", credit: 0.5 }),
  ];
  it("writes only our rostered players to play_players", () => {
    expect(buildPlayerCredits(mixed)).toEqual([
      { player_id: "p22", role: "rusher", credit: null },
      { player_id: "p55", role: "tackler", credit: 0.5 },
    ]);
  });
  it("makes the first rostered player the play's primary player, skipping anyone else", () => {
    const onlyOthersFirst = [mixed[1], mixed[2], mixed[0]];
    const row = buildPlayInsert(submit({ tagged: onlyOthersFirst }), "g1", live, {}, 44);
    expect(row.primary_player_id).toBe("p22");
  });
  it("has no primary player when nobody rostered was tagged", () => {
    const row = buildPlayInsert(submit({ tagged: [mixed[1], mixed[3]] }), "g1", live, {}, 44);
    expect(row.primary_player_id).toBeNull();
  });
});

describe("whether the spot needs review", () => {
  it("asks after a flag, a blocked kick or a turnover with no spot stated", () => {
    expect(needsSituationReview(submit({ penalty: "Holding" }), false)).toBe(true);
    expect(needsSituationReview(submit({ playType: type("blocked_kick") }), false)).toBe(true);
    expect(needsSituationReview(submit({ playType: type("int") }), true)).toBe(true);
  });
  it("does not ask after a touchdown, even one scored on a turnover", () => {
    expect(needsSituationReview(submit({ playType: type("int"), isTouchdown: true }), true)).toBe(false);
    expect(needsSituationReview(submit({ penalty: "Holding", isTouchdown: true }), false)).toBe(false);
  });
  it("does not ask when the operator already stated the spot", () => {
    const stated = submit({
      penalty: "Holding",
      nextSituation: { ballOn: 30, down: 1, distance: 10, possession: "us", source: "manual_override" },
    });
    expect(needsSituationReview(stated, false)).toBe(false);
  });
  it("does not ask after an ordinary play", () => {
    expect(needsSituationReview(submit(), false)).toBe(false);
  });
  it("stores the matching source on the play", () => {
    expect(nextSituationSourceFor(submit({ penalty: "Holding" }), false)).toBe("pending_review");
    expect(nextSituationSourceFor(submit({ playType: type("int"), isTouchdown: true }), true)).toBe("auto");
    expect(nextSituationSourceFor(submit(), false)).toBe("auto");
    expect(nextSituationSourceFor(submit({
      nextSituation: { ballOn: 30, down: 1, distance: 10, possession: "them", source: "penalty_enforced" },
    }), false)).toBe("penalty_enforced");
  });
});

describe("the play record", () => {
  it("is stamped with the modal's clock and the live situation", () => {
    const play = buildSubmittedPlay(submit({ clock: 575 }), ctx());
    expect(play).toMatchObject({ quarter: 2, clock: 575, possession: "us", down: 2, distance: 6, ballOn: 40, sequence: 1 });
    expect(play.playData).toMatchObject({
      season_id: "season-1",
      recorded_start_clock: "9:35",
      recorded_start_clock_seconds: 575,
      next_situation_source: "auto",
    });
  });
  it("keeps possession for the kickers on an onside kick they recover", () => {
    const kept = buildSubmittedPlay(submit({ playType: type("onside_kick"), onsideRecoveredByKicker: true }), ctx());
    expect(kept.nextPossession).toBe("us");
    const lost = buildSubmittedPlay(submit({ playType: type("onside_kick"), onsideRecoveredByKicker: false }), ctx());
    expect(lost.nextPossession).toBeUndefined();
  });
  it("carries a stated next spot, in the new team's frame", () => {
    const play = buildSubmittedPlay(submit({
      playType: type("int"),
      nextSituation: { ballOn: 25, down: 1, distance: 10, possession: "them", source: "manual_override" },
    }), ctx());
    expect(play).toMatchObject({ nextPossession: "them", nextDown: 1, nextDistance: 10, nextBallOn: 25, turnover: true });
  });
  it("lets the modal's play data add to, but not lose, what the screen stamps", () => {
    const play = buildSubmittedPlay(submit({ playData: { bad_snap: true } }), ctx());
    expect(play.playData).toMatchObject({ bad_snap: true, season_id: "season-1" });
  });
});

describe("recording into the middle of the game", () => {
  const plays = [recorded("a"), recorded("b"), recorded("c")];
  const insertAt = { index: 0, quarter: 1, possession: "us" as const, down: 2, distance: 7, ballOn: 33 };

  it("builds the play at the insert point, not the live scoreboard", () => {
    const play = buildSubmittedPlay(submit(), ctx({ plays, insertAt }));
    expect(play).toMatchObject({ quarter: 1, down: 2, distance: 7, ballOn: 33, sequence: 2 });
  });
  it("places it after the play it was inserted behind", () => {
    const play = recorded("new");
    expect(playsWithSubmitted(plays, play, insertAt).map(p => p.id)).toEqual(["a", "new", "b", "c"]);
    expect(playsWithSubmitted(plays, play, null).map(p => p.id)).toEqual(["a", "b", "c", "new"]);
  });
  it("still writes the live situation to the row, for the re-chain to correct", () => {
    const row = buildPlayInsert(submit(), "g1", live, {}, 44);
    expect(row).toMatchObject({ quarter: 2, down: 2, distance: 6, yard_line: 40, possession: "us" });
  });
});

describe("the database row", () => {
  it("records the snap clock from the modal and the running clock as the start time", () => {
    const row = buildPlayInsert(submit({ clock: 575 }), "g1", live, { a: 1 }, 44);
    expect(row).toMatchObject({
      game_id: "g1", clock: "9:35", play_start_time: 590, play_end_time: null,
      play_type: "rush", yards_gained: 4, end_yard_line: 44, play_data: { a: 1 },
      is_touchdown: false, is_turnover: false, is_penalty: false,
    });
  });
  it("only sends formation and hash columns that were filled in", () => {
    const bare = buildPlayInsert(submit(), "g1", live, {}, 44);
    expect(bare).not.toHaveProperty("offensive_formation");
    expect(bare).not.toHaveProperty("hash_mark");
    const charted = buildPlayInsert(submit({ offensiveFormation: "Trips", hashMark: "left" }), "g1", live, {}, 44);
    expect(charted).toMatchObject({ offensive_formation: "Trips", hash_mark: "left" });
  });
  it("marks a flag and a turnover", () => {
    expect(buildPlayInsert(submit({ penalty: "Holding" }), "g1", live, {}, 44).is_penalty).toBe(true);
    expect(buildPlayInsert(submit({ playType: type("int") }), "g1", live, {}, 44).is_turnover).toBe(true);
  });
});
