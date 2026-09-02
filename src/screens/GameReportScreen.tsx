import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computeGameStatsBundle } from "@/services/statsService";
import { buildGameReport, type GameReport, type TeamStatRow } from "@/services/gameReport";

/* ═══════════════════════════════════════════════════════════════════════════
   GAME REPORT — a letter-sized document, laid out in inches.

   The previous version was a fluid web page that @media print then tried to
   talk into being a sheet of paper, and it lost that argument repeatedly: the
   app frame's phone width survived into print, scroll containers clipped
   instead of scrolling, and a global stylesheet restyled the tables on the way
   out. Every fix was one more override fighting the last.

   So this does not do that. A page here is a box 8 inches wide and 10.5 inches
   tall — letter minus the quarter-inch margins the @page rule sets — and it is
   that same box on screen. Nothing in the layout depends on the viewport, a
   breakpoint or a media query, so what is on screen is what comes out of the
   printer by construction rather than by correction. Print only removes the
   gap and the shadow between sheets.

   Everything the old report carried is still here: line score, scoring
   summary, points by player, rushing, passing, receiving, punting, returns,
   kickoffs, the team comparison, and the full defensive table.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Printable area of a letter page at the quarter-inch margins @page sets. */
const PAGE_W = "8in";
const PAGE_H = "10.5in";

interface GameInfo {
  our_score: number;
  opponent_score: number;
  is_home: boolean;
  status: string;
  game_date: string | null;
  kickoff_time: string | null;
  opponent_name: string;
  opponent_abbrev: string | null;
  opponent_color: string;
  opponent_logo_url: string | null;
}

/** Whole numbers plain, fractions to one decimal — 4.5 tackles, 25 carries. */
function n(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/* ── Identity ─────────────────────────────────────────────────────────────── */

/** Keep a logo that will not load off the printed page: a broken-image glyph
 *  on a handout is worse than the initials it replaces. */
function useLoadable(url: string | null) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  return { show: Boolean(url) && !failed, onError: () => setFailed(true) };
}

/** Images and background ink are dropped from a print by default; every mark
 *  here opts back in, because the crest is what says whose sheet this is. */
const PRINT_INK = {
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
} as const;

function Crest({
  logoUrl, abbr, color, size = 18,
}: { logoUrl: string | null; abbr: string; color: string; size?: number }) {
  const img = useLoadable(logoUrl);
  if (img.show) {
    return (
      <img
        src={logoUrl as string}
        alt=""
        onError={img.onError}
        className="object-contain shrink-0"
        style={{ width: size, height: size, ...PRINT_INK }}
      />
    );
  }
  return (
    <span
      className="shrink-0 flex items-center justify-center font-black text-white"
      style={{
        width: size, height: size, fontSize: Math.max(6, Math.round(size * 0.36)),
        backgroundColor: color, ...PRINT_INK,
      }}
    >
      {abbr.slice(0, 3)}
    </span>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

/**
 * One sheet of paper.
 *
 * Fixed inches, not a percentage of anything, so it is the same box on screen
 * and on paper. The footer is pushed down by the flex column rather than
 * positioned absolutely, so a page that overruns its 10.5 inches spills onto
 * the next sheet with the footer still after the content instead of printed
 * across the middle of it.
 */
function Page({
  report, pageNo, pageCount, last, children,
}: {
  report: GameReport;
  pageNo: number;
  pageCount: number;
  last?: boolean;
  children: React.ReactNode;
}) {
  const img = useLoadable(report.us.logoUrl);
  return (
    <section
      /* game-report-sheet is the hook the print stylesheet uses to leave this
         document alone - without it the app's global print rules restyle the
         tables at 10pt on the way to paper, which is a fifth wider than they
         are laid out for. */
      className={`game-report-sheet relative bg-white text-black mx-auto flex flex-col px-[0.34in] py-[0.3in] shadow-xl print:shadow-none ${
        last ? "" : "print:break-after-page"
      }`}
      style={{ width: PAGE_W, minHeight: PAGE_H, ...PRINT_INK }}
    >
      {/* The program's mark, ghosted. One copy per sheet, anchored inside it,
          so it asks nothing special of the print engine — Safari does not
          reliably repeat a fixed element across printed pages. */}
      {img.show && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{ zIndex: 0 }}
        >
          <img
            src={report.us.logoUrl as string}
            alt=""
            onError={img.onError}
            className="object-contain"
            style={{ width: "62%", opacity: 0.045, ...PRINT_INK }}
          />
        </div>
      )}

      <div className="relative flex-1" style={{ zIndex: 1 }}>{children}</div>

      <footer
        className="relative mt-3 pt-1 border-t border-neutral-300 flex items-center justify-between text-[7pt] text-neutral-500"
        style={{ zIndex: 1 }}
      >
        <span className="uppercase tracking-wider font-semibold">
          {report.us.abbr} vs {report.them.abbr} · {report.dateLabel}
        </span>
        <span className="tabular-nums">Page {pageNo} of {pageCount}</span>
      </footer>
    </section>
  );
}

/** Section heading: a black band, which reads as structure at a glance on a
 *  sheet that is otherwise all numbers. */
function Band({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div
      className="flex items-baseline justify-between px-2 py-[3px] mt-3 first:mt-0 mb-1"
      style={{ backgroundColor: "#000", ...PRINT_INK }}
    >
      <h2 className="text-[8pt] font-black uppercase tracking-[0.16em] text-white">{children}</h2>
      {note && <span className="text-[7pt] uppercase tracking-wider text-neutral-300">{note}</span>}
    </div>
  );
}

/** Sub-heading within a band, for the stacked tables on the offense page. */
function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[7.5pt] font-black uppercase tracking-[0.12em] text-neutral-700 mt-2 mb-0.5">
      {children}
    </div>
  );
}

type Col = {
  key: string;
  /** Left-aligned name column; every other column is numeric and right-set. */
  name?: boolean;
  /** Set the value in bold — the number the table is actually asked for. */
  bold?: boolean;
  width?: string;
};

/**
 * A stat table.
 *
 * No horizontal scroll container anywhere: at this width every table fits the
 * page, and a scroll container clips on paper rather than scrolling, which is
 * how columns used to disappear off the right-hand edge.
 */
function StatTable({
  cols, rows, total,
}: {
  cols: Col[];
  rows: Array<Array<string | number>>;
  total?: Array<string | number>;
}) {
  if (rows.length === 0) {
    return <div className="text-[8pt] text-neutral-500 py-1">None recorded.</div>;
  }
  return (
    <table className="w-full border-collapse text-[8.5pt] tabular-nums">
      <thead>
        <tr className="border-b border-black">
          {cols.map((c, i) => (
            <th
              key={c.key + i}
              className={`py-[3px] px-[3px] text-[6.5pt] font-black uppercase tracking-[0.08em] whitespace-nowrap ${
                c.name ? "text-left" : "text-right"
              }`}
              style={c.width ? { width: c.width } : undefined}
            >
              {c.key}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-neutral-200">
            {r.map((cell, ci) => (
              <td
                key={ci}
                className={`py-[2.5px] px-[3px] whitespace-nowrap ${
                  cols[ci]?.name ? "text-left font-semibold" : "text-right"
                } ${cols[ci]?.bold ? "font-black" : ""}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
        {total && (
          <tr className="border-t-2 border-black font-black">
            {total.map((cell, ci) => (
              <td
                key={ci}
                className={`py-[3px] px-[3px] whitespace-nowrap ${
                  cols[ci]?.name ? "text-left" : "text-right"
                }`}
              >
                {cell}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** One half of the team comparison, so 37 rows fit a single page in two
 *  columns instead of running onto a second sheet and leaving this one half
 *  empty. */
function TeamStatColumn({
  rows, usAbbr, themAbbr,
}: { rows: TeamStatRow[]; usAbbr: string; themAbbr: string }) {
  return (
    <table className="w-full border-collapse text-[8pt] tabular-nums">
      <thead>
        <tr className="border-b border-black">
          <th className="text-left py-[3px] px-[3px] text-[6.5pt] font-black uppercase tracking-[0.08em]">
            Team Stat
          </th>
          <th className="text-right py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.5in]">{usAbbr}</th>
          <th className="text-right py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.5in]">{themAbbr}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-neutral-200">
            <td className={`py-[2px] px-[3px] ${
              r.emphasis === "head"
                ? "font-black uppercase text-[7.5pt]"
                : r.emphasis === "sub"
                  ? "pl-3 text-neutral-600"
                  : "font-semibold"
            }`}>
              {r.label}
            </td>
            <td className={`py-[2px] px-[3px] text-right ${r.emphasis === "head" ? "font-black" : ""}`}>{r.us}</td>
            <td className={`py-[2px] px-[3px] text-right ${r.emphasis === "head" ? "font-black" : ""}`}>{r.them}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One side of the final score. */
function ScoreBlock({ abbr, score, won }: { abbr: string; score: number; won: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9pt] font-black uppercase tracking-widest text-neutral-600">{abbr}</span>
      <span className={`text-[22pt] font-black leading-none tabular-nums ${won ? "" : "text-neutral-500"}`}>
        {score}
      </span>
    </div>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────────── */

export default function GameReportScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { program, season } = useProgramContext();

  const [report, setReport] = useState<GameReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId || !program || !season) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [{ data: gData }, bundle] = await Promise.all([
        supabase
          .from("games")
          .select("our_score, opponent_score, is_home, status, game_date, kickoff_time, opponent:opponents(name, abbreviation, primary_color, logo_url)")
          .eq("id", gameId)
          .single(),
        computeGameStatsBundle(gameId, {
          id: program.id,
          name: program.name,
          abbreviation: program.abbreviation,
          game_config: program.game_config,
        }),
      ]);
      if (cancelled) return;

      const opp = (gData?.opponent ?? null) as {
        name?: string; abbreviation?: string | null;
        primary_color?: string | null; logo_url?: string | null;
      } | null;

      const info: GameInfo | null = gData
        ? {
            our_score: gData.our_score,
            opponent_score: gData.opponent_score,
            is_home: gData.is_home,
            status: gData.status,
            game_date: gData.game_date ?? null,
            kickoff_time: (gData as { kickoff_time?: string | null }).kickoff_time ?? null,
            opponent_name: opp?.name ?? "Opponent",
            opponent_abbrev: opp?.abbreviation ?? null,
            opponent_color: opp?.primary_color ?? "#6b7280",
            opponent_logo_url: opp?.logo_url ?? null,
          }
        : null;

      if (bundle && info) {
        setReport(buildGameReport({
          bundle,
          program: {
            id: program.id,
            name: program.name,
            abbreviation: program.abbreviation,
            logoUrl: program.logo_url ?? null,
            color: program.primary_color ?? "#111827",
          },
          opponent: {
            name: info.opponent_name,
            abbreviation: info.opponent_abbrev ?? "OPP",
            logoUrl: info.opponent_logo_url,
            color: info.opponent_color,
          },
          gameDate: info.game_date,
          kickoffLabel: formatKickoff(info.kickoff_time),
          occasion: null,
          ourScore: info.our_score,
          theirScore: info.opponent_score,
          touchbackYardLine: Number(
            (program.game_config as Record<string, unknown> | null | undefined)?.touchback_yard_line,
          ) || 20,
          fgSnapAdd: Number(
            (program.game_config as Record<string, unknown> | null | undefined)?.fg_snap_add,
          ) || 17,
        }));
      } else {
        setReport(null);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [gameId, program, season]);

  const PAGES = 4;

  return (
    /* Deliberately NOT .screen: that class is max-w-app (28rem) below the lg
       breakpoint, and print lays out at about 768px, so the app frame used to
       squeeze the whole document into a phone-width column on paper. */
    <div className="min-h-dvh flex flex-col bg-surface-bg print:bg-white">
      <div className="flex items-center gap-3 px-5 pt-5 pb-2 print:hidden">
        <button onClick={() => navigate(`/game/${gameId}/summary`)} className="btn-ghost p-2 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] flex-1">Game Report</h1>
        <button
          onClick={() => window.print()}
          className="btn-ghost p-2 cursor-pointer"
          title="Print / Save as PDF"
          disabled={!report}
        >
          <Printer className="w-5 h-5" />
        </button>
      </div>
      <div className="mx-5 mt-1 mb-4 accent-line print:hidden" />

      {/* The pages are a fixed 8 inches. Narrower than that on screen and this
          scrolls sideways rather than reflowing — reflowing is exactly how the
          printed version stopped matching what was on screen. */}
      <div className="flex-1 overflow-auto print:overflow-visible pb-10 print:pb-0">
        {loading && (
          <div className="card p-8 mx-5 text-center text-slate-500 animate-pulse print:hidden">
            Building report…
          </div>
        )}

        {!loading && !report && (
          <div className="card p-8 mx-5 text-center text-slate-500 text-sm print:hidden">
            No plays recorded for this game yet.
          </div>
        )}

        {!loading && report && (
          <div className="flex flex-col items-center gap-6 print:gap-0 px-4 print:px-0">

            {/* ══ PAGE 1 — the game ══════════════════════════════════════ */}
            <Page report={report} pageNo={1} pageCount={PAGES}>
              <div className="flex items-center gap-3 pb-2 border-b-[3px] border-black">
                <Crest logoUrl={report.us.logoUrl} abbr={report.us.abbr} color={report.us.color} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15pt] font-black uppercase leading-none tracking-tight">
                    {report.us.name} <span className="text-neutral-400">vs</span> {report.them.name}
                  </div>
                  <div className="text-[7.5pt] font-bold uppercase tracking-[0.14em] text-neutral-600 mt-1">
                    {report.dateLabel}
                    {report.kickoffLabel ? ` · ${report.kickoffLabel}` : ""}
                    {report.occasion ? ` · ${report.occasion}` : ""}
                  </div>
                </div>
                <Crest logoUrl={report.them.logoUrl} abbr={report.them.abbr} color={report.them.color} size={44} />
              </div>

              <div className="flex items-stretch justify-center gap-4 py-2 border-b border-neutral-300">
                <ScoreBlock
                  abbr={report.us.abbr}
                  score={report.lineScore.usTotal}
                  won={report.lineScore.usTotal > report.lineScore.themTotal}
                />
                <div className="self-center text-[9pt] font-bold text-neutral-400 uppercase">Final</div>
                <ScoreBlock
                  abbr={report.them.abbr}
                  score={report.lineScore.themTotal}
                  won={report.lineScore.themTotal > report.lineScore.usTotal}
                />
              </div>

              <Band>Line Score</Band>
              <table className="w-full border-collapse text-[9pt] tabular-nums">
                <thead>
                  <tr className="border-b border-black">
                    <th className="text-left py-[3px] px-[3px] text-[6.5pt] font-black uppercase tracking-[0.08em]">Team</th>
                    {report.quarters.map(q => (
                      <th key={q} className="text-center py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.7in]">{q}</th>
                    ))}
                    <th className="text-center py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.7in]">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { side: report.us, line: report.lineScore.us, total: report.lineScore.usTotal },
                    { side: report.them, line: report.lineScore.them, total: report.lineScore.themTotal },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-neutral-200">
                      <td className="py-[3px] px-[3px] font-bold uppercase whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Crest logoUrl={row.side.logoUrl} abbr={row.side.abbr} color={row.side.color} size={13} />
                          {row.side.name}
                        </span>
                      </td>
                      {row.line.map((v, qi) => (
                        <td key={qi} className="text-center py-[3px] px-[3px]">{v}</td>
                      ))}
                      <td className="text-center py-[3px] px-[3px] font-black">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Band note={`${report.them.abbr} — ${report.us.abbr}`}>Scoring Summary</Band>
              {report.scoring.length === 0 ? (
                <div className="text-[8pt] text-neutral-500 py-1">No scoring plays recorded.</div>
              ) : (
                <table className="w-full border-collapse text-[8.5pt]">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="text-left py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.35in]">Qtr</th>
                      <th className="text-left py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.5in]">Time</th>
                      <th className="text-left py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.45in]">Team</th>
                      <th className="text-left py-[3px] px-[3px] text-[6.5pt] font-black uppercase">Scoring Play</th>
                      <th className="text-right py-[3px] px-[3px] text-[6.5pt] font-black uppercase w-[0.6in]">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.scoring.map((s, i) => (
                      <tr key={i} className="border-b border-neutral-200 align-top">
                        <td className="py-[3px] px-[3px] tabular-nums">{s.quarter}</td>
                        <td className="py-[3px] px-[3px] tabular-nums">{s.clock}</td>
                        <td className="py-[3px] px-[3px] font-black">{s.team}</td>
                        <td className="py-[3px] px-[3px] leading-snug">
                          {s.play}{s.conversion ? ` ${s.conversion}` : ""}
                        </td>
                        <td className="py-[3px] px-[3px] text-right tabular-nums font-black">{s.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <Band>{report.us.abbr} Scoring — Points by Player</Band>
              <div className="w-[3.2in]">
                <StatTable
                  cols={[{ key: "Player", name: true }, { key: "Pts", bold: true }]}
                  rows={report.points.map(p => [p.name, p.points])}
                  total={["Total", report.pointsTotal]}
                />
              </div>
            </Page>

            {/* ══ PAGE 2 — offense ═══════════════════════════════════════ */}
            <Page report={report} pageNo={2} pageCount={PAGES}>
              <Band note={report.us.name}>Individual Offense</Band>

              <SubHead>Rushing</SubHead>
              <StatTable
                cols={[
                  { key: "Player", name: true },
                  { key: "Att" }, { key: "Net", bold: true }, { key: "Gain" }, { key: "Loss" },
                  { key: "TD" }, { key: "Lg" }, { key: "Avg" }, { key: "Fum" },
                ]}
                rows={report.rushing.map(r => [
                  r.name, r.att, r.net, r.gain, r.loss, r.td, r.long, r.avg.toFixed(1), r.fum,
                ])}
                total={[
                  "Total", report.rushingTotal.att, report.rushingTotal.net,
                  report.rushingTotal.gain, report.rushingTotal.loss, report.rushingTotal.td,
                  report.rushingTotal.long, report.rushingTotal.avg.toFixed(1), report.rushingTotal.fum,
                ]}
              />

              <SubHead>Passing</SubHead>
              <StatTable
                cols={[
                  { key: "Player", name: true },
                  { key: "Att" }, { key: "Comp" }, { key: "Int" },
                  { key: "Yds", bold: true }, { key: "Long" }, { key: "Sack" }, { key: "TD" },
                ]}
                rows={report.passing.map(r => [
                  r.name, r.att, r.comp, r.int, r.yds, r.long, r.sack, r.td,
                ])}
                total={[
                  "Total", report.passingTotal.att, report.passingTotal.comp, report.passingTotal.int,
                  report.passingTotal.yds, report.passingTotal.long, report.passingTotal.sack,
                  report.passingTotal.td,
                ]}
              />

              <SubHead>Receiving</SubHead>
              <StatTable
                cols={[
                  { key: "Player", name: true },
                  { key: "Rec" }, { key: "Yds", bold: true }, { key: "TD" }, { key: "Long" },
                ]}
                rows={report.receiving.map(r => [r.name, r.rec, r.yds, r.td, r.long])}
                total={[
                  "Total", report.receivingTotal.rec, report.receivingTotal.yds,
                  report.receivingTotal.td, report.receivingTotal.long,
                ]}
              />
            </Page>

            {/* ══ PAGE 3 — special teams + team comparison ═══════════════ */}
            <Page report={report} pageNo={3} pageCount={PAGES}>
              <Band note={report.us.name}>Special Teams</Band>

              <div className="flex gap-4">
                <div className="flex-1">
                  <SubHead>Punting</SubHead>
                  <StatTable
                    cols={[
                      { key: "Player", name: true },
                      { key: "No" }, { key: "Yds", bold: true }, { key: "Avg" },
                      { key: "Lg" }, { key: "In20" }, { key: "TB" },
                    ]}
                    rows={report.punting.map(r => [
                      r.name, r.att, r.yds, r.avg.toFixed(1), r.long, r.inside20, r.tb,
                    ])}
                    total={[
                      "Total", report.puntingTotal.att, report.puntingTotal.yds,
                      report.puntingTotal.avg.toFixed(1), report.puntingTotal.long,
                      report.puntingTotal.inside20, report.puntingTotal.tb,
                    ]}
                  />
                </div>
                <div className="flex-1">
                  <SubHead>Kickoffs</SubHead>
                  <StatTable
                    cols={[
                      { key: "Player", name: true },
                      { key: "No" }, { key: "Yds", bold: true }, { key: "Avg" }, { key: "TB" },
                    ]}
                    rows={report.kickoffs.map(r => [r.name, r.no, r.yds, r.avg.toFixed(1), r.tb])}
                    total={[
                      "Total", report.kickoffsTotal.no, report.kickoffsTotal.yds,
                      report.kickoffsTotal.avg.toFixed(1), report.kickoffsTotal.tb,
                    ]}
                  />
                  <div className="text-[7.5pt] font-bold uppercase tracking-wider mt-1">
                    Onside recovered: <span className="tabular-nums">{report.onsideRecovered}</span>
                  </div>
                </div>
              </div>

              <SubHead>Returns</SubHead>
              <table className="w-full border-collapse text-[8.5pt] tabular-nums">
                <thead>
                  <tr>
                    <th className="text-left py-[3px] px-[3px] text-[6.5pt] font-black uppercase">Player</th>
                    {["Kickoff", "Punt", "Intercept"].map(g => (
                      <th key={g} colSpan={3} className="py-[3px] px-[3px] text-[6.5pt] font-black uppercase text-center border-l border-neutral-400">
                        {g}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-black">
                    <th />
                    {["No", "Yds", "Lg", "No", "Yds", "Lg", "No", "Yds", "Lg"].map((h, i) => (
                      <th
                        key={i}
                        className={`py-[2px] px-[3px] text-[6.5pt] font-bold uppercase text-right ${
                          i % 3 === 0 ? "border-l border-neutral-400" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.returns.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-200">
                      <td className="py-[2.5px] px-[3px] font-semibold">{r.name}</td>
                      {[r.ko, r.punt, r.int].flatMap((g, gi) => [
                        <td key={`${gi}n`} className="py-[2.5px] px-[3px] text-right border-l border-neutral-400">{g.no || ""}</td>,
                        <td key={`${gi}y`} className="py-[2.5px] px-[3px] text-right font-black">{g.no ? g.yds : ""}</td>,
                        <td key={`${gi}l`} className="py-[2.5px] px-[3px] text-right">{g.no ? g.long : ""}</td>,
                      ])}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-black font-black">
                    <td className="py-[3px] px-[3px]">Total</td>
                    {[report.returnsTotal.ko, report.returnsTotal.punt, report.returnsTotal.int].flatMap((g, gi) => [
                      <td key={`${gi}n`} className="py-[3px] px-[3px] text-right border-l border-neutral-400">{g.no}</td>,
                      <td key={`${gi}y`} className="py-[3px] px-[3px] text-right">{g.yds}</td>,
                      <td key={`${gi}l`} className="py-[3px] px-[3px] text-right">{g.long}</td>,
                    ])}
                  </tr>
                </tbody>
              </table>

              <Band note={`${report.us.abbr} vs ${report.them.abbr}`}>Team Statistics</Band>
              {/* Two columns: 37 rows down one side would run onto a second
                  sheet and leave this one half empty. */}
              <div className="flex gap-4 items-start">
                <div className="flex-1">
                  <TeamStatColumn
                    rows={report.teamStats.slice(0, Math.ceil(report.teamStats.length / 2))}
                    usAbbr={report.us.abbr}
                    themAbbr={report.them.abbr}
                  />
                </div>
                <div className="flex-1">
                  <TeamStatColumn
                    rows={report.teamStats.slice(Math.ceil(report.teamStats.length / 2))}
                    usAbbr={report.us.abbr}
                    themAbbr={report.them.abbr}
                  />
                </div>
              </div>
            </Page>

            {/* ══ PAGE 4 — defense ═══════════════════════════════════════ */}
            <Page report={report} pageNo={4} pageCount={PAGES} last>
              <Band note={report.us.name}>Individual Defense</Band>
              <StatTable
                cols={[
                  { key: "#", name: true, width: "0.3in" },
                  { key: "Name", name: true },
                  { key: "Solo" }, { key: "Ast" }, { key: "Total", bold: true },
                  { key: "Sack" }, { key: "Yds" },
                  { key: "TFL" }, { key: "Yds" },
                  { key: "FF" }, { key: "FR" }, { key: "Yds" },
                  { key: "Int" }, { key: "Yds" },
                  { key: "BrUp" }, { key: "Blk" }, { key: "QBH" },
                ]}
                rows={report.defense.map(r => [
                  r.jersey ?? "", r.name,
                  n(r.solo), n(r.ast), n(r.total),
                  n(r.sacks), n(r.sackYds),
                  n(r.tfl), n(r.tflYds),
                  n(r.ff), n(r.fr), n(r.frYds),
                  n(r.int), n(r.intYds),
                  n(r.brUp), n(r.blocks), n(r.qbh),
                ])}
                total={[
                  "", "Total",
                  n(report.defenseTotal.solo), n(report.defenseTotal.ast), n(report.defenseTotal.total),
                  n(report.defenseTotal.sacks), n(report.defenseTotal.sackYds),
                  n(report.defenseTotal.tfl), n(report.defenseTotal.tflYds),
                  n(report.defenseTotal.ff), n(report.defenseTotal.fr), n(report.defenseTotal.frYds),
                  n(report.defenseTotal.int), n(report.defenseTotal.intYds),
                  n(report.defenseTotal.brUp), n(report.defenseTotal.blocks), n(report.defenseTotal.qbh),
                ]}
              />
              <div className="text-[7pt] text-neutral-500 mt-2 leading-snug">
                Sacks, TFL, fumble recoveries and interceptions each show count then yards.
                A shared tackle counts half to each player, so Total can carry a half.
                {" "}#100 TEAM holds stops credited to the defense when no jersey was identified.
              </div>
            </Page>

          </div>
        )}
      </div>
    </div>
  );
}

/** "19:00" or "19:00:00" from the DB reads as "7:00 PM" on the sheet. */
function formatKickoff(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const hour24 = Number(m[1]);
  const minute = m[2];
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${suffix}`;
}
