/**
 * A whole simulated season, recorded, loaded, edited, saved and reloaded.
 *
 * Every play's down, distance and spot is derived by replaying the list, and
 * the ways that could go wrong are all about the seams between those steps:
 * a spot that moves when nothing changed, an edit that stops a play or two
 * downstream, a scoreboard correction the replay walks over, a reload that
 * reads its own writes back as something else. None of them show up on one
 * play in isolation, so this plays out games the way the press box does -
 * kickoffs, punts, field goals, touchdowns and tries, turnovers with returns,
 * flags confirmed through the adjust sheet, safeties, timeouts, quarter
 * changes, and the occasional hand-moved ball - and checks the seams.
 *
 * Deterministic: each game is a fixed seed.
 */
import { describe, it, expect } from "vitest";
import {
  advanceSituationAfterPlay,
  createInitialSituation,
  getAuthoritativeNextSituation,
  markHandSetStarts,
  moveToQuarter,
  rebuildPlaySituations,
  withHandSetStart,
  type LiveSituation,
} from "./gameFlow";
import { enforcePenalty } from "./penaltyEnforcement";
import { createQuarterChange } from "./quarterChange";
import { rechainStoredPlays } from "./rechainStored";
import { DEFAULT_GAME_CONFIG as config } from "./programService";
import { grantsAutoFirstDown, type PlayRecord } from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const blank = (over: Partial<PlayRecord>): PlayRecord => ({
  id: "", quarter: 1, clock: 600, type: "rush", yards: 0, result: "", penalty: null, flagYards: 0,
  isTouchdown: false, firstDown: false, turnover: false, tagged: [], ballOn: 25, down: 1, distance: 10,
  description: "", possession: "us", playData: {}, ...over,
});

interface Game { plays: PlayRecord[]; /** Indices recorded after the ball was moved by hand. */ adjusted: Set<number> }

/**
 * One game, recorded the way GameScreen records it: each play starts from the
 * live situation, and the live situation then becomes the play's after. With
 * `flagLive` the recorder flags hand-set starts as they happen (this build);
 * without it the game looks like one recorded before that existed.
 */
function simulateGame(seed: number, flagLive: boolean): Game {
  const r = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const plays: PlayRecord[] = [];
  const adjusted = new Set<number>();
  let live: LiveSituation = createInitialSituation(null, config);
  let quarter = 1;
  let inQuarter = 0;
  let phase = "kickoff" as "kickoff" | "try" | "scrimmage";

  const record = (over: Partial<PlayRecord>, confirm = false) => {
    let play = blank({
      ...over,
      id: `g${seed}-${plays.length + 1}`,
      sequence: plays.length + 1,
      quarter,
      possession: live.possession, down: live.down, distance: live.distance, ballOn: live.ballOn,
    });
    if (flagLive) play = withHandSetStart(play, plays[plays.length - 1], null, config);
    const after = getAuthoritativeNextSituation(play) ?? advanceSituationAfterPlay(play, live, config);
    // Flags and turnovers open the adjust sheet; confirming it stores the spot
    // as stated, which is how nearly every one of them reaches the database.
    const source = play.playData?.next_situation_source ?? (confirm && !play.isTouchdown ? "manual_override" : "auto");
    play = {
      ...play,
      nextPossession: after.possession, nextDown: after.down, nextDistance: after.distance, nextBallOn: after.ballOn,
      playData: { ...play.playData, next_situation_source: source },
    };
    plays.push(play);
    live = after;
    inQuarter += 1;
    if (play.isTouchdown) phase = "try";
    else if (["pat", "two_pt", "safety"].includes(play.type) || (play.type === "fg" && play.result === "Good")) phase = "kickoff";
    else if (play.type !== "timeout") phase = "scrimmage";
  };

  const kickoff = () => {
    const from = live.ballOn;
    const x = r();
    if (x < 0.04) {
      const kept = r() < 0.4;
      record({ type: "onside_kick", yards: 12, playData: { kick_outcome: "returned", kicked_to_yard: 100 - from - 12, return_to_ball_on: from + 12, onside_recovered_by_kicker: kept } });
    } else if (x < 0.3) {
      record({ type: "kickoff", yards: 100 - from, isTouchback: true, playData: { kick_outcome: "touchback", kicked_to_yard: 0, return_to_ball_on: 100 - config.touchback_yard_line, is_touchback: true } });
    } else {
      const kickedTo = int(1, 15);
      const score = r() < 0.03;
      const ret = score ? 100 - kickedTo : int(8, 35);
      record({ type: "kickoff", yards: (100 - kickedTo - from) - ret, isTouchdown: score,
        playData: { kick_outcome: "returned", kicked_to_yard: kickedTo, return_to_ball_on: score ? 0 : 100 - (kickedTo + ret) } });
    }
  };

  const punt = () => {
    const dist = int(30, 48);
    const kickedTo = 100 - live.ballOn - dist;
    if (kickedTo <= 0) {
      record({ type: "punt", yards: 100 - live.ballOn, isTouchback: true, playData: { kick_outcome: "touchback", kicked_to_yard: 0, return_to_ball_on: 100 - config.touchback_yard_line, is_touchback: true } });
    } else if (r() < 0.3) {
      record({ type: "fair_catch", yards: dist, playData: { kick_outcome: "fair_catch", kicked_to_yard: kickedTo, return_to_ball_on: 100 - kickedTo } });
    } else {
      const ret = Math.min(int(0, 15), 98 - kickedTo);
      record({ type: "punt", yards: dist - ret, playData: { kick_outcome: "returned", kicked_to_yard: kickedTo, return_to_ball_on: 100 - (kickedTo + ret) } });
    }
  };

  const scrimmage = () => {
    const { ballOn, down, distance, possession } = live;
    if (down === 4 && ballOn >= 62) return record({ type: "fg", result: r() < 0.75 ? "Good" : "No Good" });
    if (down === 4 && !(distance <= 2 && ballOn >= 45 && r() < 0.5)) return punt();

    const x = r();
    if (x < 0.04) {
      return record({ type: "penalty_only", penalty: "False Start", penaltyCategory: "offense", penaltyEnforcement: "accepted", flagYards: 5 }, true);
    }
    const carry = (gain: number, over: Partial<PlayRecord> = {}, confirm = false) => {
      if (ballOn + gain >= 100) return record({ ...over, yards: 100 - ballOn, isTouchdown: true, firstDown: 100 - ballOn >= distance }, confirm);
      if (ballOn + gain <= 0) return record({ type: "safety", yards: -ballOn });
      return record({ ...over, yards: gain, firstDown: gain >= distance }, confirm);
    };
    if (x < 0.08) {
      // A flag on the run, enforced from where the run ended - then confirmed.
      const gain = int(0, 8);
      const end = ballOn + gain;
      if (end >= 99) return carry(gain, { type: "rush" });
      const e = enforcePenalty({
        side: "defense", flagYards: 15, before: { ballOn, down, distance }, foulSpotBallOn: end, playEndBallOn: end,
        kind: "running", possessionAtEnd: "offense", firstDownDistance: config.first_down_distance,
        autoFirstDown: grantsAutoFirstDown("Personal Foul", "defense"), lossOfDown: false,
      })!;
      return record({
        type: "rush", yards: gain, firstDown: gain >= distance, penalty: "Personal Foul", penaltyCategory: "defense",
        penaltyEnforcement: "accepted", flagYards: 15,
        nextPossession: possession, nextDown: e.down, nextDistance: e.distance, nextBallOn: e.ballOn,
        playData: { foul_spot_ball_on: end, next_situation_source: "manual_override" },
      });
    }
    if (x < 0.58) {
      const y = r();
      return carry(y < 0.1 ? int(-4, -1) : y < 0.92 ? int(0, 8) : int(9, 45), { type: "rush" });
    }
    if (x < 0.66) return record({ type: "pass_inc" });
    if (x < 0.87) return carry(r() < 0.94 ? int(2, 25) : int(26, 60), { type: "pass_comp" });
    if (x < 0.91) return carry(int(-9, -3), { type: "sack" });
    if (x < 0.95) {
      const caught = Math.min(99, ballOn + int(8, 30));
      const ret = int(0, 20);
      const returnTo = caught - ret;
      const score = returnTo <= 0;
      return record({
        type: "int", turnover: true, isTouchdown: score, yards: (score ? 0 : returnTo) - ballOn,
        playData: {
          interception_spot: { ball_on: caught },
          interception_return_to: { ball_on: score ? 0 : returnTo },
          interception_return_yards: score ? caught : ret,
        },
      }, true);
    }
    // A run that is stripped and lost, sometimes returned.
    const gain = int(0, 6);
    if (ballOn + gain >= 99) return carry(gain, { type: "rush" });
    return record({ type: "rush", yards: gain, turnover: true, fumbleRecoveredAt: ballOn + gain, fumbleReturnYards: int(0, 10) }, true);
  };

  while (quarter <= 4) {
    if (inQuarter >= 32 && phase !== "try") {
      if (quarter === 4) break;
      const before = { ...live, quarter, clock: 0, ourScore: 0, theirScore: 0 };
      const transition = moveToQuarter(quarter, quarter + 1, live, null, config);
      let entry = createQuarterChange(before, { ...transition.situation, quarter: transition.quarter, clock: transition.clock, ourScore: 0, theirScore: 0 }, plays.length + 1);
      entry = { ...entry, id: `g${seed}-q${quarter + 1}` };
      if (flagLive) entry = withHandSetStart(entry, plays[plays.length - 1], null, config);
      plays.push(entry);
      live = transition.situation;
      quarter += 1;
      inQuarter = 0;
      if (quarter === 3) phase = "kickoff";
      continue;
    }
    if (phase === "kickoff") { kickoff(); continue; }
    if (phase === "try") {
      if (r() < 0.85) record({ type: "pat", result: r() < 0.93 ? "Good" : "No Good" });
      else record({ type: "two_pt", result: r() < 0.5 ? "Good" : "No Good" });
      continue;
    }
    if (r() < 0.03) { record({ type: "timeout", playData: { next_situation_source: "timeout" } }); continue; }
    // The operator nudging the ball on the scoreboard before the snap.
    if (r() < 0.03) {
      live = { ...live, ballOn: Math.max(1, Math.min(99, live.ballOn + [-3, -2, -1, 1, 2, 3][int(0, 5)])) };
      adjusted.add(plays.length);
    }
    scrimmage();
  }
  return { plays, adjusted };
}

const load = (stored: PlayRecord[]) =>
  rebuildPlaySituations(markHandSetStarts(stored, null, config), null, config).plays;
const rebuild = (plays: PlayRecord[]) => rebuildPlaySituations(plays, null, config).plays;
const spots = (p: PlayRecord) =>
  [p.possession, p.down, p.distance, p.ballOn, p.nextPossession, p.nextDown, p.nextDistance, p.nextBallOn];
const flagged = (plays: PlayRecord[]) =>
  plays.flatMap((p, i) => (p.playData?.start_override === true ? [i] : []));

/** What handleSaveEdit does to a plain snap whose gain was corrected. */
function editGain(plays: PlayRecord[], k: number, yards: number): PlayRecord[] {
  const out = [...plays];
  out[k] = {
    ...plays[k], yards, firstDown: yards >= plays[k].distance,
    nextPossession: undefined, nextDown: undefined, nextDistance: undefined, nextBallOn: undefined,
    playData: { ...plays[k].playData, next_situation_source: "auto" },
  };
  return out;
}

/** Plain snaps whose gain can move without scoring or changing hands. */
function editable(plays: PlayRecord[]) {
  return plays.flatMap((p, i) => (
    ["rush", "pass_comp", "sack"].includes(p.type) && !p.isTouchdown && !p.turnover && !p.penalty
      && p.down < 4 && i + 1 < plays.length && plays[i + 1].type !== "quarter_change"
      && p.ballOn + p.yards > 8 && p.ballOn + p.yards < 92
      ? [i] : []
  ));
}

function toRow(p: PlayRecord): PlayWithPlayers {
  return {
    id: p.id, sequence: p.sequence, quarter: p.quarter, clock: "12:00", possession: p.possession, down: p.down,
    distance: p.distance, yard_line: p.ballOn, play_type: p.type, yards_gained: p.yards, is_touchdown: p.isTouchdown,
    is_turnover: p.turnover, is_penalty: !!p.penalty, description: p.description, play_players: [],
    play_data: {
      ...p.playData, result: p.result || null, penalty_type: p.penalty, play_category: p.penaltyCategory ?? null,
      penalty_enforcement: p.penalty ? p.penaltyEnforcement ?? "accepted" : null, penalty_yards: p.flagYards,
      is_first_down: p.firstDown, is_touchback: p.isTouchback ?? false, blocked_kick_type: p.blockedKickType ?? null,
      fumble_return_yards: p.fumbleReturnYards ?? null, fumble_recovered_at: p.fumbleRecoveredAt ?? null,
      next_possession: p.nextPossession ?? null, next_down: p.nextDown ?? null,
      next_distance: p.nextDistance ?? null, next_yard_line: p.nextBallOn ?? null,
    },
  } as unknown as PlayWithPlayers;
}

const SEEDS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const season = SEEDS.map(seed => ({ seed, ...simulateGame(seed, seed % 2 === 0) }));

describe("a simulated season, end to end", () => {
  it("is a real season's worth of play", () => {
    const all = season.flatMap(g => g.plays);
    expect(all.length).toBeGreaterThan(1000);
    for (const type of ["kickoff", "punt", "fair_catch", "fg", "pat", "int", "penalty_only", "timeout", "quarter_change", "sack"]) {
      expect(all.some(p => p.type === type), type).toBe(true);
    }
    expect(all.some(p => p.isTouchdown)).toBe(true);
    expect(all.some(p => p.turnover && p.fumbleRecoveredAt != null)).toBe(true);
    expect(season.reduce((n, g) => n + g.adjusted.size, 0)).toBeGreaterThan(10);
  });

  it("loads every game exactly as it was recorded, scoreboard corrections included", () => {
    for (const g of season) {
      const loaded = load(g.plays);
      loaded.forEach((p, i) => expect(spots(p), `game ${g.seed} play ${i + 1} (${p.type})`).toEqual(spots(g.plays[i])));
    }
  });

  it("finds exactly the hand-moved balls in a game recorded before they were flagged", () => {
    for (const g of season) {
      expect(flagged(markHandSetStarts(g.plays, null, config)), `game ${g.seed}`).toEqual([...g.adjusted].sort((a, b) => a - b));
    }
  });

  it("re-chains every later play after an edit, and every play's spots agree with its gain", () => {
    for (const g of season) {
      const loaded = load(g.plays);
      const r = rng(g.seed * 7);
      const candidates = editable(loaded);
      for (let n = 0; n < 12; n++) {
        const k = candidates[Math.floor(r() * candidates.length)];
        const delta = r() < 0.5 ? -3 : 4;
        const after = rebuild(editGain(loaded, k, loaded[k].yards + delta));
        const where = `game ${g.seed} edit play ${k + 1}`;

        // The very next snap moves by exactly the correction, unless the
        // operator put the ball there by hand.
        if (after[k + 1].playData?.start_override !== true) {
          expect(after[k + 1].ballOn, where).toBe(loaded[k + 1].ballOn + delta);
        }
        after.forEach((p, i) => {
          if (i === 0 || p.type === "quarter_change" || p.playData?.start_override === true) return;
          const prev = after[i - 1];
          if (prev.quarter !== p.quarter) return;
          // No seams: each play starts where the one before it left the ball.
          expect([p.possession, p.down, p.distance, p.ballOn], `${where}: play ${i + 1} (${p.type}) start`)
            .toEqual([prev.nextPossession, prev.nextDown, prev.nextDistance, prev.nextBallOn]);
          // And a play the rules decide ends where the rules put it.
          if (!getAuthoritativeNextSituation(p)) {
            const expected = advanceSituationAfterPlay(p, p, config);
            expect([p.nextPossession, p.nextDown, p.nextDistance, p.nextBallOn], `${where}: play ${i + 1} (${p.type}) end`)
              .toEqual([expected.possession, expected.down, expected.distance, expected.ballOn]);
          }
        });
        // Hand-moved balls stay where the operator put them.
        for (const i of flagged(after)) expect(after[i].ballOn, `${where}: hand-set play ${i + 1}`).toBe(loaded[i].ballOn);
      }
    }
  });

  it("reads its own writes back unchanged after an edit is saved and the game reopened", () => {
    for (const g of season) {
      const loaded = load(g.plays);
      const candidates = editable(loaded);
      const k = candidates[Math.floor(candidates.length / 2)];
      const saved = rebuild(editGain(loaded, k, loaded[k].yards - 3));
      const reopened = load(saved);
      reopened.forEach((p, i) => expect(spots(p), `game ${g.seed} play ${i + 1}`).toEqual(spots(saved[i])));
      expect(flagged(markHandSetStarts(saved, null, config))).toEqual(flagged(saved));
    }
  });

  it("writes the same spots from the film chart as the game screen derives", () => {
    for (const g of season) {
      const rows = load(g.plays).map(toRow);
      const candidates = editable(load(g.plays));
      const k = candidates[Math.floor(candidates.length / 3)];
      // A film-chart edit: new gain, and the play's stored next cleared.
      rows[k] = {
        ...rows[k], yards_gained: rows[k].yards_gained + 5,
        play_data: { ...rows[k].play_data, is_first_down: rows[k].yards_gained + 5 >= rows[k].distance,
          next_possession: null, next_down: null, next_distance: null, next_yard_line: null, next_situation_source: "auto" },
      };
      const rewrites = rechainStoredPlays(rows, null, config);
      expect(rewrites.length, `game ${g.seed}`).toBeGreaterThan(0);
      const byId = new Map(rewrites.map(w => [w.id, w]));
      const written = rows.map(row => {
        const w = byId.get(row.id);
        return w ? { ...row, ...w.fields, play_data: w.playData } : row;
      });
      // Nothing left for a second pass to fix...
      expect(rechainStoredPlays(written, null, config), `game ${g.seed}`).toEqual([]);
      // ...and the next play after the edit moved with it.
      if (written[k + 1].play_data?.start_override !== true) {
        expect(written[k + 1].yard_line).toBe(rows[k + 1].yard_line + 5);
      }
    }
  });
});
