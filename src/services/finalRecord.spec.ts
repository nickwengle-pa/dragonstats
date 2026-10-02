import { describe, it, expect } from "vitest";
import {
  buildFinalRecord, buildFinalRecordFromRows, changesNumbers, checkFinal, diffFinalRecords, isEmptyDiff,
  needsConfirmation, playFingerprint, snapshotOf,
} from "./finalRecord";
import { markHandSetStarts, rebuildPlaySituations } from "./gameFlow";
import { playRecordFromRow } from "./playRecordFromRow";
import type { PlayWithPlayers } from "./gameService";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord, TaggedPlayer } from "@/components/game/types";
import type { LiveSessionConfig } from "./liveGameSession";

const CONFIG: LiveSessionConfig = {
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
  pregame: { tossWinner: "us", tossChoice: "receive", openingKickoffReceiver: "us", ourDriveDirectionQ1: "right" },
};
const NAMES = { us: "US", them: "TH" };

const rusher = (id: string, name: string, jersey: number): TaggedPlayer =>
  ({ id, player_id: id, name, jersey_number: jersey, role: "rusher" }) as TaggedPlayer;

let seq = 0;
function play(over: Partial<PlayRecord>): PlayRecord {
  seq += 1;
  return {
    id: `p${seq}`, sequence: seq, quarter: 1, clock: 600, type: "rush", yards: 0, result: "",
    penalty: null, flagYards: 0, isTouchdown: false, firstDown: false, turnover: false, tagged: [],
    ballOn: 25, down: 1, distance: 10, description: "", possession: "us",
    ...over,
  } as PlayRecord;
}

function drive(): PlayRecord[] {
  seq = 0;
  return [
    play({ type: "kickoff", possession: "them", yards: 35, ballOn: 40, description: "Kickoff" }),
    play({ yards: 6, tagged: [rusher("smith", "Al Smith", 22)], description: "Smith rush +6" }),
    play({ yards: 5, firstDown: true, tagged: [rusher("smith", "Al Smith", 22)], description: "Smith rush +5" }),
    play({ yards: 64, isTouchdown: true, tagged: [rusher("jones", "Bo Jones", 5)], description: "Jones rush +64 TD" }),
  ];
}

describe("the official copy of a finished game", () => {
  it("records the score the game screen scores", () => {
    const record = buildFinalRecord(drive(), CONFIG);
    expect(record.score).toEqual({ us: 6, them: 0 });
  });

  it("sees no change when nothing changed", () => {
    const before = buildFinalRecord(drive(), CONFIG);
    const after = buildFinalRecord(drive(), CONFIG);
    expect(isEmptyDiff(diffFinalRecords(before, after, NAMES))).toBe(true);
  });

  it("names the player line and the team line an edited gain moves", () => {
    const plays = drive();
    const before = buildFinalRecord(plays, CONFIG);
    const edited = plays.map((p) => (p.id === "p2" ? { ...p, yards: 9 } : p));
    const diff = diffFinalRecords(before, buildFinalRecord(edited, CONFIG), NAMES);

    expect(diff.edited.map((m) => m.n)).toEqual([2]);
    const labels = Object.fromEntries(diff.stats.map((s) => [s.label, [s.before, s.after]]));
    expect(labels["US #22 Al Smith - Rushing yards"]).toEqual([11, 14]);
    expect(labels["US Rushing yards"]).toEqual([75, 78]);
    expect(changesNumbers(diff)).toBe(true);
  });

  it("lists a play added after the game went final", () => {
    const plays = drive();
    const before = buildFinalRecord(plays, CONFIG);
    seq = 4;
    const added = [...plays.slice(0, 3), play({ yards: -5, tagged: [rusher("smith", "Al Smith", 22)], description: "Smith rush -5" }), plays[3]];
    const diff = diffFinalRecords(before, buildFinalRecord(added, CONFIG), NAMES);
    expect(diff.added.map((m) => m.d)).toEqual(["Smith rush -5"]);
    expect(diff.stats.find((s) => s.label === "US #22 Al Smith - Carries")).toMatchObject({ before: 2, after: 3 });
  });

  it("reports the new score when a touchdown is taken away", () => {
    const plays = drive();
    const before = buildFinalRecord(plays, CONFIG);
    const after = buildFinalRecord(plays.map((p) => (p.id === "p4" ? { ...p, isTouchdown: false, yards: 30 } : p)), CONFIG);
    const diff = diffFinalRecords(before, after, NAMES);
    expect(diff.score).toEqual({ before: { us: 6, them: 0 }, after: { us: 0, them: 0 } });
  });

  it("treats a clock correction as no change to the numbers", () => {
    const plays = drive();
    const before = buildFinalRecord(plays, CONFIG);
    const after = buildFinalRecord(plays.map((p) => (p.id === "p3" ? { ...p, clock: 512 } : p)), CONFIG);
    expect(isEmptyDiff(diffFinalRecords(before, after, NAMES))).toBe(true);
    expect(playFingerprint(plays[2])).toBe(playFingerprint({ ...plays[2], clock: 512 }));
  });
});

describe("when a change to a finished game has to be confirmed", () => {
  const plays = () => drive();
  const official = (p: PlayRecord[]) => snapshotOf(buildFinalRecord(p, CONFIG), "finalized");
  const saved = { us: 6, them: 0 };

  it("before the stats are marked final, a stat-only change saves without asking", () => {
    const p = plays();
    const diff = diffFinalRecords(official(p), buildFinalRecord(p.map((x) => (x.id === "p2" ? { ...x, yards: 9 } : x)), CONFIG), NAMES);
    expect(needsConfirmation(diff, false)).toBe(false);
    expect(needsConfirmation(diff, true)).toBe(true);
  });

  it("a change to the final score always asks", () => {
    const p = plays();
    const diff = diffFinalRecords(official(p), buildFinalRecord(p.map((x) => (x.id === "p4" ? { ...x, isTouchdown: false } : x)), CONFIG), NAMES);
    expect(needsConfirmation(diff, false)).toBe(true);
  });

  it("takes a first copy only of a game whose plays still add up", () => {
    const current = buildFinalRecord(plays(), CONFIG);
    expect(checkFinal({ statsLocked: false, official: null, current, saved, names: NAMES })).toBe("record");
    const drifted = checkFinal({ statsLocked: false, official: null, current, saved: { us: 13, them: 0 }, names: NAMES });
    expect(drifted).toMatchObject({ title: "The plays don't add up to the final score" });
  });

  it("warns about a stat change only once the stats are marked final", () => {
    const p = plays();
    const current = buildFinalRecord(p.map((x) => (x.id === "p2" ? { ...x, yards: 9 } : x)), CONFIG);
    expect(checkFinal({ statsLocked: false, official: official(p), current, saved, names: NAMES })).toBeNull();
    const locked = checkFinal({ statsLocked: true, official: official(p), current, saved, names: NAMES });
    expect(locked).toMatchObject({ title: "Changed since the stats were marked final" });
    expect(locked && locked !== "record" && locked.detail).toContain("1 play edited");
  });
});

describe("both screens agree about the same stored plays", () => {
  it("the film chart's record of the rows matches the game screen's", () => {
    const rows = drive().map((p) => ({
      id: p.id, game_id: "g", sequence: p.sequence, quarter: p.quarter, clock: "10:00",
      down: p.down, distance: p.distance, yard_line: p.ballOn, possession: p.possession,
      play_type: p.type, yards_gained: p.yards, is_touchdown: p.isTouchdown, is_turnover: p.turnover,
      is_penalty: false, description: p.description,
      play_data: { result: p.result || null, is_first_down: p.firstDown, fumble_recovered_at: 0, fumble_return_yards: 0 },
      play_players: p.tagged.map((t) => ({ player_id: t.player_id, role: t.role, credit: null, player: { first_name: t.name.split(" ")[0], last_name: t.name.split(" ")[1] } })),
    })) as unknown as PlayWithPlayers[];

    // The game screen: rows -> records -> hand-set starts -> re-chain, then held.
    const records = rows.map((r) => playRecordFromRow(r));
    const held = rebuildPlaySituations(markHandSetStarts(records, CONFIG.pregame, CONFIG.gameConfig), CONFIG.pregame, CONFIG.gameConfig).plays;

    const fromScreen = buildFinalRecord(held, CONFIG);
    const fromRows = buildFinalRecordFromRows(rows, CONFIG);
    expect(fromRows.score).toEqual(fromScreen.score);
    expect(fromRows.stats).toEqual(fromScreen.stats);
    expect(fromRows.plays).toEqual(fromScreen.plays);
  });
});
