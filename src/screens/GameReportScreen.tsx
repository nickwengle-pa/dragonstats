import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computeGameStatsBundle } from "@/services/statsService";
import { buildGameReport, type GameReport } from "@/services/gameReport";

/* ═══════════════════════════════════════════════
   GAME REPORT — the full printed stat sheet.

   Deliberately NOT themed. This renders as a white
   document on screen and on paper alike, because
   its whole job is to be printed, saved as a PDF or
   handed to somebody, and a coach proofing it on an
   iPad should be looking at the thing that comes
   out of the printer. The app chrome around it
   keeps the dark theme; the sheet does not.
   ═══════════════════════════════════════════════ */

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

/** A negative yardage total reads better with the sign than in brackets here,
 *  because the Gain and Loss columns sit right beside it. */
function signed(v: number): string {
  return v > 0 ? String(v) : String(v);
}

/* ── Identity ─────────────────────────────────────────────────────────────── */

/**
 * Keep the image out of the printed page when it will not load.
 *
 * A logo lives on remote storage. Printing a report from a press box with no
 * service would otherwise put a broken-image glyph on the sheet, which is worse
 * than the initials it replaced.
 */
function useLoadable(url: string | null) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  return { show: Boolean(url) && !failed, onError: () => setFailed(true) };
}

/** Team mark, falling back to initials in the team's colour. */
function Crest({
  logoUrl, abbr, color, size = 20,
}: {
  logoUrl: string | null;
  abbr: string;
  color: string;
  size?: number;
}) {
  const img = useLoadable(logoUrl);
  if (img.show) {
    return (
      <img
        src={logoUrl as string}
        alt=""
        onError={img.onError}
        className="object-contain shrink-0"
        style={{
          width: size,
          height: size,
          // Browsers drop images and background colour from a print by
          // default. The crest is the one thing on the sheet that says whose
          // it is, so it prints.
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      />
    );
  }
  return (
    <span
      className="shrink-0 rounded-sm flex items-center justify-center font-black text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(7, Math.round(size * 0.38)),
        backgroundColor: color,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {abbr.slice(0, 3)}
    </span>
  );
}

/**
 * The program's mark, ghosted behind the sheet.
 *
 * position: fixed rather than absolute under print, because a fixed element
 * repeats on every printed page while an absolute one appears once and then
 * pages two through four come out blank behind the tables.
 *
 * aria-hidden and pointer-events-none: it is decoration, and it must never
 * take a tap meant for the table on top of it.
 */
function Watermark({ logoUrl }: { logoUrl: string | null }) {
  const img = useLoadable(logoUrl);
  if (!img.show) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 print:fixed print:inset-0 flex items-center justify-center overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <img
        src={logoUrl as string}
        alt=""
        onError={img.onError}
        className="object-contain"
        style={{
          width: "70%",
          maxWidth: "6in",
          opacity: 0.05,
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      />
    </div>
  );
}

/* ── Document primitives ──────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-black uppercase tracking-[0.12em] text-black border-b-2 border-black pb-0.5 mb-1.5 mt-4 first:mt-0">
      {children}
    </h2>
  );
}

/**
 * One stat table.
 *
 * `align` marks which columns are numeric so they can be right-aligned and
 * tabular; the first column is always the name and stays left. A `total` row
 * gets the rule above it that a stat sheet uses to say "this is the sum".
 */
function Table({
  head,
  rows,
  total,
  minWidth,
}: {
  head: string[];
  rows: Array<Array<string | number>>;
  total?: Array<string | number>;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-[11px] border-collapse"
        style={minWidth ? { minWidth } : undefined}
      >
        <thead>
          <tr className="border-b border-black">
            {head.map((h, i) => (
              <th
                key={h + i}
                className={`py-1 px-1.5 font-black uppercase tracking-wide text-[10px] whitespace-nowrap ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-neutral-300">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-1 px-1.5 whitespace-nowrap ${
                    ci === 0 ? "text-left font-semibold" : "text-right"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {total && (
            <tr className="border-t-2 border-black font-black">
              {total.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-1 px-1.5 whitespace-nowrap ${
                    ci === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="text-[11px] text-neutral-500 py-1.5 px-1.5">None recorded.</div>
      )}
    </div>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────────── */

export default function GameReportScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { program, season } = useProgramContext();

  const [report, setReport] = useState<GameReport | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
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
      setGameInfo(info);

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
        }));
      } else {
        setReport(null);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [gameId, program, season]);

  const scoreHeader = useMemo(() => {
    if (!report) return "";
    return `${report.them.abbr}-${report.us.abbr}`;
  }, [report]);

  return (
    <div className="screen safe-top safe-bottom print:bg-white">
      {/* App chrome — keeps the dark theme, never prints. */}
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

      <div className="flex-1 overflow-y-auto px-3 pb-8 print:overflow-visible print:px-0 print:pb-0">
        {loading && (
          <div className="card p-8 text-center text-slate-500 animate-pulse print:hidden">
            Building report...
          </div>
        )}

        {!loading && !report && (
          <div className="card p-8 text-center text-slate-500 text-sm print:hidden">
            No plays recorded for this game yet.
          </div>
        )}

        {!loading && report && gameInfo && (
          <div className="relative mx-auto max-w-[8.5in] bg-white text-black rounded-lg print:rounded-none shadow-lg print:shadow-none p-5 print:p-0 font-body">
            <Watermark logoUrl={report.us.logoUrl} />

            {/* Everything above the ghosted mark. One stacking context on the
                content rather than a z-index on every table. */}
            <div className="relative" style={{ zIndex: 1 }}>

            {/* ── Header block ────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-2">
              <div className="flex items-start gap-3 min-w-0">
                {/* Whose sheet this is, answered before anything is read. */}
                <Crest
                  logoUrl={report.us.logoUrl}
                  abbr={report.us.abbr}
                  color={report.us.color}
                  size={46}
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wide">
                    DATE: {report.dateLabel}
                    {report.occasion ? ` - ${report.occasion}` : ""}
                  </div>
                  <div className="text-[17px] font-black uppercase leading-tight tracking-wide mt-0.5">
                    {report.title}
                  </div>
                  {report.kickoffLabel && (
                    <div className="text-[11px] font-bold mt-0.5">{report.kickoffLabel}</div>
                  )}
                </div>
              </div>

              {/* Line score */}
              <table className="text-[11px] border-collapse tabular-nums">
                <thead>
                  <tr>
                    <th className="text-left px-1.5 py-0.5 font-black uppercase text-[10px]">Team</th>
                    {report.quarters.map(q => (
                      <th key={q} className="px-2 py-0.5 font-black uppercase text-[10px] text-center">
                        QTR {q}
                      </th>
                    ))}
                    <th className="px-2 py-0.5 font-black uppercase text-[10px] text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-black">
                    <td className="px-1.5 py-0.5 font-bold uppercase whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <Crest logoUrl={report.us.logoUrl} abbr={report.us.abbr} color={report.us.color} size={16} />
                        {report.us.name}
                      </span>
                    </td>
                    {report.lineScore.us.map((v, i) => (
                      <td key={i} className="px-2 py-0.5 text-center">{v}</td>
                    ))}
                    <td className="px-2 py-0.5 text-center font-black">{report.lineScore.usTotal}</td>
                  </tr>
                  <tr className="border-t border-neutral-300">
                    <td className="px-1.5 py-0.5 font-bold uppercase whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <Crest logoUrl={report.them.logoUrl} abbr={report.them.abbr} color={report.them.color} size={16} />
                        {report.them.name}
                      </span>
                    </td>
                    {report.lineScore.them.map((v, i) => (
                      <td key={i} className="px-2 py-0.5 text-center">{v}</td>
                    ))}
                    <td className="px-2 py-0.5 text-center font-black">{report.lineScore.themTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Scoring summary ─────────────────────────────────────── */}
            <SectionTitle>Scoring Summary</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse" style={{ minWidth: 520 }}>
                <thead>
                  <tr className="border-b border-black">
                    <th className="text-left py-1 px-1.5 font-black uppercase text-[10px] w-10">Qtr</th>
                    <th className="text-left py-1 px-1.5 font-black uppercase text-[10px] w-14">Time</th>
                    <th className="text-left py-1 px-1.5 font-black uppercase text-[10px] w-16">Team</th>
                    <th className="text-left py-1 px-1.5 font-black uppercase text-[10px]">Scoring Play</th>
                    <th className="text-right py-1 px-1.5 font-black uppercase text-[10px] w-16">{scoreHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.scoring.map((s, i) => (
                    <tr key={i} className="border-b border-neutral-300 align-top">
                      <td className="py-1 px-1.5 tabular-nums">{s.quarter}</td>
                      <td className="py-1 px-1.5 tabular-nums">{s.clock}</td>
                      <td className="py-1 px-1.5 font-bold">{s.team}</td>
                      <td className="py-1 px-1.5">
                        {s.play}{s.conversion ? ` ${s.conversion}` : ""}
                      </td>
                      <td className="py-1 px-1.5 text-right tabular-nums font-bold">{s.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.scoring.length === 0 && (
                <div className="text-[11px] text-neutral-500 py-1.5 px-1.5">No scoring plays recorded.</div>
              )}
            </div>

            {/* ── Points by player ────────────────────────────────────── */}
            <SectionTitle>{report.us.abbr} - Points - Player</SectionTitle>
            <div className="max-w-xs">
              <Table
                head={["Player", "PTS"]}
                rows={report.points.map(p => [p.name, p.points])}
                total={["Total", report.pointsTotal]}
              />
            </div>

            {/* ── Offensive stats ─────────────────────────────────────── */}
            <SectionTitle>Offensive Stats</SectionTitle>

            <div className="text-[11px] font-black uppercase tracking-wide mt-2 mb-1">Rushing</div>
            <Table
              minWidth={520}
              head={["Player", "Att.", "Gain", "Loss", "Net", "TD", "Lg", "Avg", "FUM."]}
              rows={report.rushing.map(r => [
                r.name, r.att, r.gain, signed(r.loss), signed(r.net), r.td, r.long, r.avg.toFixed(1), r.fum,
              ])}
              total={[
                "Total", report.rushingTotal.att, report.rushingTotal.gain,
                signed(report.rushingTotal.loss), signed(report.rushingTotal.net),
                report.rushingTotal.td, report.rushingTotal.long,
                report.rushingTotal.avg.toFixed(1), report.rushingTotal.fum,
              ]}
            />

            <div className="text-[11px] font-black uppercase tracking-wide mt-3 mb-1">Passing</div>
            <Table
              minWidth={480}
              head={["Player", "Att.", "Comp", "Int", "Yds", "Long", "Sack", "TD"]}
              rows={report.passing.map(r => [
                r.name, r.att, r.comp, r.int, r.yds, r.long, r.sack, r.td,
              ])}
              total={[
                "Total", report.passingTotal.att, report.passingTotal.comp,
                report.passingTotal.int, report.passingTotal.yds,
                report.passingTotal.long, report.passingTotal.sack, report.passingTotal.td,
              ]}
            />

            <div className="text-[11px] font-black uppercase tracking-wide mt-3 mb-1">Receiving</div>
            <Table
              minWidth={380}
              head={["Player", "Att.", "Yards", "TD", "Long"]}
              rows={report.receiving.map(r => [r.name, r.rec, r.yds, r.td, r.long])}
              total={[
                "Total", report.receivingTotal.rec, report.receivingTotal.yds,
                report.receivingTotal.td, report.receivingTotal.long,
              ]}
            />

            <div className="text-[11px] font-black uppercase tracking-wide mt-3 mb-1">Punting</div>
            <Table
              minWidth={460}
              head={["Player", "Att.", "Yards", "Avg", "Long", "Ind20", "TB"]}
              rows={report.punting.map(r => [
                r.name, r.att, r.yds, r.avg.toFixed(1), r.long, r.inside20, r.tb,
              ])}
              total={[
                "Total", report.puntingTotal.att, report.puntingTotal.yds,
                report.puntingTotal.avg.toFixed(1), report.puntingTotal.long,
                report.puntingTotal.inside20, report.puntingTotal.tb,
              ]}
            />

            {/* ── Returns ─────────────────────────────────────────────── */}
            <SectionTitle>Returns</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th className="text-left py-1 px-1.5 font-black uppercase text-[10px]">Player</th>
                    <th colSpan={3} className="py-1 px-1.5 font-black uppercase text-[10px] text-center border-l border-neutral-400">Kickoff</th>
                    <th colSpan={3} className="py-1 px-1.5 font-black uppercase text-[10px] text-center border-l border-neutral-400">Punt</th>
                    <th colSpan={3} className="py-1 px-1.5 font-black uppercase text-[10px] text-center border-l border-neutral-400">Intercept</th>
                  </tr>
                  <tr className="border-b border-black">
                    <th />
                    {["No", "Yds", "Lg", "No", "Yds", "Lg", "No", "Yds", "Lg"].map((h, i) => (
                      <th
                        key={i}
                        className={`py-0.5 px-1.5 font-bold uppercase text-[10px] text-right ${
                          i % 3 === 0 ? "border-l border-neutral-400" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {report.returns.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-300">
                      <td className="py-1 px-1.5 font-semibold">{r.name}</td>
                      {[r.ko, r.punt, r.int].flatMap((g, gi) => [
                        <td key={`${gi}n`} className="py-1 px-1.5 text-right border-l border-neutral-400">{g.no || ""}</td>,
                        <td key={`${gi}y`} className="py-1 px-1.5 text-right">{g.no ? g.yds : ""}</td>,
                        <td key={`${gi}l`} className="py-1 px-1.5 text-right">{g.no ? g.long : ""}</td>,
                      ])}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-black font-black">
                    <td className="py-1 px-1.5">Total</td>
                    {[report.returnsTotal.ko, report.returnsTotal.punt, report.returnsTotal.int].flatMap((g, gi) => [
                      <td key={`${gi}n`} className="py-1 px-1.5 text-right border-l border-neutral-400">{g.no}</td>,
                      <td key={`${gi}y`} className="py-1 px-1.5 text-right">{g.yds}</td>,
                      <td key={`${gi}l`} className="py-1 px-1.5 text-right">{g.long}</td>,
                    ])}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Kickoffs ────────────────────────────────────────────── */}
            <SectionTitle>Kickoff</SectionTitle>
            <div className="max-w-md">
              <Table
                head={["Player", "No", "Yds", "Avg", "TB"]}
                rows={report.kickoffs.map(r => [r.name, r.no, r.yds, r.avg.toFixed(1), r.tb])}
                total={[
                  "Total", report.kickoffsTotal.no, report.kickoffsTotal.yds,
                  report.kickoffsTotal.avg.toFixed(1), report.kickoffsTotal.tb,
                ]}
              />
              <div className="text-[11px] font-bold uppercase tracking-wide mt-1.5">
                Onside Recovered: <span className="tabular-nums">{report.onsideRecovered}</span>
              </div>
            </div>

            {/* ── Team stats ──────────────────────────────────────────── */}
            <SectionTitle>Team Stats</SectionTitle>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-black">
                  <th className="text-left py-1 px-1.5 font-black uppercase text-[10px]">Action Name</th>
                  <th className="py-1 px-1.5 font-black uppercase text-[10px] w-16">
                    <span className="flex items-center justify-end gap-1">
                      <Crest logoUrl={report.us.logoUrl} abbr={report.us.abbr} color={report.us.color} size={14} />
                      {report.us.abbr}
                    </span>
                  </th>
                  <th className="py-1 px-1.5 font-black uppercase text-[10px] w-16">
                    <span className="flex items-center justify-end gap-1">
                      <Crest logoUrl={report.them.logoUrl} abbr={report.them.abbr} color={report.them.color} size={14} />
                      {report.them.abbr}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.teamStats.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-200">
                    <td
                      className={`py-0.5 px-1.5 ${
                        r.emphasis === "head"
                          ? "font-black uppercase"
                          : r.emphasis === "sub"
                            ? "pl-4 text-neutral-700"
                            : "font-semibold"
                      }`}
                    >
                      {r.label}
                    </td>
                    <td className={`py-0.5 px-1.5 text-right ${r.emphasis === "head" ? "font-black" : ""}`}>{r.us}</td>
                    <td className={`py-0.5 px-1.5 text-right ${r.emphasis === "head" ? "font-black" : ""}`}>{r.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Defensive stats ─────────────────────────────────────── */}
            <SectionTitle>Defensive Stats</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse" style={{ minWidth: 700 }}>
                <thead>
                  <tr className="border-b border-black">
                    {["#", "Name", "Solo", "Ast", "Total", "Sacks-Yds", "TFL-Yds", "FF", "FR-Yds", "Int-Yds", "BrUp", "Blks", "QBH"]
                      .map((h, i) => (
                        <th
                          key={h}
                          className={`py-1 px-1.5 font-black uppercase text-[10px] whitespace-nowrap ${
                            i <= 1 ? "text-left" : "text-right"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {report.defense.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-300">
                      <td className="py-1 px-1.5">{r.jersey ?? ""}</td>
                      <td className="py-1 px-1.5 font-semibold whitespace-nowrap">{r.name}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.solo)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.ast)}</td>
                      <td className="py-1 px-1.5 text-right font-bold">{n(r.total)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.sacks)}-{n(r.sackYds)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.tfl)}-{n(r.tflYds)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.ff)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.fr)}-{n(r.frYds)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.int)}-{n(r.intYds)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.brUp)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.blocks)}</td>
                      <td className="py-1 px-1.5 text-right">{n(r.qbh)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-black font-black">
                    <td className="py-1 px-1.5" />
                    <td className="py-1 px-1.5">Total</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.solo)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.ast)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.total)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.sacks)}-{n(report.defenseTotal.sackYds)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.tfl)}-{n(report.defenseTotal.tflYds)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.ff)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.fr)}-{n(report.defenseTotal.frYds)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.int)}-{n(report.defenseTotal.intYds)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.brUp)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.blocks)}</td>
                    <td className="py-1 px-1.5 text-right">{n(report.defenseTotal.qbh)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "19:00" or "19:00:00" from the DB reads as "7:00PM" on the sheet. */
function formatKickoff(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const hour24 = Number(m[1]);
  const minute = m[2];
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute}${suffix}`;
}
