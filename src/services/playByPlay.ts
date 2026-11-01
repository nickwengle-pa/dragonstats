/**
 * A game's play-by-play as a stat sheet prints it: by quarter, by drive,
 * every snap with its down, spot, what happened, who was credited and the
 * yards the stats counted.
 *
 * It exists so a number in the Season Book can be traced to the plays it came
 * from. That is why the yards column is the STAT yardage (withStatYards) and
 * not the stored gain: a 20-yard run behind a holding call reads "+20 · PEN"
 * in the description and +2 in the column, because +2 is what the rushing line
 * counted. A snap wiped out by a flag reads "No play" for the same reason.
 *
 * Plays are numbered in recording order, every row counted, exactly as the
 * game screen's play log numbers them, so "play 103" means the same snap in
 * the book and in the app.
 */

import type { DriveStats } from "football-stats-engine";
import type { PlayWithPlayers } from "./gameService";
import type { RosterPlayer } from "./statsService";
import { drivesByQuarter } from "./drivesByQuarter";
import { nullifiedStats, withStatYards } from "./statAuditRules";
import { scoringEventsForPlay } from "./scoringLedger";
import { playRecordFromRow } from "./playRecordFromRow";
import { distanceLabel, storedGoalToGo } from "./goalToGo";
import { isBadSnap, quarterLabel, taggedCountsInStats, type TaggedPlayer } from "@/components/game/types";

export interface PbpPlay {
  /** Recording order, as the play log numbers it. */
  number: number;
  clock: string;
  /** "1st & 10"; blank for kicks, tries and timeouts. */
  situation: string;
  /** "PL 34", from the team with the ball. */
  spot: string;
  text: string;
  /** Our defensive credits the description leaves out: tacklers, forced
   *  fumbles, breakups, hurries, blocks. */
  credits: string;
  /** Stat yards, "+5" / "-3" / "0"; "No play" when a flag wiped it out;
   *  blank for kicks, tries and timeouts. */
  gain: string;
  flags: string[];
  /** The score after a play that changed it, ours first. */
  score: string | null;
}

export interface PbpDrive {
  /** A real possession, or a kickoff or try line that belongs to none. */
  kind: "drive" | "kick";
  side: "us" | "them";
  abbr: string;
  /** "Drive 3", or "Kickoff" / "Try" on a kick line. */
  label: string;
  /** How the whole drive ended: "Touchdown", "Punt"... */
  result: string | null;
  /** "Start 8:42 · PL 34 · 8 plays · 66 yds · 4:12". */
  summary: string | null;
  continuedFrom: number | null;
  continuesInto: number | null;
  plays: PbpPlay[];
}

export interface PbpQuarter {
  quarter: number;
  title: string;
  drives: PbpDrive[];
  /** Score at the end of the quarter, ours first. */
  endScore: string;
}

const RESULT_TEXT: Record<string, string> = {
  touchdown: "Touchdown",
  field_goal: "Field goal",
  punt: "Punt",
  turnover: "Turnover",
  turnover_on_downs: "Downs",
  end_of_half: "End of half",
  end_of_game: "End of game",
  safety: "Safety",
  missed_field_goal: "Missed FG",
};

/** Rows that are no down: no "1st & 10" beside them. */
const NO_DOWN = new Set(["kickoff", "onside_kick", "pat", "two_pt", "timeout", "quarter_change", "score_correction"]);
/** Rows whose yardage is not a gain from scrimmage. */
const NO_GAIN = new Set([
  "kickoff", "onside_kick", "punt", "fair_catch", "fg", "pat", "two_pt", "timeout",
  "quarter_change", "blocked_kick", "score_correction",
]);

const CREDIT_ROLES: Array<{ roles: string[]; label: string }> = [
  { roles: ["tackler", "assist"], label: "Tkl" },
  { roles: ["recovery_tackler"], label: "Ret tkl" },
  { roles: ["forced_fumble"], label: "FF" },
  { roles: ["defender"], label: "PBU" },
  { roles: ["pass_rusher"], label: "Hurry" },
  { roles: ["blocker"], label: "Blk" },
];

function ordinal(down: number): string {
  return down === 1 ? "1st" : down === 2 ? "2nd" : down === 3 ? "3rd" : `${down}th`;
}

/** "PL 34" for a spot counted from the possessing team's own goal line. */
export function teamSpot(yardLine: number, possession: "us" | "them", usAbbr: string, themAbbr: string): string {
  if (yardLine === 50) return "50";
  const offense = possession === "us" ? usAbbr : themAbbr;
  const defense = possession === "us" ? themAbbr : usAbbr;
  return yardLine < 50 ? `${offense} ${yardLine}` : `${defense} ${100 - yardLine}`;
}

function tagName(tag: TaggedPlayer): string {
  if (tag.isTeam) return "TEAM";
  const surname = tag.name.trim().split(/\s+/).slice(-1)[0] ?? "";
  const number = tag.jersey_number != null ? `#${tag.jersey_number}` : "";
  // An unrostered jersey is NAMED by its number; do not print it twice.
  if (!surname || surname === "?" || surname === number || /^#?\d+$/.test(surname) || tag.isPending) return number || "?";
  return number ? `${number} ${surname}` : surname;
}

function creditsLine(tags: TaggedPlayer[]): string {
  const ours = tags.filter(t => !t.isOpponent && taggedCountsInStats(t));
  const parts: string[] = [];
  for (const { roles, label } of CREDIT_ROLES) {
    const hit = ours.filter(t => roles.includes(t.role));
    if (hit.length === 0) continue;
    parts.push(`${label} ${hit.map(t => `${tagName(t)}${t.credit != null && t.credit !== 1 ? ` (${t.credit === 0.5 ? "½" : t.credit})` : ""}`).join(", ")}`);
  }
  return parts.join(" · ");
}

/** The clock at the snap. The text column is honoured first; most rows keep
 *  it as seconds in play_start_time instead (see playTransformer's snapClock). */
function snapClock(play: PlayWithPlayers): string {
  if (play.clock) return play.clock;
  const secs = play.play_start_time;
  if (typeof secs !== "number" || !Number.isFinite(secs) || secs < 0) return "";
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
}

/** Rows that are only a flag: there was never a snap to wipe out. */
const FLAG_ONLY = new Set(["penalty_only", "false_start", "encroachment", "penalty"]);

function gainText(play: PlayWithPlayers): string {
  if (NO_GAIN.has(play.play_type) || FLAG_ONLY.has(play.play_type)) return "";
  if (nullifiedStats(play)) return "No play";
  const y = Number(withStatYards(play).yards_gained ?? 0);
  return y > 0 ? `+${y}` : String(y);
}

function flagsFor(play: PlayWithPlayers): string[] {
  const flags: string[] = [];
  if (play.is_touchdown) flags.push("TD");
  if (play.is_turnover || play.play_type === "int") flags.push("TO");
  if (play.is_penalty) flags.push("PEN");
  if (isBadSnap(play.play_type, play.play_data)) flags.push("BS");
  return flags;
}

/**
 * The whole game, quarter by quarter. `plays` is every row of the game in
 * recording order and `drives` the engine's drives for the whole game.
 */
export function playByPlay(
  plays: PlayWithPlayers[],
  drives: DriveStats[],
  roster: RosterPlayer[],
  usAbbr: string,
  themAbbr: string,
): PbpQuarter[] {
  const sorted = [...plays].sort((a, b) => a.sequence - b.sequence);
  const numberOf = new Map(sorted.map((p, i) => [p.id, i + 1]));

  // Running score, play by play, from the one scoring ledger.
  const scoreAfter = new Map<string, string>();
  const score = { us: 0, them: 0 };
  const scoreText = () => `${usAbbr} ${score.us}, ${themAbbr} ${score.them}`;
  const endOfQuarter = new Map<number, string>();
  for (const p of sorted) {
    const events = scoringEventsForPlay({
      quarter: p.quarter,
      type: p.play_type,
      possession: p.possession === "them" ? "them" : "us",
      isTouchdown: Boolean(p.is_touchdown),
      turnover: Boolean(p.is_turnover),
      result: String(p.play_data?.result ?? ""),
      playData: p.play_data ?? null,
      ballOn: p.yard_line ?? undefined,
    });
    if (events.length) {
      for (const e of events) score[e.side] += e.points;
      scoreAfter.set(p.id, scoreText());
    }
    endOfQuarter.set(Number(p.quarter) || 1, scoreText());
  }

  const names = new Map(roster.map(r => [r.player_id, `${r.first_name} ${r.last_name}`.trim()]));
  const jerseys = new Map(roster.map(r => [r.player_id, r.jersey_number]));
  const toPlay = (p: PlayWithPlayers): PbpPlay => {
    const record = playRecordFromRow(p, { names, jerseys });
    const side = p.possession === "them" ? "them" : "us";
    const snap = !NO_DOWN.has(p.play_type) && (p.down ?? 0) >= 1;
    return {
      number: numberOf.get(p.id) ?? 0,
      clock: snapClock(p),
      situation: snap
        ? `${ordinal(p.down)} & ${distanceLabel({ ballOn: p.yard_line ?? 0, distance: p.distance ?? 10, goalToGo: storedGoalToGo(p.play_data) }).replace(/^G$/, "Goal")}`
        : "",
      spot: p.play_type === "timeout" ? "" : teamSpot(p.yard_line ?? 0, side, usAbbr, themAbbr),
      text: (p.description ?? "").trim() || p.play_type.replace(/_/g, " "),
      credits: creditsLine(record.tagged ?? []),
      gain: gainText(p),
      flags: flagsFor(p),
      score: scoreAfter.get(p.id) ?? null,
    };
  };

  const quarters: PbpQuarter[] = [];
  const byQuarter = drivesByQuarter(sorted, drives);
  for (const quarter of [...byQuarter.keys()].sort((a, b) => a - b)) {
    const out: PbpDrive[] = [];
    for (const d of byQuarter.get(quarter) ?? []) {
      const abbr = d.possession === "us" ? usAbbr : themAbbr;
      const s = d.stats;
      if (d.kickoffOnly) {
        const kickoff = d.plays.some(p => p.play_type === "kickoff" || p.play_type === "onside_kick");
        out.push({
          kind: "kick", side: d.possession, abbr, label: kickoff ? "Kickoff" : "Try",
          result: null, summary: null, continuedFrom: null, continuesInto: null,
          plays: d.plays.map(toPlay),
        });
        continue;
      }
      const ended = s && !d.ongoing ? RESULT_TEXT[s.result] ?? String(s.result) : null;
      out.push({
        kind: "drive", side: d.possession, abbr, label: `Drive ${d.label}`,
        result: ended,
        summary: s && s.plays > 0
          ? `Start Q${s.startQuarter > 4 ? "OT" : s.startQuarter} ${s.startTime} · ${teamSpot(s.startYardLine, d.possession, usAbbr, themAbbr)} · ${s.plays} play${s.plays === 1 ? "" : "s"} · ${s.yards} yd${Math.abs(s.yards) === 1 ? "" : "s"} · ${s.timeOfPossession}`
          : null,
        continuedFrom: d.continuedFrom,
        continuesInto: d.continuesInto,
        plays: d.plays.map(toPlay),
      });
    }
    quarters.push({
      quarter,
      title: quarter > 4 ? (quarter === 5 ? "Overtime" : `Overtime ${quarter - 4}`) : `${quarterLabel(quarter)} Quarter`,
      drives: out,
      endScore: endOfQuarter.get(quarter) ?? `${usAbbr} 0, ${themAbbr} 0`,
    });
  }
  return quarters;
}
