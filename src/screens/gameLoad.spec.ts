/* How a loaded game becomes the screen's state, pinned as it behaved inside
   GameScreen's loadData before it was moved out. */
import { describe, expect, it } from "vitest";
import type { SyncQueueItem } from "@/services/offlineDb";
import { DEFAULT_GAME_CONFIG } from "@/services/programService";
import { ROLE_REFUSAL_MESSAGE } from "@/services/syncWorker";
import {
  liveSessionConfigFor,
  pendingGamePatches,
  placeholderSessionConfig,
  resumeSituation,
  rosterLookups,
  withPendingPatches,
} from "./gameLoad";

const program = { id: "prog", name: "Purchase Line Dragons", abbreviation: "DRG" };
const opponent = { id: "opp", name: "United Lions", abbreviation: null };

describe("session config", () => {
  it("waits for both the program and the opponent", () => {
    expect(liveSessionConfigFor("g", null, { opponent }, DEFAULT_GAME_CONFIG, null)).toBeNull();
    expect(liveSessionConfigFor("g", program, { opponent: null }, DEFAULT_GAME_CONFIG, null)).toBeNull();
    expect(liveSessionConfigFor("g", program, { opponent: { id: null, name: "X" } }, DEFAULT_GAME_CONFIG, null)).toBeNull();
  });
  it("names both teams the way the scorebug does", () => {
    const config = liveSessionConfigFor("g", program, { opponent, is_home: 1 as unknown as boolean }, DEFAULT_GAME_CONFIG, null);
    expect(config).toMatchObject({
      gameId: "g", programTeamId: "prog", programAbbreviation: "DRG",
      opponentTeamId: "opp", opponentName: "United Lions", opponentAbbreviation: "UL", isHome: true,
    });
  });
  it("falls back to placeholders when there is nothing to name", () => {
    expect(placeholderSessionConfig("g", null, null, DEFAULT_GAME_CONFIG, null)).toMatchObject({
      programTeamId: "program", programName: "Team", programAbbreviation: "TEA",
      opponentTeamId: "opponent", opponentName: "Opponent", opponentAbbreviation: "OPP", isHome: false,
    });
  });
});

describe("roster lookups", () => {
  it("maps each rostered player to a name and a number", () => {
    const { names, jerseys } = rosterLookups([
      { player_id: "p1", jersey_number: 22, player: { first_name: "Sam", last_name: "Bell" } },
      { player_id: "p2", jersey_number: null, player: { first_name: "Al", last_name: "Ray" } },
      { player_id: "p3", jersey_number: 7, player: null },
      { jersey_number: 9, player: { first_name: "No", last_name: "Id" } },
    ]);
    expect([...names]).toEqual([["p1", "Sam Bell"], ["p2", "Al Ray"]]);
    expect([...jerseys]).toEqual([["p1", 22], ["p2", null]]);
  });
});

describe("pending game edits", () => {
  const item = (over: Partial<SyncQueueItem>): SyncQueueItem => ({
    id: "q", op: "game", gameId: "g", playId: "", payload: { patch: {} }, status: "pending", attempts: 0, createdAt: 0, ...over,
  });
  it("lays game edits over the server's copy, oldest first, and ignores play edits", () => {
    const queue = [
      item({ id: "b", createdAt: 2, payload: { patch: { status: "final", our_score: 21 } } }),
      item({ id: "play", op: "update", createdAt: 1, payload: { patch: { status: "live" } } }),
      item({ id: "a", createdAt: 1, payload: { patch: { status: "live", our_score: 14 } } }),
    ];
    const patches = pendingGamePatches(queue);
    expect(patches.map((p) => p.id)).toEqual(["a", "b"]);
    expect(withPendingPatches({ status: "scheduled", our_score: 0, their_score: 7 }, patches))
      .toEqual({ status: "final", our_score: 21, their_score: 7 });
  });
  it("skips an edit the server refused on role grounds, so it can't reopen a final", () => {
    const refused = item({ status: "failed", lastError: ROLE_REFUSAL_MESSAGE, payload: { patch: { status: "live" } } });
    const otherFailure = item({ id: "net", status: "failed", lastError: "Network down" });
    expect(pendingGamePatches([refused, otherFailure]).map((p) => p.id)).toEqual(["net"]);
  });
  it("leaves a missing game missing", () => {
    expect(withPendingPatches(null, [item({})])).toBeNull();
  });
});

describe("where the live situation resumes", () => {
  const derived = { quarter: 3, clock: 400, possession: "us" as const, down: 2, distance: 7, ballOn: 45, goalToGo: false };
  const managed = { _dragonstats: { liveStateVersion: 1 } };

  it("uses the replay when the game row carries no live state", () => {
    const resumed = resumeSituation({ current_quarter: 4, current_down: 1, rules_config: {} }, derived);
    expect(resumed).toEqual({ ...derived, persistedKey: null });
  });
  it("uses the game row's live state when it has it", () => {
    const resumed = resumeSituation({
      rules_config: { ...managed, current_goal_to_go: true },
      current_quarter: 4, current_clock: "2:05", current_possession: "them",
      current_down: 3, current_distance: 4, current_yard_line: 92,
    }, derived);
    expect(resumed).toEqual({
      quarter: 4, clock: 125, possession: "them", down: 3, distance: 4, ballOn: 92, goalToGo: true,
      persistedKey: "4|125|them|3|4|92",
    });
  });
  it("falls back field by field when a stored value is missing or malformed", () => {
    const resumed = resumeSituation({
      rules_config: managed,
      current_clock: "soon", current_possession: "both", current_down: "3",
    }, derived);
    expect(resumed).toMatchObject({ quarter: 3, clock: 400, possession: "us", down: 2, distance: 7, ballOn: 45, goalToGo: false });
    expect(resumed.persistedKey).toBe("3|400|us|2|7|45");
  });
});
