/**
 * The Season Book: one PDF with the whole season in it, linked.
 *
 *   Cover            record, leaders, every result
 *   Contents         every section, game and player, each a link
 *   Season           team stats, by quarter and half, every player's line,
 *                    game by game
 *   Each game        line score, scoring, team stats, every player's line,
 *                    by quarter and half (team and players), play-by-play
 *   Each player      every stat by game with season totals, and by quarter
 *
 * Every game and player name is a link to its page, and every page footer
 * links back to the contents, so the book reads like the app: tap down from
 * the season to a game to a quarter to the plays.
 *
 * It is drawn as text, not as pictures of the screen the way the one-page
 * reports print (reportPrint.ts). A hundred pages of screenshots would be tens
 * of megabytes and minutes of work on an iPad; as text it is a few hundred
 * kilobytes, searchable, and every link lands exactly on its section.
 *
 * Numbers come from seasonBook.ts and nowhere else, so the book and the
 * Season Stats screen cannot disagree.
 */

import { jsPDF } from "jspdf";
import type { DefensiveRow, GameReport, KickoffRow, PassingRow, PuntingRow, ReceivingRow, ReturnRow, RushingRow, TeamStatRow } from "./gameReport";
import type { PlayerScoring } from "./gameReport";
import { playByPlay, type PbpPlay } from "./playByPlay";
import {
  bookPlayers, clockFromSeconds, ensurePeriods, gameResult, gameStats, gamesPlayed, hasLine, kickingRows, leaders, n, per,
  playerLine, recordLabel, seasonHasOT, seasonRecord, seasonSlice, shortDate, splitParts, splitPeriods, teamPeriodLines,
  gameHasOT,
  type BookGame, type BookPlayer, type KickingLine, type PeriodStats, type PlayerLine, type SeasonModel, type TeamPeriodLine,
} from "./seasonBook";
import { PERIOD_SHORT, type StatPeriod } from "./statPeriod";

/* ── Page geometry (points; letter portrait) ──────────────────────────────── */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = 66;
const BOTTOM = PAGE_H - 46;

type RGB = [number, number, number];
const INK: RGB = [11, 13, 16];
const MUTE: RGB = [82, 90, 102];
const FAINT: RGB = [140, 146, 156];
const LINE: RGB = [208, 212, 218];
const STRIPE: RGB = [242, 243, 245];
const LINK: RGB = [22, 82, 196];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [15, 122, 72];
const RED_TEXT: RGB = [193, 18, 26];
const AMBER: RGB = [154, 103, 0];

function hexToRgb(hex: string | null | undefined, fallback: RGB): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return fallback;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** A color that reads on the black bands: a navy or maroon is lifted until
 *  it has 3:1 contrast with black; a red or gold is left as it is. */
function onDark(c: RGB): RGB {
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const contrast = (k: RGB) => (0.2126 * lin(k[0]) + 0.7152 * lin(k[1]) + 0.0722 * lin(k[2]) + 0.05) / 0.05;
  let out = c;
  for (let t = 0.1; contrast(out) < 3 && t <= 1; t += 0.1) {
    out = [Math.round(c[0] + (255 - c[0]) * t), Math.round(c[1] + (255 - c[1]) * t), Math.round(c[2] + (255 - c[2]) * t)];
  }
  return out;
}

/** Two teams in red would tell the drives apart by nothing: the opponent
 *  goes slate when its color is close to ours. */
function apart(theirs: RGB, ours: RGB): RGB {
  const d = Math.hypot(theirs[0] - ours[0], theirs[1] - ours[1], theirs[2] - ours[2]);
  return d < 110 ? [96, 104, 116] : theirs;
}

/* Helvetica in a PDF speaks WinAnsi. The app writes arrows and the odd
   symbol into descriptions; they would come out as junk, so they are spelled
   out or dropped. */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s*→\s*/g, " to ")
    .replace(/⇄/g, "<>")
    .replace(/←/g, "<-")
    .replace(/[   ]/g, " ")
    .replace(/[−]/g, "-")
    .split("")
    .filter(ch => {
      const c = ch.charCodeAt(0);
      return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch);
    })
    .join("");
}

/* ── Layout engine ────────────────────────────────────────────────────────── */

interface LinkTarget { pageNumber: number; top: number; left: number; zoom: number; magFactor: "XYZ" }

interface Column {
  label: string;
  /** Points. 0 takes whatever the fixed columns leave. */
  width: number;
  align?: "left" | "right" | "center";
}

interface Cell {
  text: string;
  link?: string;
  bold?: boolean;
  color?: RGB;
  /** Print the page this key lands on, once the book is laid out. */
  pageOf?: string;
}

type CellIn = string | number | Cell;

interface Row {
  cells: CellIn[];
  /** "extra" is a short muted line under the row before it (TDs, sacks),
   *  kept on the same page as that row with no rule between them. */
  kind?: "total" | "head" | "sub" | "group" | "extra";
}

class Book {
  readonly doc: jsPDF;
  page = 0;
  y = TOP;
  /** What the header says on the pages being drawn now. */
  label = "";
  readonly pageLabels: string[] = [];
  readonly anchors = new Map<string, { page: number; y: number }>();
  private readonly targets = new Map<string, LinkTarget>();
  /** Page numbers to print once every section has its page. */
  private readonly pageRefs: Array<{ page: number; x: number; y: number; size: number; bold: boolean; align: "left" | "right" | "center"; key: string }> = [];
  readonly accent: RGB;

  constructor(readonly linkable: Set<string>, accent: RGB) {
    this.doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait", compress: true });
    this.accent = accent;
  }

  /* pages */
  newPage(label = this.label) {
    if (this.page > 0) this.doc.addPage();
    this.page = this.doc.getNumberOfPages();
    this.pageLabels[this.page] = label;
    this.y = TOP;
  }
  /** Start a new page unless this one has room for `height` more. */
  ensure(height: number) {
    if (this.y + height > BOTTOM) this.newPage();
  }
  gap(h: number) { this.y += h; }

  /* links */
  anchor(key: string, y = this.y) {
    if (!this.anchors.has(key)) this.anchors.set(key, { page: this.page, y });
  }
  canLink(key: string | undefined): key is string {
    return Boolean(key && this.linkable.has(key));
  }
  link(key: string | undefined, x: number, y: number, w: number, h: number) {
    if (!this.canLink(key)) return;
    let target = this.targets.get(key);
    if (!target) {
      target = { pageNumber: 1, top: 0, left: 0, zoom: 0, magFactor: "XYZ" };
      this.targets.set(key, target);
    }
    this.doc.link(x, y, w, h, target);
  }
  /** Point every link at its section, now that the sections have pages.
   *  The keys with no section are returned: each is a bug to fix. */
  resolveLinks(): string[] {
    const missing: string[] = [];
    for (const [key, target] of this.targets) {
      const at = this.anchors.get(key);
      if (!at) { missing.push(key); continue; }
      target.pageNumber = at.page;
      target.top = Math.max(0, at.y - 8);
    }
    return missing;
  }
  pageOf(key: string): number | null {
    return this.anchors.get(key)?.page ?? null;
  }
  /** Print a key's page number here, once it is known. */
  pageRef(key: string, x: number, y: number, opts: { size: number; bold?: boolean; align?: "left" | "right" | "center" }) {
    this.pageRefs.push({ page: this.page, x, y, size: opts.size, bold: opts.bold ?? true, align: opts.align ?? "right", key });
  }
  fillPageRefs() {
    for (const ref of this.pageRefs) {
      const page = this.pageOf(ref.key);
      if (page == null) continue;
      this.doc.setPage(ref.page);
      this.text(String(page), ref.x, ref.y, { size: ref.size, bold: ref.bold, align: ref.align, link: ref.key });
    }
  }

  /* text */
  font(size: number, bold = false, color: RGB = INK) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(color[0], color[1], color[2]);
  }
  width(text: string): number {
    return this.doc.getTextWidth(text);
  }
  /** Cut to fit, with an ellipsis. */
  fit(text: string, max: number): string {
    let t = pdfText(text);
    if (max <= 0 || this.width(t) <= max) return t;
    while (t.length > 1 && this.width(`${t}…`) > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }
  text(value: unknown, x: number, y: number, opts: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; max?: number; link?: string; charSpace?: number } = {}) {
    const size = opts.size ?? 8;
    const linked = this.canLink(opts.link);
    this.font(size, opts.bold, linked ? LINK : opts.color ?? INK);
    const str = opts.max ? this.fit(String(value ?? ""), opts.max) : pdfText(value);
    if (!str) return 0;
    const w = this.width(str) + (opts.charSpace ? opts.charSpace * str.length : 0);
    const left = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    this.doc.text(str, left, y, { charSpace: opts.charSpace });
    if (linked) this.link(opts.link, left - 1, y - size * 0.82, w + 2, size * 1.08);
    return w;
  }
  wrap(value: string, width: number, size: number): string[] {
    this.font(size);
    return this.doc.splitTextToSize(pdfText(value), width) as string[];
  }

  /* shapes */
  fill(color: RGB) { this.doc.setFillColor(color[0], color[1], color[2]); }
  stroke(color: RGB, width = 0.5) { this.doc.setDrawColor(color[0], color[1], color[2]); this.doc.setLineWidth(width); }
  rect(x: number, y: number, w: number, h: number, color: RGB) { this.fill(color); this.doc.rect(x, y, w, h, "F"); }
  rule(y: number, color: RGB = LINE, width = 0.4, x1 = MARGIN, x2 = MARGIN + CONTENT_W) {
    this.stroke(color, width);
    this.doc.line(x1, y, x2, y);
  }

  /* blocks */
  /** The black section band, with the accent tick at its left. */
  band(title: string, opts: { note?: string; anchor?: string; minBelow?: number } = {}) {
    this.ensure(26 + (opts.minBelow ?? 60));
    if (opts.anchor) this.anchor(opts.anchor);
    const y = this.y;
    this.rect(MARGIN, y, CONTENT_W, 18, INK);
    this.rect(MARGIN, y, 5, 18, this.accent);
    this.text(title.toUpperCase(), MARGIN + 12, y + 12.4, { size: 9, bold: true, color: WHITE, charSpace: 0.6 });
    if (opts.note) this.text(opts.note, MARGIN + CONTENT_W - 8, y + 12.2, { size: 7.5, color: [200, 204, 210], align: "right" });
    this.y = y + 26;
  }
  /** A smaller heading, with a rule running to the right edge. */
  subhead(title: string, opts: { note?: string; anchor?: string; minBelow?: number; link?: string } = {}) {
    this.ensure(16 + (opts.minBelow ?? 40));
    if (opts.anchor) this.anchor(opts.anchor);
    this.y = this.subheadAt(title, this.y, opts);
  }
  /** Draw a subhead whose top is at `top`, with no page break; the y under it. */
  subheadAt(title: string, top: number, opts: { note?: string; link?: string } = {}): number {
    const y = top + 9;
    const w = this.text(title.toUpperCase(), MARGIN, y, { size: 7.5, bold: true, color: INK, charSpace: 0.4, link: opts.link });
    let right = MARGIN + CONTENT_W;
    if (opts.note) {
      const nw = this.text(opts.note, right, y, { size: 6.8, color: MUTE, align: "right" });
      right -= nw + 6;
    }
    this.rule(y - 2.6, LINE, 0.5, MARGIN + w + 6, right);
    return y + 6;
  }
  note(text: string, opts: { size?: number; color?: RGB } = {}) {
    const size = opts.size ?? 6.8;
    const lines = this.wrap(text, CONTENT_W, size);
    this.ensure(lines.length * (size + 2.4) + 2);
    for (const line of lines) {
      this.text(line, MARGIN, this.y + size, { size, color: opts.color ?? MUTE });
      this.y += size + 2.4;
    }
    this.y += 2;
  }

  /**
   * A stat table. The header repeats on every page it runs onto, a heading
   * is never left at the foot of a page with no rows under it, and a total
   * row never starts a page on its own.
   */
  table(cols: Column[], rows: Row[], opts: { title?: string; titleNote?: string; titleAnchor?: string; size?: number; rowH?: number; empty?: string; x?: number; width?: number } = {}) {
    const size = opts.size ?? 7.4;
    const rowH = opts.rowH ?? size + 4.2;
    const x0 = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT_W;
    const fixed = cols.reduce((s, c) => s + c.width, 0);
    const flex = cols.filter(c => c.width === 0).length;
    const flexW = flex ? Math.max(30, (width - fixed) / flex) : 0;
    const widths = cols.map(c => (c.width === 0 ? flexW : c.width));
    const scale = flex ? 1 : width / fixed;
    const ws = widths.map(w => w * scale);
    const xs: number[] = [];
    ws.reduce((x, w) => { xs.push(x); return x + w; }, x0);
    const headH = rowH + 1;
    const body: Row[] = rows.length ? rows : [{ cells: [opts.empty ?? "None recorded"] }];

    const header = (continued: boolean) => {
      if (opts.title) this.subhead(continued ? `${opts.title} (continued)` : opts.title, { note: opts.titleNote, anchor: continued ? undefined : opts.titleAnchor, minBelow: headH + rowH * Math.min(3, body.length) });
      const y = this.y;
      cols.forEach((c, i) => {
        const align = c.align ?? (i === 0 ? "left" : "right");
        const tx = align === "right" ? xs[i] + ws[i] - 2 : align === "center" ? xs[i] + ws[i] / 2 : xs[i] + 2;
        this.text(c.label.toUpperCase(), tx, y + size - 0.6, { size: size - 1.4, bold: true, color: MUTE, align, max: ws[i] - 3 });
      });
      this.rule(y + headH - 0.5, INK, 0.7, x0, x0 + width);
      this.y = y + headH + 0.5;
    };

    // Keep a heading with at least a few rows.
    this.ensure((opts.title ? 22 : 0) + headH + rowH * Math.min(3, body.length));
    header(false);
    const extraSize = size - 1.1;
    const extraH = extraSize + 2.6;
    body.forEach((row, ri) => {
      const isLast = ri === body.length - 1;
      const next = body[ri + 1];
      const extra = row.kind === "extra";
      const h = extra ? extraH : rowH;
      // A total row does not start a page alone: take the row before it
      // along. Nor is a row parted from its extra line.
      const withExtra = next?.kind === "extra";
      const afterAt = withExtra ? ri + 2 : ri + 1;
      const totalFollows = body[afterAt]?.kind === "total" && afterAt === body.length - 1;
      const need = h + (withExtra ? extraH : 0) + (totalFollows ? rowH : 0) + 1;
      if (!extra && this.y + need > BOTTOM) { this.newPage(); header(true); }
      const y = this.y;
      if (row.kind === "group") this.rect(x0, y, width, rowH, STRIPE);
      if (row.kind === "total") this.rule(y, INK, 0.8, x0, x0 + width);
      if (rows.length === 0 && ri === 0) {
        this.text(opts.empty ?? "None recorded", xs[0] + 2, y + size + 0.8, { size, color: MUTE });
      } else {
        const cellSize = extra ? extraSize : size;
        row.cells.forEach((raw, i) => {
          if (i >= cols.length) return;
          const cell: Cell = typeof raw === "object" ? raw : { text: String(raw) };
          const align = cols[i].align ?? (i === 0 ? "left" : "right");
          const indent = i === 0 && row.kind === "sub" ? 8 : 0;
          const tx = align === "right" ? xs[i] + ws[i] - 2 : align === "center" ? xs[i] + ws[i] / 2 : xs[i] + 2 + indent;
          const bold = cell.bold ?? (row.kind === "total" || row.kind === "head" || row.kind === "group");
          if (cell.pageOf) {
            this.pageRef(cell.pageOf, tx, y + cellSize + 0.8, { size: cellSize, bold, align });
            return;
          }
          this.text(cell.text, tx, y + cellSize + (extra ? 0.2 : 0.8), {
            size: cellSize, bold, align, color: cell.color ?? ((row.kind === "sub" && i === 0) || extra ? MUTE : INK),
            max: ws[i] - 4 - indent, link: cell.link,
          });
        });
      }
      this.y = y + h;
      if (row.kind !== "total" && !isLast && next?.kind !== "total" && next?.kind !== "extra") this.rule(this.y, LINE, 0.25, x0, x0 + width);
    });
    this.y += 8;
  }
}

/* ── Keys ─────────────────────────────────────────────────────────────────── */

const K = {
  contents: "contents",
  seasonTeam: "season-team",
  seasonSplits: "season-splits",
  seasonPlayers: "season-players",
  seasonGames: "season-games",
  game: (id: string) => `game:${id}`,
  gamePlayers: (id: string) => `game:${id}:players`,
  gameSplits: (id: string) => `game:${id}:splits`,
  gamePbp: (id: string) => `game:${id}:pbp`,
  player: (id: string) => `player:${id}`,
};

/* ── Stat categories, shared by season, game and player tables ───────────── */

interface Category<T> {
  title: string;
  cols: Column[];
  cells: (row: T) => CellIn[];
  /** The season tables add a per-game column of this. */
  perGame?: { label: string; value: (row: T) => number };
}

const num = (w = 30): Column => ({ label: "", width: w });
const col = (label: string, w = 30): Column => ({ ...num(w), label });

const RUSHING: Category<RushingRow> = {
  title: "Rushing",
  cols: [col("Att", 28), col("Net"), col("Gain"), col("Loss"), col("Sack"), col("Avg"), col("TD", 24), col("Lg", 24), col("Fum", 26)],
  cells: r => [r.att, r.net, r.gain, r.loss, r.sackYds, r.avg.toFixed(1), r.td, r.long, r.fum],
  perGame: { label: "Y/G", value: r => r.net },
};
const PASSING: Category<PassingRow> = {
  title: "Passing",
  cols: [col("Comp"), col("Att", 28), col("Pct"), col("Yds"), col("Y/A"), col("TD", 24), col("Int", 24), col("Lg", 24), col("Sack", 28)],
  cells: r => [r.comp, r.att, r.att ? `${Math.round((r.comp / r.att) * 100)}%` : "-", r.yds, per(r.yds, r.att), r.td, r.int, r.long, r.sack],
  perGame: { label: "Y/G", value: r => r.yds },
};
const RECEIVING: Category<ReceivingRow> = {
  title: "Receiving",
  cols: [col("Rec"), col("Yds"), col("Avg"), col("TD", 24), col("Lg", 24)],
  cells: r => [r.rec, r.yds, per(r.yds, r.rec), r.td, r.long],
  perGame: { label: "Y/G", value: r => r.yds },
};
const DEFENSE: Category<DefensiveRow> = {
  title: "Defense",
  cols: [col("Solo", 26), col("Ast", 24), col("Tot", 26), col("TFL", 24), col("Yds", 24), col("Sack", 26), col("Yds", 24), col("FF", 22), col("FR", 22), col("Int", 22), col("PBU", 24), col("Blk", 22), col("QBH", 24)],
  cells: r => [n(r.solo), n(r.ast), { text: n(r.total), bold: true }, n(r.tfl), n(r.tflYds), n(r.sacks), n(r.sackYds), n(r.ff), n(r.fr), n(r.int), n(r.brUp), n(r.blocks), n(r.qbh)],
  perGame: { label: "T/G", value: r => r.total },
};
const SCORING: Category<{ points: number; scoring?: PlayerScoring }> = {
  title: "Scoring",
  cols: [col("TD", 28), col("2-Pt", 28), col("PAT", 28), col("FG", 28), col("Pts", 32)],
  cells: r => [r.scoring?.touchdowns ?? 0, r.scoring?.twoPointMade ?? 0, r.scoring?.patMade ?? 0, r.scoring?.fgMade ?? 0, { text: String(r.points), bold: true }],
  perGame: { label: "P/G", value: r => r.points },
};
const KICKING: Category<KickingLine> = {
  title: "Field goals & PATs",
  cols: [col("FG", 34), col("Pct", 30), col("Lg", 26), col("PAT", 34), col("Pct", 30)],
  cells: r => [
    `${r.fgMade}-${r.fgAtt}`, r.fgAtt ? `${Math.round((r.fgMade / r.fgAtt) * 100)}%` : "-", r.fgLong || "-",
    `${r.patMade}-${r.patAtt}`, r.patAtt ? `${Math.round((r.patMade / r.patAtt) * 100)}%` : "-",
  ],
};
const PUNTING: Category<PuntingRow> = {
  title: "Punting",
  cols: [col("No", 26), col("Yds"), col("Avg"), col("Lg", 26), col("In 20"), col("TB", 26)],
  cells: r => [r.att, r.yds, r.avg.toFixed(1), r.long, r.inside20, r.tb],
};
const KICKOFFS: Category<KickoffRow> = {
  title: "Kickoffs",
  cols: [col("No", 26), col("Yds"), col("Avg"), col("TB", 26)],
  cells: r => [r.no, r.yds, r.avg.toFixed(1), r.tb],
};
type ReturnKind = "ko" | "punt" | "int" | "fr";
const RETURN_TITLES: Record<ReturnKind, string> = { ko: "Kickoff returns", punt: "Punt returns", int: "Interception returns", fr: "Fumble returns" };
function returnsCategory(kind: ReturnKind): Category<ReturnRow> {
  const withFum = kind === "ko" || kind === "punt";
  return {
    title: RETURN_TITLES[kind],
    cols: [col("No", 26), col("Yds"), col("Avg"), col("Lg", 26), col("TD", 24), ...(withFum ? [col("Fum", 26)] : [])],
    cells: r => {
      const g = r[kind];
      return [g.no, g.yds, per(g.yds, g.no), g.long, g.td, ...(withFum ? [(g as { fum: number }).fum] : [])];
    },
  };
}
const hasReturn = (kind: ReturnKind) => (r: ReturnRow) => r[kind].no > 0 || ((kind === "ko" || kind === "punt") && (r[kind] as { fum: number }).fum > 0);

/** The by-quarter categories and how one cell of each reads. */
const SPLIT_CATS: Array<{ title: string; legend: string; cell: (line: PlayerLine) => [string, string] }> = [
  { title: "Rushing", legend: "carries-yards, TDs beneath", cell: l => splitParts.rushing(l.rushing) },
  { title: "Passing", legend: "completions/attempts-yards, TDs and interceptions beneath", cell: l => splitParts.passing(l.passing) },
  { title: "Receiving", legend: "catches-yards, TDs beneath", cell: l => splitParts.receiving(l.receiving) },
  { title: "Defense", legend: "tackles; sacks, interceptions and forced fumbles beneath", cell: l => splitParts.defense(l.defense) },
  { title: "Scoring", legend: "points", cell: l => splitParts.points(l.points) },
];

/** The by-quarter columns: a fixed first column, the slices sharing the rest
 *  evenly so the widest cell (a season's passing line) still fits. */
function splitColumns(first: string, periods: StatPeriod[], wholeLabel: string): Column[] {
  const label = (p: StatPeriod) => p === "game" ? wholeLabel : p === "h1" ? "1st half" : p === "h2" ? "2nd half" : PERIOD_SHORT[p];
  return [{ label: first, width: first === "Game" ? 122 : 112, align: "left" }, ...periods.map(p => ({ label: label(p), width: 0 }))];
}

/** A row per player (or game) across the slices, and a muted line under it
 *  when any slice has a TD, sack or pick to show. */
function splitRows(first: CellIn, parts: Array<[string, string]>, boldAt: number, total = false): Row[] {
  const main: Row = { cells: [first, ...parts.map(([m], i) => ({ text: m, bold: total || i === boldAt }))], kind: total ? "total" : undefined };
  if (!parts.some(([, e]) => e)) return [main];
  return [main, { kind: "extra", cells: ["", ...parts.map(([, e]) => e)] }];
}

/* ── Building ─────────────────────────────────────────────────────────────── */

export interface SeasonBookOptions {
  /** "2026 Varsity". */
  seasonLabel: string;
  /** When it was made, as the viewer reads time. */
  generatedLabel: string;
  /** The program's logo as a PNG or JPEG data URL, for the cover. */
  logoDataUrl?: string | null;
  onProgress?: (message: string, fraction: number) => void;
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Only final games: a game in progress is not part of the record. */
export function bookGames(model: SeasonModel): BookGame[] {
  return model.games.filter(g => g.meta.status === "completed" && g.inputs);
}

export async function buildSeasonBookPdf(model: SeasonModel, options: SeasonBookOptions): Promise<Blob> {
  const { program } = model;
  const games = bookGames(model);
  if (games.length === 0) throw new Error("There are no final games with plays to put in the book yet.");
  const progress = options.onProgress ?? (() => {});
  const book = new SeasonBookBuild(model, games, options);

  // Every slice of every game first: the expensive part, so it reports.
  for (const [i, g] of games.entries()) {
    progress(`Counting game ${i + 1} of ${games.length}…`, (i / games.length) * 0.6);
    await tick();
    ensurePeriods(program, g, splitPeriods(gameHasOT(g)));
  }
  progress("Adding up the season…", 0.62);
  await tick();
  book.prepare();
  progress("Laying out the season pages…", 0.7);
  await tick();
  book.cover();
  book.reserveContents();
  book.seasonSections();
  for (const [i, g] of games.entries()) {
    progress(`Laying out game ${i + 1} of ${games.length}…`, 0.72 + (i / games.length) * 0.16);
    await tick();
    book.gameSection(g);
  }
  progress("Laying out the player pages…", 0.9);
  await tick();
  book.playerSections();
  book.finish();
  progress("Saving…", 0.98);
  await tick();
  return book.output();
}

class SeasonBookBuild {
  private readonly b: Book;
  private readonly program: SeasonModel["program"];
  private readonly hasOT: boolean;
  private players: BookPlayer[] = [];
  private playerIds = new Set<string>();
  private season!: PeriodStats & { games: number };
  private contentsPages: number[] = [];
  private gp = new Map<string, number>();

  constructor(private readonly model: SeasonModel, private readonly games: BookGame[], private readonly options: SeasonBookOptions) {
    this.program = model.program;
    this.hasOT = seasonHasOT(games);
    const linkable = new Set<string>([K.contents, K.seasonTeam, K.seasonSplits, K.seasonPlayers, K.seasonGames]);
    for (const g of games) for (const k of [K.game, K.gamePlayers, K.gameSplits, K.gamePbp]) linkable.add(k(g.meta.id));
    this.b = new Book(linkable, hexToRgb(this.program.color, [215, 20, 26]));
  }

  private get abbr() { return this.program.abbreviation || "US"; }

  /** Season totals off the book's own games: final ones only. */
  private seasonFor(period: StatPeriod) {
    const sub = { ...this.model, games: this.games, seasonCache: this.cache };
    return seasonSlice(sub, period);
  }
  private cache = new Map<StatPeriod, ReturnType<typeof seasonSlice>>();

  prepare() {
    const season = this.seasonFor("game");
    if (!season) throw new Error("The season has no plays to count yet.");
    this.season = season;
    this.players = bookPlayers(this.program, this.games);
    for (const p of this.players) {
      this.playerIds.add(p.id);
      this.b.linkable.add(K.player(p.id));
      this.gp.set(p.id, gamesPlayed(this.program, this.games, p.id));
    }
  }

  private playerLink(id: string | undefined): string | undefined {
    return id && this.playerIds.has(id) ? K.player(id) : undefined;
  }
  private nameCell(row: { id?: string; name: string }): Cell {
    const player = row.id ? this.players.find(p => p.id === row.id) : undefined;
    return { text: player?.label ?? row.name, link: this.playerLink(row.id) };
  }
  private opponentText(g: BookGame): string {
    return `${g.meta.isHome ? "vs" : "at"} ${g.meta.opponentName}`;
  }
  private resultText(g: BookGame): string {
    const r = gameResult(g.meta);
    return `${r ?? ""} ${g.meta.ourScore}-${g.meta.theirScore}`.trim();
  }
  private resultColor(g: BookGame): RGB {
    const r = gameResult(g.meta);
    return r === "W" ? GREEN : r === "L" ? RED_TEXT : MUTE;
  }

  /* ── Cover ── */
  cover() {
    const b = this.b;
    b.label = "";
    b.newPage("");
    const rec = seasonRecord(this.games);
    // Masthead.
    b.rect(MARGIN, 40, CONTENT_W, 170, INK);
    b.rect(MARGIN, 210, CONTENT_W, 6, b.accent);
    let textX = MARGIN + 28;
    const logo = this.options.logoDataUrl;
    if (logo) {
      try {
        // Fitted inside a 104pt square, so a wide wordmark keeps its shape.
        const format = /^data:image\/jpe?g/i.test(logo) ? "JPEG" : "PNG";
        const { width, height } = b.doc.getImageProperties(logo);
        const scale = 104 / Math.max(width, height, 1);
        const w = width * scale;
        const h = height * scale;
        b.doc.addImage(logo, format, MARGIN + 24 + (104 - w) / 2, 66 + (104 - h) / 2, w, h, undefined, "FAST");
        textX = MARGIN + 148;
      } catch { /* a logo that will not draw is left off */ }
    }
    b.text("SEASON BOOK", textX, 84, { size: 10, bold: true, color: onDark(b.accent), charSpace: 2.4 });
    b.text(this.program.name.toUpperCase(), textX, 116, { size: 26, bold: true, color: WHITE, max: MARGIN + CONTENT_W - textX - 20 });
    b.text(this.options.seasonLabel.toUpperCase(), textX, 140, { size: 13, bold: true, color: [200, 204, 210], charSpace: 1 });
    b.text(`${recordLabel(rec)}  ·  ${rec.final} game${rec.final === 1 ? "" : "s"}  ·  ${rec.pf} points for, ${rec.pa} against`, textX, 172, { size: 9.5, color: WHITE });
    b.text(`Made ${this.options.generatedLabel}`, textX, 190, { size: 7.5, color: [160, 166, 176] });

    // Tiles.
    const us = teamPeriodLines(this.season, this.program.id);
    const gamesN = this.season.games;
    const tiles: Array<[string, string, string]> = [
      ["Record", recordLabel(rec), `${rec.final} final`],
      ["Points per game", per(us.us.points, gamesN), `${us.us.points} total`],
      ["Allowed per game", per(us.them.points, gamesN), `${us.them.points} total`],
      ["Yards per game", per(us.us.totalYds, gamesN), `${us.us.rushYds} rush, ${us.us.passYds} pass`],
      ["Allowed per game", per(us.them.totalYds, gamesN), "yards"],
      ["Turnover margin", signed(us.them.turnovers - us.us.turnovers), `${us.them.turnovers} gained, ${us.us.turnovers} lost`],
    ];
    const tileW = (CONTENT_W - 5 * 6) / 6;
    tiles.forEach(([label, value, sub], i) => {
      const x = MARGIN + i * (tileW + 6);
      b.rect(x, 232, tileW, 58, STRIPE);
      b.rect(x, 232, tileW, 2, INK);
      b.text(label.toUpperCase(), x + 6, 246, { size: 6, bold: true, color: MUTE, max: tileW - 10, charSpace: 0.3 });
      b.text(value, x + 6, 268, { size: 17, bold: true });
      b.text(sub, x + 6, 282, { size: 6.2, color: MUTE, max: tileW - 10 });
    });
    b.y = 306;

    // Leaders.
    const leaders = this.leaders(this.season);
    b.subhead("Season leaders", { minBelow: 20 });
    const lw = CONTENT_W / 3;
    leaders.forEach((l, i) => {
      const x = MARGIN + (i % 3) * lw;
      const y = b.y + Math.floor(i / 3) * 30;
      b.text(l.label.toUpperCase(), x, y + 8, { size: 6.2, bold: true, color: MUTE, charSpace: 0.3 });
      b.text(l.value, x, y + 20, { size: 8.6, bold: true, max: lw - 10, link: l.link });
    });
    b.y += Math.ceil(leaders.length / 3) * 30 + 8;

    // Results.
    b.table([
      col("G", 18), { label: "Date", width: 44, align: "left" }, { label: "Opponent", width: 0, align: "left" },
      { label: "Site", width: 40, align: "left" }, { label: "Result", width: 56 }, col("Yds", 34), col("Opp yds", 40), col("TO +/-", 34), col("Page", 30),
    ], this.games.map(g => {
      const s = gameStats(this.program, g, "game")!;
      const t = teamPeriodLines(s, this.program.id);
      return { cells: [
        g.number, shortDate(g.meta.date), { text: this.opponentText(g), link: K.game(g.meta.id) },
        g.meta.isHome ? "Home" : "Away", { text: this.resultText(g), bold: true, color: this.resultColor(g) },
        t.us.totalYds, t.them.totalYds, signed(t.them.turnovers - t.us.turnovers), { text: "", pageOf: K.game(g.meta.id) },
      ] };
    }), { title: "Results", titleNote: "Tap a game to open it · TO +/- = takeaways less giveaways" });

    // The season's line score.
    const quarters: StatPeriod[] = this.hasOT ? ["q1", "q2", "q3", "q4", "ot"] : ["q1", "q2", "q3", "q4"];
    const byQuarter = quarters.map(q => {
      const slice = this.seasonFor(q);
      return slice ? teamPeriodLines(slice, this.program.id) : null;
    });
    b.table([{ label: "Team", width: 0, align: "left" }, ...quarters.map(q => col(PERIOD_SHORT[q], 44)), col("Total", 52)], [
      { cells: [{ text: this.program.name, bold: true }, ...byQuarter.map(l => String(l?.us.points ?? 0)), { text: String(us.us.points), bold: true }] },
      { cells: ["Opponents", ...byQuarter.map(l => String(l?.them.points ?? 0)), { text: String(us.them.points), bold: true }] },
    ], { title: "Points by quarter", titleNote: "Every final game added up", size: 8.2, rowH: 12.4 });
    b.note("How to use this book: every game and player name is a link. Tap one to jump to its page; tap Contents at the foot of any page to come back. Numbers are counted from the plays charted in Dragon Stats, the same way the app's Game Report and Season Stats count them. Completed games only.");
  }

  private leaders(stats: PeriodStats): Array<{ label: string; value: string; link?: string }> {
    return leaders(stats, id => this.playerIds.has(id)).map(l => ({
      label: l.category,
      value: `${this.players.find(p => p.id === l.id)?.label ?? ""}, ${l.value}`,
      link: this.playerLink(l.id),
    }));
  }

  /* ── Contents ── */
  private contentsLines(): Array<{ h: number; draw: (y: number) => void }> {
    const b = this.b;
    const lines: Array<{ h: number; draw: (y: number) => void }> = [];
    // `y` is the baseline of the slot's text; the heading sits in its top.
    const heading = (text: string) => lines.push({ h: 24, draw: y => { b.subheadAt(text, y - 13); } });
    const entry = (text: string, key: string, opts: { bold?: boolean; detail?: string; color?: RGB; x?: number; w?: number; size?: number } = {}) => (y: number) => {
      const x = opts.x ?? MARGIN;
      const w = opts.w ?? CONTENT_W;
      const page = b.pageOf(key);
      const size = opts.size ?? 8.4;
      const tw = b.text(text, x, y, { size, bold: opts.bold, link: key, max: w - 70 });
      let left = x + tw + 4;
      if (opts.detail) left += b.text(opts.detail, left, y, { size: size - 1, color: opts.color ?? MUTE }) + 4;
      const pageText = page != null ? String(page) : "";
      const pw = b.text(pageText, x + w, y, { size, bold: true, align: "right", link: key });
      // Dot leaders.
      b.font(size, false, FAINT);
      const dotsFrom = left + 2;
      const dotsTo = x + w - pw - 4;
      if (dotsTo > dotsFrom) {
        const dot = b.width(". ");
        const count = Math.floor((dotsTo - dotsFrom) / dot);
        if (count > 0) b.doc.text(". ".repeat(count), dotsTo - count * dot, y);
      }
      b.link(key, x, y - size, w, size + 3);
    };
    heading("Season");
    for (const [text, key] of [
      ["Team statistics", K.seasonTeam], ["By quarter and half", K.seasonSplits],
      ["Individual statistics", K.seasonPlayers], ["Game by game", K.seasonGames],
    ] as const) lines.push({ h: 14, draw: entry(text, key, { bold: true }) });
    lines.push({ h: 8, draw: () => {} });
    heading("Games");
    for (const g of this.games) {
      lines.push({ h: 13, draw: entry(`Game ${g.number} · ${shortDate(g.meta.date)} · ${this.opponentText(g)}`, K.game(g.meta.id), {
        bold: true, detail: this.resultText(g), color: this.resultColor(g),
      }) });
      lines.push({ h: 13, draw: y => {
        let x = MARGIN + 14;
        for (const [text, key] of [["Players", K.gamePlayers(g.meta.id)], ["By quarter", K.gameSplits(g.meta.id)], ["Play-by-play", K.gamePbp(g.meta.id)]] as const) {
          const page = b.pageOf(key);
          x += b.text(`${text}${page != null ? ` p.${page}` : ""}`, x, y - 1, { size: 7.2, link: key }) + 14;
        }
      } });
    }
    lines.push({ h: 8, draw: () => {} });
    heading("Players");
    const half = Math.ceil(this.players.length / 2);
    for (let i = 0; i < half; i++) {
      const pair = [this.players[i], this.players[i + half]].filter(Boolean) as BookPlayer[];
      lines.push({ h: 12.5, draw: y => {
        pair.forEach((p, j) => entry(p.label, K.player(p.id), {
          x: MARGIN + j * (CONTENT_W / 2 + 6), w: CONTENT_W / 2 - 6, size: 8,
          detail: p.position ?? undefined,
        })(y));
      } });
    }
    return lines;
  }
  private paginateContents() {
    const pages: Array<Array<{ y: number; draw: (y: number) => void }>> = [[]];
    let y = TOP + 34;
    for (const line of this.contentsLines()) {
      if (y + line.h > BOTTOM) { pages.push([]); y = TOP + 8; }
      pages[pages.length - 1].push({ y: y + line.h - 4, draw: line.draw });
      y += line.h;
    }
    return pages;
  }
  reserveContents() {
    const count = this.paginateContents().length;
    for (let i = 0; i < count; i++) {
      this.b.newPage("Contents");
      if (i === 0) this.b.anchor(K.contents, TOP);
      this.contentsPages.push(this.b.page);
    }
  }
  private drawContents() {
    const b = this.b;
    const pages = this.paginateContents();
    pages.forEach((items, i) => {
      const pageNo = this.contentsPages[i];
      if (pageNo == null) return;
      b.doc.setPage(pageNo);
      if (i === 0) {
        b.text("CONTENTS", MARGIN, TOP + 16, { size: 18, bold: true, charSpace: 1 });
        b.text("Every line is a link", MARGIN + CONTENT_W, TOP + 16, { size: 7.5, color: MUTE, align: "right" });
      }
      for (const item of items) item.draw(item.y);
    });
  }

  /* ── Season ── */
  seasonSections() {
    const b = this.b;
    const s = this.season;
    b.label = "Season totals";

    // Team statistics.
    b.newPage();
    b.band("Season team statistics", { anchor: K.seasonTeam, note: `${s.games} final game${s.games === 1 ? "" : "s"}` });
    this.teamComparison(s.report, s.games, true);

    // By quarter and half.
    b.band("Season by quarter and half", { anchor: K.seasonSplits, note: "Each quarter's numbers added up across the season", minBelow: 200 });
    this.teamSplits(p => this.seasonFor(p), "Season");
    this.playerSplits(p => this.seasonFor(p), "Season");

    // Individual statistics.
    b.newPage();
    b.band("Season individual statistics", { anchor: K.seasonPlayers, note: "GP = games with a stat line" });
    this.individualTables(s, true);

    // Game by game.
    b.newPage();
    b.band("Game by game", { anchor: K.seasonGames, note: "Tap a game to open it" });
    this.gameByGame();
  }

  private teamComparison(report: GameReport, games: number | null, perGame: boolean) {
    const b = this.b;
    const rows = report.teamStats.filter(r => !/possession/i.test(r.label));
    const sides = teamPeriodLines(games ? this.season : { report, bundle: this.season.bundle }, this.program.id);
    const top = games ? clockFromSeconds(sides.us.topSeconds / games) : "";
    const cols: Column[] = perGame
      ? [{ label: "Statistic", width: 0, align: "left" }, col(this.abbr, 64), col("Per game", 54), col("Opponents", 64), col("Per game", 54)]
      : [{ label: "Statistic", width: 0, align: "left" }, col(this.abbr, 70), col(report.them.abbr, 70)];
    const perG = (v: string) => games && /^-?\d+(\.\d+)?$/.test(v) ? per(Number(v), games) : "";
    const tableRows: Row[] = [];
    if (perGame && games) {
      tableRows.push({ kind: "head", cells: ["POINTS", sides.us.points, per(sides.us.points, games), sides.them.points, per(sides.them.points, games)] });
    }
    tableRows.push(...rows.map((r: TeamStatRow) => {
      const rate = /average|per /i.test(r.label);
      const cells: CellIn[] = perGame
        ? [r.label, r.us, rate ? "" : perG(r.us), r.them, rate ? "" : perG(r.them)]
        : [r.label, r.us, r.them];
      return { cells, kind: r.emphasis === "head" ? "head" : r.emphasis === "sub" ? "sub" : undefined } as Row;
    }));
    if (perGame && games) {
      const themTop = clockFromSeconds(sides.them.topSeconds / games);
      tableRows.push({ cells: ["Possession time per game", top, "", themTop, ""] });
    }
    b.table(cols, tableRows, { size: 7.4, rowH: 10.6 });
  }

  /** Team numbers across the slices: two lines per stat, ours then theirs. */
  private teamSplits(slice: (p: StatPeriod) => PeriodStats | null, wholeLabel: string, hasOT = this.hasOT, oppAbbr = "OPP") {
    const periods = splitPeriods(hasOT);
    const lines = periods.map(p => {
      const s = slice(p);
      return s ? teamPeriodLines(s, this.program.id) : null;
    });
    const stats: Array<[string, (l: TeamPeriodLine) => string]> = [
      ["Points", l => String(l.points)],
      ["First downs", l => String(l.firstDowns)],
      ["Rushing att-yds", l => `${l.rushAtt}-${l.rushYds}`],
      ["Passing c-a-yds", l => `${l.passComp}-${l.passAtt}-${l.passYds}`],
      ["Total yards", l => String(l.totalYds)],
      ["Plays · yds/play", l => `${l.plays} · ${per(l.totalYds, l.plays)}`],
      ["3rd down conv", l => `${l.thirdConv}-${l.thirdAtt}`],
      ["Turnovers", l => String(l.turnovers)],
      ["Penalties-yds", l => `${l.penalties}-${l.penaltyYds}`],
      ["Possession", l => clockFromSeconds(l.topSeconds)],
    ];
    const cols: Column[] = [{ label: "", width: 92, align: "left" }, { label: "", width: 30, align: "left" },
      ...splitColumns("", periods, wholeLabel).slice(1)];
    const rows: Row[] = [];
    for (const [name, value] of stats) {
      rows.push({ cells: [{ text: name, bold: true }, { text: this.abbr, bold: true }, ...lines.map(l => l ? value(l.us) : "")] });
      rows.push({ cells: ["", { text: oppAbbr, color: MUTE }, ...lines.map(l => ({ text: l ? value(l.them) : "", color: MUTE }))] });
    }
    this.b.table(cols, rows, { title: "Team", titleNote: `${this.abbr} on top, opponents beneath`, size: 7.1, rowH: 10 });
  }

  /** Our players across the slices, one compact cell each. `game` limits it
   *  to the players of one game. */
  private playerSplits(slice: (p: StatPeriod) => PeriodStats | null, wholeLabel: string, hasOT = this.hasOT) {
    const periods = splitPeriods(hasOT);
    const slices = periods.map(p => slice(p));
    const whole = slices[slices.length - 1];
    for (const cat of SPLIT_CATS) {
      const ids = this.players.filter(p => cat.cell(playerLine(whole, p.id)).some(Boolean));
      if (ids.length === 0) continue;
      const rows: Row[] = ids.flatMap(p => splitRows(
        { text: p.label, link: K.player(p.id) },
        slices.map(s => cat.cell(playerLine(s, p.id))),
        periods.length - 1,
      ));
      this.b.table(splitColumns("Player", periods, wholeLabel), rows, { title: `${cat.title} by quarter`, titleNote: cat.legend, size: 7, rowH: 9.8 });
    }
  }

  private individualTables(stats: PeriodStats, withGp: boolean) {
    const r = stats.report;
    const gpCol: Column[] = withGp ? [col("GP", 22)] : [];
    const gp = (id?: string): CellIn[] => withGp ? [id ? String(this.gp.get(id) ?? "") : ""] : [];
    const put = <T extends { id?: string; name: string }>(cat: Category<T>, rows: T[], total?: T, title = cat.title) => {
      const pg = withGp ? cat.perGame : undefined;
      const pgCol: Column[] = pg ? [col(pg.label, 30)] : [];
      const pgCell = (row: T, games: number): CellIn[] => pg ? [per(pg.value(row), games)] : [];
      const body: Row[] = rows.map(row => ({ cells: [this.nameCell(row), ...gp(row.id), ...cat.cells(row), ...pgCell(row, this.gp.get(row.id ?? "") ?? 0)] }));
      if (total && rows.length > 1) body.push({ cells: ["Total", ...gp(), ...cat.cells(total), ...pgCell(total, this.season.games)], kind: "total" });
      this.b.table([{ label: "Player", width: 0, align: "left" }, ...gpCol, ...cat.cols, ...pgCol], body, { title });
    };
    const scoringRows = r.points.map(p => ({ ...p, scoring: playerLine(stats, p.id ?? "").scoring }));
    put(SCORING, scoringRows, {
      name: "Total", points: r.pointsTotal,
      scoring: scoringRows.reduce<PlayerScoring>((t, x) => ({
        points: t.points + x.points, touchdowns: t.touchdowns + (x.scoring?.touchdowns ?? 0),
        twoPointMade: t.twoPointMade + (x.scoring?.twoPointMade ?? 0), patMade: t.patMade + (x.scoring?.patMade ?? 0), fgMade: t.fgMade + (x.scoring?.fgMade ?? 0),
      }), { points: 0, touchdowns: 0, twoPointMade: 0, patMade: 0, fgMade: 0 }),
    });
    put(RUSHING, r.rushing, r.rushingTotal);
    put(PASSING, r.passing, r.passingTotal);
    put(RECEIVING, r.receiving, r.receivingTotal);
    put(DEFENSE, r.defense, r.defenseTotal);
    const kickers = kickingRows(stats).map(k => ({ id: k.id, name: this.players.find(p => p.id === k.id)?.label ?? (k.id === "our_team" ? "TEAM" : k.id), ...k.line }));
    if (kickers.length) {
      put(KICKING, kickers, kickers.reduce((t, k) => ({ ...t, fgMade: t.fgMade + k.fgMade, fgAtt: t.fgAtt + k.fgAtt, fgLong: Math.max(t.fgLong, k.fgLong), patMade: t.patMade + k.patMade, patAtt: t.patAtt + k.patAtt }), { name: "Total", fgMade: 0, fgAtt: 0, fgLong: 0, patMade: 0, patAtt: 0 }));
    }
    if (r.punting.length) put(PUNTING, r.punting, r.puntingTotal);
    if (r.kickoffs.length) put(KICKOFFS, r.kickoffs, r.kickoffsTotal);
    for (const kind of ["ko", "punt", "int", "fr"] as const) {
      const rows = r.returns.filter(hasReturn(kind));
      if (rows.length) put(returnsCategory(kind), rows, r.returnsTotal);
    }
  }

  private gameByGame() {
    const b = this.b;
    const lines = this.games.map(g => {
      const s = gameStats(this.program, g, "game")!;
      return { g, s, t: teamPeriodLines(s, this.program.id) };
    });
    const cols = (who: string): Column[] => [
      col("G", 16), { label: "Opponent", width: 0, align: "left" as const }, { label: "Result", width: 48 },
      col("1st D", 28), col("Rush", 42), col("Pass", 50), col("Total", 32), col("Plays", 30), col("Y/P", 28),
      col("3rd D", 34), col("TO", 22), col("Pen", 36),
    ].map((c, i) => (i === 1 ? { ...c, label: who } : c));
    const row = (g: BookGame, l: TeamPeriodLine): CellIn[] => [
      g.number, { text: this.opponentText(g), link: K.game(g.meta.id) }, { text: this.resultText(g), bold: true, color: this.resultColor(g) },
      l.firstDowns, `${l.rushAtt}-${l.rushYds}`, `${l.passComp}-${l.passAtt}-${l.passYds}`, { text: String(l.totalYds), bold: true }, l.plays,
      per(l.totalYds, l.plays), `${l.thirdConv}-${l.thirdAtt}`, l.turnovers, `${l.penalties}-${l.penaltyYds}`,
    ];
    const s = teamPeriodLines(this.season, this.program.id);
    const totalRow = (l: TeamPeriodLine): Row => ({ kind: "total", cells: [
      "", "Season", "", l.firstDowns, `${l.rushAtt}-${l.rushYds}`, `${l.passComp}-${l.passAtt}-${l.passYds}`, l.totalYds, l.plays,
      per(l.totalYds, l.plays), `${l.thirdConv}-${l.thirdAtt}`, l.turnovers, `${l.penalties}-${l.penaltyYds}`,
    ] });
    b.table(cols(`${this.abbr} offense`), [...lines.map(x => ({ cells: row(x.g, x.t.us) })), totalRow(s.us)], { title: `${this.program.name} offense`, titleNote: "Rush att-yds · Pass comp-att-yds" });
    b.table(cols("Opponent offense"), [...lines.map(x => ({ cells: row(x.g, x.t.them) })), totalRow(s.them)], { title: "Opponent offense", titleNote: "What the defense allowed" });

    // Leaders, game by game.
    const leader = <T extends { id?: string; name: string }>(rows: T[], score: (r: T) => number, text: (r: T) => string): Cell => {
      const best = rows.filter(r => r.id).sort((a, z) => score(z) - score(a))[0];
      if (!best || score(best) <= 0) return { text: "" };
      return { text: `${this.shortName(best)} ${text(best)}`, link: this.playerLink(best.id) };
    };
    b.table([
      col("G", 16), { label: "Opponent", width: 92, align: "left" },
      { label: "Rushing", width: 0, align: "left" }, { label: "Passing", width: 0, align: "left" },
      { label: "Receiving", width: 0, align: "left" }, { label: "Tackles", width: 0, align: "left" },
    ], lines.map(({ g, s: st }) => ({ cells: [
      g.number, { text: g.meta.opponentName, link: K.game(g.meta.id) },
      leader(st.report.rushing, r => r.net, r => `${r.att}-${r.net}`),
      leader(st.report.passing, r => r.yds, r => `${r.comp}/${r.att}-${r.yds}`),
      leader(st.report.receiving, r => r.yds, r => `${r.rec}-${r.yds}`),
      leader(st.report.defense, r => r.total, r => n(r.total)),
    ] })), { title: "Leaders by game", size: 7 });
  }

  private shortName(row: { id?: string; name: string }): string {
    const p = row.id ? this.players.find(x => x.id === row.id) : undefined;
    if (!p) return row.name;
    const last = p.name.split(/\s+/).slice(-1)[0] ?? p.name;
    return p.jersey != null ? `#${p.jersey} ${last}` : last;
  }

  /* ── One game ── */
  gameSection(g: BookGame) {
    const b = this.b;
    const s = gameStats(this.program, g, "game");
    if (!s) return;
    const r = s.report;
    const hasOT = gameHasOT(g);
    b.label = `Game ${g.number} · ${this.opponentText(g)}`;
    b.newPage();
    b.anchor(K.game(g.meta.id), TOP);

    // Masthead.
    const y0 = b.y;
    b.text(`GAME ${g.number}  ·  ${longDate(g.meta.date)}  ·  ${g.meta.isHome ? "HOME" : "AWAY"}`, MARGIN, y0 + 8, { size: 7.5, bold: true, color: MUTE, charSpace: 0.6 });
    b.text(`${g.meta.isHome ? "vs" : "at"} ${g.meta.opponentName}`.toUpperCase(), MARGIN, y0 + 30, { size: 20, bold: true, max: CONTENT_W - 150 });
    const result = gameResult(g.meta);
    const chipW = 128;
    b.rect(MARGIN + CONTENT_W - chipW, y0 + 6, chipW, 30, result === "W" ? GREEN : result === "L" ? b.accent : MUTE);
    b.text(`${result === "W" ? "WIN" : result === "L" ? "LOSS" : result === "T" ? "TIE" : ""}  ${g.meta.ourScore}-${g.meta.theirScore}`, MARGIN + CONTENT_W - chipW / 2, y0 + 26, { size: 13, bold: true, color: WHITE, align: "center" });
    b.y = y0 + 44;
    // Jump links within the game.
    let jx = MARGIN;
    for (const [text, key] of [["Players", K.gamePlayers(g.meta.id)], ["By quarter", K.gameSplits(g.meta.id)], ["Play-by-play", K.gamePbp(g.meta.id)], ["Game by game", K.seasonGames]] as const) {
      jx += b.text(`${text} ›`, jx, b.y + 4, { size: 7.6, bold: true, link: key }) + 14;
    }
    b.y += 14;

    // Line score.
    const qCols = r.quarters.map(q => col(q === "OT" ? "OT" : q, 34));
    b.table([{ label: "Team", width: 0, align: "left" }, ...qCols, col("Final", 44)], [
      { cells: [{ text: this.program.name, bold: true }, ...r.lineScore.us.map(String), { text: String(g.meta.ourScore), bold: true }] },
      { cells: [g.meta.opponentName, ...r.lineScore.them.map(String), { text: String(g.meta.theirScore), bold: true }] },
    ], { title: "Line score", size: 8.4, rowH: 13 });

    // Scoring summary.
    if (r.scoring.length) {
      b.table([
        col("Qtr", 26), { label: "Time", width: 32, align: "left" }, { label: "Team", width: 32, align: "left" },
        { label: "Scoring play", width: 0, align: "left" }, col(`${this.abbr}-${g.meta.opponentAbbr}`, 48),
      ], r.scoring.map(row => {
        const [them, us] = row.score.split("-");
        return { cells: [
          row.quarter > 4 ? "OT" : String(row.quarter), row.clock, { text: row.team, bold: true, color: row.isUs ? INK : MUTE },
          `${row.play}${row.conversion ? ` ${row.conversion}` : ""}`, { text: `${us}-${them}`, bold: true },
        ] };
      }), { title: "Scoring summary" });
    }

    // Team statistics, two columns.
    this.twoColumnTeamStats(r);

    // Players.
    b.band("Individual statistics", { anchor: K.gamePlayers(g.meta.id), note: `${this.opponentText(g)} · ${this.resultText(g)}` });
    this.individualTables(s, false);

    // By quarter and half.
    b.newPage();
    b.band("By quarter and half", { anchor: K.gameSplits(g.meta.id), note: `${this.opponentText(g)} · ${this.resultText(g)}` });
    this.teamSplits(p => gameStats(this.program, g, p), "Game", hasOT, g.meta.opponentAbbr);
    this.playerSplits(p => gameStats(this.program, g, p), "Game", hasOT);

    // Play-by-play.
    b.newPage();
    b.band("Play-by-play", { anchor: K.gamePbp(g.meta.id), note: "Yards are what the stats counted · # matches the app's play log" });
    this.playByPlaySection(g, s);
  }

  private twoColumnTeamStats(r: GameReport) {
    const b = this.b;
    const rows = r.teamStats;
    const half = Math.ceil(rows.length / 2);
    const colW = (CONTENT_W - 14) / 2;
    const toRows = (list: TeamStatRow[]): Row[] => list.map(x => ({
      cells: [x.label, x.us, x.them], kind: x.emphasis === "head" ? "head" : x.emphasis === "sub" ? "sub" : undefined,
    }));
    const cols: Column[] = [{ label: "Team statistics", width: 0, align: "left" }, col(r.us.abbr, 54), col(r.them.abbr, 54)];
    const height = (half + 1) * 10 + 30;
    b.ensure(height);
    const startPage = b.page;
    const y = b.y;
    b.table(cols, toRows(rows.slice(0, half)), { size: 7, rowH: 9.6, x: MARGIN, width: colW });
    const leftEnd = b.y;
    if (b.page === startPage) {
      b.y = y;
      b.table(cols, toRows(rows.slice(half)), { size: 7, rowH: 9.6, x: MARGIN + colW + 14, width: colW });
      b.y = Math.max(leftEnd, b.y);
    } else {
      b.table(cols, toRows(rows.slice(half)), { size: 7, rowH: 9.6 });
    }
  }

  private playByPlaySection(g: BookGame, s: PeriodStats) {
    const b = this.b;
    const quarters = playByPlay(s.bundle.allPlays, s.bundle.summary.drives, s.bundle.roster, this.abbr, g.meta.opponentAbbr);
    const usColor = b.accent;
    const themColor = apart(hexToRgb(g.meta.opponentColor, MUTE), usColor);
    // Columns: # · clock · down · spot · play · gain · note.
    const X = { num: MARGIN, clock: MARGIN + 20, down: MARGIN + 46, spot: MARGIN + 92, play: MARGIN + 134, gain: MARGIN + CONTENT_W - 66, note: MARGIN + CONTENT_W };
    const playW = X.gain - X.play - 26;
    const size = 7.2;
    const lineH = size + 2.3;

    const drawPlay = (p: PbpPlay) => {
      const lines = b.wrap(p.text, playW, size);
      const credit = p.credits ? b.wrap(p.credits, playW, size - 0.8) : [];
      const h = lines.length * lineH + credit.length * (lineH - 1) + 3.5;
      if (b.y + h > BOTTOM) { b.newPage(); pbpHeader(); }
      const y = b.y + size + 1;
      b.text(String(p.number), X.num + 14, y, { size: size - 0.6, color: FAINT, align: "right" });
      b.text(p.clock, X.clock, y, { size: size - 0.4, color: MUTE });
      b.text(p.situation, X.down, y, { size: size - 0.4, color: MUTE, max: 46 });
      b.text(p.spot, X.spot, y, { size: size - 0.4, color: MUTE, max: 40 });
      lines.forEach((line, i) => b.text(line, X.play, y + i * lineH, { size, bold: p.flags.includes("TD") }));
      credit.forEach((line, i) => b.text(line, X.play, y + lines.length * lineH + i * (lineH - 1), { size: size - 0.8, color: MUTE }));
      if (p.gain) b.text(p.gain, X.gain, y, { size, bold: true, align: "right", color: p.gain === "No play" ? AMBER : INK });
      const flags = p.flags.join(" ");
      if (flags) b.text(flags, X.note, y, { size: size - 0.6, bold: true, align: "right", color: p.flags.includes("TD") ? GREEN : p.flags.includes("TO") ? RED_TEXT : AMBER });
      if (p.score) b.text(p.score, X.note, y + lineH, { size: size - 0.8, bold: true, align: "right" });
      b.y += Math.max(h, p.score ? lineH * 2 + 3 : 0);
      b.rule(b.y - 1.2, LINE, 0.2);
    };
    const pbpHeader = () => {
      const y = b.y + 7;
      for (const [label, x, align] of [["#", X.num + 14, "right"], ["Clock", X.clock, "left"], ["Down", X.down, "left"], ["Ball on", X.spot, "left"], ["Play", X.play, "left"], ["Yds", X.gain, "right"], ["", X.note, "right"]] as const) {
        b.text(label.toUpperCase(), x, y, { size: 5.8, bold: true, color: MUTE, align });
      }
      b.rule(y + 2.4, INK, 0.6);
      b.y = y + 5;
    };

    pbpHeader();
    for (const q of quarters) {
      // The quarter band, a drive heading and a play under it, or a new page.
      b.ensure(64);
      const y = b.y + 2;
      b.rect(MARGIN, y, CONTENT_W, 14, INK);
      b.text(q.title.toUpperCase(), MARGIN + 8, y + 9.8, { size: 8, bold: true, color: WHITE, charSpace: 0.5 });
      b.text(`End of quarter: ${q.endScore}`, MARGIN + CONTENT_W - 8, y + 9.6, { size: 7, color: [200, 204, 210], align: "right" });
      b.y = y + 18;
      for (const d of q.drives) {
        // A drive heading never sits alone at the foot of a page.
        b.ensure(44);
        const dy = b.y;
        const color = d.side === "us" ? usColor : themColor;
        b.rect(MARGIN, dy, CONTENT_W, 12.5, STRIPE);
        b.rect(MARGIN, dy, 3, 12.5, color);
        const head = d.kind === "kick" ? `${d.abbr} ${d.label.toLowerCase()}` : `${d.abbr} ${d.label}${d.result ? ` – ${d.result}` : ""}`;
        const hw = b.text(head, MARGIN + 8, dy + 8.9, { size: 7.4, bold: true });
        const cont = [d.continuedFrom != null ? `continued from Q${d.continuedFrom}` : "", d.continuesInto != null ? `continues in Q${d.continuesInto}` : ""].filter(Boolean).join(" · ");
        if (cont) b.text(cont, MARGIN + 14 + hw, dy + 8.8, { size: 6.4, color: MUTE });
        if (d.summary) b.text(d.summary, MARGIN + CONTENT_W - 6, dy + 8.8, { size: 6.6, color: MUTE, align: "right" });
        b.y = dy + 15.5;
        for (const p of d.plays) drawPlay(p);
        b.y += 3;
      }
    }
  }

  /* ── Players ── */
  playerSections() {
    const b = this.b;
    if (this.players.length === 0) return;
    b.label = "Players";
    b.newPage();
    for (const p of this.players) this.playerSection(p);
  }

  private playerSection(p: BookPlayer) {
    const b = this.b;
    b.ensure(150);
    b.anchor(K.player(p.id));
    const firstPage = b.page;
    const season = playerLine(this.season, p.id);
    const gp = this.gp.get(p.id) ?? 0;
    // Name band.
    const y = b.y;
    b.rect(MARGIN, y, CONTENT_W, 24, INK);
    b.rect(MARGIN, y, 5, 24, b.accent);
    b.text(p.label.toUpperCase(), MARGIN + 12, y + 16.4, { size: 12, bold: true, color: WHITE, charSpace: 0.4, max: CONTENT_W - 180 });
    b.text([p.position, `${gp} GP`].filter(Boolean).join("  ·  "), MARGIN + CONTENT_W - 8, y + 15.6, { size: 8, color: [200, 204, 210], align: "right" });
    b.y = y + 28;
    const summary = playerSummary(season);
    if (summary) { b.text(summary, MARGIN, b.y + 8, { size: 7.8, bold: true, max: CONTENT_W }); b.y += 14; }

    const games = this.games.map(g => ({ g, line: playerLine(gameStats(this.program, g, "game"), p.id) })).filter(x => hasLine(x.line));
    const gameCell = (g: BookGame): Cell => ({ text: `${g.number}. ${shortDate(g.meta.date)} ${g.meta.isHome ? "vs" : "at"} ${g.meta.opponentName}`, link: K.game(g.meta.id) });
    const put = <T,>(cat: Category<T>, pick: (l: PlayerLine) => T | undefined, title = cat.title) => {
      const rows = games.flatMap(({ g, line }) => {
        const v = pick(line);
        return v ? [{ cells: [gameCell(g), ...cat.cells(v)] } as Row] : [];
      });
      if (rows.length === 0) return;
      const total = pick(season);
      if (total && rows.length > 1) rows.push({ cells: ["Season", ...cat.cells(total)], kind: "total" });
      b.table([{ label: "Game", width: 0, align: "left" }, ...cat.cols], rows, { title, size: 7.2, rowH: 10.2 });
    };
    put(SCORING, l => l.points ? { points: l.points.points, scoring: l.scoring } : undefined);
    put(RUSHING, l => l.rushing);
    put(PASSING, l => l.passing);
    put(RECEIVING, l => l.receiving);
    put(DEFENSE, l => l.defense);
    put(KICKING, l => l.kicking);
    put(PUNTING, l => l.punting);
    put(KICKOFFS, l => l.kickoffs);
    for (const kind of ["ko", "punt", "int", "fr"] as const) put(returnsCategory(kind), l => l.returns && hasReturn(kind)(l.returns) ? l.returns : undefined);

    // By quarter, game by game.
    const periods = splitPeriods(this.hasOT);
    for (const cat of SPLIT_CATS) {
      if (cat.title === "Scoring") continue;
      const rows: Row[] = games.flatMap(({ g, line }) => {
        if (!cat.cell(line).some(Boolean)) return [];
        return splitRows(gameCell(g), periods.map(q => cat.cell(playerLine(gameStats(this.program, g, q), p.id))), periods.length - 1);
      });
      if (rows.length === 0) continue;
      if (games.length > 1) rows.push(...splitRows("Season", periods.map(q => cat.cell(playerLine(this.seasonFor(q), p.id))), -1, true));
      b.table(splitColumns("Game", periods, "Game"), rows, {
        title: `${cat.title} by quarter`, titleNote: cat.legend, size: 6.9, rowH: 9.8,
      });
    }
    b.gap(6);
    // The header names whoever is on the page.
    for (let page = firstPage; page <= b.page; page++) {
      const names = this.pagePlayers.get(page) ?? [];
      names.push(p.label);
      this.pagePlayers.set(page, names);
    }
  }
  private pagePlayers = new Map<number, string[]>();

  /* ── Finish ── */
  finish() {
    const b = this.b;
    this.drawContents();
    b.fillPageRefs();
    const total = b.doc.getNumberOfPages();
    for (let page = 1; page <= total; page++) {
      b.doc.setPage(page);
      if (page > 1) this.header(page);
      this.footer(page, total);
    }
    // Every link is drawn: point them all at their sections.
    const missing = b.resolveLinks();
    if (missing.length) console.warn("Season Book links with no section:", missing);
    // The reader's sidebar: same sections as the contents.
    const outline = (b.doc as unknown as { outline?: { add: (parent: unknown, title: string, opts: { pageNumber: number }) => unknown } }).outline;
    if (outline) {
      const at = (key: string) => b.pageOf(key) ?? 1;
      outline.add(null, "Cover", { pageNumber: 1 });
      outline.add(null, "Contents", { pageNumber: at(K.contents) });
      const season = outline.add(null, "Season", { pageNumber: at(K.seasonTeam) });
      outline.add(season, "Team statistics", { pageNumber: at(K.seasonTeam) });
      outline.add(season, "By quarter and half", { pageNumber: at(K.seasonSplits) });
      outline.add(season, "Individual statistics", { pageNumber: at(K.seasonPlayers) });
      outline.add(season, "Game by game", { pageNumber: at(K.seasonGames) });
      const gamesNode = outline.add(null, "Games", { pageNumber: at(K.game(this.games[0].meta.id)) });
      for (const g of this.games) {
        const node = outline.add(gamesNode, pdfText(`${g.number}. ${this.opponentText(g)} (${this.resultText(g)})`), { pageNumber: at(K.game(g.meta.id)) });
        outline.add(node, "Players", { pageNumber: at(K.gamePlayers(g.meta.id)) });
        outline.add(node, "By quarter", { pageNumber: at(K.gameSplits(g.meta.id)) });
        outline.add(node, "Play-by-play", { pageNumber: at(K.gamePbp(g.meta.id)) });
      }
      if (this.players.length) {
        const playersNode = outline.add(null, "Players", { pageNumber: at(K.player(this.players[0].id)) });
        for (const p of this.players) outline.add(playersNode, pdfText(p.label), { pageNumber: at(K.player(p.id)) });
      }
    }
    b.doc.setProperties({
      title: pdfText(`${this.program.name} Season Book, ${this.options.seasonLabel}`),
      subject: "Season statistics",
      author: pdfText(this.program.name),
      creator: "Dragon Stats",
    });
  }

  private header(page: number) {
    const b = this.b;
    b.rect(MARGIN, 26, CONTENT_W, 18, INK);
    // The accent slash under the bar.
    b.fill(b.accent);
    b.doc.triangle(MARGIN + CONTENT_W - 10, 44, MARGIN + CONTENT_W, 44, MARGIN + CONTENT_W - 10, 47.5, "F");
    b.doc.rect(MARGIN, 44, CONTENT_W - 10, 3.5, "F");
    b.text(`${this.program.name}  ·  ${this.options.seasonLabel}  ·  Season Book`.toUpperCase(), MARGIN + 8, 37.6, { size: 6.6, bold: true, color: WHITE, charSpace: 0.5, max: 280 });
    const players = this.pagePlayers.get(page);
    const label = players ? players.join("  ·  ") : b.pageLabels[page] ?? "";
    if (label) b.text(label.toUpperCase(), MARGIN + CONTENT_W - 8, 37.6, { size: 6.6, bold: true, color: [200, 204, 210], align: "right", charSpace: 0.4, max: 230 });
  }

  private footer(page: number, total: number) {
    const b = this.b;
    const y = PAGE_H - 26;
    b.rule(y - 10, LINE, 0.4);
    if (page > 1 && !this.contentsPages.includes(page)) b.text("‹ Contents", MARGIN, y, { size: 7.4, bold: true, link: K.contents });
    b.text(`Made ${this.options.generatedLabel} · Dragon Stats`, PAGE_W / 2, y, { size: 6.4, color: FAINT, align: "center" });
    b.text(`Page ${page} of ${total}`, MARGIN + CONTENT_W, y, { size: 7, color: MUTE, align: "right" });
  }

  output(): Blob {
    return this.b.doc.output("blob");
  }
  /** For tests: the raw bytes. */
  bytes(): ArrayBuffer {
    return this.b.doc.output("arraybuffer");
  }
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

function longDate(date: string | null): string {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

/** "152 rush yds · 3 TD · 24 tackles", the player's season at a glance. */
function playerSummary(l: PlayerLine): string {
  const parts: string[] = [];
  if (l.passing?.att) parts.push(`${l.passing.comp}/${l.passing.att} passing, ${l.passing.yds} yds, ${l.passing.td} TD`);
  if (l.rushing?.att) parts.push(`${l.rushing.att} carries, ${l.rushing.net} yds, ${l.rushing.td} TD`);
  if (l.receiving?.rec) parts.push(`${l.receiving.rec} catches, ${l.receiving.yds} yds, ${l.receiving.td} TD`);
  if (l.defense && (l.defense.total || l.defense.sacks || l.defense.int)) {
    parts.push([`${n(l.defense.total)} tackles`, l.defense.tfl ? `${n(l.defense.tfl)} TFL` : "", l.defense.sacks ? `${n(l.defense.sacks)} sacks` : "", l.defense.int ? `${l.defense.int} INT` : ""].filter(Boolean).join(", "));
  }
  if (l.points?.points) parts.push(`${l.points.points} points`);
  return parts.join("  ·  ");
}

/** Test hook: build without delivering, to inspect the bytes. */
export async function buildSeasonBookBytes(model: SeasonModel, options: SeasonBookOptions): Promise<ArrayBuffer> {
  const blob = await buildSeasonBookPdf(model, options);
  return blob.arrayBuffer();
}
