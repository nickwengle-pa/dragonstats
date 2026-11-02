/**
 * Possession time when the clock was not kept on every snap.
 *
 * The game clock in Dragon Stats is set by hand. When it is left alone, every
 * snap after it carries the same time until the next update, and the engine,
 * which times a drive from its first snap to the next drive's first snap,
 * hands the whole stretch to whichever drive was on the field when the clock
 * was finally moved. A game charted that way read 41:25 to 6:28.
 *
 * So where snaps share one reading even though a play among them ran the
 * clock (a run or a catch, with no flag, score or change of possession), the
 * time from that reading to the next one is shared out over those snaps, and
 * possession is timed off that. Each snap's share is a rough length for the
 * play before the next one: a play that left the clock running takes the
 * huddle and the play clock with it, one that stopped it only its own few
 * seconds, a timeout or a try none. A reading that stayed put because the
 * clock really was stopped (incompletions, flags, scores, turnovers) is left
 * as it is. Nothing stored changes, and the play log and drive starts still
 * show the clock as entered: only time of possession is estimated, and the
 * reports say so.
 */
import type { PlayWithPlayers } from "./gameService";

/** Plays that leave the clock running when nothing else stops it. */
const RUNS_CLOCK = new Set(["rush", "scramble", "kneel", "bad_snap", "fumble", "pass_comp", "sack"]);
/** Rows that take no time off the clock: no snap of their own, or a try,
 *  which is untimed. They take no share of the time. */
const NO_SNAP = new Set(["timeout", "penalty", "penalty_only", "false_start", "encroachment", "pat", "two_pt"]);
/** Rows that are not plays at all. */
const NOT_A_PLAY = new Set(["quarter_change", "score_correction"]);

/** Rough seconds from one snap to the next, by whether the play left the
 *  clock running. Only how they compare matters. */
const RUNNING_GAP = 30;
const STOPPED_GAP = 6;

/** Fewest snaps with an estimated clock before a report calls possession
 *  estimated: one forgotten update is not worth a label. */
export const ESTIMATED_SNAPS = 3;

export interface ClockEstimate {
  /** Every row, in the order given; the estimated ones carry their new clock. */
  rows: PlayWithPlayers[];
  /** The snaps given an estimated clock, by play id. */
  snaps: Set<string>;
}

/** The snap clock in seconds, read the way the engine is given it. */
export function snapSeconds(play: Pick<PlayWithPlayers, "clock" | "play_start_time">): number | null {
  if (play.clock) {
    const m = /^(\d+):(\d{1,2})$/.exec(play.clock.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  const secs = play.play_start_time;
  return typeof secs === "number" && Number.isFinite(secs) && secs >= 0 ? Math.floor(secs) : null;
}

function ranClock(play: PlayWithPlayers): boolean {
  return RUNS_CLOCK.has(play.play_type) && !play.is_touchdown && !play.is_turnover && !play.is_penalty;
}

/** About how long from this row's snap to the next one. */
function gapAfter(play: PlayWithPlayers): number {
  if (NO_SNAP.has(play.play_type)) return 0;
  return ranClock(play) ? RUNNING_GAP : STOPPED_GAP;
}

const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The rows with an estimated clock wherever one was left alone across snaps
 * that ran it, or null when there is nothing to estimate. `completed` says the
 * game is over, so its 4th quarter ran to 0:00 like every quarter before it.
 */
export function estimateStaleClocks(plays: PlayWithPlayers[], opts: { completed: boolean }): ClockEstimate | null {
  const lastQuarter = plays.reduce((q, p) => Math.max(q, Number(p.quarter) || 0), 0);
  const estimates = new Map<string, number>();

  for (let quarter = 1; quarter <= 4; quarter++) {
    const rows = plays.filter(p => Number(p.quarter) === quarter && !NOT_A_PLAY.has(p.play_type) && snapSeconds(p) != null);
    // A quarter that is over ran to 0:00; the one being played has no end yet.
    const over = quarter < lastQuarter || (quarter === 4 && opts.completed);
    for (let i = 0; i < rows.length;) {
      const reading = snapSeconds(rows[i])!;
      let j = i;
      while (j + 1 < rows.length && snapSeconds(rows[j + 1]) === reading) j++;
      const run = rows.slice(i, j + 1);
      const next = j + 1 < rows.length ? snapSeconds(rows[j + 1])! : over ? 0 : null;
      i = j + 1;
      if (run.length < 2 || next == null || next >= reading) continue;
      // Every snap but the last was followed by another on the same time: if
      // none of them ran the clock, it really was stopped.
      if (!run.slice(0, -1).some(ranClock)) continue;
      const gaps = run.map(gapAfter);
      const total = gaps.reduce((s, g) => s + g, 0);
      let before = 0;
      run.forEach((p, k) => {
        if (k > 0) {
          const at = Math.round(reading - ((reading - next) * before) / total);
          if (at !== reading) estimates.set(p.id, at);
        }
        before += gaps[k];
      });
    }
  }

  if (estimates.size === 0) return null;
  const snaps = new Set<string>();
  const rows = plays.map(p => {
    const at = estimates.get(p.id);
    if (at == null) return p;
    if (!NO_SNAP.has(p.play_type)) snaps.add(p.id);
    return { ...p, clock: clockText(at), play_start_time: at };
  });
  return { rows, snaps };
}
