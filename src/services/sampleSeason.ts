/**
 * A made-up season, for the Season Book preview and its tests.
 *
 * Every team, player and play here is invented, and the games are simulated
 * from a fixed seed so a test sees the same season every run. The plays are
 * written the way the app stores them - play_players for our rostered
 * players, opponents in play_data.opp_tagged, kick spots in kicked_to_yard and
 * return_to_ball_on, the snap clock in play_start_time - so they go through
 * the real transformer, engine and stat sheet unchanged.
 *
 * Nothing in the app imports this outside the dev-only preview.
 */

import type { PlayWithPlayers } from "./gameService";
import type { GameRecord, GameStatsInputs, RosterPlayer } from "./statsService";
import type { BookGame, BookProgram } from "./seasonBook";

export const SAMPLE_PROGRAM: BookProgram = {
  id: "sample-program",
  name: "Sample Dragons",
  abbreviation: "SD",
  logoUrl: null,
  color: "#d7141a",
  game_config: { touchback_yard_line: 20, fg_snap_add: 17 },
};

const SEASON_ID = "sample-season";

type Pos = "QB" | "RB" | "WR" | "TE" | "DL" | "LB" | "DB" | "K";
const ROSTER_SPEC: Array<[number, string, string, Pos]> = [
  [2, "Jalen", "Avery", "RB"], [3, "Marcus", "Bell", "DB"], [4, "Owen", "Castillo", "WR"],
  [5, "Tyler", "Dunn", "DB"], [7, "Caleb", "Ellis", "QB"], [8, "Noah", "Fischer", "WR"],
  [10, "Ethan", "Garza", "K"], [11, "Luke", "Harper", "WR"], [12, "Isaac", "Ingram", "QB"],
  [14, "Mason", "Jordan", "DB"], [21, "Victor", "Keller", "RB"], [22, "Dylan", "Lowe", "RB"],
  [24, "Gavin", "Morris", "DB"], [32, "Hunter", "Nash", "LB"], [33, "Colton", "Ortiz", "LB"],
  [44, "Brody", "Park", "LB"], [52, "Seth", "Quinn", "LB"], [55, "Wyatt", "Reed", "DL"],
  [77, "Logan", "Shaw", "DL"], [88, "Carter", "Tate", "TE"], [90, "Easton", "Underwood", "DL"],
  [99, "Grant", "Vance", "DL"],
];
const OPPONENTS: Array<[string, string, string, boolean]> = [
  ["Northfield", "NF", "#1d4ed8", true], ["Cedar Ridge", "CR", "#15803d", false],
  ["Lakeview", "LV", "#7c3aed", true], ["Hillcrest", "HC", "#b45309", false],
  ["Riverside", "RS", "#0f766e", true], ["Oak Hollow", "OH", "#be123c", false],
];

/** Small, seeded, good enough: mulberry32. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Tag { id: string; role: string; credit?: number | null; name?: string; jersey_number?: number | null }

export function sampleRoster(): RosterPlayer[] {
  return ROSTER_SPEC.map(([jersey, first, last, pos]) => ({
    player_id: `sp-${jersey}`, first_name: first, last_name: last, jersey_number: jersey, position: pos,
  }));
}

function simulateGame(index: number, roster: RosterPlayer[]): { record: GameRecord; plays: PlayWithPlayers[]; opp: GameStatsInputs["opponentPlayers"] } {
  const rand = rng(1000 + index * 7919);
  const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const [oppName, oppAbbr, , isHome] = OPPONENTS[index];
  const opponentId = `sample-opp-${index}`;
  const gameId = `sample-game-${index}`;
  const opp = [
    { jersey: 6, name: "Rivera", pos: "QB" }, { jersey: 20, name: "Brooks", pos: "RB" },
    { jersey: 1, name: "Coleman", pos: "WR" }, { jersey: 81, name: "Diaz", pos: "WR" },
    { jersey: 9, name: "Foster", pos: "K" }, { jersey: 54, name: "Grant", pos: "LB" },
    { jersey: 23, name: "Hayes", pos: "DB" },
  ].map(p => ({ id: `${opponentId}-p${p.jersey}`, name: p.name, jersey_number: p.jersey, position: p.pos }));
  const oppBy = (pos: string) => opp.filter(p => p.position === pos);

  const by = (pos: Pos) => roster.filter(r => r.position === pos);
  const qb = by("QB")[0];
  const backs = by("RB");
  const catchers = [...by("WR"), ...by("TE"), backs[0]];
  const defenders = [...by("LB"), ...by("DB"), ...by("DL")];
  const kicker = by("K")[0];

  const plays: PlayWithPlayers[] = [];
  let seq = 0;
  let quarter = 1;
  let clock = 720;
  const score = { us: 0, them: 0 };
  const openingReceiver: "us" | "them" = index % 2 === 0 ? "us" : "them";

  const ours = (p: RosterPlayer, role: string, credit?: number) => ({
    id: `${gameId}-pp${seq}-${role}-${p.player_id}`, play_id: `${gameId}-${seq}`, player_id: p.player_id, role,
    credit: credit ?? null, player: { first_name: p.first_name, last_name: p.last_name },
  });
  const theirs = (p: (typeof opp)[number], role: string, credit?: number): Tag => ({
    id: p.id, name: p.name, jersey_number: p.jersey_number, role, credit: credit ?? null,
  });
  const label = (p: RosterPlayer) => `#${p.jersey_number} ${p.first_name[0]}.${p.last_name}`;
  const oppLabel = (p: (typeof opp)[number]) => `#${p.jersey_number} ${p.name}`;

  function push(row: {
    possession: "us" | "them"; down: number; distance: number; yard_line: number; play_type: string;
    yards_gained?: number; is_touchdown?: boolean; is_turnover?: boolean; is_penalty?: boolean;
    description: string; play_data?: Record<string, unknown>;
    play_players?: ReturnType<typeof ours>[]; elapsed: number;
  }) {
    seq += 1;
    const snapClock = clock;
    clock = Math.max(0, clock - row.elapsed);
    plays.push({
      id: `${gameId}-${seq}`, game_id: gameId, sequence: seq, created_at: "2026-09-01T00:00:00Z",
      quarter, clock: `${Math.floor(snapClock / 60)}:${String(snapClock % 60).padStart(2, "0")}`,
      play_start_time: snapClock, play_end_time: clock,
      possession: row.possession, down: row.down, distance: row.distance, yard_line: row.yard_line,
      play_type: row.play_type, yards_gained: row.yards_gained ?? 0,
      is_touchdown: row.is_touchdown ?? false, is_turnover: row.is_turnover ?? false, is_penalty: row.is_penalty ?? false,
      description: row.description, play_data: row.play_data ?? {}, play_players: row.play_players ?? [],
    } as PlayWithPlayers);
  }
  function quarterBreak() {
    seq += 1;
    plays.push({
      id: `${gameId}-${seq}`, game_id: gameId, sequence: seq, created_at: "2026-09-01T00:00:00Z",
      quarter, clock: "0:00", possession: "us", down: 1, distance: 10, yard_line: 50,
      play_type: "quarter_change", yards_gained: 0, is_touchdown: false, is_turnover: false, is_penalty: false,
      description: `End of ${["1st", "2nd", "3rd", "4th"][quarter - 1] ?? "OT"} quarter`, play_data: {}, play_players: [],
    } as PlayWithPlayers);
    quarter += 1;
    clock = 720;
  }

  /** Kick off from the 40; returns where the receivers start, in their frame. */
  function kickoff(kicking: "us" | "them"): number {
    const distance = between(42, 62);
    const kickedTo = 100 - 40 - distance;
    const receiving = kicking === "us" ? "them" : "us";
    if (kickedTo <= 0) {
      push({
        possession: kicking, down: 1, distance: 10, yard_line: 40, play_type: "kickoff", elapsed: 0,
        description: `Kickoff ${kicking === "us" ? label(kicker) : oppLabel(oppBy("K")[0])} ${distance} yds Touchback`,
        play_data: { is_touchback: true, kick_outcome: "touchback", next_possession: receiving, next_down: 1, next_distance: 10, next_yard_line: 20 },
        play_players: kicking === "us" ? [ours(kicker, "kicker")] : [],
      });
      return 20;
    }
    const ret = between(4, 28);
    const start = Math.min(99, kickedTo + ret);
    const returner = receiving === "us" ? pick(backs) : null;
    const theirReturner = receiving === "them" ? oppBy("RB")[0] : null;
    const tackler = kicking === "us" ? pick(defenders) : null;
    push({
      possession: kicking, down: 1, distance: 10, yard_line: 40, play_type: "kickoff", elapsed: between(5, 9),
      description: `Kickoff ${kicking === "us" ? label(kicker) : oppLabel(oppBy("K")[0])} ${distance} yds to ${receiving === "us" ? SAMPLE_PROGRAM.abbreviation : oppAbbr} ${kickedTo}, ret ${returner ? label(returner) : oppLabel(theirReturner!)} ${ret} yds`,
      play_data: {
        kicked_to_yard: kickedTo, return_to_ball_on: 100 - start,
        next_possession: receiving, next_down: 1, next_distance: 10, next_yard_line: start,
        ...(kicking === "them" ? { opp_tagged: [theirs(oppBy("K")[0], "kicker")] } : { opp_tagged: [theirs(theirReturner!, "returner")] }),
      },
      play_players: kicking === "us"
        ? [ours(kicker, "kicker"), ours(tackler!, "tackler", 1)]
        : [ours(returner!, "returner")],
    });
    return start;
  }

  interface DriveState { ball: number; down: number; toGo: number }
  type DriveEnd =
    | { clockOut: true; state: DriveState }
    | { clockOut: false; kickoffBy: "us" | "them" | null; next: number };
  /** One possession, until the ball changes hands or the clock runs out
   *  mid-drive (the drive then carries on after a quarter break). */
  function drive(offense: "us" | "them", from: DriveState): DriveEnd {
    let { ball, down, toGo } = from;
    const defense = offense === "us" ? "them" : "us";
    const over = (kickoffBy: "us" | "them" | null, next: number): DriveEnd => ({ clockOut: false, kickoffBy, next });
    while (true) {
      if (clock <= 0) return { clockOut: true, state: { ball, down, toGo } };
      const goal = ball + toGo >= 100;
      const dist = goal ? 100 - ball : toGo;
      const base = { possession: offense, down, distance: dist, yard_line: ball } as const;
      // 4th down: kick or go.
      if (down === 4 && !(dist <= 2 && ball > 45 && rand() < 0.5)) {
        if (ball >= 70) {
          const good = rand() < 0.7;
          const k = offense === "us" ? kicker : null;
          push({
            ...base, play_type: "fg", elapsed: 5,
            description: `FG ${good ? "Good" : "No Good"}`,
            play_data: { result: good ? "Good" : "No Good", ...(k ? {} : { opp_tagged: [theirs(oppBy("K")[0], "kicker")] }) },
            play_players: k ? [ours(k, "kicker")] : [],
          });
          if (good) { score[offense] += 3; return over(offense, 0); }
          return over(null, Math.max(20, 100 - ball));
        }
        const distance = between(30, 46);
        const landing = Math.max(1, 100 - ball - distance);
        if (landing <= 0 || ball + distance >= 100) {
          push({
            ...base, play_type: "punt", elapsed: 8,
            description: `Punt ${offense === "us" ? label(kicker) : oppLabel(oppBy("K")[0])} ${distance} yds Touchback`,
            play_data: { is_touchback: true, kick_outcome: "touchback", ...(offense === "them" ? { opp_tagged: [theirs(oppBy("K")[0], "punter")] } : {}) },
            play_players: offense === "us" ? [ours(kicker, "punter")] : [],
          });
          return over(null, 20);
        }
        const ret = rand() < 0.35 ? 0 : between(2, 14);
        const returner = defense === "us" ? backs[1] ?? backs[0] : null;
        const start2 = Math.min(99, landing + ret);
        push({
          ...base, play_type: "punt", elapsed: 9,
          description: `Punt ${offense === "us" ? label(kicker) : oppLabel(oppBy("K")[0])} ${distance} yds to ${defense === "us" ? SAMPLE_PROGRAM.abbreviation : oppAbbr} ${landing}${ret ? `, ret ${returner ? label(returner) : oppLabel(oppBy("RB")[0])} ${ret} yds` : ""}`,
          play_data: {
            kicked_to_yard: landing, return_to_ball_on: 100 - start2,
            ...(offense === "them" ? { opp_tagged: [theirs(oppBy("K")[0], "punter")] } : ret ? { opp_tagged: [theirs(oppBy("RB")[0], "returner")] } : {}),
          },
          play_players: offense === "us"
            ? [ours(kicker, "punter"), ...(ret ? [ours(pick(defenders), "tackler", 1)] : [])]
            : ret ? [ours(returner!, "returner")] : [],
        });
        return over(null, start2);
      }
      // A flag now and then.
      if (rand() < 0.05) {
        const offensive = rand() < 0.5;
        const yards = 5;
        push({
          ...base, play_type: "penalty_only", is_penalty: true, elapsed: 0,
          description: `PEN: ${offensive ? "False Start" : "Offside"}`,
          play_data: { penalty_type: offensive ? "False Start" : "Offside", penalty_yards: yards, play_category: offensive ? "offense" : "defense" },
        });
        ball = Math.max(1, Math.min(99, ball + (offensive ? -yards : yards)));
        toGo = Math.max(1, toGo + (offensive ? yards : -yards));
        continue;
      }
      const passing = rand() < (offense === "us" ? 0.42 : 0.45);
      const tacklers = () => {
        if (offense === "us") return { pp: [] as ReturnType<typeof ours>[], opp: rand() < 0.6 ? [theirs(pick(oppBy("LB").concat(oppBy("DB"))), "tackler", 1)] : [] };
        const first = pick(defenders);
        if (rand() < 0.3) {
          const second = pick(defenders.filter(d => d !== first));
          return { pp: [ours(first, "tackler", 0.5), ours(second, "tackler", 0.5)], opp: [] as Tag[] };
        }
        return { pp: [ours(first, "tackler", 1)], opp: [] as Tag[] };
      };
      let gain = 0;
      let td = false;
      if (!passing) {
        gain = rand() < 0.12 ? between(-4, -1) : rand() < 0.08 ? between(15, 60) : between(0, 9);
        if (ball + gain >= 100) { gain = 100 - ball; td = true; }
        if (ball + gain <= 0) gain = 1 - ball;
        const runner = offense === "us" ? (rand() < 0.62 ? backs[1] : rand() < 0.6 ? backs[0] : qb) : null;
        const t = td ? { pp: [], opp: [] } : tacklers();
        const fumbleLost = !td && rand() < 0.015;
        push({
          ...base, play_type: "rush", yards_gained: gain, is_touchdown: td, is_turnover: fumbleLost, elapsed: between(28, 40),
          description: `${runner ? label(runner) : oppLabel(oppBy("RB")[0])} rush ${gain > 0 ? "+" : ""}${gain}${fumbleLost ? " · Fumble lost" : ""}${td ? " · TD" : ""}`,
          play_data: {
            ...(offense === "them" ? { opp_tagged: [theirs(oppBy("RB")[0], "rusher")] } : t.opp.length ? { opp_tagged: t.opp } : {}),
            ...(fumbleLost ? { fumble_recovered_at: ball + gain } : {}),
          },
          play_players: [...(runner ? [ours(runner, "rusher")] : []), ...t.pp,
            ...(fumbleLost && offense === "them" ? [ours(pick(defenders), "fumble_recovery"), ours(pick(defenders), "forced_fumble")] : [])],
        });
        if (fumbleLost) return over(null, Math.max(1, Math.min(99, 100 - (ball + gain))));
      } else {
        const roll = rand();
        const passer = offense === "us" ? qb : null;
        if (roll < 0.06) {
          // Sacked.
          gain = -between(3, 9);
          const sacker = offense === "them" ? pick(by("DL").concat(by("LB"))) : null;
          push({
            ...base, play_type: "sack", yards_gained: gain, elapsed: 30,
            description: `${passer ? label(passer) : oppLabel(oppBy("QB")[0])} sacked ${gain}${sacker ? ` by ${label(sacker)}` : ""}`,
            play_data: offense === "them" ? { opp_tagged: [theirs(oppBy("QB")[0], "passer")] } : {},
            play_players: passer ? [ours(passer, "passer")] : sacker ? [ours(sacker, "sacker")] : [],
          });
        } else if (roll < 0.09) {
          const picker = offense === "them" ? pick(by("DB").concat(by("LB"))) : null;
          const back = between(0, 25);
          push({
            ...base, play_type: "int", is_turnover: true, elapsed: 12,
            description: `${passer ? label(passer) : oppLabel(oppBy("QB")[0])} INT by ${picker ? label(picker) : oppLabel(oppBy("DB")[0])}, ret ${back} yds`,
            play_data: {
              interception_return_yards: back,
              opp_tagged: offense === "them" ? [theirs(oppBy("QB")[0], "passer")] : [theirs(oppBy("DB")[0], "interceptor")],
            },
            play_players: passer ? [ours(passer, "passer")] : [ours(picker!, "interceptor")],
          });
          const caughtAt = Math.min(99, ball + between(8, 25));
          return over(null, Math.max(1, Math.min(99, 100 - caughtAt + back)));
        } else if (roll < 0.45) {
          const target = offense === "us" ? pick(catchers) : null;
          const breakup = offense === "them" && rand() < 0.3 ? pick(by("DB")) : null;
          push({
            ...base, play_type: "pass_inc", elapsed: 6,
            description: `${passer ? label(passer) : oppLabel(oppBy("QB")[0])}${target ? ` → ${label(target)}` : ""} inc`,
            play_data: offense === "them" ? { opp_tagged: [theirs(oppBy("QB")[0], "passer")] } : {},
            play_players: [...(passer ? [ours(passer, "passer")] : []), ...(target ? [ours(target, "target")] : []), ...(breakup ? [ours(breakup, "defender")] : [])],
          });
        } else {
          gain = rand() < 0.15 ? between(18, 55) : between(2, 14);
          if (ball + gain >= 100) { gain = 100 - ball; td = true; }
          const receiver = offense === "us" ? pick(catchers) : null;
          const theirReceiver = offense === "them" ? pick(oppBy("WR")) : null;
          const t = td ? { pp: [], opp: [] } : tacklers();
          push({
            ...base, play_type: "pass_comp", yards_gained: gain, is_touchdown: td, elapsed: between(24, 36),
            description: `${passer ? label(passer) : oppLabel(oppBy("QB")[0])} → ${receiver ? label(receiver) : oppLabel(theirReceiver!)} ${gain > 0 ? "+" : ""}${gain}${td ? " · TD" : ""}`,
            play_data: offense === "them"
              ? { opp_tagged: [theirs(oppBy("QB")[0], "passer"), theirs(theirReceiver!, "receiver")] }
              : t.opp.length ? { opp_tagged: t.opp } : {},
            play_players: [...(passer ? [ours(passer, "passer"), ours(receiver!, "receiver")] : []), ...t.pp],
          });
        }
      }
      if (td) {
        score[offense] += 6;
        const good = rand() < 0.88;
        push({
          possession: offense, down: 1, distance: 3, yard_line: 97, play_type: "pat", elapsed: 0,
          description: `PAT ${good ? "Good" : "No Good"}`,
          play_data: { result: good ? "Good" : "No Good", ...(offense === "them" ? { opp_tagged: [theirs(oppBy("K")[0], "kicker")] } : {}) },
          play_players: offense === "us" ? [ours(kicker, "kicker")] : [],
        });
        if (good) score[offense] += 1;
        return over(offense, 0);
      }
      ball += gain;
      toGo -= gain;
      if (toGo <= 0) { down = 1; toGo = 10; } else { down += 1; }
      if (down > 4) return over(null, Math.max(1, 100 - ball));
    }
  }

  // The game.
  const other = (side: "us" | "them"): "us" | "them" => (side === "us" ? "them" : "us");
  const fresh = (ball: number): DriveState => ({ ball, down: 1, toGo: 10 });
  let offense: "us" | "them" = openingReceiver;
  let state = fresh(kickoff(other(openingReceiver)));
  while (true) {
    const result = drive(offense, state);
    if (clock <= 0) {
      if (quarter === 4) { quarterBreak(); break; }
      if (quarter === 2) {
        // Halftime ends every drive; the other team receives.
        quarterBreak();
        offense = other(openingReceiver);
        state = fresh(kickoff(openingReceiver));
        continue;
      }
      quarterBreak();
      // A drive carries across the 1st and 3rd quarter breaks.
      if (result.clockOut) { state = result.state; continue; }
    }
    if (result.clockOut) continue;
    if (result.kickoffBy) {
      offense = other(result.kickoffBy);
      state = fresh(kickoff(result.kickoffBy));
    } else {
      offense = other(offense);
      state = fresh(result.next);
    }
  }

  // Each play's next spot, as a replay would leave it: the next row's start.
  const snaps = plays.filter(p => p.play_type !== "quarter_change");
  snaps.forEach((p, i) => {
    const following = snaps[i + 1];
    if (!following) return;
    p.play_data = {
      next_possession: following.possession, next_down: following.down,
      next_distance: following.distance, next_yard_line: following.yard_line,
      ...p.play_data,
    };
  });

  const record: GameRecord = {
    id: gameId, season_id: SEASON_ID, opponent_id: opponentId, is_home: isHome,
    our_score: score.us, opponent_score: score.them, status: "completed",
    rules_config: null, opening_kickoff_receiver: openingReceiver,
    opponent: { id: opponentId, name: oppName, abbreviation: oppAbbr },
  };
  return { record, plays, opp };
}

/** Six games, simulated. Fresh objects every call, so a test can mutate. */
export function sampleSeasonGames(count = OPPONENTS.length): BookGame[] {
  const roster = sampleRoster();
  return OPPONENTS.slice(0, count).map(([name, abbr, color, isHome], i) => {
    const { record, plays, opp } = simulateGame(i, roster);
    // Fridays from Aug 28, a week apart.
    const friday = new Date(Date.UTC(2026, 7, 28 + i * 7));
    const date = friday.toISOString().slice(0, 10);
    return {
      number: i + 1,
      meta: {
        id: record.id, date, kickoff: "19:00", opponentName: name, opponentAbbr: abbr, opponentColor: color,
        opponentLogo: null, isHome, ourScore: record.our_score, theirScore: record.opponent_score, status: "completed",
      },
      inputs: { game: record, plays, roster, opponentPlayers: opp },
      periods: new Map(),
    };
  });
}
