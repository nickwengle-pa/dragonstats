import { describe, expect, it } from "vitest";
import { buildGameReport } from "./gameReport";
import { computeGameStatsBundles, type GameRecord } from "./statsService";
import { nullifiedStats } from "./statAuditRules";
import type { PlayWithPlayers } from "./gameService";

/* The counting rules settled after the 2026 full-season check, and the report
   bugs that check turned up. Each case is a real play from that season with
   the names taken off. */

const US = "us-team";
const THEM = "them-team";
const BACK = "back";
const QB = "qb";
const PUNTER = "punter";
const TACKLER = "tackler";

const GAME: GameRecord = {
  id: "g", season_id: "s", opponent_id: THEM, is_home: true, our_score: 0, opponent_score: 0,
  status: "live", rules_config: {}, opening_kickoff_receiver: null,
  opponent: { id: THEM, name: "Them", abbreviation: "TH" },
};
const ROSTER = [
  { player_id: BACK, first_name: "Al", last_name: "Back", jersey_number: 22, position: "RB" },
  { player_id: QB, first_name: "Bo", last_name: "Passer", jersey_number: 8, position: "QB" },
  { player_id: PUNTER, first_name: "Cy", last_name: "Punter", jersey_number: 3, position: "P" },
  { player_id: TACKLER, first_name: "Di", last_name: "Tackler", jersey_number: 24, position: "LB" },
];

type Row = Partial<Omit<PlayWithPlayers, "play_data" | "play_players">> & {
  data?: Record<string, unknown>;
  /** [player id, role] for our players. */
  ours?: Array<[string, string]>;
  /** Roles filled by an unnamed opponent. */
  theirs?: string[];
};

let seq = 0;
function play(play_type: string, over: Row = {}): PlayWithPlayers {
  seq += 1;
  const { data, ours = [], theirs = [], ...rest } = over;
  return {
    id: `p${seq}`, sequence: seq, created_at: "", game_id: "g",
    quarter: 1, clock: "8:00", possession: "us", down: 1, distance: 10, yard_line: 30,
    play_type, yards_gained: 0, is_touchdown: false, is_turnover: false, is_penalty: false,
    description: "",
    play_data: { ...(theirs.length ? { opp_tagged: theirs.map(role => ({ id: "opp_team", role })) } : {}), ...data },
    play_players: ours.map(([player_id, role], i) => ({ id: `pp${seq}-${i}`, play_id: `p${seq}`, player_id, role })),
    ...rest,
  } as unknown as PlayWithPlayers;
}

const run = (yards: number, over: Row = {}) =>
  play("rush", { yards_gained: yards, ours: over.possession === "them" ? [] : [[BACK, "rusher"]], theirs: over.possession === "them" ? ["rusher"] : [], ...over });

function stats(plays: PlayWithPlayers[]) {
  const bundle = computeGameStatsBundles(
    { game: GAME, plays, roster: ROSTER, opponentPlayers: [] },
    { id: US, name: "Us", abbreviation: "US" },
    ["game"],
  )!.get("game")!;
  const report = buildGameReport({
    bundle,
    program: { id: US, name: "Us", abbreviation: "US", logoUrl: null, color: "#f00" },
    opponent: { name: "Them", abbreviation: "TH", logoUrl: null, color: "#00f" },
    gameDate: null, kickoffLabel: null, occasion: null, ourScore: 0, theirScore: 0, touchbackYardLine: 20,
  });
  const line = (label: string) => {
    const r = report.teamStats.find(t => t.label === label);
    if (!r) throw new Error(`no "${label}" row`);
    return { us: r.us, them: r.them };
  };
  return { us: bundle.summary.homeTeamStats, them: bundle.summary.awayTeamStats, summary: bundle.summary, report, line };
}

describe("a play that ends in a touchdown is not a first down", () => {
  it("leaves a long scoring run out of first downs and still converts the down", () => {
    const s = stats([
      run(12),
      run(30, { down: 3, distance: 5, yard_line: 70, is_touchdown: true }),
    ]);
    expect(s.us).toMatchObject({ firstDowns: 1, firstDownsRushing: 1, thirdDownAttempts: 1, thirdDownConversions: 1 });
    expect(s.summary.rushing[BACK]).toMatchObject({ carries: 2, yards: 42, touchdowns: 1 });
  });

  it("treats a scoring pass the same way, for either team", () => {
    const s = stats([
      play("pass_comp", { yards_gained: 40, yard_line: 60, is_touchdown: true, ours: [[QB, "passer"], [BACK, "receiver"]] }),
      play("pass_comp", { possession: "them", yards_gained: 25, yard_line: 75, is_touchdown: true, theirs: ["passer", "receiver"] }),
    ]);
    expect(s.us).toMatchObject({ firstDowns: 0, firstDownsPassing: 0, passingYards: 40 });
    expect(s.them).toMatchObject({ firstDowns: 0, firstDownsPassing: 0, passingYards: 25 });
  });

  it("gives no first down by penalty for a flag on a scoring play", () => {
    const s = stats([run(30, {
      yard_line: 70, is_touchdown: true, is_penalty: true,
      data: { penalty_type: "Facemask", play_category: "defense", penalty_yards: 15, penalty_enforcement: "accepted" },
    })]);
    expect(s.us).toMatchObject({ firstDowns: 0, firstDownsPenalty: 0 });
    expect(s.them.penalties).toBe(1);
  });
});

describe("a kickoff out of bounds is not a kick", () => {
  it("keeps its flag and opens no drive for the kicking team", () => {
    // They scored on defense, so their kickoff is their only "possession".
    const s = stats([
      run(3, { quarter: 4, clock: "8:20" }),
      play("kickoff", {
        quarter: 4, clock: "8:14", possession: "them", yard_line: 40, yards_gained: 55, is_penalty: true, theirs: ["kicker"],
        data: { kick_outcome: "out_of_bounds", kicked_to_yard: 5, penalty_type: "Offsides", play_category: "offense", penalty_yards: 5, penalty_enforcement: "accepted" },
      }),
      run(4, { quarter: 4, clock: "6:41", yard_line: 35 }),
    ]);
    expect(s.line("KICKOFF-YARDS").them).toBe("0-0");
    expect(s.them.penalties).toBe(1);
    expect(s.summary.drives.map(d => d.team)).toEqual([US, US]);
  });
});

describe("blocked punts", () => {
  it("count in the net average, and the yards back are a punt return", () => {
    const s = stats([
      play("punt", {
        down: 4, yard_line: 30, yards_gained: 40, ours: [[PUNTER, "punter"]],
        data: { kick_outcome: "downed", kicked_to_yard: 30, return_to_ball_on: 70, next_possession: "them", next_yard_line: 30 },
      }),
      play("blocked_kick", {
        down: 4, yard_line: 30, yards_gained: -12, ours: [[PUNTER, "punter"]], theirs: ["blocker", "recoverer"],
        data: { blocked_kick_type: "punt", blocked_recovered_by_kicking: false },
      }),
    ]);
    // 40 net on the first, minus 12 on the block, over two punts.
    expect(s.line("Net Average Per Punt").us).toBe("14.0");
    expect(s.line("Punt returns: Number-Yards-TD").them).toBe("1-12-0");
  });

  it("is no return when the kicking team falls on it", () => {
    const s = stats([play("blocked_kick", {
      down: 4, yard_line: 30, yards_gained: -8, ours: [[PUNTER, "punter"]], theirs: ["blocker"],
      data: { blocked_kick_type: "punt", blocked_recovered_by_kicking: true },
    })]);
    expect(s.line("Punt returns: Number-Yards-TD").them).toBe("0-0-0");
  });

  it("is a punt return touchdown when the blocking team runs it in", () => {
    const s = stats([play("blocked_kick", {
      down: 4, yard_line: 11, yards_gained: 89, is_touchdown: true, ours: [[PUNTER, "punter"]], theirs: ["blocker", "recoverer"],
      data: { blocked_kick_type: "punt" },
    })]);
    expect(s.line("Punt returns: Number-Yards-TD").them).toBe("1-11-1");
  });

  /* Nick's example: blocked, rolls back 20, picked up and run 10 more. The
     roll back is the blocker's, the run the runner's, and the team has one
     return of 30. */
  it("splits the return at the pickup spot between the blocker and the runner", () => {
    const s = stats([play("blocked_kick", {
      possession: "them", down: 4, yard_line: 40, yards_gained: -30,
      theirs: ["punter"], ours: [[TACKLER, "blocker"], [BACK, "recoverer"]],
      data: { blocked_kick_type: "punt", blocked_recovered_by_kicking: false, blocked_pickup_ball_on: 20 },
    })]);
    expect(s.summary.returns[TACKLER]).toMatchObject({ puntReturns: 0, puntReturnYards: 20 });
    expect(s.summary.returns[BACK]).toMatchObject({ puntReturns: 1, puntReturnYards: 10 });
    expect(s.line("Punt returns: Number-Yards-TD").us).toBe("1-30-0");
    expect(s.line("Net Average Per Punt").them).toBe("-30.0");
  });

  it("gives the runner the touchdown and the blocker only the roll back", () => {
    const s = stats([play("blocked_kick", {
      possession: "them", down: 4, yard_line: 40, yards_gained: 60, is_touchdown: true,
      theirs: ["punter"], ours: [[TACKLER, "blocker"], [BACK, "recoverer"]],
      data: { blocked_kick_type: "punt", blocked_recovered_by_kicking: false, blocked_pickup_ball_on: 25 },
    })]);
    expect(s.summary.returns[TACKLER]).toMatchObject({ puntReturns: 0, puntReturnYards: 15, puntReturnTouchdowns: 0 });
    expect(s.summary.returns[BACK]).toMatchObject({ puntReturns: 1, puntReturnYards: 25, puntReturnTouchdowns: 1 });
    expect(s.line("Punt returns: Number-Yards-TD").us).toBe("1-40-1");
  });

  it("keeps the whole return on one line when the blocker picked it up himself", () => {
    const s = stats([play("blocked_kick", {
      possession: "them", down: 4, yard_line: 40, yards_gained: -30,
      theirs: ["punter"], ours: [[TACKLER, "blocker"], [TACKLER, "recoverer"]],
      data: { blocked_kick_type: "punt", blocked_recovered_by_kicking: false, blocked_pickup_ball_on: 20 },
    })]);
    expect(s.summary.returns[TACKLER]).toMatchObject({ puntReturns: 1, puntReturnYards: 30 });
  });
});

describe("punts inside the 20", () => {
  const punt = (kickedTo: number, nextYard: number, over: Row = {}) => play("punt", {
    down: 4, yard_line: 50, yards_gained: 50 - kickedTo, ours: [[PUNTER, "punter"]],
    data: { kick_outcome: "downed", kicked_to_yard: kickedTo, return_to_ball_on: 100 - nextYard, next_possession: "them", next_yard_line: nextYard },
    ...over,
  });

  it("goes by where the other team snaps it next, and the 20 itself is not inside", () => {
    const s = stats([
      punt(15, 15),   // downed at the 15: counts
      punt(20, 20),   // downed on the 20: does not
      punt(15, 30),   // fielded at the 15, run out to the 30: does not
    ]);
    expect(s.line("Inside 20").us).toBe("1");
  });

  it("counts the other team's punts too", () => {
    const s = stats([play("punt", {
      possession: "them", down: 4, yard_line: 50, yards_gained: 40, theirs: ["punter"],
      data: { kick_outcome: "downed", kicked_to_yard: 10, return_to_ball_on: 90, next_possession: "us", next_yard_line: 10 },
    })]);
    expect(s.line("Inside 20").them).toBe("1");
  });
});

describe("flags that used to wipe or keep the wrong play", () => {
  const flag = (type: string, side: "offense" | "defense", yards: number, next: Record<string, unknown>) => ({
    is_penalty: true,
    data: { penalty_type: type, play_category: side, penalty_yards: yards, penalty_enforcement: "accepted", ...next },
  });

  it("keeps a run when a hand-typed foul was tacked on to the end of it", () => {
    // 1st & 10 at the 25, a 10-yard run, five more for the facemask: 1st & 10 at the 40.
    const kept = run(10, { yard_line: 25, ...flag("facemask 5yd", "defense", 5, { next_possession: "us", next_down: 1, next_yard_line: 40 }) });
    expect(nullifiedStats(kept)).toBe(false);
    const s = stats([kept]);
    expect(s.summary.rushing[BACK]).toMatchObject({ carries: 1, yards: 10 });
    expect(s.them.penalties).toBe(1);
  });

  it("still wipes it when the same foul was marched from the line", () => {
    const wiped = run(10, { yard_line: 25, ...flag("facemask 5yd", "defense", 5, { next_possession: "us", next_down: 1, next_yard_line: 30 }) });
    expect(nullifiedStats(wiped)).toBe(true);
    expect(stats([wiped]).us.rushAttempts).toBe(0);
  });

  it("takes the run and the tackle off when an offensive foul replays the down", () => {
    // 1st & 10 at the 39, a 10-yard run called back: 1st & 20 at the 29.
    const s = stats([run(10, {
      possession: "them", yard_line: 39, ours: [[TACKLER, "tackler"]],
      ...flag("Facemask", "offense", 10, { next_possession: "them", next_down: 1, next_distance: 20, next_yard_line: 29 }),
    })]);
    expect(s.them).toMatchObject({ rushAttempts: 0, rushingYards: 0, penalties: 1 });
    expect(s.summary.defense[TACKLER]?.totalTackles ?? 0).toBe(0);
  });

  it("charges no attempt for an incompletion with a personal foul on the defense", () => {
    const s = stats([
      play("pass_comp", { yards_gained: 6, ours: [[QB, "passer"], [BACK, "receiver"]] }),
      play("pass_inc", {
        down: 2, distance: 12, yard_line: 44, ours: [[QB, "passer"]],
        ...flag("Roughing the Passer", "defense", 15, { penalty_enforcement_from: "auto", next_possession: "us", next_down: 1, next_yard_line: 59 }),
      }),
    ]);
    expect(s.summary.passing[QB]).toMatchObject({ attempts: 1, completions: 1 });
    expect(s.us).toMatchObject({ firstDowns: 1, firstDownsPenalty: 1 });
  });

  it("cuts a kick return back to the foul on a row saved without the enforcement spot", () => {
    // Fielded at our 11, run out 55, a hold at our 36: first and 10 at our 26.
    const s = stats([play("kickoff", {
      possession: "them", yard_line: 40, yards_gained: -6, theirs: ["kicker"], ours: [[BACK, "returner"]],
      ...flag("Holding-OFF", "defense", 10, { next_possession: "us", next_down: 1, next_yard_line: 26 }),
      data: {
        kick_outcome: "returned", kicked_to_yard: 11, return_to_ball_on: 34, foul_spot_ball_on: 64,
        penalty_type: "Holding-OFF", play_category: "defense", penalty_yards: 10, penalty_enforcement: "accepted",
        next_possession: "us", next_down: 1, next_yard_line: 26,
      },
    })]);
    expect(s.summary.returns[BACK]).toMatchObject({ kickReturns: 1, kickReturnYards: 25 });
    expect(s.line("KICKOFF-YARDS").them).toBe("1-49");
    // The kicking team gets no first down out of the receivers' foul.
    expect(s.them).toMatchObject({ firstDowns: 0, firstDownsPenalty: 0 });
  });

  it("counts one first down, not two, when a run that made the line also drew a flag", () => {
    // 4th & 3: a 4-yard run plus 15 for targeting.
    const s = stats([run(4, {
      down: 4, distance: 3, yard_line: 35,
      ...flag("Targeting", "defense", 15, { penalty_enforcement_from: "auto", next_possession: "us", next_down: 1, next_yard_line: 54 }),
    })]);
    expect(s.us).toMatchObject({ firstDowns: 1, firstDownsRushing: 1, firstDownsPenalty: 0, fourthDownConversions: 1 });
  });
});

describe("other report lines", () => {
  it("does not count an interception on third down as a conversion", () => {
    const s = stats([play("int", {
      down: 3, distance: 6, yard_line: 65, yards_gained: 10, is_turnover: true, ours: [[QB, "passer"]], theirs: ["interceptor"],
    })]);
    expect(s.us).toMatchObject({ thirdDownAttempts: 1, thirdDownConversions: 0 });
    expect(s.line("Third-Down Conversions").us).toBe("0-1");
  });

  it("shows the other team's sacks even when nobody on their side was named", () => {
    const s = stats([play("sack", { yards_gained: -7, ours: [[QB, "passer"]] })]);
    expect(s.line("Sacks By: Number-Yards").them).toBe("1-7");
  });
});
