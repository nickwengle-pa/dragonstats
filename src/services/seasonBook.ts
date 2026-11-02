/**
 * The season, every way it can be sliced: team and player totals for the
 * season, each game, and each quarter and half of each game.
 *
 * One model feeds both the Season Stats screen and the Season Book PDF, so a
 * number on the screen is the number in the book. It is built from the same
 * pieces every other stat screen uses - computeGameStatsBundles for the engine
 * pass, buildGameReport for the stat sheet, combineSeasonBundles for season
 * totals - and adds nothing to how a stat is counted. It only decides which
 * slice to count and where each player's line sits.
 *
 * Games are loaded once (seasonBookLoader.ts); every period after that is
 * pure computation on the loaded plays, done on demand and kept, so flipping
 * the period switch never goes back to the network.
 */

import type { TeamStats } from "football-stats-engine";
import {
  computeGameStatsBundles,
  type GameStatsBundle,
  type GameStatsInputs,
  type ProgramInfo,
} from "./statsService";
import {
  buildGameReport,
  countYards,
  playerScoringFromPlays,
  type BuildReportInput,
  type DefensiveRow,
  type GameReport,
  type KickoffRow,
  type PassingRow,
  type PlayerScoring,
  type PointsRow,
  type PuntingRow,
  type ReceivingRow,
  type ReturnRow,
  type RushingRow,
} from "./gameReport";
import { combineSeasonBundles } from "./seasonReport";
import { inPeriod, type StatPeriod } from "./statPeriod";
import { TEAM_PLAYER_ID, isPendingId } from "@/components/game/types";

/* ── Shapes ───────────────────────────────────────────────────────────────── */

export interface BookProgram extends ProgramInfo {
  logoUrl: string | null;
  color: string;
}

export interface BookGameMeta {
  id: string;
  date: string | null;
  kickoff: string | null;
  opponentName: string;
  opponentAbbr: string;
  opponentColor: string;
  opponentLogo: string | null;
  isHome: boolean;
  ourScore: number;
  theirScore: number;
  status: string;
}

/** One slice of one game, or of the season. */
export interface PeriodStats {
  bundle: GameStatsBundle;
  report: GameReport;
}

export interface BookGame {
  meta: BookGameMeta;
  /** 1 for the season's first game, in date order. */
  number: number;
  /** Null when the game has no plays charted, or could not be loaded. */
  inputs: GameStatsInputs | null;
  /** Filled on demand by gameStats. */
  periods: Map<StatPeriod, PeriodStats | null>;
}

export interface BookPlayer {
  id: string;
  name: string;
  jersey: number | null;
  position: string | null;
  /** "#21 Victor Bartlebaugh", or the name alone with no number. */
  label: string;
}

/** Field goals and tries for one kicker, which the stat sheet keeps in the
 *  team table only. */
export interface KickingLine {
  fgMade: number;
  fgAtt: number;
  fgLong: number;
  patMade: number;
  patAtt: number;
}

/** Everything one player did in one slice. Absent categories are blank. */
export interface PlayerLine {
  points?: PointsRow;
  /** How the points were scored. */
  scoring?: PlayerScoring;
  rushing?: RushingRow;
  passing?: PassingRow;
  receiving?: ReceivingRow;
  defense?: DefensiveRow;
  punting?: PuntingRow;
  kickoffs?: KickoffRow;
  returns?: ReturnRow;
  kicking?: KickingLine;
}

/** A team's numbers for one slice, the way a split table reads them. */
export interface TeamPeriodLine {
  points: number;
  firstDowns: number;
  rushAtt: number;
  rushYds: number;
  passComp: number;
  passAtt: number;
  passYds: number;
  passInt: number;
  totalYds: number;
  plays: number;
  fumblesLost: number;
  turnovers: number;
  penalties: number;
  penaltyYds: number;
  thirdConv: number;
  thirdAtt: number;
  fourthConv: number;
  fourthAtt: number;
  topSeconds: number;
  sacksBy: number;
}

/* ── Periods ──────────────────────────────────────────────────────────────── */

/** The slices a split table runs across: quarters, overtime when there was
 *  one, the halves, then the whole. Halves are regulation only, as on every
 *  other stat screen (statPeriod.ts). */
export function splitPeriods(hasOT: boolean): StatPeriod[] {
  return ["q1", "q2", "q3", "q4", ...(hasOT ? ["ot" as const] : []), "h1", "h2", "game"];
}

export function gameHasOT(game: BookGame): boolean {
  return Boolean(game.inputs?.plays.some(p => Number(p.quarter) > 4));
}

export function seasonHasOT(games: BookGame[]): boolean {
  return games.some(gameHasOT);
}

/* ── Building ─────────────────────────────────────────────────────────────── */

function gameConfigNumber(program: BookProgram, key: string, fallback: number): number {
  const n = Number((program.game_config as Record<string, unknown> | null | undefined)?.[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function reportInput(program: BookProgram, meta: BookGameMeta): Omit<BuildReportInput, "bundle"> {
  return {
    program: { id: program.id, name: program.name, abbreviation: program.abbreviation, logoUrl: program.logoUrl, color: program.color },
    opponent: { name: meta.opponentName, abbreviation: meta.opponentAbbr, logoUrl: meta.opponentLogo, color: meta.opponentColor },
    gameDate: meta.date,
    kickoffLabel: null,
    occasion: null,
    ourScore: meta.ourScore,
    theirScore: meta.theirScore,
    touchbackYardLine: gameConfigNumber(program, "touchback_yard_line", 20),
    fgSnapAdd: gameConfigNumber(program, "fg_snap_add", 17),
  };
}

/** Compute whichever of these slices of a game are not already kept. */
export function ensurePeriods(program: BookProgram, game: BookGame, periods: StatPeriod[]): void {
  const missing = periods.filter(p => !game.periods.has(p));
  if (missing.length === 0) return;
  const bundles = game.inputs ? computeGameStatsBundles(game.inputs, program, missing) : null;
  for (const period of missing) {
    const bundle = bundles?.get(period) ?? null;
    game.periods.set(period, bundle
      ? { bundle, report: buildGameReport({ ...reportInput(program, game.meta), bundle }) }
      : null);
  }
}

/** One slice of one game. Null when the game has no plays to count. */
export function gameStats(program: BookProgram, game: BookGame, period: StatPeriod): PeriodStats | null {
  ensurePeriods(program, game, [period]);
  return game.periods.get(period) ?? null;
}

export interface SeasonStats extends PeriodStats {
  /** Games that went into it. */
  games: number;
}

/**
 * One slice of the season: every game's Q3 added up, say. The same
 * combination the Season PDF has always printed, so its totals agree.
 */
export function seasonStats(program: BookProgram, games: BookGame[], period: StatPeriod): SeasonStats | null {
  const counted = games.flatMap(g => {
    const s = gameStats(program, g, period);
    return s ? [{ game: g, stats: s }] : [];
  });
  if (counted.length === 0) return null;
  const bundle = combineSeasonBundles(counted.map(c => c.stats.bundle), program.id);
  const report = buildGameReport({
    bundle,
    program: { id: program.id, name: program.name, abbreviation: program.abbreviation, logoUrl: program.logoUrl, color: program.color },
    opponent: { name: "Opponents", abbreviation: "OPP", logoUrl: null, color: "#444444" },
    gameDate: null, kickoffLabel: null, occasion: null,
    ourScore: counted.reduce((n, c) => n + c.game.meta.ourScore, 0),
    theirScore: counted.reduce((n, c) => n + c.game.meta.theirScore, 0),
    touchbackYardLine: gameConfigNumber(program, "touchback_yard_line", 20),
    fgSnapAdd: gameConfigNumber(program, "fg_snap_add", 17),
  });
  return { bundle, report, games: counted.length };
}

/** A loaded season and the slices worked out so far. */
export interface SeasonModel {
  program: BookProgram;
  games: BookGame[];
  seasonCache: Map<StatPeriod, SeasonStats | null>;
}

export function seasonModel(program: BookProgram, games: BookGame[]): SeasonModel {
  return { program, games, seasonCache: new Map() };
}

/** seasonStats, kept: the combination is the costly part of a season slice. */
export function seasonSlice(model: SeasonModel, period: StatPeriod): SeasonStats | null {
  if (!model.seasonCache.has(period)) model.seasonCache.set(period, seasonStats(model.program, model.games, period));
  return model.seasonCache.get(period) ?? null;
}

/* ── Players ──────────────────────────────────────────────────────────────── */

const lineIndex = new WeakMap<GameReport, Map<string, PlayerLine>>();

/** Every player's line in a slice, by player id. Built once per report. */
function indexLines(stats: PeriodStats): Map<string, PlayerLine> {
  const cached = lineIndex.get(stats.report);
  if (cached) return cached;
  const index = new Map<string, PlayerLine>();
  const put = <K extends keyof PlayerLine>(key: K, rows: Array<NonNullable<PlayerLine[K]> & { id?: string }>) => {
    for (const row of rows) {
      if (!row.id) continue;
      const line = index.get(row.id) ?? {};
      line[key] = row;
      index.set(row.id, line);
    }
  };
  const r = stats.report;
  put("points", r.points);
  const scoring = playerScoringFromPlays(stats.bundle.plays);
  for (const row of r.points) {
    const how = row.id ? scoring.get(row.id) : undefined;
    if (row.id && how) index.get(row.id)!.scoring = how;
  }
  put("rushing", r.rushing);
  put("passing", r.passing);
  put("receiving", r.receiving);
  put("defense", r.defense);
  put("punting", r.punting);
  put("kickoffs", r.kickoffs);
  put("returns", r.returns);
  // The engine keeps every kicker, theirs too; the sheet is ours.
  const ours = new Set(stats.bundle.roster.map(p => p.player_id));
  for (const [id, k] of Object.entries(stats.bundle.summary.kicking)) {
    if (!k.fieldGoalAttempts && !k.extraPointAttempts) continue;
    if (!ours.has(id) && id !== TEAM_PLAYER_ID && !isPendingId(id)) continue;
    const line = index.get(id) ?? {};
    line.kicking = {
      fgMade: k.fieldGoalMade, fgAtt: k.fieldGoalAttempts, fgLong: k.fieldGoalLong ?? 0,
      patMade: k.extraPointMade, patAtt: k.extraPointAttempts,
    };
    index.set(id, line);
  }
  lineIndex.set(stats.report, index);
  return index;
}

export function playerLine(stats: PeriodStats | null, playerId: string): PlayerLine {
  return stats ? indexLines(stats).get(playerId) ?? {} : {};
}

export function hasLine(line: PlayerLine): boolean {
  return Object.values(line).some(Boolean);
}

/** A kicker in the kicking table: field goals and tries, any made or missed. */
export function kickingRows(stats: PeriodStats | null): Array<{ id: string; line: KickingLine }> {
  if (!stats) return [];
  const rows: Array<{ id: string; line: KickingLine }> = [];
  for (const [id, line] of indexLines(stats)) if (line.kicking) rows.push({ id, line: line.kicking });
  return rows;
}

/**
 * Our players with anything in the book, by jersey. A rostered player only:
 * TEAM and unrostered jerseys have lines in the tables but no page, since
 * there is nobody to make one about.
 */
export function bookPlayers(program: BookProgram, games: BookGame[]): BookPlayer[] {
  const roster = new Map<string, BookPlayer>();
  for (const game of games) {
    for (const r of game.inputs?.roster ?? []) {
      if (roster.has(r.player_id)) continue;
      const name = `${r.first_name} ${r.last_name}`.trim() || "Unnamed player";
      roster.set(r.player_id, {
        id: r.player_id, name, jersey: r.jersey_number, position: r.position,
        label: r.jersey_number != null ? `#${r.jersey_number} ${name}` : name,
      });
    }
  }
  const played = new Set<string>();
  for (const game of games) {
    const stats = gameStats(program, game, "game");
    if (!stats) continue;
    for (const [id, line] of indexLines(stats)) if (hasLine(line)) played.add(id);
  }
  return [...roster.values()]
    .filter(p => played.has(p.id))
    .sort((a, b) => (a.jersey ?? 1000) - (b.jersey ?? 1000) || a.name.localeCompare(b.name));
}

/** Games a player has a line in, counting the whole game. */
export function gamesPlayed(program: BookProgram, games: BookGame[], playerId: string): number {
  return games.filter(g => hasLine(playerLine(gameStats(program, g, "game"), playerId))).length;
}

/** One category's leader in a slice: who, and the line that makes them it. */
export interface Leader {
  category: string;
  id: string;
  /** "696 yds on 114, 6 TD", without the name. */
  value: string;
}

/**
 * Who leads each category in a slice, ours only. A category nobody has a
 * positive number in is left out rather than crowning a zero.
 */
export function leaders(stats: PeriodStats, isOurs: (id: string) => boolean): Leader[] {
  const r = stats.report;
  const out: Leader[] = [];
  const top = <T extends { id?: string }>(category: string, rows: T[], score: (row: T) => number, text: (row: T) => string) => {
    const best = rows.filter(row => row.id && isOurs(row.id)).sort((a, z) => score(z) - score(a))[0];
    if (best?.id && score(best) > 0) out.push({ category, id: best.id, value: text(best) });
  };
  top("Rushing", r.rushing, x => x.net, x => `${x.net} yds on ${x.att}, ${x.td} TD`);
  top("Passing", r.passing, x => x.yds, x => `${x.comp}/${x.att}, ${x.yds} yds, ${x.td} TD`);
  top("Receiving", r.receiving, x => x.yds, x => `${x.rec} for ${x.yds} yds, ${x.td} TD`);
  top("Tackles", r.defense, x => x.total, x => `${n(x.total)} (${n(x.solo)} solo)`);
  top("Sacks", r.defense, x => x.sacks, x => `${n(x.sacks)} for ${n(x.sackYds)} yds`);
  top("Scoring", r.points, x => x.points, x => `${x.points} pts`);
  return out;
}

/* ── Team ─────────────────────────────────────────────────────────────────── */

export function teamSides(bundle: GameStatsBundle, programId: string): { us: TeamStats; them: TeamStats } {
  const s = bundle.summary;
  const us = s.homeTeamStats.teamId === programId ? s.homeTeamStats : s.awayTeamStats;
  return { us, them: us === s.homeTeamStats ? s.awayTeamStats : s.homeTeamStats };
}

/** Points in the report's slice, off its whole-game line score. */
function periodPoints(report: GameReport, side: "us" | "them"): number {
  const values = side === "us" ? report.lineScore.us : report.lineScore.them;
  return report.quarters.reduce((sum, col, i) =>
    sum + (inPeriod(col === "OT" ? 5 : Number(col), report.period) ? values[i] ?? 0 : 0), 0);
}

function sideLine(team: TeamStats, points: number, sacksBy: number): TeamPeriodLine {
  return {
    points,
    firstDowns: team.firstDowns,
    rushAtt: team.rushAttempts,
    rushYds: team.rushingYards,
    passComp: team.passCompletions,
    passAtt: team.passAttempts,
    passYds: team.passingYards,
    passInt: team.interceptionsThrown,
    totalYds: team.totalYards,
    plays: team.totalPlays,
    fumblesLost: team.fumblesLost,
    turnovers: team.fumblesLost + team.interceptionsThrown,
    penalties: team.penalties,
    penaltyYds: team.penaltyYards,
    thirdConv: team.thirdDownConversions,
    thirdAtt: team.thirdDownAttempts,
    fourthConv: team.fourthDownConversions,
    fourthAtt: team.fourthDownAttempts,
    topSeconds: team.timeOfPossessionSeconds ?? 0,
    sacksBy,
  };
}

/** Both teams' numbers for one slice of a game or of the season. */
export function teamPeriodLines(stats: PeriodStats, programId: string): { us: TeamPeriodLine; them: TeamPeriodLine } {
  const { us, them } = teamSides(stats.bundle, programId);
  return {
    // Sacks BY a side are the other side's sacks taken.
    us: sideLine(us, periodPoints(stats.report, "us"), them.sacks ?? 0),
    them: sideLine(them, periodPoints(stats.report, "them"), us.sacks ?? 0),
  };
}

export function gameResult(meta: BookGameMeta): "W" | "L" | "T" | null {
  if (meta.status !== "completed") return null;
  return meta.ourScore > meta.theirScore ? "W" : meta.ourScore < meta.theirScore ? "L" : "T";
}

export interface SeasonRecord { wins: number; losses: number; ties: number; pf: number; pa: number; final: number }

export function seasonRecord(games: BookGame[]): SeasonRecord {
  const rec: SeasonRecord = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, final: 0 };
  for (const g of games) {
    const result = gameResult(g.meta);
    if (!result) continue;
    rec.final += 1;
    rec.pf += g.meta.ourScore;
    rec.pa += g.meta.theirScore;
    if (result === "W") rec.wins += 1;
    else if (result === "L") rec.losses += 1;
    else rec.ties += 1;
  }
  return rec;
}

export function recordLabel(rec: SeasonRecord): string {
  return `${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ""}`;
}

/* ── Formatting shared by the screen and the book ────────────────────────── */

/** Whole numbers plain, a shared tackle to one decimal. */
export function n(v: number | null | undefined): string {
  const x = Number(v ?? 0);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/** One decimal; "0.0" with nothing to divide. */
export function per(total: number, count: number): string {
  return count > 0 ? (Math.round((total / count) * 10) / 10 + 0).toFixed(1) : "0.0";
}

export function clockFromSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Sep 4" off a stored date, read as the calendar day it names. */
export function shortDate(date: string | null): string {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m[2]) - 1] ?? ""} ${Number(m[3])}`;
}

/**
 * The by-quarter cells, in two parts: the counting line ("11-112", or
 * "4 for -3" when the yards went backwards) and what scored or took the ball
 * away ("2 TD"). Both blank when there is nothing. The book prints the second
 * part on a line of its own under the first, so a cell never has to be cut to
 * fit a column.
 */
export const splitParts = {
  rushing: (r?: RushingRow): [string, string] => r && r.att ? [countYards(r.att, r.net), r.td ? `${r.td} TD` : ""] : ["", ""],
  passing: (r?: PassingRow): [string, string] => r && r.att
    ? [countYards(`${r.comp}/${r.att}`, r.yds), [r.td ? `${r.td} TD` : "", r.int ? `${r.int} INT` : ""].filter(Boolean).join(" ")]
    : ["", ""],
  receiving: (r?: ReceivingRow): [string, string] => r && r.rec ? [countYards(r.rec, r.yds), r.td ? `${r.td} TD` : ""] : ["", ""],
  defense: (r?: DefensiveRow): [string, string] => {
    if (!r) return ["", ""];
    const extras = [
      r.sacks ? `${n(r.sacks)} sk` : "",
      r.int ? `${r.int} int` : "",
      r.ff ? `${r.ff} ff` : "",
    ].filter(Boolean).join(" ");
    if (!r.total && !extras) return ["", ""];
    return [n(r.total), extras];
  },
  points: (r?: PointsRow): [string, string] => [r && r.points ? String(r.points) : "", ""],
};

/** The same cells on one line, for a narrow screen column. */
export const splitCell = {
  rushing: (r?: RushingRow) => joinParts(splitParts.rushing(r)),
  passing: (r?: PassingRow) => joinParts(splitParts.passing(r)),
  receiving: (r?: ReceivingRow) => joinParts(splitParts.receiving(r)),
  defense: (r?: DefensiveRow) => joinParts(splitParts.defense(r)),
  points: (r?: PointsRow) => joinParts(splitParts.points(r)),
};

function joinParts([main, extra]: [string, string]): string {
  return [main, extra].filter(Boolean).join(" ");
}
