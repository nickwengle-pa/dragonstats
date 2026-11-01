import { describe, expect, it } from "vitest";
import { SAMPLE_PROGRAM, sampleSeasonGames } from "./sampleSeason";
import {
  bookPlayers, gameStats, gamesPlayed, leaders, playerLine, seasonModel, seasonRecord, seasonSlice, splitCell, splitParts,
  teamPeriodLines,
} from "./seasonBook";
import type { StatPeriod } from "./statPeriod";

/* The Season Stats screen and the Season Book read every number through this
   model, so these pin what a coach would check by hand: the season is the
   games added up, a game is its quarters added up, and a quarter never holds
   more than a quarter's worth of clock. */

const games = sampleSeasonGames();
const model = seasonModel(SAMPLE_PROGRAM, games);
const us = SAMPLE_PROGRAM.id;
const QUARTERS: StatPeriod[] = ["q1", "q2", "q3", "q4"];
const line = (gameIndex: number, period: StatPeriod) => teamPeriodLines(gameStats(SAMPLE_PROGRAM, games[gameIndex], period)!, us);

describe("season book model", () => {
  it("adds every game into the season", () => {
    const season = seasonSlice(model, "game")!;
    expect(season.games).toBe(games.length);
    const sides = teamPeriodLines(season, us);
    const sum = (pick: (i: number) => number) => games.reduce((t, _, i) => t + pick(i), 0);
    expect(sides.us.totalYds).toBe(sum(i => line(i, "game").us.totalYds));
    expect(sides.them.totalYds).toBe(sum(i => line(i, "game").them.totalYds));
    expect(sides.us.points).toBe(games.reduce((t, g) => t + g.meta.ourScore, 0));
    expect(sides.them.points).toBe(games.reduce((t, g) => t + g.meta.theirScore, 0));
  });

  it("splits each game's points across its quarters and halves", () => {
    games.forEach((g, i) => {
      const q = QUARTERS.map(p => line(i, p));
      expect(q.reduce((t, l) => t + l.us.points, 0)).toBe(g.meta.ourScore);
      expect(q.reduce((t, l) => t + l.them.points, 0)).toBe(g.meta.theirScore);
      expect(line(i, "h1").us.points + line(i, "h2").us.points).toBe(g.meta.ourScore);
    });
  });

  it("splits yards the same way: the quarters add up to the game", () => {
    games.forEach((_, i) => {
      const total = QUARTERS.reduce((t, p) => t + line(i, p).us.totalYds, 0);
      expect(total).toBe(line(i, "game").us.totalYds);
    });
  });

  it("keeps a quarter's possession inside the quarter", () => {
    // A 3rd-quarter drive that carried into the 4th used to be handed the
    // whole 4th quarter left after it, so Q3 read 17:04 of possession.
    games.forEach((_, i) => {
      for (const p of QUARTERS) {
        const l = line(i, p);
        expect(l.us.topSeconds + l.them.topSeconds).toBeLessThanOrEqual(12 * 60);
      }
      const h2 = line(i, "h2");
      expect(h2.us.topSeconds + h2.them.topSeconds).toBeLessThanOrEqual(24 * 60);
    });
  });

  it("adds a player's quarters up to their game", () => {
    const players = bookPlayers(SAMPLE_PROGRAM, games);
    const back = players.find(p => p.jersey === 21)!;
    games.forEach(g => {
      const whole = playerLine(gameStats(SAMPLE_PROGRAM, g, "game"), back.id).rushing?.net ?? 0;
      const parts = QUARTERS.reduce((t, p) => t + (playerLine(gameStats(SAMPLE_PROGRAM, g, p), back.id).rushing?.net ?? 0), 0);
      expect(parts).toBe(whole);
    });
    const season = playerLine(seasonSlice(model, "game"), back.id).rushing!;
    expect(season.net).toBe(games.reduce((t, g) => t + (playerLine(gameStats(SAMPLE_PROGRAM, g, "game"), back.id).rushing?.net ?? 0), 0));
  });

  it("lists rostered players with a line, by jersey, and counts their games", () => {
    const players = bookPlayers(SAMPLE_PROGRAM, games);
    expect(players.length).toBeGreaterThan(10);
    const jerseys = players.map(p => p.jersey ?? 0);
    expect(jerseys).toEqual([...jerseys].sort((a, b) => a - b));
    expect(players.every(p => p.label.startsWith(`#${p.jersey} `))).toBe(true);
    const qb = players.find(p => p.position === "QB")!;
    expect(gamesPlayed(SAMPLE_PROGRAM, games, qb.id)).toBe(games.length);
  });

  it("names a leader in each category, ours only", () => {
    const ids = new Set(bookPlayers(SAMPLE_PROGRAM, games).map(p => p.id));
    const top = leaders(seasonSlice(model, "game")!, id => ids.has(id));
    expect(top.map(l => l.category)).toEqual(["Rushing", "Passing", "Receiving", "Tackles", "Sacks", "Scoring"]);
    expect(top.every(l => ids.has(l.id))).toBe(true);
  });

  it("keeps the record to final games", () => {
    const rec = seasonRecord(games);
    expect(rec.final).toBe(games.length);
    expect(rec.wins + rec.losses + rec.ties).toBe(games.length);
  });
});

describe("by-quarter cells", () => {
  it("splits the counting line from what scored or took the ball away", () => {
    expect(splitParts.rushing({ att: 11, net: 112, td: 2 } as never)).toEqual(["11-112", "2 TD"]);
    expect(splitParts.passing({ comp: 3, att: 5, yds: 19, td: 0, int: 1 } as never)).toEqual(["3/5-19", "1 INT"]);
    expect(splitParts.defense({ total: 4.5, sacks: 1, int: 0, ff: 1 } as never)).toEqual(["4.5", "1 sk 1 ff"]);
    expect(splitParts.rushing(undefined)).toEqual(["", ""]);
    expect(splitCell.receiving({ rec: 4, yds: 45, td: 1 } as never)).toBe("4-45 1 TD");
  });
});
