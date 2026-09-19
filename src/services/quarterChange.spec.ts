import { describe, expect, it } from "vitest";
import { createQuarterChange, quarterChangeBefore } from "./quarterChange";
import { advanceSituationAfterPlay, moveToQuarter, rebuildPlaySituations } from "./gameFlow";
import { DEFAULT_GAME_CONFIG as config } from "./programService";
import { replayLiveGame, type LiveSessionConfig } from "./liveGameSession";
import { transformPlays } from "./playTransformer";
import type { GameState } from "../components/game/types";
import type { PlayWithPlayers } from "./gameService";

const before: GameState = { quarter: 1, clock: 0, possession: "us", down: 3, distance: 4, ballOn: 46, ourScore: 0, theirScore: 0 };
const session: LiveSessionConfig = { gameId: "game", programTeamId: "us", programName: "Us", programAbbreviation: "US", opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH", isHome: true, gameConfig: config, pregame: null };
const transitionEntry = (state: GameState, nextQuarter: number) => {
  const transition = moveToQuarter(state.quarter, nextQuarter, state, null, config);
  return createQuarterChange(state, { ...state, ...transition.situation, quarter: transition.quarter, clock: transition.clock }, 1);
};

describe("recorded quarter changes", () => {
  it("records the new quarter without consuming a down or yard", () => {
    const entry = transitionEntry(before, 2);
    expect(entry.description).toBe("Start 2nd quarter");
    expect(entry).toMatchObject({ quarter: 2, clock: config.quarter_length_secs, down: 3, distance: 4, ballOn: 46, yards: 0, tagged: [] });
    expect(advanceSituationAfterPlay(entry, before, config)).toMatchObject({ down: 3, distance: 4, ballOn: 46, possession: "us" });
    const rebuilt = rebuildPlaySituations([entry], null, config);
    expect(rebuilt.currentQuarter).toBe(2);
    expect(rebuilt.currentSituation).toMatchObject({ down: 3, distance: 4, ballOn: 46 });
  });

  it("retains halftime and overtime setup after reloading", () => {
    for (const [from, to] of [[2, 3], [4, 5]]) {
      const entry = transitionEntry({ ...before, quarter: from }, to);
      const reloaded = JSON.parse(JSON.stringify(entry));
      const result = rebuildPlaySituations([reloaded], null, config);
      expect(result.currentSituation).toMatchObject({ possession: entry.possession, down: entry.down, distance: entry.distance, ballOn: entry.ballOn });
      expect(replayLiveGame(result.plays, session).currentState).toMatchObject({ quarter: to, clock: config.quarter_length_secs });
    }
  });

  it("persists the exact previous clock and situation for Undo, including corrections backward", () => {
    const original = { ...before, quarter: 3, clock: 337 };
    const entry = createQuarterChange(original, { ...before, quarter: 2, clock: 0 }, 1);
    expect(entry.description).toBe("Quarter corrected to 2nd quarter");
    expect(quarterChangeBefore(JSON.parse(JSON.stringify(entry)))).toEqual(original);
    expect(rebuildPlaySituations([entry], null, config).currentQuarter).toBe(2);
  });

  it("adds no engine events, statistical plays, scores or drives", () => {
    const entry = transitionEntry(before, 2);
    const empty = replayLiveGame([], session);
    const replay = replayLiveGame([entry], session);
    expect(replay.allEvents).toEqual([]);
    expect(replay.score).toEqual(empty.score);
    expect(replay.summary).toEqual(empty.summary);
    const row = { play_type: entry.type, quarter: 2, play_data: entry.playData, possession: "us" } as unknown as PlayWithPlayers;
    expect(transformPlays([row], { gameId: "game", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" })).toEqual([]);
  });
});
