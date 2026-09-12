/** Each audit finding is an ordinary regression test; none are expected failures. */
import { FootballStatsEngine } from "football-stats-engine";
import { describe, expect, it } from "vitest";
import { transformPlays } from "./playTransformer";
import { calcDefenseStats, type PlayWithPlayers } from "./gameService";
import { replayLiveGame } from "./liveGameSession";
import { DEFAULT_GAME_CONFIG } from "./programService";
import type { PlayRecord } from "@/components/game/types";

const tags = (...roles: string[]) => roles.map((role, i) => ({ player_id: `${role}${i}`, role, credit: null }));
function row(over: Record<string, unknown> = {}): PlayWithPlayers {
  return {
    id: "p1", game_id: "audit", sequence: 1, quarter: 1, clock: "10:00", down: 1, distance: 10,
    yard_line: 40, possession: "us", play_type: "rush", play_data: {}, yards_gained: 0,
    is_touchdown: false, is_turnover: false, is_penalty: false, description: "", play_start_time: 600,
    play_players: tags("rusher"), ...over,
  } as unknown as PlayWithPlayers;
}
function run(...plays: PlayWithPlayers[]) {
  const engine = new FootballStatsEngine({ rules: "high_school", trackDrives: true });
  engine.setTeams({ id: "us", name: "Us", abbreviation: "US" }, { id: "them", name: "Them", abbreviation: "TH" });
  engine.processPlays(transformPlays(plays, { gameId: "audit", homeTeamId: "us", awayTeamId: "them", homeTeamName: "Us", awayTeamName: "Them", programTeamId: "us" }));
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
    gameId: "audit", programTeamId: "us", programName: "Us", programAbbreviation: "US",
    opponentTeamId: "them", opponentName: "Them", opponentAbbreviation: "TH",
    isHome: true, gameConfig: DEFAULT_GAME_CONFIG, pregame: null,
  }).summary!;
  for (const key of ["firstDowns", "firstDownsPenalty", "rushingYards", "thirdDownAttempts", "fourthDownAttempts", "penalties", "puntCount"] as const) {
    expect(live.homeTeamStats[key], `live/report ${key}`).toBe(summary.homeTeamStats[key]);
  }
  return summary;
}
describe("NFHS manual audit — corrected regressions", () => {
  it("A01: third-down sack must count as a failed third-down attempt", () => {
    const s = run(row({ play_type: "sack", down: 3, yards_gained: -7, play_players: tags("passer", "sacker") }));
    expect(s.homeTeamStats.thirdDownAttempts).toBe(1);
  });
  it("A02: lost fumble beyond the chains must not earn a first down", () => {
    const s = run(row({ down: 2, distance: 5, yards_gained: 10, is_turnover: true, play_players: tags("rusher", "fumble_recovery") }));
    expect(s.homeTeamStats.firstDowns).toBe(0);
  });
  it("A03: goal-to-go touchdown must not earn another first down", () => {
    const s = run(row({ yard_line: 97, distance: 3, yards_gained: 3, is_touchdown: true }));
    expect(s.homeTeamStats.firstDowns).toBe(0);
  });
  it("A04: a measured first down by encroachment must count", () => {
    const s = run(row({ play_type: "penalty_only", down: 2, distance: 3, is_penalty: true,
      play_data: { penalty_type: "Encroachment", penalty_yards: 5, play_category: "defense", penalty_enforcement: "accepted", next_yard_line: 45, next_down: 1, next_distance: 10 } }));
    expect(s.homeTeamStats.firstDownsPenalty).toBe(1);
  });
  it("A05: holding beyond the line must preserve legal rushing yardage", () => {
    const s = run(row({ yard_line: 50, down: 2, distance: 5, yards_gained: 18, is_penalty: true,
      play_data: { penalty_type: "Holding-OFF", penalty_yards: 10, play_category: "offense", penalty_enforcement: "accepted", foul_spot_ball_on: 68 } }));
    expect(s.homeTeamStats.rushingYards).toBe(18);
  });
  it("A06: a nullified play must not give the defender a tackle", () => {
    const s = run(row({ yards_gained: -2, is_penalty: true, play_players: tags("rusher", "tackler"),
      play_data: { penalty_type: "Holding-OFF", penalty_yards: 10, play_category: "offense", penalty_enforcement: "accepted" } }));
    expect(s.defense.tackler1?.totalTackles ?? 0).toBe(0);
  });
  it("A07: reporting supplement must preserve shared-sack TFL credit", () => {
    const play = row({ play_type: "sack", yards_gained: -7, play_players: [
      { player_id: "d1", role: "sacker", credit: 0.5 }, { player_id: "d2", role: "sacker", credit: 0.5 },
    ] });
    expect(calcDefenseStats([play]).get("d1")?.tfl).toBe(0.5);
  });
  it("A08: blocked punt must not count against the individual punter", () => {
    const s = run(row({ play_type: "blocked_kick", play_players: tags("punter", "blocker"), play_data: { blocked_kick_type: "punt" } }));
    expect(s.punting.punter0?.punts ?? 0).toBe(0);
  });
  it("A09: blocked field goal actually kicked must count for the kicker", () => {
    const s = run(row({ play_type: "blocked_kick", play_players: tags("kicker", "blocker"), play_data: { blocked_kick_type: "field_goal" } }));
    expect(s.kicking.kicker0?.fieldGoalAttempts ?? 0).toBe(1);
  });
  it("A10: untouched onside recovery by kicking team is not a return", () => {
    const s = run(row({ play_type: "onside_kick", play_players: tags("kicker", "recoverer"),
      play_data: { onside_recovered_by_kicker: true, kicked_to_yard: 50, return_to_ball_on: 50 } }));
    expect(s.returns.recoverer1?.kickReturns ?? 0).toBe(0);
  });
  it("A11: awarded kickoff spot must not count as an assessed penalty", () => {
    const s = run(row({ play_type: "kickoff", is_penalty: true, play_players: tags("kicker"),
      play_data: { kickoff_out_of_bounds_choice: "take_35", penalty_type: "Kickoff Out of Bounds", penalty_yards: 0, penalty_enforcement: "accepted", play_category: "offense" } }));
    expect(s.homeTeamStats.penalties).toBe(0);
  });
  it("A12: pre-snap false start must not inflate drive play count", () => {
    const s = run(row({ play_type: "penalty_only", is_penalty: true, play_data: { penalty_type: "False Start", penalty_yards: 5, penalty_enforcement: "accepted", play_category: "offense" } }),
      row({ id: "p2", sequence: 2, yard_line: 35, yards_gained: 3, clock: "09:30" }));
    expect(s.drives[0].plays).toBe(1);
  });
  it("A13: punt touchback gross distance must reach the goal line", () => {
    const s = run(row({ play_type: "punt", yard_line: 35, play_players: tags("punter"),
      play_data: { is_touchback: true, kick_outcome: "touchback", kicked_to_yard: 5, return_to_ball_on: 95 } }));
    expect(s.punting.punter0.puntYards).toBe(65);
  });
  it("A14: loose-ball yardage through opponent recovery belongs to the original runner", () => {
    const s = run(row({ yard_line: 50, yards_gained: 5, is_turnover: true,
      play_players: tags("rusher", "fumble_recovery"), play_data: { fumble_recovered_at: 60, fumble_return_yards: 0 } }));
    expect(s.rushing.rusher0.yards).toBe(10);
  });
  it("A15: safety rushing loss belongs to the tagged ball carrier", () => {
    const s = run(row({ play_type: "safety", yard_line: 3, yards_gained: -3, play_players: tags("rusher", "tackler") }));
    expect(s.rushing.rusher0?.yards ?? 0).toBe(-3);
  });
  it("control: a completed pass gives matching passing and receiving yards", () => {
    const s = run(row({ play_type: "pass_comp", yards_gained: 12, play_players: tags("passer", "receiver") }));
    expect(s.passing.passer0.yards).toBe(12);
    expect(s.receiving.receiver1.yards).toBe(12);
    expect(s.homeTeamStats.totalYards).toBe(12);
  });
  it("control: two-point tries stay out of ordinary rushing and passing totals", () => {
    const s = run(row({ play_type: "two_pt", yards_gained: 3, play_data: { result: "Good" }, play_players: tags("passer", "receiver") }));
    expect(s.homeTeamStats.totalYards).toBe(0);
    expect(s.homeTeamStats.rushAttempts).toBe(0);
    expect(s.homeTeamStats.passAttempts).toBe(0);
  });
  it("counts a fourth-down sack, and gives no first down for an untagged lost fumble", () => {
    expect(run(row({ play_type: "sack", down: 4, yards_gained: -7 })).homeTeamStats.fourthDownAttempts).toBe(1);
    expect(run(row({ distance: 5, yards_gained: 10, is_turnover: true })).homeTeamStats.firstDowns).toBe(0);
  });
  it("assigns a blocked punt to Team at zero yards and a blocked PAT to its kicker", () => {
    const punt = run(row({ play_type: "blocked_kick", play_players: tags("punter"), play_data: { blocked_kick_type: "punt" } }));
    expect(punt.homeTeamStats.puntCount).toBe(1);
    expect(Object.values(punt.punting).reduce((n, p) => n + p.puntYards, 0)).toBe(0);
    const pat = run(row({ play_type: "blocked_kick", play_players: tags("kicker"), play_data: { blocked_kick_type: "extra_point" } }));
    expect(pat.kicking.kicker0.extraPointAttempts).toBe(1);
  });
  it("cuts legal rushing credit off at a holding foul beyond the line", () => {
    const s = run(row({ yard_line: 50, yards_gained: 25, is_penalty: true, play_data: {
      penalty_type: "Holding-OFF", penalty_yards: 10, penalty_enforcement: "accepted", play_category: "offense", foul_spot_ball_on: 68,
    } }));
    expect(s.rushing.rusher0.yards).toBe(18);
    expect(s.homeTeamStats.penaltyYards).toBe(10);
  });
});
