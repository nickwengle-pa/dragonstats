import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computeGameStatsBundle } from "@/services/statsService";
import { buildSeasonReport, combineSeasonBundles, paginateSeasonSections, type ReportSection } from "@/services/seasonReport";
import { formatSeasonName } from "@/services/seasonService";

export default function SeasonReportScreen() {
  const { program, season } = useProgramContext(); const navigate = useNavigate();
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState("");
  useEffect(() => {
    if (!program || !season) return;
    let cancelled = false; setLoading(true); setError(""); setSections([]);
    (async () => {
      try {
        const { data: games, error: queryError } = await supabase.from("games").select("id,game_date,our_score,opponent_score,is_home,opponent:opponents(name)").eq("season_id", season.id).eq("status", "completed").order("game_date");
        if (queryError) throw queryError;
        if (!games?.length) throw new Error("No completed games in this season yet.");
        const bundles = [];
        for (const g of games) {
          const bundle = await computeGameStatsBundle(g.id, program);
          if (cancelled) return;
          if (!bundle) throw new Error("A game could not be loaded. Reload to try again; no partial report was generated.");
          bundles.push(bundle);
        }
        const report = buildSeasonReport(bundles, {
          program: { id: program.id, name: program.name, abbreviation: program.abbreviation, logoUrl: program.logo_url, color: program.primary_color },
          opponent: { name: "Opponents", abbreviation: "OPP", logoUrl: null, color: "#444" },
          gameDate: null, kickoffLabel: null, occasion: null, touchbackYardLine: Number(program.game_config?.touchback_yard_line) || 20,
          ourScore: games.reduce((n,g) => n + g.our_score,0), theirScore: games.reduce((n,g) => n + g.opponent_score,0),
        });
        const wins = games.filter(g => g.our_score > g.opponent_score).length;
        const losses = games.filter(g => g.our_score < g.opponent_score).length;
        const list: ReportSection[] = [];
        const add = (title: string, headers: string[], rows: (string | number)[][], total?: (string | number)[]) => list.push({ title, headers, rows, total });
        add("Game results", ["Date", "Opponent", "Site", "W/L", "PF", "PA"], games.map(g => [g.game_date?.slice(0,10) ?? "", (g.opponent as any)?.name ?? "Opponent", g.is_home ? "Home" : "Away", g.our_score > g.opponent_score ? "W" : g.our_score < g.opponent_score ? "L" : "T", g.our_score, g.opponent_score]));
        add("Team totals", ["Statistic", program.abbreviation, "Opponents"], report.teamStats.filter(r => !/possession|per game/i.test(r.label)).map(r => [r.label, r.us, r.them]));
        const rush = (r: typeof report.rushingTotal) => [r.name,r.att,r.net,r.gain,r.loss,r.sackYds,r.td,r.long,r.avg.toFixed(1),r.fum];
        add("Rushing · Loss excludes sacks; Sack = yards lost", ["Player","Att","Net","Gain","Loss","Sack","TD","Lg","Avg","Fum"],report.rushing.map(rush),rush(report.rushingTotal));
        const pass = (r: typeof report.passingTotal) => [r.name,r.att,r.comp,r.yds,r.td,r.int,r.sack,r.long];
        add("Passing",["Player","Att","Comp","Yds","TD","Int","Sack","Lg"],report.passing.map(pass),pass(report.passingTotal));
        const rec = (r: typeof report.receivingTotal) => [r.name,r.rec,r.yds,r.td,r.long];
        add("Receiving",["Player","Rec","Yds","TD","Lg"],report.receiving.map(rec),rec(report.receivingTotal));
        const def = (r: typeof report.defenseTotal) => [r.name,r.solo,r.ast,r.total,r.tfl,r.sacks,r.int,r.ff,r.fr,r.brUp];
        add("Defense",["Player","Solo","Ast","Total","TFL","Sack","Int","FF","FR","PBU"],report.defense.map(def),def(report.defenseTotal));
        const punt = (r: typeof report.puntingTotal) => [r.name,r.att,r.yds,r.avg.toFixed(1),r.long,r.inside20,r.tb];
        add("Punting",["Player","No","Yds","Avg","Lg","In 20","TB"],report.punting.map(punt),punt(report.puntingTotal));
        const ko = (r: typeof report.kickoffsTotal) => [r.name,r.no,r.yds,r.avg.toFixed(1),r.tb];
        add("Kickoffs",["Player","No","Yds","Avg","TB"],report.kickoffs.map(ko),ko(report.kickoffsTotal));
        const combined = combineSeasonBundles(bundles, program.id);
        const ours = new Map(combined.roster.map(r => [r.player_id, `${r.first_name} ${r.last_name}`]));
        ours.set("our_team", "TEAM");
        const kickers = Object.entries(combined.summary.kicking).filter(([id, s]) => ours.has(id) && (s.fieldGoalAttempts || s.extraPointAttempts));
        add("Field goals & extra points",["Player","FG Made","FG Att","FG Lg","PAT Made","PAT Att"], kickers.map(([id,s]) => [ours.get(id)!,s.fieldGoalMade,s.fieldGoalAttempts,s.fieldGoalLong,s.extraPointMade,s.extraPointAttempts]), ["Total", ...["fieldGoalMade","fieldGoalAttempts","fieldGoalLong","extraPointMade","extraPointAttempts"].map(key => key === "fieldGoalLong" ? Math.max(0,...kickers.map(([,s]) => s.fieldGoalLong)) : kickers.reduce((n,[,s]) => n + Number((s as any)[key] ?? 0),0))]);
        for (const [key, title] of [["ko","Kickoff returns"],["punt","Punt returns"],["int","Interception returns"]] as const) {
          const ret = (r: typeof report.returnsTotal) => [r.name,r[key].no,r[key].yds,r[key].long,r[key].td];
          add(title,["Player","No","Yds","Lg","TD"],report.returns.filter(r => r[key].no).map(ret),ret(report.returnsTotal));
        }
        add("Scoring",["Player","Points"],report.points.map(r => [r.name,r.points]),["Total",report.pointsTotal]);
        if (!cancelled) { setSections(list); setRecord(`${wins}–${losses}${games.length-wins-losses ? `–${games.length-wins-losses}` : ""} · ${games.length} completed games`); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load season report. Please reload."); }
      finally { if (!cancelled) setLoading(false); }
    })(); return () => { cancelled = true; };
  }, [program, season]);
  const title = season ? formatSeasonName(season) : "Season";
  return <SeasonReportDocument program={program} title={title} sections={sections} loading={loading} error={error} record={record} onBack={() => navigate("/season-stats")} />;
}

export function SeasonReportDocument({ program, title, sections, loading = false, error = "", record, onBack, preview = false }: {
  program: { name: string; abbreviation: string; logo_url: string | null } | null;
  title: string; sections: ReportSection[]; loading?: boolean; error?: string; record: string; onBack: () => void; preview?: boolean;
}) {
  const pages = paginateSeasonSections(sections);
  useEffect(() => { const previous = document.title; document.title = `${program?.abbreviation ?? "Team"} ${title} Season Stats`; return () => { document.title = previous; }; }, [program, title]);
  return <div className="min-h-dvh bg-surface-bg print:bg-white">
    <div className="p-5 flex items-center gap-4 print:hidden"><button onClick={onBack}>← {preview ? "Game Preview" : "Season Stats"}</button><h1 className="flex-1 font-bold">Season Report{preview ? " · Sample Preview" : ""}</h1><button className="btn-primary" disabled={loading || !!error} onClick={() => window.print()}>Print / Save PDF</button></div>
    <p className="px-5 pb-4 text-sm text-slate-400 print:hidden">{preview ? "Sample data to review the layout. " : ""}Save as PDF from the print dialog, then attach the saved report to your email.</p>
    {loading ? <p className="p-6">Preparing season totals…</p> : error ? <p role="alert" className="p-6">{error}</p> :
      <div className="overflow-auto print:overflow-visible"><div className="flex flex-col items-center gap-6 pb-6 print:gap-0 print:pb-0">
        {pages.map((page, i) => <section key={i} className="game-report-sheet bg-white text-black flex flex-col shadow-xl print:shadow-none" style={{ width: "8in", minHeight: "10.5in", padding: "0.3in 0.34in", breakAfter: i < pages.length-1 ? "page" : "auto", printColorAdjust: "exact" }}>
          <header className="border-b-2 border-black pb-2 mb-3 flex items-center gap-3">{program?.logo_url && <img src={program.logo_url} alt="" className="w-12 h-12 object-contain" />}<div><h1 className="font-black uppercase text-xl">{program?.name}</h1><p className="text-xs">{title} · Season statistics · {record}</p></div></header>
          <div className="flex-1">{page.map((s,j) => <div key={j} className="mb-4"><h2 className="bg-black text-white uppercase font-bold text-[8pt] px-2 py-1 mb-1">{s.title}</h2><table className="w-full border-collapse tabular-nums text-[8pt]" style={{ tableLayout: "fixed" }}><colgroup><col style={{ width: "34%" }}/>{s.headers.slice(1).map((_,k) => <col key={k}/>)}</colgroup><thead><tr className="border-b border-black">{s.headers.map((h,k) => <th key={k} className={`p-1 text-[6.5pt] uppercase ${k ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead><tbody>{s.rows.map((r,k) => <tr key={k} className="border-b border-neutral-200">{r.map((v,n) => <td key={n} className={`px-1 py-[3px] ${n ? "text-right" : "text-left font-semibold"}`}>{typeof v === "number" && !Number.isInteger(v) ? v.toFixed(1) : v}</td>)}</tr>)}</tbody>{s.total && <tfoot><tr className="border-t-2 border-black font-bold">{s.total.map((v,k) => <td key={k} className={`p-1 ${k ? "text-right" : "text-left"}`}>{typeof v === "number" && !Number.isInteger(v) ? v.toFixed(1) : v}</td>)}</tr></tfoot>}</table></div>)}</div>
          <footer className="border-t border-neutral-300 pt-2 text-[7pt] flex justify-between"><span>{title} · {preview ? "Sample data — layout preview" : "Completed games only"}</span><span>Page {i+1} of {pages.length}</span></footer>
        </section>)}
      </div></div>}
  </div>;
}
