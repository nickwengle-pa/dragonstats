/**
 * A bad snap's yardage belongs to TEAM, all the way to the stat line.
 *
 * badSnap.test.ts pins the decision — the modal writes a TEAM rusher and the
 * transformer resolves it. This pins the CONSEQUENCE, which is the part worth
 * checking: that the loss actually arrives on the #100 TEAM rushing line and
 * not on the quarterback's, once the real transformer and the real engine have
 * had it.
 *
 * That chain has several places to go wrong. A bad snap has no play_players
 * row at all — the TEAM tag cannot be a foreign key, so it rides in
 * play_data.team_tagged — and every earlier version of the transformer read
 * play_players alone and dropped it on the floor.
 *
 * Run: vitest (it resolves the vendored engine the way the app does; the dist
 * uses extensionless imports that only a bundler can load).
 */
import { FootballStatsEngine } from "football-stats-engine";
import type { GameSummary, TeamId } from "football-stats-engine";
import { transformPlays } from "./playTransformer";
import type { PlayWithPlayers } from "./gameService";
import { TEAM_PLAYER_ID } from "@/components/game/types";
import { describe, it, expect } from "vitest";

const PROGRAM = "team-us";
const OPPONENT = "team-them";
const GAME = "game-1";

function dbPlay(over: Partial<PlayWithPlayers> & { id: string }): PlayWithPlayers {
  return {
    game_id: GAME,
    sequence: 1,
    quarter: 1,
    clock: "10:00",
    down: 1,
    distance: 10,
    yard_line: 30,
    possession: "us",
    play_type: "rush",
    play_data: {},
    yards_gained: 0,
    is_touchdown: false,
    is_turnover: false,
    is_penalty: false,
    description: "",
    play_start_time: 600,
    play_players: [],
    ...over,
  } as unknown as PlayWithPlayers;
}

function summarise(plays: PlayWithPlayers[]): GameSummary {
  const engine = new FootballStatsEngine({
    enableGameState: true,
    rules: "high_school",
    trackDrives: true,
  });
  const home: TeamId = { id: PROGRAM, name: "Us", abbreviation: "US" };
  const away: TeamId = { id: OPPONENT, name: "Them", abbreviation: "TH" };
  engine.setTeams(home, away);
  engine.registerPlayers([
    { id: "qb1", name: "QB One" },
    { id: "rb1", name: "RB One" },
    { id: TEAM_PLAYER_ID, name: "#100 TEAM" },
  ]);
  engine.processPlays(
    transformPlays(plays, {
      gameId: GAME,
      homeTeamId: PROGRAM,
      awayTeamId: OPPONENT,
      homeTeamName: "Us",
      awayTeamName: "Them",
      programTeamId: PROGRAM,
    }),
  );
  return engine.getGameSummary();
}

const rushing = (s: GameSummary, id: string) =>
  (s.rushing as Record<string, { carries?: number; yards?: number } | undefined>)[id];

/** A bad snap as the app actually stores one: no play_players row, the TEAM
 *  rusher in play_data where a tag that cannot be a foreign key has to live. */
const BAD_SNAP = dbPlay({
  id: "p1",
  play_type: "bad_snap",
  yards_gained: -8,
  description: "Bad snap -8",
  play_data: { team_tagged: [{ role: "rusher", credit: null }] },
});

describe("a bad snap is charged to TEAM", () => {
  it("puts the carry and the yards on the TEAM line", () => {
    const team = rushing(summarise([BAD_SNAP]), TEAM_PLAYER_ID);
    expect(team?.carries).toBe(1);
    expect(team?.yards).toBe(-8);
  });

  it("leaves the quarterback's line completely alone", () => {
    // The whole reason the play type exists: a bad centre exchange must not
    // read as a bad night from the back.
    const s = summarise([
      BAD_SNAP,
      dbPlay({
        id: "p2",
        play_type: "rush",
        yards_gained: 12,
        play_players: [{ id: "pp1", play_id: "p2", player_id: "rb1", role: "rusher", credit: null }],
      } as Partial<PlayWithPlayers> & { id: string }),
    ]);
    expect(rushing(s, "qb1")).toBeUndefined();
    // And the back keeps exactly his own carry, unpolluted by the snap.
    expect(rushing(s, "rb1")?.carries).toBe(1);
    expect(rushing(s, "rb1")?.yards).toBe(12);
  });

  it("counts in the team's net rushing, so the sheet reconciles", () => {
    // Bad snap -8 plus a 12-yard run is 4 net on two attempts. If the snap
    // were dropped on the way to the engine the team total would read 12 and
    // disagree with the individual lines under it.
    const s = summarise([
      BAD_SNAP,
      dbPlay({
        id: "p2",
        play_type: "rush",
        yards_gained: 12,
        play_players: [{ id: "pp1", play_id: "p2", player_id: "rb1", role: "rusher", credit: null }],
      } as Partial<PlayWithPlayers> & { id: string }),
    ]);
    const us = s.homeTeamStats.teamId === PROGRAM ? s.homeTeamStats : s.awayTeamStats;
    expect(us.rushingYards).toBe(4);
    expect(us.rushAttempts).toBe(2);
  });

  it("never scores, however the yardage lands", () => {
    const s = summarise([
      dbPlay({
        id: "p3",
        play_type: "bad_snap",
        yards_gained: -30,
        is_touchdown: true, // a stray flag must not become a TEAM rushing TD
        play_data: { team_tagged: [{ role: "rusher", credit: null }] },
      }),
    ]);
    expect(rushing(s, TEAM_PLAYER_ID)?.carries).toBe(1);
    const team = s.rushing[TEAM_PLAYER_ID] as { touchdowns?: number } | undefined;
    expect(team?.touchdowns ?? 0).toBe(0);
  });
});
