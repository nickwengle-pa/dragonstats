/**
 * Printed game report.
 *
 * Builds the numbers for a full stat sheet — scoring summary, points by player,
 * individual offense/kicking/return lines, a two-column team comparison and a
 * defensive table — in the shape a coach expects to read on paper.
 *
 * Everything here derives from plays that are already stored, so a game charted
 * months ago reports exactly as one charted tonight. Nothing is written, nothing
 * is cached, and no column depends on a field added after the fact: where a
 * number was never captured it comes out zero rather than blank, which is what
 * the paper version does too.
 *
 * The engine is the source of truth wherever it has an answer. This file only
 * derives what the engine does not model:
 *   - rushing gain/loss   (it keeps a net only)
 *   - interception return long
 *   - blocked kicks credited to a defender
 *   - points by player
 *   - the scoring narrative, so conversions fold into the touchdown line
 */

import type {
  GameSummary, TeamStats,
  PassingStats, RushingStats, ReceivingStats,
  DefensiveStats, KickingStats, PuntingStats, ReturnStats,
} from "football-stats-engine";
import type { GameStatsBundle } from "./statsService";
import type { PlayWithPlayers } from "./gameService";
import { netKickYards, resolveKickSpots } from "./kickSpots";
import { TEAM_JERSEY, TEAM_PLAYER_ID } from "@/components/game/types";

/* ── Play-type groupings ──────────────────────────────────────────────────── */

/** Play types the engine counts as a rushing attempt. Kept in step with
 *  playTransformer — a type here that it does not treat as a rush would make
 *  gain/loss disagree with the net beside it. */
const RUSH_TYPES = new Set(["rush", "scramble", "kneel"]);

/** Roles that can be the one who reached the end zone, most specific first.
 *  A fumble return TD has both a rusher (who lost it) and a recoverer (who
 *  scored), and only the second of those put points on the board. */
const SCORER_ROLES = [
  "fumble_recovery", "recoverer", "interceptor", "returner", "receiver", "rusher", "passer",
];

/* ── Public shape ─────────────────────────────────────────────────────────── */

export interface ReportTeamSide {
  name: string;
  abbr: string;
  logoUrl: string | null;
  color: string;
}

export interface ScoringRow {
  quarter: number;
  clock: string;
  /** Abbreviation of whoever scored. */
  team: string;
  isUs: boolean;
  /** "#21 Victor Bartlebaugh run for 58 yds to the UV End Zone. Touchdown!" */
  play: string;
  /** Conversion, already parenthesised: "(Kick Failed)". Empty when none. */
  conversion: string;
  /** Running score, THEIR score first, matching the sheet's "U-P" column. */
  score: string;
}

export interface PointsRow { name: string; points: number }

export interface RushingRow {
  name: string; att: number; gain: number; loss: number;
  net: number; td: number; long: number; avg: number; fum: number;
}
export interface PassingRow {
  name: string; att: number; comp: number; int: number;
  yds: number; long: number; sack: number; td: number;
}
export interface ReceivingRow { name: string; rec: number; yds: number; td: number; long: number }
export interface PuntingRow {
  name: string; att: number; yds: number; avg: number; long: number; inside20: number; tb: number;
}
export interface ReturnRow {
  name: string;
  ko: { no: number; yds: number; long: number };
  punt: { no: number; yds: number; long: number };
  int: { no: number; yds: number; long: number };
}
export interface KickoffRow { name: string; no: number; yds: number; avg: number; tb: number }
export interface DefensiveRow {
  jersey: number | null; name: string;
  solo: number; ast: number; total: number;
  sacks: number; sackYds: number;
  tfl: number; tflYds: number;
  ff: number; fr: number; frYds: number;
  int: number; intYds: number;
  brUp: number; blocks: number; qbh: number;
}

export interface TeamStatRow {
  label: string;
  us: string;
  them: string;
  /** Section heads and the sub-rows beneath FIRST DOWNS read differently. */
  emphasis?: "head" | "sub";
}

export interface GameReport {
  dateLabel: string;
  /** Whatever the game was called, e.g. "SENIOR NIGHT". Null when unset. */
  occasion: string | null;
  kickoffLabel: string | null;
  title: string;
  us: ReportTeamSide;
  them: ReportTeamSide;
  /** Column heads for the line score, "1".."4" plus OT when it went there. */
  quarters: string[];
  lineScore: { us: number[]; them: number[]; usTotal: number; themTotal: number };
  scoring: ScoringRow[];
  points: PointsRow[];
  pointsTotal: number;
  rushing: RushingRow[]; rushingTotal: RushingRow;
  passing: PassingRow[]; passingTotal: PassingRow;
  receiving: ReceivingRow[]; receivingTotal: ReceivingRow;
  punting: PuntingRow[]; puntingTotal: PuntingRow;
  returns: ReturnRow[]; returnsTotal: ReturnRow;
  kickoffs: KickoffRow[]; kickoffsTotal: KickoffRow;
  onsideRecovered: number;
  teamStats: TeamStatRow[];
  defense: DefensiveRow[]; defenseTotal: DefensiveRow;
}

/* ── Small helpers ────────────────────────────────────────────────────────── */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** One decimal, and never "-0.0". */
const avg = (total: number, count: number): number =>
  count > 0 ? Math.round((total / count) * 10) / 10 + 0 : 0;

const dash = (a: number, b: number) => `${a}-${b}`;

/** Jersey-prefixed where we know the number: "#21 Victor Bartlebaugh". */
function labelFor(
  tag: { id: string; name: string; jersey: number | null },
  jerseys: Map<string, number | null>,
): string {
  const jersey = jerseys.get(tag.id) ?? tag.jersey;
  return jersey != null ? `#${jersey} ${tag.name}`.trim() : tag.name;
}

/** Sort our players' stat records, biggest line first, blanks dropped. */
function ourRows<T>(
  records: Record<string, T>,
  ours: Set<string>,
  include: (s: T) => boolean,
  weight: (s: T) => number,
): Array<[string, T]> {
  return Object.entries(records)
    .filter(([id, s]) => ours.has(id) && include(s))
    .sort((a, b) => weight(b[1]) - weight(a[1]));
}

/**
 * The tag on a play holding one of these roles, ours or theirs.
 *
 * Opponent and unrostered players have no players row and therefore no
 * play_players row - they ride in play_data instead (see the tags-that-cannot-
 * be-foreign-keys note in CLAUDE.md). Both are checked, ours first, or the
 * opponent's kicker on a recorded PAT would come back empty and the scoring
 * line would say "(Kick Good)" for a man whose number we actually have.
 */
function tagWithRole(
  play: PlayWithPlayers,
  roles: string[],
): { id: string; name: string; jersey: number | null } | null {
  const loose = [
    ...(Array.isArray(play.play_data?.opp_tagged) ? play.play_data.opp_tagged : []),
    ...(Array.isArray(play.play_data?.pending_tagged) ? play.play_data.pending_tagged : []),
  ] as Array<{ id?: string; name?: string; role?: string; jersey_number?: number | null }>;

  for (const role of roles) {
    const pp = play.play_players?.find(p => p.role === role);
    if (pp) {
      const p = (pp as { player?: { first_name: string; last_name: string } }).player;
      return {
        id: pp.player_id,
        name: p ? `${p.first_name} ${p.last_name}`.trim() : "",
        jersey: null,
      };
    }
    const tag = loose.find(t => t.role === role);
    // A TEAM placeholder is "we could not see who", which is no name at all.
    if (tag && tag.id !== "opp_team") {
      return {
        id: String(tag.id ?? ""),
        name: String(tag.name ?? "").trim(),
        jersey: tag.jersey_number ?? null,
      };
    }
  }
  return null;
}

/* ── Scoring narrative ────────────────────────────────────────────────────── */

/** "run", "pass from #7 Smith", "kickoff return"... — how it was scored. */
function scoringVerb(play: PlayWithPlayers, jerseys: Map<string, number | null>): string {
  switch (play.play_type) {
    case "rush":
    case "kneel":
      return "run";
    case "scramble":
      return "run";
    case "pass_comp": {
      const passer = tagWithRole(play, ["passer"]);
      return passer && passer.name
        ? `pass from ${labelFor(passer, jerseys)}`
        : "pass";
    }
    case "kickoff":
    case "onside_kick":
      return "kickoff return";
    case "punt":
    case "fair_catch":
      return "punt return";
    case "int":
      return "interception return";
    case "fumble":
      return "fumble return";
    case "blocked_kick":
      return "blocked kick return";
    default:
      return "run";
  }
}

/**
 * The conversion that followed a touchdown, in the parentheses the sheet uses.
 *
 * A PAT and a two-point try are separate plays in the log but belong on the
 * touchdown's line, exactly as they read on a printed summary. A try that was
 * never recorded says nothing rather than guessing it failed.
 */
function conversionText(
  play: PlayWithPlayers | undefined,
  jerseys: Map<string, number | null>,
): string {
  if (!play) return "";
  const good = String(play.play_data?.result ?? "") === "Good";
  if (play.play_type === "pat") {
    if (!good) return "(Kick Failed)";
    const kicker = tagWithRole(play, ["kicker"]);
    return kicker && kicker.name
      ? `(${labelFor(kicker, jerseys)} kick)`
      : "(Kick Good)";
  }
  if (play.play_type === "two_pt") {
    const scorer = tagWithRole(play, SCORER_ROLES);
    // Which roles were tagged says how it was run: a two-point rush has a
    // rusher and no receiver. No stored flag to consult.
    const how = play.play_players?.some(p => p.role === "rusher") ? "run" : "pass";
    if (!good) return "(Conversion Failed)";
    return scorer && scorer.name
      ? `(${labelFor(scorer, jerseys)} ${how})`
      : "(Conversion Good)";
  }
  return "";
}

/* ── The build ────────────────────────────────────────────────────────────── */

export interface BuildReportInput {
  bundle: GameStatsBundle;
  program: { id: string; name: string; abbreviation: string; logoUrl: string | null; color: string };
  opponent: { name: string; abbreviation: string; logoUrl: string | null; color: string };
  gameDate: string | null;
  kickoffLabel: string | null;
  occasion: string | null;
  ourScore: number;
  theirScore: number;
  /** Where a touchback spots the ball, from the program's rules. Net kicking
   *  yardage measures to it, so a program playing a 25 would have had every
   *  net figure off by five. */
  touchbackYardLine: number;
}

export function buildGameReport(input: BuildReportInput): GameReport {
  const { bundle, program, opponent } = input;
  const { summary, plays, roster } = bundle;

  const jerseys = new Map<string, number | null>();
  const names = new Map<string, string>();
  for (const r of roster) {
    jerseys.set(r.player_id, r.jersey_number);
    names.set(r.player_id, `${r.first_name} ${r.last_name}`.trim());
  }
  /* Unrostered jerseys are our players too - a number seen on the field that
     nobody had added to the roster yet. They carry their own number. */
  for (const play of plays) {
    for (const raw of (Array.isArray(play.play_data?.pending_tagged)
      ? play.play_data.pending_tagged
      : []) as Array<{ id?: string; jersey_number?: number | null }>) {
      if (!raw.id || names.has(String(raw.id))) continue;
      jerseys.set(String(raw.id), raw.jersey_number ?? null);
      names.set(String(raw.id), `#${raw.jersey_number ?? "?"} (unrostered)`);
    }
  }
  /* TEAM is one of ours for reporting purposes: it holds stats our players
     earned that nobody got a number on. Leaving it out of this set was why a
     team-credited tackle appeared nowhere on the sheet - not under a name, and
     not in the totals either. */
  jerseys.set(TEAM_PLAYER_ID, TEAM_JERSEY);
  names.set(TEAM_PLAYER_ID, "TEAM");
  const ours = new Set([...roster.map(r => r.player_id), TEAM_PLAYER_ID]);

  const usTeam: TeamStats = summary.homeTeamStats.teamId === program.id
    ? summary.homeTeamStats
    : summary.awayTeamStats;
  const themTeam: TeamStats = usTeam === summary.homeTeamStats
    ? summary.awayTeamStats
    : summary.homeTeamStats;

  /* ── Line score ───────────────────────────────────────────────────────── */
  const usQ: Record<number, number> = {};
  const themQ: Record<number, number> = {};
  let sawOT = false;
  for (const sp of summary.scoringPlays) {
    const q = Number(sp.quarter);
    if (q > 4) sawOT = true;
    const bucket = sp.team === program.id ? usQ : themQ;
    bucket[q] = (bucket[q] ?? 0) + sp.pointsScored;
  }
  const quarters = sawOT ? ["1", "2", "3", "4", "OT"] : ["1", "2", "3", "4"];
  const perQuarter = (bucket: Record<number, number>) =>
    quarters.map((col, i) => col === "OT"
      ? Object.entries(bucket).filter(([q]) => Number(q) > 4).reduce((s, [, v]) => s + v, 0)
      : bucket[i + 1] ?? 0);

  /* ── Scoring summary ──────────────────────────────────────────────────── */
  const scoring: ScoringRow[] = [];
  let runningUs = 0;
  let runningThem = 0;
  plays.forEach((play, idx) => {
    const isUs = play.possession === "us";
    // A return touchdown is scored by the team that did NOT have the ball.
    // A kick that always changes hands is one case; every other case is just
    // the turnover flag, which is what separates an onside kick the kicking
    // team recovered and ran in from one the receivers took back.
    const kickChangesHands = ["kickoff", "punt", "fair_catch"].includes(play.play_type);
    const returnScore = kickChangesHands || play.is_turnover;
    const scoredByUs = play.is_touchdown && returnScore ? !isUs : isUs;

    if (play.is_touchdown) {
      // The try is the next non-timeout play, and only if it IS a try.
      const next = plays.slice(idx + 1).find(p => p.play_type !== "timeout");
      const tryPlay = next && ["pat", "two_pt"].includes(next.play_type) ? next : undefined;
      const conversionPoints = tryPlay && String(tryPlay.play_data?.result ?? "") === "Good"
        ? (tryPlay.play_type === "pat" ? 1 : 2)
        : 0;
      if (scoredByUs) runningUs += 6 + conversionPoints;
      else runningThem += 6 + conversionPoints;

      const scorer = tagWithRole(play, SCORER_ROLES);
      const who = scorer && scorer.name
        ? labelFor(scorer, jerseys)
        : (scoredByUs ? program.abbreviation : opponent.abbreviation);
      const endZone = scoredByUs ? opponent.abbreviation : program.abbreviation;
      scoring.push({
        quarter: play.quarter,
        clock: play.clock ?? "",
        team: scoredByUs ? program.abbreviation : opponent.abbreviation,
        isUs: scoredByUs,
        play: `${who} ${scoringVerb(play, jerseys)} for ${play.yards_gained} yds to the ${endZone} End Zone. Touchdown!`,
        conversion: conversionText(tryPlay, jerseys),
        score: `${runningThem}-${runningUs}`,
      });
      return;
    }

    // Field goals and safeties stand on their own line; tries never do,
    // they were folded into the touchdown above.
    if (play.play_type === "fg" && String(play.play_data?.result ?? "") === "Good") {
      if (isUs) runningUs += 3; else runningThem += 3;
      const kicker = tagWithRole(play, ["kicker"]);
      const who = kicker && kicker.name
        ? labelFor(kicker, jerseys)
        : (isUs ? program.abbreviation : opponent.abbreviation);
      scoring.push({
        quarter: play.quarter, clock: play.clock ?? "",
        team: isUs ? program.abbreviation : opponent.abbreviation,
        isUs,
        play: `${who} field goal. Good!`,
        conversion: "",
        score: `${runningThem}-${runningUs}`,
      });
      return;
    }
    if (play.play_type === "safety") {
      // A safety scores for the defending team.
      if (isUs) runningThem += 2; else runningUs += 2;
      scoring.push({
        quarter: play.quarter, clock: play.clock ?? "",
        team: isUs ? opponent.abbreviation : program.abbreviation,
        isUs: !isUs,
        play: "Safety.",
        conversion: "",
        score: `${runningThem}-${runningUs}`,
      });
    }
  });

  /* ── Points by player (ours) ──────────────────────────────────────────── */
  const pointsById = new Map<string, number>();
  const addPoints = (id: string | undefined, pts: number) => {
    if (!id || !ours.has(id)) return;
    pointsById.set(id, (pointsById.get(id) ?? 0) + pts);
  };
  for (const play of plays) {
    if (play.is_touchdown) {
      const scorer = tagWithRole(play, SCORER_ROLES);
      addPoints(scorer?.id, 6);
      continue;
    }
    const good = String(play.play_data?.result ?? "") === "Good";
    if (play.play_type === "pat" && good) addPoints(tagWithRole(play, ["kicker"])?.id, 1);
    if (play.play_type === "fg" && good) addPoints(tagWithRole(play, ["kicker"])?.id, 3);
    if (play.play_type === "two_pt" && good) addPoints(tagWithRole(play, SCORER_ROLES)?.id, 2);
  }
  const points: PointsRow[] = [...pointsById.entries()]
    .map(([id, pts]) => ({ name: names.get(id) ?? "", points: pts }))
    .filter(r => r.points > 0)
    .sort((a, b) => b.points - a.points);
  const pointsTotal = points.reduce((s, r) => s + r.points, 0);

  /* ── Rushing, with the gain/loss split the engine does not keep ───────── */
  const rushGainById = new Map<string, number>();
  for (const play of plays) {
    if (play.possession !== "us") continue;
    if (!RUSH_TYPES.has(play.play_type) && play.play_type !== "fumble") continue;
    const rusher = tagWithRole(play, ["rusher"]);
    if (!rusher || !ours.has(rusher.id)) continue;
    const y = num(play.yards_gained);
    if (y > 0) rushGainById.set(rusher.id, (rushGainById.get(rusher.id) ?? 0) + y);
  }

  const rushing: RushingRow[] = ourRows<RushingStats>(
    summary.rushing, ours, s => s.carries > 0, s => s.yards,
  ).map(([id, s]) => {
    // Loss is derived from the net rather than summed separately, so gain and
    // loss always add back to the net printed beside them and to the team
    // rushing total, whatever the engine chose to count as a carry.
    const gain = rushGainById.get(id) ?? Math.max(0, s.yards);
    return {
      name: names.get(id) ?? s.playerName,
      att: s.carries,
      gain,
      loss: s.yards - gain,
      net: s.yards,
      td: s.touchdowns,
      long: s.longRush ?? 0,
      avg: avg(s.yards, s.carries),
      fum: s.fumbles ?? 0,
    };
  });
  const rushingTotal: RushingRow = rushing.reduce((t, r) => ({
    name: "Total",
    att: t.att + r.att, gain: t.gain + r.gain, loss: t.loss + r.loss,
    net: t.net + r.net, td: t.td + r.td, long: Math.max(t.long, r.long),
    avg: 0, fum: t.fum + r.fum,
  }), { name: "Total", att: 0, gain: 0, loss: 0, net: 0, td: 0, long: 0, avg: 0, fum: 0 });
  rushingTotal.avg = avg(rushingTotal.net, rushingTotal.att);

  /* ── Passing ──────────────────────────────────────────────────────────── */
  const passing: PassingRow[] = ourRows<PassingStats>(
    summary.passing, ours, s => s.attempts > 0, s => s.yards,
  ).map(([id, s]) => ({
    name: names.get(id) ?? s.playerName,
    att: s.attempts, comp: s.completions, int: s.interceptions,
    yds: s.yards, long: s.longPass ?? 0, sack: s.sacks ?? 0, td: s.touchdowns,
  }));
  const passingTotal: PassingRow = passing.reduce((t, r) => ({
    name: "Total",
    att: t.att + r.att, comp: t.comp + r.comp, int: t.int + r.int,
    yds: t.yds + r.yds, long: Math.max(t.long, r.long),
    sack: t.sack + r.sack, td: t.td + r.td,
  }), { name: "Total", att: 0, comp: 0, int: 0, yds: 0, long: 0, sack: 0, td: 0 });

  /* ── Receiving ────────────────────────────────────────────────────────── */
  const receiving: ReceivingRow[] = ourRows<ReceivingStats>(
    summary.receiving, ours, s => s.receptions > 0, s => s.yards,
  ).map(([id, s]) => ({
    name: names.get(id) ?? s.playerName,
    rec: s.receptions, yds: s.yards, td: s.touchdowns, long: s.longReception ?? 0,
  }));
  const receivingTotal: ReceivingRow = receiving.reduce((t, r) => ({
    name: "Total", rec: t.rec + r.rec, yds: t.yds + r.yds,
    td: t.td + r.td, long: Math.max(t.long, r.long),
  }), { name: "Total", rec: 0, yds: 0, td: 0, long: 0 });

  /* ── Punting ──────────────────────────────────────────────────────────── */
  const punting: PuntingRow[] = ourRows<PuntingStats>(
    summary.punting, ours, s => s.punts > 0, s => s.puntYards,
  ).map(([id, s]) => ({
    name: names.get(id) ?? s.playerName,
    att: s.punts, yds: s.puntYards, avg: avg(s.puntYards, s.punts),
    long: s.puntLong ?? 0, inside20: s.puntsInside20 ?? 0, tb: s.touchbacks ?? 0,
  }));
  const puntingTotal: PuntingRow = punting.reduce((t, r) => ({
    name: "Total", att: t.att + r.att, yds: t.yds + r.yds, avg: 0,
    long: Math.max(t.long, r.long), inside20: t.inside20 + r.inside20, tb: t.tb + r.tb,
  }), { name: "Total", att: 0, yds: 0, avg: 0, long: 0, inside20: 0, tb: 0 });
  puntingTotal.avg = avg(puntingTotal.yds, puntingTotal.att);

  /* ── Returns, including the interception column the engine files under
        defense and the long it does not keep at all ────────────────────── */
  const intReturnByPlayer = new Map<string, { yds: number; long: number; no: number }>();
  for (const play of plays) {
    if (play.play_type !== "int") continue;
    const pick = tagWithRole(play, ["interceptor"]);
    if (!pick || !ours.has(pick.id)) continue;
    /* Same fallback playTransformer uses. Without it a pick recorded before
       the return spot was stored reads 0 here while the defensive table -
       which comes from the engine, which does fall back - shows the real
       number, so one sheet contradicted itself. */
    const stored = play.play_data?.interception_return_yards;
    const yds = typeof stored === "number"
      ? stored
      : Math.max(0, num(play.yards_gained));
    const cur = intReturnByPlayer.get(pick.id) ?? { yds: 0, long: 0, no: 0 };
    intReturnByPlayer.set(pick.id, {
      yds: cur.yds + yds,
      long: Math.max(cur.long, yds),
      no: cur.no + 1,
    });
  }

  const returnIds = new Set<string>([
    ...Object.keys(summary.returns).filter(id => ours.has(id)),
    ...intReturnByPlayer.keys(),
  ]);
  const returns: ReturnRow[] = [...returnIds]
    .map(id => {
      const r: ReturnStats | undefined = summary.returns[id];
      const pick = intReturnByPlayer.get(id) ?? { yds: 0, long: 0, no: 0 };
      return {
        name: names.get(id) ?? r?.playerName ?? "",
        ko: {
          no: r?.kickReturns ?? 0,
          yds: r?.kickReturnYards ?? 0,
          long: r?.kickReturnLong ?? 0,
        },
        punt: {
          no: r?.puntReturns ?? 0,
          yds: r?.puntReturnYards ?? 0,
          long: r?.puntReturnLong ?? 0,
        },
        int: { no: pick.no, yds: pick.yds, long: pick.long },
      };
    })
    .filter(r => r.ko.no > 0 || r.punt.no > 0 || r.int.no > 0)
    .sort((a, b) =>
      (b.ko.yds + b.punt.yds + b.int.yds) - (a.ko.yds + a.punt.yds + a.int.yds));
  const returnsTotal: ReturnRow = returns.reduce((t, r) => ({
    name: "Total",
    ko: { no: t.ko.no + r.ko.no, yds: t.ko.yds + r.ko.yds, long: Math.max(t.ko.long, r.ko.long) },
    punt: { no: t.punt.no + r.punt.no, yds: t.punt.yds + r.punt.yds, long: Math.max(t.punt.long, r.punt.long) },
    int: { no: t.int.no + r.int.no, yds: t.int.yds + r.int.yds, long: Math.max(t.int.long, r.int.long) },
  }), {
    name: "Total",
    ko: { no: 0, yds: 0, long: 0 },
    punt: { no: 0, yds: 0, long: 0 },
    int: { no: 0, yds: 0, long: 0 },
  });

  /* ── Kickoffs ─────────────────────────────────────────────────────────── */
  const kickoffs: KickoffRow[] = ourRows<KickingStats>(
    summary.kicking, ours, s => s.kickoffs > 0, s => s.kickoffs,
  ).map(([id, s]) => ({
    name: names.get(id) ?? s.playerName,
    no: s.kickoffs,
    yds: Math.round((s.averageKickoffDistance ?? 0) * s.kickoffs),
    avg: Math.round((s.averageKickoffDistance ?? 0) * 10) / 10,
    tb: s.kickoffTouchbacks ?? 0,
  }));
  const kickoffsTotal: KickoffRow = kickoffs.reduce((t, r) => ({
    name: "Total", no: t.no + r.no, yds: t.yds + r.yds, avg: 0, tb: t.tb + r.tb,
  }), { name: "Total", no: 0, yds: 0, avg: 0, tb: 0 });
  kickoffsTotal.avg = avg(kickoffsTotal.yds, kickoffsTotal.no);
  const onsideRecovered = Object.entries(summary.kicking)
    .filter(([id]) => ours.has(id))
    .reduce((s, [, k]) => s + (k.onsideKickRecoveries ?? 0), 0);

  /* ── Defense, plus what the engine does not model ─────────────────────── */
  /* Yards lost on a tackle for loss. The engine keeps a TFL count and no
     yardage, so the report was printing the count in the yards column and
     reading "2-2" for two stops that lost eleven. Summed off the plays: a
     tackle on a play that lost ground is in for the yards it lost, shared or
     not, which is how the count is credited too. */
  const tflYardsById = new Map<string, number>();
  for (const play of plays) {
    const lost = num(play.yards_gained);
    if (lost >= 0) continue;
    if (!["rush", "pass_comp", "scramble", "sack"].includes(play.play_type)) continue;
    for (const pp of play.play_players ?? []) {
      if (pp.role !== "tackler" && pp.role !== "sacker") continue;
      if (!ours.has(pp.player_id)) continue;
      tflYardsById.set(pp.player_id, (tflYardsById.get(pp.player_id) ?? 0) + Math.abs(lost));
    }
  }

  const blocksById = new Map<string, number>();
  for (const play of plays) {
    if (play.play_type !== "blocked_kick") continue;
    const blocker = tagWithRole(play, ["blocker"]);
    if (!blocker || !ours.has(blocker.id)) continue;
    blocksById.set(blocker.id, (blocksById.get(blocker.id) ?? 0) + 1);
  }

  const defense: DefensiveRow[] = ourRows<DefensiveStats>(
    summary.defense, ours,
    s => s.totalTackles > 0 || s.sacks > 0 || s.interceptions > 0
      || s.passesDefended > 0 || s.forcedFumbles > 0 || s.fumbleRecoveries > 0,
    s => s.totalTackles * 10 + s.sacks + s.interceptions,
  ).map(([id, s]) => ({
    jersey: jerseys.get(id) ?? null,
    name: names.get(id) ?? s.playerName,
    solo: s.soloTackles, ast: s.assistedTackles, total: s.totalTackles,
    sacks: s.sacks, sackYds: s.sackYards,
    tfl: s.tacklesForLoss, tflYds: tflYardsById.get(id) ?? 0,
    ff: s.forcedFumbles, fr: s.fumbleRecoveries, frYds: s.fumbleRecoveryYards,
    int: s.interceptions, intYds: s.interceptionYards,
    brUp: s.passesDefended, blocks: blocksById.get(id) ?? 0, qbh: s.qbHits,
  }));
  const defenseTotal: DefensiveRow = defense.reduce((t, r) => ({
    jersey: null, name: "Total",
    solo: t.solo + r.solo, ast: t.ast + r.ast, total: t.total + r.total,
    sacks: t.sacks + r.sacks, sackYds: t.sackYds + r.sackYds,
    tfl: t.tfl + r.tfl, tflYds: t.tflYds + r.tflYds,
    ff: t.ff + r.ff, fr: t.fr + r.fr, frYds: t.frYds + r.frYds,
    int: t.int + r.int, intYds: t.intYds + r.intYds,
    brUp: t.brUp + r.brUp, blocks: t.blocks + r.blocks, qbh: t.qbh + r.qbh,
  }), {
    jersey: null, name: "Total", solo: 0, ast: 0, total: 0, sacks: 0, sackYds: 0,
    tfl: 0, tflYds: 0, ff: 0, fr: 0, frYds: 0, int: 0, intYds: 0,
    brUp: 0, blocks: 0, qbh: 0,
  });

  /* ── Their side, from the same plays ──────────────────────────────────────
     The engine files punting, kicking and returns per player, and opponent
     players are tagged loosely or not at all, so their totals are the
     complement of ours rather than a lookup. Touchdown counts by type are not
     modelled per team at all and come straight off the plays. */
  const sumTheirs = <T>(records: Record<string, T>, pick: (s: T) => number): number =>
    Object.entries(records)
      .filter(([id]) => !ours.has(id))
      .reduce((s, [, v]) => s + (pick(v) || 0), 0);

  const countPlays = (
    side: "us" | "them",
    match: (p: PlayWithPlayers) => boolean,
  ): number => plays.filter(p => p.possession === side && match(p)).length;

  const theirPunts = sumTheirs<PuntingStats>(summary.punting, s => s.punts);
  const theirPuntYards = sumTheirs<PuntingStats>(summary.punting, s => s.puntYards);
  const theirPuntsInside20 = sumTheirs<PuntingStats>(summary.punting, s => s.puntsInside20);
  const theirKickoffs = sumTheirs<KickingStats>(summary.kicking, s => s.kickoffs);
  const theirKickoffYards = Math.round(
    sumTheirs<KickingStats>(summary.kicking, s => (s.averageKickoffDistance ?? 0) * s.kickoffs));
  const theirKickoffTBs = sumTheirs<KickingStats>(summary.kicking, s => s.kickoffTouchbacks);
  const theirKoReturns = sumTheirs<ReturnStats>(summary.returns, s => s.kickReturns);
  const theirKoReturnYards = sumTheirs<ReturnStats>(summary.returns, s => s.kickReturnYards);
  const theirPuntReturns = sumTheirs<ReturnStats>(summary.returns, s => s.puntReturns);
  const theirPuntReturnYards = sumTheirs<ReturnStats>(summary.returns, s => s.puntReturnYards);
  const theirSacks = sumTheirs<DefensiveStats>(summary.defense, s => s.sacks);
  const theirSackYards = sumTheirs<DefensiveStats>(summary.defense, s => s.sackYards);

  const isGood = (p: PlayWithPlayers) => String(p.play_data?.result ?? "") === "Good";
  const patAttUs = countPlays("us", p => p.play_type === "pat");
  const patMadeUs = countPlays("us", p => p.play_type === "pat" && isGood(p));
  const patAttThem = countPlays("them", p => p.play_type === "pat");
  const patMadeThem = countPlays("them", p => p.play_type === "pat" && isGood(p));
  const fgAttUs = countPlays("us", p => p.play_type === "fg");
  const fgMadeUs = countPlays("us", p => p.play_type === "fg" && isGood(p));
  const fgAttThem = countPlays("them", p => p.play_type === "fg");
  const fgMadeThem = countPlays("them", p => p.play_type === "fg" && isGood(p));

  /* Return touchdowns belong to the team that did NOT have the ball on the
     play, so possession is inverted for these counts. */
  const koReturnTdUs = countPlays("them", p => p.is_touchdown && ["kickoff", "onside_kick"].includes(p.play_type));
  const koReturnTdThem = countPlays("us", p => p.is_touchdown && ["kickoff", "onside_kick"].includes(p.play_type));
  const puntReturnTdUs = countPlays("them", p => p.is_touchdown && ["punt", "fair_catch"].includes(p.play_type));
  const puntReturnTdThem = countPlays("us", p => p.is_touchdown && ["punt", "fair_catch"].includes(p.play_type));
  const intTdUs = countPlays("them", p => p.is_touchdown && p.play_type === "int");
  const intTdThem = countPlays("us", p => p.is_touchdown && p.play_type === "int");
  const theirIntReturnYards = plays
    .filter(p => p.play_type === "int" && p.possession === "us")
    .reduce((s, p) => {
      const stored = p.play_data?.interception_return_yards;
      return s + (typeof stored === "number" ? stored : Math.max(0, num(p.yards_gained)));
    }, 0);

  /* Net kicking yardage: kick spot to where the receiving team actually
     starts. Gross minus the return, except on a touchback, where the return
     never happened and the ball is placed by rule - which is what makes a
     touchback a poor kickoff rather than a 65-yard one. The engine models
     gross only, so both nets are summed here. */
  const touchbackLine = input.touchbackYardLine;
  const netKickFor = (side: "us" | "them", types: string[]): { yards: number; count: number } =>
    plays
      .filter(p => p.possession === side && types.includes(p.play_type))
      .reduce((acc, p) => {
        const spots = resolveKickSpots({
          ballOn: p.yard_line ?? 0,
          playData: p.play_data,
          description: p.description,
        });
        if (!spots) return acc;
        return {
          yards: acc.yards + netKickYards(spots, p.yard_line ?? 0, Boolean(p.play_data?.is_touchback), touchbackLine),
          count: acc.count + 1,
        };
      }, { yards: 0, count: 0 });

  const netPuntUs = netKickFor("us", ["punt", "fair_catch"]);
  const netPuntThem = netKickFor("them", ["punt", "fair_catch"]);
  const netKoUs = netKickFor("us", ["kickoff"]);
  const netKoThem = netKickFor("them", ["kickoff"]);

  const rushTdUs = countPlays("us", p => p.is_touchdown && RUSH_TYPES.has(p.play_type));
  const rushTdThem = countPlays("them", p => p.is_touchdown && RUSH_TYPES.has(p.play_type));
  const passTdUs = countPlays("us", p => p.is_touchdown && p.play_type === "pass_comp");
  const passTdThem = countPlays("them", p => p.is_touchdown && p.play_type === "pass_comp");
  const fumblesUs = countPlays("us", p => p.play_type === "fumble" || Boolean(p.play_data?.had_fumble));
  const fumblesThem = countPlays("them", p => p.play_type === "fumble" || Boolean(p.play_data?.had_fumble));

  /* ── Team comparison ──────────────────────────────────────────────────── */
  /* Rushing gain and loss, per side, off the plays. Every play is charted
     whichever team ran it, so their split is as real as ours. Loss is derived
     from the net rather than summed on its own, so gain and loss always add
     back to the net printed above them. */
  const rushGainFor = (side: "us" | "them"): number => plays
    .filter(p => p.possession === side && RUSH_TYPES.has(p.play_type))
    .reduce((s, p) => s + Math.max(0, num(p.yards_gained)), 0);

  const usGain = rushGainFor("us");
  const usLoss = usTeam.rushingYards - usGain;
  const themGain = rushGainFor("them");
  const themLoss = themTeam.rushingYards - themGain;

  const row = (label: string, us: string | number, them: string | number, emphasis?: "head" | "sub"): TeamStatRow =>
    ({ label, us: String(us), them: String(them), emphasis });

  const teamStats: TeamStatRow[] = [
    row("FIRST DOWNS", usTeam.firstDowns, themTeam.firstDowns, "head"),
    row("Passing", usTeam.firstDownsPassing, themTeam.firstDownsPassing, "sub"),
    row("Rushing", usTeam.firstDownsRushing, themTeam.firstDownsRushing, "sub"),
    row("Penalty", usTeam.firstDownsPenalty, themTeam.firstDownsPenalty, "sub"),
    row("NET YARDS RUSHING", usTeam.rushingYards, themTeam.rushingYards, "head"),
    row("Rushing Attempts", usTeam.rushAttempts, themTeam.rushAttempts, "sub"),
    row("Average Per Rush", avg(usTeam.rushingYards, usTeam.rushAttempts).toFixed(1),
      avg(themTeam.rushingYards, themTeam.rushAttempts).toFixed(1), "sub"),
    row("Rushing Touchdowns", rushTdUs, rushTdThem, "sub"),
    row("Yard Gained Rushing", usGain, themGain, "sub"),
    row("Yard Lost Rushing", usLoss, themLoss, "sub"),
    row("NET YARDS PASSING", usTeam.passingYards, themTeam.passingYards, "head"),
    row("Completions-Attempts-Int",
      `${usTeam.passCompletions}-${usTeam.passAttempts}-${usTeam.interceptionsThrown}`,
      `${themTeam.passCompletions}-${themTeam.passAttempts}-${themTeam.interceptionsThrown}`, "sub"),
    row("Average Per Attempt", avg(usTeam.passingYards, usTeam.passAttempts).toFixed(2),
      avg(themTeam.passingYards, themTeam.passAttempts).toFixed(2), "sub"),
    row("Average Per Completion", avg(usTeam.passingYards, usTeam.passCompletions).toFixed(1),
      avg(themTeam.passingYards, themTeam.passCompletions).toFixed(1), "sub"),
    row("Passing Touchdowns", passTdUs, passTdThem, "sub"),
    row("TOTAL OFFENSE YARDS", usTeam.totalYards, themTeam.totalYards, "head"),
    row("Total Offense Plays", usTeam.totalPlays, themTeam.totalPlays, "sub"),
    row("Average Gain Per Play", avg(usTeam.totalYards, usTeam.totalPlays).toFixed(1),
      avg(themTeam.totalYards, themTeam.totalPlays).toFixed(1), "sub"),
    row("Fumbles: Number-Lost", dash(fumblesUs, usTeam.fumblesLost),
      dash(fumblesThem, themTeam.fumblesLost)),
    row("Penalties: Number-Yards", dash(usTeam.penalties, usTeam.penaltyYards),
      dash(themTeam.penalties, themTeam.penaltyYards)),
    row("PUNTS-YARDS", dash(puntingTotal.att, puntingTotal.yds),
      dash(theirPunts, theirPuntYards), "head"),
    row("Average Yards Per Punt", puntingTotal.avg.toFixed(1),
      avg(theirPuntYards, theirPunts).toFixed(1), "sub"),
    row("Net Average Per Punt", avg(netPuntUs.yards, netPuntUs.count).toFixed(1),
      avg(netPuntThem.yards, netPuntThem.count).toFixed(1), "sub"),
    row("Inside 20", puntingTotal.inside20, theirPuntsInside20, "sub"),
    row("KICKOFF-YARDS", dash(kickoffsTotal.no, kickoffsTotal.yds),
      dash(theirKickoffs, theirKickoffYards), "head"),
    row("Average Yards Per Kickoff", kickoffsTotal.avg.toFixed(1),
      avg(theirKickoffYards, theirKickoffs).toFixed(1), "sub"),
    row("Net Average Per Kickoff", avg(netKoUs.yards, netKoUs.count).toFixed(1),
      avg(netKoThem.yards, netKoThem.count).toFixed(1), "sub"),
    row("Touchbacks", kickoffsTotal.tb, theirKickoffTBs, "sub"),
    row("Punt returns: Number-Yards-TD",
      `${returnsTotal.punt.no}-${returnsTotal.punt.yds}-${puntReturnTdUs}`,
      `${theirPuntReturns}-${theirPuntReturnYards}-${puntReturnTdThem}`),
    row("Average Per Return", avg(returnsTotal.punt.yds, returnsTotal.punt.no).toFixed(1),
      avg(theirPuntReturnYards, theirPuntReturns).toFixed(1), "sub"),
    row("Kickoff returns: Number-Yards-TD",
      `${returnsTotal.ko.no}-${returnsTotal.ko.yds}-${koReturnTdUs}`,
      `${theirKoReturns}-${theirKoReturnYards}-${koReturnTdThem}`),
    row("Average Per Return", avg(returnsTotal.ko.yds, returnsTotal.ko.no).toFixed(1),
      avg(theirKoReturnYards, theirKoReturns).toFixed(1), "sub"),
    row("Interceptions: Number-Yards-TD",
      `${returnsTotal.int.no}-${returnsTotal.int.yds}-${intTdUs}`,
      `${usTeam.interceptionsThrown}-${theirIntReturnYards}-${intTdThem}`),
    row("Fumble returns: Number-Yards-TD",
      `${defenseTotal.fr}-${defenseTotal.frYds}-0`,
      `${usTeam.fumblesLost}-0-0`),
    row("Third-Down Conversions",
      dash(usTeam.thirdDownConversions, usTeam.thirdDownAttempts),
      dash(themTeam.thirdDownConversions, themTeam.thirdDownAttempts)),
    row("Fourth-Down Conversions",
      dash(usTeam.fourthDownConversions, usTeam.fourthDownAttempts),
      dash(themTeam.fourthDownConversions, themTeam.fourthDownAttempts)),
    row("Sacks By: Number-Yards",
      dash(defenseTotal.sacks, defenseTotal.sackYds),
      dash(theirSacks, theirSackYards)),
    row("PAT Kicks", dash(patMadeUs, patAttUs), dash(patMadeThem, patAttThem)),
    row("Field Goals", dash(fgMadeUs, fgAttUs), dash(fgMadeThem, fgAttThem)),
    row("Possession Time", usTeam.timeOfPossession || "-", themTeam.timeOfPossession || "-"),
  ];

  const dateLabel = input.gameDate
    ? new Date(input.gameDate).toLocaleDateString("en-US", {
        month: "2-digit", day: "2-digit", year: "numeric",
      }).replace(/\//g, "-")
    : "";

  return {
    dateLabel,
    occasion: input.occasion,
    kickoffLabel: input.kickoffLabel,
    title: `${program.name.toUpperCase()} vs ${opponent.name.toUpperCase()}`,
    us: { name: program.name, abbr: program.abbreviation, logoUrl: program.logoUrl, color: program.color },
    them: { name: opponent.name, abbr: opponent.abbreviation, logoUrl: opponent.logoUrl, color: opponent.color },
    quarters,
    lineScore: {
      us: perQuarter(usQ),
      them: perQuarter(themQ),
      usTotal: input.ourScore,
      themTotal: input.theirScore,
    },
    scoring,
    points, pointsTotal,
    rushing, rushingTotal,
    passing, passingTotal,
    receiving, receivingTotal,
    punting, puntingTotal,
    returns, returnsTotal,
    kickoffs, kickoffsTotal,
    onsideRecovered,
    teamStats,
    defense, defenseTotal,
  };
}
