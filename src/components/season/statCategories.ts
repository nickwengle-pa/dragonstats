/**
 * The player stat tables on the Season Stats screen, one per category.
 *
 * Every row comes off a GameReport (seasonBook.ts slices it), so the screen,
 * the Game Report and the Season Book all read the same numbers; this file
 * only says which columns a coach sees and how each one sorts.
 */

import type { DefensiveRow, KickoffRow, PassingRow, PuntingRow, ReceivingRow, ReturnRow, RushingRow } from "@/services/gameReport";
import { kickingRows, n, playerLine, type KickingLine, type PeriodStats } from "@/services/seasonBook";

export interface StatColumn<T> {
  label: string;
  /** Spelled out, for the header's tooltip and screen readers. */
  title?: string;
  /** What the column sorts by. */
  value: (row: T) => number;
  /** What it shows; the value when left out. */
  text?: (row: T) => string;
  /** The category's headline number. */
  strong?: boolean;
}

export interface StatRow<T> {
  /** The player's id; TEAM and unrostered jerseys have none to open. */
  id?: string;
  name: string;
  data: T;
}

export interface StatCategory<T = unknown> {
  id: string;
  title: string;
  /** Short name for the picker. */
  short: string;
  rows: (stats: PeriodStats) => Array<StatRow<T>>;
  total: (stats: PeriodStats) => T | null;
  cols: Array<StatColumn<T>>;
  /** The per-game column on season tables: what is divided by games played. */
  perGame?: { label: string; value: (row: T) => number };
}

const pct = (made: number, att: number) => (att ? `${Math.round((made / att) * 100)}%` : "-");
const avg = (total: number, count: number) => (count ? (total / count).toFixed(1) : "0.0");

function category<T>(c: StatCategory<T>): StatCategory<T> {
  return c;
}

type Named = { id?: string; name: string };
const rowsOf = <T extends Named>(list: T[]): Array<StatRow<T>> => list.map(r => ({ id: r.id, name: r.name, data: r }));

const RUSHING = category<RushingRow>({
  id: "rushing", title: "Rushing", short: "Rush",
  rows: s => rowsOf(s.report.rushing),
  total: s => (s.report.rushing.length ? s.report.rushingTotal : null),
  cols: [
    { label: "Att", title: "Carries", value: r => r.att },
    { label: "Yds", title: "Net yards", value: r => r.net, strong: true },
    { label: "Avg", title: "Yards per carry", value: r => (r.att ? r.net / r.att : 0), text: r => avg(r.net, r.att) },
    { label: "TD", title: "Touchdowns", value: r => r.td },
    { label: "Lg", title: "Longest", value: r => r.long },
    { label: "Gain", title: "Yards gained", value: r => r.gain },
    { label: "Loss", title: "Yards lost", value: r => r.loss },
    { label: "Fum", title: "Fumbles", value: r => r.fum },
  ],
  perGame: { label: "Y/G", value: r => r.net },
});

const PASSING = category<PassingRow>({
  id: "passing", title: "Passing", short: "Pass",
  rows: s => rowsOf(s.report.passing),
  total: s => (s.report.passing.length ? s.report.passingTotal : null),
  cols: [
    { label: "Cmp", title: "Completions", value: r => r.comp },
    { label: "Att", title: "Attempts", value: r => r.att },
    { label: "Pct", title: "Completion percentage", value: r => (r.att ? r.comp / r.att : 0), text: r => pct(r.comp, r.att) },
    { label: "Yds", title: "Passing yards", value: r => r.yds, strong: true },
    { label: "Y/A", title: "Yards per attempt", value: r => (r.att ? r.yds / r.att : 0), text: r => avg(r.yds, r.att) },
    { label: "TD", title: "Touchdowns", value: r => r.td },
    { label: "Int", title: "Interceptions", value: r => r.int },
    { label: "Lg", title: "Longest", value: r => r.long },
    { label: "Sck", title: "Sacked", value: r => r.sack },
  ],
  perGame: { label: "Y/G", value: r => r.yds },
});

const RECEIVING = category<ReceivingRow>({
  id: "receiving", title: "Receiving", short: "Rec",
  rows: s => rowsOf(s.report.receiving),
  total: s => (s.report.receiving.length ? s.report.receivingTotal : null),
  cols: [
    { label: "Rec", title: "Catches", value: r => r.rec },
    { label: "Yds", title: "Receiving yards", value: r => r.yds, strong: true },
    { label: "Avg", title: "Yards per catch", value: r => (r.rec ? r.yds / r.rec : 0), text: r => avg(r.yds, r.rec) },
    { label: "TD", title: "Touchdowns", value: r => r.td },
    { label: "Lg", title: "Longest", value: r => r.long },
  ],
  perGame: { label: "Y/G", value: r => r.yds },
});

const DEFENSE = category<DefensiveRow>({
  id: "defense", title: "Defense", short: "Def",
  rows: s => rowsOf(s.report.defense),
  total: s => (s.report.defense.length ? s.report.defenseTotal : null),
  cols: [
    { label: "Tot", title: "Total tackles", value: r => r.total, text: r => n(r.total), strong: true },
    { label: "Solo", title: "Solo tackles", value: r => r.solo, text: r => n(r.solo) },
    { label: "Ast", title: "Assisted tackles", value: r => r.ast, text: r => n(r.ast) },
    { label: "TFL", title: "Tackles for loss", value: r => r.tfl, text: r => n(r.tfl) },
    { label: "Sack", title: "Sacks", value: r => r.sacks, text: r => n(r.sacks) },
    { label: "Int", title: "Interceptions", value: r => r.int },
    { label: "FF", title: "Forced fumbles", value: r => r.ff },
    { label: "FR", title: "Fumble recoveries", value: r => r.fr },
    { label: "PBU", title: "Pass breakups", value: r => r.brUp },
    { label: "QBH", title: "Quarterback hurries", value: r => r.qbh },
    { label: "Blk", title: "Blocked kicks", value: r => r.blocks },
  ],
  perGame: { label: "T/G", value: r => r.total },
});

interface ScoringLine { points: number; td: number; twoPt: number; pat: number; fg: number }
function scoringRows(s: PeriodStats): Array<StatRow<ScoringLine>> {
  return s.report.points.map(p => {
    const how = playerLine(s, p.id ?? "").scoring;
    return { id: p.id, name: p.name, data: { points: p.points, td: how?.touchdowns ?? 0, twoPt: how?.twoPointMade ?? 0, pat: how?.patMade ?? 0, fg: how?.fgMade ?? 0 } };
  });
}
const SCORING = category<ScoringLine>({
  id: "scoring", title: "Scoring", short: "Pts",
  rows: scoringRows,
  total: s => {
    if (!s.report.points.length) return null;
    const rows = scoringRows(s);
    const sum = (k: keyof ScoringLine) => rows.reduce((t, r) => t + r.data[k], 0);
    return { points: s.report.pointsTotal, td: sum("td"), twoPt: sum("twoPt"), pat: sum("pat"), fg: sum("fg") };
  },
  cols: [
    { label: "Pts", title: "Points", value: r => r.points, strong: true },
    { label: "TD", title: "Touchdowns", value: r => r.td },
    { label: "2-Pt", title: "Two-point tries made", value: r => r.twoPt },
    { label: "PAT", title: "Kicks after touchdowns made", value: r => r.pat },
    { label: "FG", title: "Field goals made", value: r => r.fg },
  ],
  perGame: { label: "P/G", value: r => r.points },
});

const KICKING = category<KickingLine>({
  id: "kicking", title: "Field goals & PATs", short: "FG/PAT",
  rows: s => kickingRows(s).map(k => ({ id: k.id, name: "", data: k.line })),
  total: s => {
    const rows = kickingRows(s);
    if (rows.length < 2) return null;
    return rows.reduce<KickingLine>((t, { line }) => ({
      fgMade: t.fgMade + line.fgMade, fgAtt: t.fgAtt + line.fgAtt, fgLong: Math.max(t.fgLong, line.fgLong),
      patMade: t.patMade + line.patMade, patAtt: t.patAtt + line.patAtt,
    }), { fgMade: 0, fgAtt: 0, fgLong: 0, patMade: 0, patAtt: 0 });
  },
  cols: [
    { label: "FG", title: "Field goals made-attempted", value: r => r.fgMade, text: r => `${r.fgMade}-${r.fgAtt}`, strong: true },
    { label: "Pct", title: "Field goal percentage", value: r => (r.fgAtt ? r.fgMade / r.fgAtt : 0), text: r => pct(r.fgMade, r.fgAtt) },
    { label: "Lg", title: "Longest field goal", value: r => r.fgLong, text: r => (r.fgLong ? String(r.fgLong) : "-") },
    { label: "PAT", title: "Kicks after touchdowns made-attempted", value: r => r.patMade, text: r => `${r.patMade}-${r.patAtt}` },
    { label: "Pct", title: "PAT percentage", value: r => (r.patAtt ? r.patMade / r.patAtt : 0), text: r => pct(r.patMade, r.patAtt) },
  ],
});

const PUNTING = category<PuntingRow>({
  id: "punting", title: "Punting", short: "Punt",
  rows: s => rowsOf(s.report.punting),
  total: s => (s.report.punting.length ? s.report.puntingTotal : null),
  cols: [
    { label: "No", title: "Punts", value: r => r.att },
    { label: "Yds", title: "Yards", value: r => r.yds },
    { label: "Avg", title: "Average", value: r => r.avg, text: r => r.avg.toFixed(1), strong: true },
    { label: "Lg", title: "Longest", value: r => r.long },
    { label: "In20", title: "Inside the 20", value: r => r.inside20 },
    { label: "TB", title: "Touchbacks", value: r => r.tb },
  ],
});

const KICKOFFS = category<KickoffRow>({
  id: "kickoffs", title: "Kickoffs", short: "KO",
  rows: s => rowsOf(s.report.kickoffs),
  total: s => (s.report.kickoffs.length ? s.report.kickoffsTotal : null),
  cols: [
    { label: "No", title: "Kickoffs", value: r => r.no },
    { label: "Yds", title: "Yards", value: r => r.yds },
    { label: "Avg", title: "Average", value: r => r.avg, text: r => r.avg.toFixed(1), strong: true },
    { label: "TB", title: "Touchbacks", value: r => r.tb },
  ],
});

type ReturnKind = "ko" | "punt" | "int" | "fr";
const RETURN_NAMES: Record<ReturnKind, [string, string]> = {
  ko: ["Kickoff returns", "KR"], punt: ["Punt returns", "PR"], int: ["Interception returns", "INT ret"], fr: ["Fumble returns", "FR ret"],
};
function returns(kind: ReturnKind): StatCategory<ReturnRow> {
  const withFum = kind === "ko" || kind === "punt";
  const part = (r: ReturnRow) => r[kind] as { no: number; yds: number; long: number; td: number; fum?: number };
  const has = (r: ReturnRow) => part(r).no > 0 || (part(r).fum ?? 0) > 0;
  return category<ReturnRow>({
    id: `ret-${kind}`, title: RETURN_NAMES[kind][0], short: RETURN_NAMES[kind][1],
    rows: s => rowsOf(s.report.returns.filter(has)),
    total: s => (s.report.returns.some(has) ? s.report.returnsTotal : null),
    cols: [
      { label: "No", title: "Returns", value: r => part(r).no },
      { label: "Yds", title: "Yards", value: r => part(r).yds, strong: true },
      { label: "Avg", title: "Average", value: r => (part(r).no ? part(r).yds / part(r).no : 0), text: r => avg(part(r).yds, part(r).no) },
      { label: "Lg", title: "Longest", value: r => part(r).long },
      { label: "TD", title: "Touchdowns", value: r => part(r).td },
      ...(withFum ? [{ label: "Fum", title: "Fumbles, every muff included", value: (r: ReturnRow) => part(r).fum ?? 0 }] : []),
    ],
  });
}

/** In the order a stat sheet runs. */
export const STAT_CATEGORIES: StatCategory[] = [
  RUSHING, PASSING, RECEIVING, DEFENSE, SCORING, KICKING, PUNTING, KICKOFFS,
  returns("ko"), returns("punt"), returns("int"), returns("fr"),
] as StatCategory[];
