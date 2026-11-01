import { describe, expect, it } from "vitest";
import { SAMPLE_PROGRAM, sampleSeasonGames } from "./sampleSeason";
import { gameStats } from "./seasonBook";
import { playByPlay } from "./playByPlay";

/* The play-by-play is how a number in the Season Book is traced back to the
   snaps it came from, so it has to number plays as the play log does, keep
   every snap, and agree with the score. */

const [game] = sampleSeasonGames(1);
const stats = gameStats(SAMPLE_PROGRAM, game, "game")!;
const rows = [...stats.bundle.allPlays].sort((a, b) => a.sequence - b.sequence);
const quarters = playByPlay(stats.bundle.allPlays, stats.bundle.summary.drives, stats.bundle.roster, "SD", game.meta.opponentAbbr);
const plays = quarters.flatMap(q => q.drives.flatMap(d => d.plays));

describe("play-by-play", () => {
  it("numbers every play the way the play log does", () => {
    const numberOf = new Map(rows.map((p, i) => [p.id, i + 1]));
    const expected = rows.filter(p => p.play_type !== "quarter_change").map(p => numberOf.get(p.id));
    expect(plays.map(p => p.number).sort((a, b) => a - b)).toEqual(expected);
  });

  it("goes quarter by quarter", () => {
    expect(quarters.map(q => q.title)).toEqual(["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"]);
  });

  it("ends on the final score", () => {
    const last = quarters[quarters.length - 1];
    expect(last.endScore).toBe(`SD ${game.meta.ourScore}, ${game.meta.opponentAbbr} ${game.meta.theirScore}`);
    const scored = plays.filter(p => p.score);
    expect(scored[scored.length - 1].score).toBe(last.endScore);
  });

  it("gives a flag with no snap no yards, and a snap its stat yards", () => {
    const flags = rows.filter(r => r.play_type === "penalty_only");
    expect(flags.length).toBeGreaterThan(0);
    const numberOf = new Map(rows.map((p, i) => [p.id, i + 1]));
    for (const f of flags) expect(plays.find(p => p.number === numberOf.get(f.id))!.gain).toBe("");
    const rush = rows.find(r => r.play_type === "rush" && !r.is_penalty)!;
    const shown = plays.find(p => p.number === numberOf.get(rush.id))!;
    const y = Number(rush.yards_gained);
    expect(shown.gain).toBe(y > 0 ? `+${y}` : String(y));
  });

  it("names our tacklers beside the opponent's snaps", () => {
    expect(plays.some(p => p.credits.startsWith("Tkl #"))).toBe(true);
  });

  it("puts down and distance on snaps only", () => {
    const kick = plays.find(p => p.text.startsWith("Kickoff"))!;
    expect(kick.situation).toBe("");
    expect(plays.some(p => /^1st & 10$/.test(p.situation))).toBe(true);
  });
});
