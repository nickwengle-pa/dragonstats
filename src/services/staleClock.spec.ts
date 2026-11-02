/**
 * "In games where play timestamps weren't logged on every snap (like Game 1,
 * where multiple plays share the same clock reading), time of possession skews
 * heavily (41:25 PL vs. 6:28 CT)."
 */
import { describe, expect, it } from "vitest";
import type { PlayWithPlayers } from "./gameService";
import { SAMPLE_PROGRAM, sampleSeasonGames } from "./sampleSeason";
import { estimateStaleClocks } from "./staleClock";
import { buildGameReport } from "./gameReport";
import { computeGameStatsBundles, type GameStatsInputs } from "./statsService";

let seq = 0;
const snap = (quarter: number, secs: number, play_type = "rush", flags: Partial<PlayWithPlayers> = {}) => ({
  id: `p${++seq}`, quarter, play_start_time: secs, clock: null, play_type,
  possession: "us", is_touchdown: false, is_turnover: false, is_penalty: false, ...flags,
}) as unknown as PlayWithPlayers;

/** The estimated snap clocks, in seconds, or null when nothing was estimated. */
function clocks(plays: PlayWithPlayers[], completed = true) {
  return estimateStaleClocks(plays, { completed })?.rows.map(p => p.play_start_time) ?? null;
}

describe("estimating a clock that was left alone", () => {
  it("leaves a game whose clock was kept alone", () => {
    expect(clocks([snap(1, 720, "kickoff"), snap(1, 712), snap(1, 680, "pass_inc"), snap(1, 674, "punt"), snap(1, 640)])).toBeNull();
  });

  it("shares the time to the next reading over snaps that ran the clock", () => {
    expect(clocks([snap(1, 600), snap(1, 600), snap(1, 600, "pass_comp"), snap(1, 480)])).toEqual([600, 560, 520, 480]);
  });

  it("gives a play that stopped the clock a few seconds, not a full share", () => {
    // The run before the incompletion took the huddle with it; the incompletion only itself.
    expect(clocks([snap(1, 600), snap(1, 600, "pass_inc"), snap(1, 600), snap(1, 534)])).toEqual([600, 570, 564, 534]);
  });

  it("leaves equal readings alone when nothing between them ran the clock", () => {
    expect(clocks([snap(1, 600, "pass_inc"), snap(1, 600, "pass_inc"), snap(1, 600, "punt"), snap(1, 540)])).toBeNull();
    // A score stops it: the try and kickoff really were snapped on the same time.
    expect(clocks([snap(1, 300, "rush", { is_touchdown: true }), snap(1, 300, "pat"), snap(1, 300, "kickoff"), snap(1, 292)])).toBeNull();
  });

  it("gives a timeout no share", () => {
    expect(clocks([snap(1, 600), snap(1, 600, "timeout"), snap(1, 600), snap(1, 540)])).toEqual([600, 570, 570, 540]);
  });

  it("runs a quarter that is over out to 0:00, and leaves the one still being played", () => {
    const first = [snap(1, 120), snap(1, 120), snap(1, 120)];
    expect(clocks([...first, snap(2, 720, "quarter_change"), snap(2, 700)])).toEqual([120, 80, 40, 720, 700]);
    // A live game's quarter has no end yet...
    expect(clocks([snap(4, 120), snap(4, 120), snap(4, 120)], false)).toBeNull();
    // ...a final one ran out.
    expect(clocks([snap(4, 120), snap(4, 120), snap(4, 120)], true)).toEqual([120, 80, 40]);
  });

  it("counts the snaps it estimated, not the timeouts", () => {
    const estimate = estimateStaleClocks([snap(1, 600), snap(1, 600, "timeout"), snap(1, 600), snap(1, 540)], { completed: true });
    expect(estimate?.snaps.size).toBe(1);
  });
});

/* ── A whole game ────────────────────────────────────────────────────────── */

/** The operator moves the clock only once our offense has run a play: every
 *  snap of their drive, and our first snap after it, keep the old reading.
 *  The shape that read 41:25 to 6:28. */
function clockLeftAloneThroughTheirDrives(plays: PlayWithPlayers[]): PlayWithPlayers[] {
  let last: Pick<PlayWithPlayers, "clock" | "play_start_time"> | null = null;
  let frozen = false;
  let ourSnaps = 0;
  return plays.map(p => {
    if (p.play_type === "quarter_change") { last = null; frozen = false; return p; }
    if (p.possession === "them") { frozen = true; ourSnaps = 0; }
    else if (frozen && ++ourSnaps >= 2) frozen = false;
    if (frozen && last) return { ...p, clock: last.clock, play_start_time: last.play_start_time };
    last = { clock: p.clock, play_start_time: p.play_start_time };
    return p;
  });
}

/** Every snap of one quarter read the clock it started on. */
function quarterLeftAlone(plays: PlayWithPlayers[], quarter: number): PlayWithPlayers[] {
  return plays.map(p => p.play_type !== "quarter_change" && Number(p.quarter) === quarter
    ? { ...p, clock: "12:00", play_start_time: 720 } : p);
}

function possession(inputs: GameStatsInputs, homeIsUs: boolean) {
  const game = computeGameStatsBundles(inputs, SAMPLE_PROGRAM, ["game"])!.get("game")!;
  const { homeTeamStats: home, awayTeamStats: away } = game.summary;
  const [us, them] = homeIsUs ? [home, away] : [away, home];
  return { us: us.timeOfPossessionSeconds, them: them.timeOfPossessionSeconds, estimated: game.clockEstimated };
}

describe("possession time in a game charted with a clock left alone", () => {
  it("comes out close to the real split instead of handing one team the other's drives", () => {
    for (const g of sampleSeasonGames()) {
      const inputs = g.inputs!;
      const truth = possession(inputs, g.meta.isHome);
      const charted = possession({ ...inputs, plays: clockLeftAloneThroughTheirDrives(inputs.plays) }, g.meta.isHome);
      // Taken as entered, these read as much as 47:47 to 0:13.
      expect(Math.abs(charted.us - truth.us), g.meta.opponentName).toBeLessThan(90);
      expect(Math.abs(charted.them - truth.them), g.meta.opponentName).toBeLessThan(90);
      // The game is no longer or shorter for it.
      expect(Math.abs(charted.us + charted.them - (truth.us + truth.them))).toBeLessThan(30);
      expect(charted.estimated).toBe(true);
      expect(truth.estimated).toBe(false);
    }
  });

  it("says so only where it estimated, and keeps the drive starts as entered", () => {
    const [g] = sampleSeasonGames(1);
    const inputs = { ...g.inputs!, plays: quarterLeftAlone(g.inputs!.plays, 2) };
    const bundles = computeGameStatsBundles(inputs, SAMPLE_PROGRAM, ["game", "h1", "h2", "q1", "q2"])!;
    expect(bundles.get("game")!.clockEstimated).toBe(true);
    expect(bundles.get("h1")!.clockEstimated).toBe(true);
    expect(bundles.get("q2")!.clockEstimated).toBe(true);
    expect(bundles.get("q1")!.clockEstimated).toBe(false);
    expect(bundles.get("h2")!.clockEstimated).toBe(false);

    const label = (period: "game" | "q1") => buildGameReport({
      bundle: bundles.get(period)!,
      program: { id: SAMPLE_PROGRAM.id, name: SAMPLE_PROGRAM.name, abbreviation: SAMPLE_PROGRAM.abbreviation, logoUrl: null, color: SAMPLE_PROGRAM.color },
      opponent: { name: g.meta.opponentName, abbreviation: g.meta.opponentAbbr, logoUrl: null, color: g.meta.opponentColor },
      gameDate: g.meta.date, kickoffLabel: null, occasion: null,
      ourScore: g.meta.ourScore, theirScore: g.meta.theirScore, touchbackYardLine: 20,
    }).teamStats.find(r => r.label.startsWith("Possession Time"))!.label;
    expect(label("game")).toBe("Possession Time (estimated)");
    expect(label("q1")).toBe("Possession Time");

    // Every drive begun in the 2nd still starts at 12:00, as charted, but they
    // no longer all last nothing.
    const second = bundles.get("q2")!.summary.drives;
    expect(second.length).toBeGreaterThan(1);
    expect(second.every(d => d.startTime === "12:00")).toBe(true);
    expect(second.filter(d => d.timeOfPossessionSeconds > 0).length).toBeGreaterThan(1);
  });
});
