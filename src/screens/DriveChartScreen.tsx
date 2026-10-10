import GameHomeLink from "@/components/game/GameHomeLink";
import PrintReportButton from "@/components/report/PrintReportButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Share2 } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computeGameStatsBundle, type GameStatsBundle } from "@/services/statsService";
import { drivesByQuarter, type QuarterDrive } from "@/services/drivesByQuarter";
import { pdfFilename } from "@/services/reportPrint";
import type { PlayWithPlayers } from "@/services/gameService";
import { RESULT_LABEL } from "@/components/game/DrivesList";
import { isBadSnap, quarterLabel, yardLabel } from "@/components/game/types";

/* ═══════════════════════════════════════════════════════════════════════════
   DRIVE CHART — every play, grouped into drives, one quarter at a time.

   The quarter tabs pick what is shown; "All" stacks every quarter for print.
   A drive that runs across a quarter break is listed under each quarter it
   touches with that quarter's plays, so a quarter's page is complete on its
   own, and is marked as continued so it is not read as two drives.
   ═══════════════════════════════════════════════════════════════════════════ */

type TeamFilter = "both" | "us" | "them";

function downDistance(play: PlayWithPlayers): string {
  if (!play.down || play.down < 1) return "";
  return `${play.down}&${play.distance ?? 0}`;
}

function gain(play: PlayWithPlayers): string {
  const y = play.yards_gained ?? 0;
  return `${y > 0 ? "+" : ""}${y}`;
}

export default function DriveChartScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { program } = useProgramContext();
  const screenRoot = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  const [bundle, setBundle] = useState<GameStatsBundle | null>(null);
  const [oppColor, setOppColor] = useState("#94a3b8");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamFilter>("both");

  useEffect(() => {
    if (!gameId || !program) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [result, { data }] = await Promise.all([
          computeGameStatsBundle(gameId, {
            id: program.id, name: program.name,
            abbreviation: program.abbreviation, game_config: program.game_config,
          }),
          supabase.from("games").select("opponent:opponents(primary_color)").eq("id", gameId).single(),
        ]);
        if (cancelled) return;
        setBundle(result);
        const color = (data?.opponent as any)?.primary_color;
        if (color) setOppColor(color);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Failed to load the drives");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId, program]);

  const byQuarter = useMemo(
    () => bundle ? drivesByQuarter(bundle.plays, bundle.summary.drives) : new Map<number, QuarterDrive[]>(),
    [bundle],
  );
  const quarters = useMemo(() => {
    const seen = [...byQuarter.keys()];
    // Always offer the four regulation quarters; overtime only once it exists.
    return [...new Set([1, 2, 3, 4, ...seen])].sort((a, b) => a - b);
  }, [byQuarter]);
  const lastDrive = useMemo(() => {
    let max = 0;
    for (const list of byQuarter.values()) for (const d of list) max = Math.max(max, d.driveNumber);
    return max;
  }, [byQuarter]);

  const live = bundle?.game.status !== "completed";
  const latestQuarter = Math.max(1, ...byQuarter.keys());
  const selected = params.get("q") ?? (live ? String(latestQuarter) : "1");
  const shown = selected === "all" ? quarters : [Number(selected)];
  const pick = (q: string) => setParams({ q }, { replace: true });

  const usAbbr = program?.abbreviation ?? "US";
  const oppName = bundle?.game.opponent.name ?? "Opponent";
  const oppAbbr = bundle?.game.opponent.abbreviation ?? oppName.slice(0, 3).toUpperCase();
  const usColor = program?.primary_color ?? "#3b82f6";

  return (
    <div ref={screenRoot} className="screen safe-top safe-bottom">
      <GameHomeLink />
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate(`/game/${gameId}/summary`)} className="btn-ghost p-2 cursor-pointer print:hidden" aria-label="Back to summary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em]">Drive Chart</h1>
          {bundle && <div className="text-xs text-surface-muted truncate">{usAbbr} vs {oppName}</div>}
        </div>
        <PrintReportButton
          root={() => screenRoot.current}
          filename={pdfFilename(`${usAbbr} vs ${oppName} Drives ${selected === "all" ? "All" : `Q${selected}`}`)}
          className="btn-ghost p-2 cursor-pointer"
          disabled={!bundle}
        >
          <Share2 className="w-5 h-5" />
        </PrintReportButton>
      </div>
      <div className="mx-5 mt-1 mb-3 accent-line" />

      {/* Quarter picker — the heading the whole report hangs off. */}
      <div className="px-5 pb-3 space-y-2 print:hidden">
        <div role="tablist" aria-label="Quarter" className="flex gap-1.5 overflow-x-auto">
          {quarters.map((q) => (
            <QuarterTab key={q} active={selected === String(q)} onClick={() => pick(String(q))}
              label={quarterLabel(q)} count={(byQuarter.get(q) ?? []).filter((d) => !d.kickoffOnly).length} />
          ))}
          <QuarterTab active={selected === "all"} onClick={() => pick("all")} label="All" />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Team">
          {([["both", "Both teams"], ["us", usAbbr], ["them", oppAbbr]] as const).map(([value, label]) => (
            <button key={value} onClick={() => setTeam(value)} aria-pressed={team === value}
              className={`min-h-9 px-3 rounded-lg text-xs font-bold border ${team === value
                ? "bg-surface-card border-dragon-primary text-surface-text"
                : "border-surface-border text-surface-muted"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 space-y-5 pb-8">
        {loading && <div className="card p-8 text-center text-slate-500 animate-pulse">Loading drives...</div>}
        {error && <div className="card p-5 border border-red-500/30 text-red-400 text-sm">{error}</div>}
        {!loading && !error && !bundle && (
          <div className="card p-8 text-center text-slate-500 text-sm">No play data recorded yet.</div>
        )}

        {bundle && shown.map((q) => {
          const drives = (byQuarter.get(q) ?? []).filter((d) => team === "both" || d.possession === team);
          return (
            <section key={q} className="space-y-3">
              <h2 className="text-sm font-display font-extrabold uppercase tracking-[0.12em] text-surface-muted">
                {quarterLabel(q)} Quarter
              </h2>
              {drives.length === 0 && (
                <div className="card p-5 text-center text-sm text-surface-muted">No plays recorded in the {quarterLabel(q)}.</div>
              )}
              {drives.map((d) => (
                <DriveCard key={`${d.driveNumber}-${q}`} drive={d}
                  abbr={d.possession === "us" ? usAbbr : oppAbbr}
                  color={d.possession === "us" ? usColor : oppColor}
                  inProgress={live && d.driveNumber === lastDrive} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function QuarterTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`shrink-0 min-h-11 min-w-16 px-4 rounded-xl text-sm font-display font-extrabold uppercase tracking-wider border transition-colors ${active
        ? "bg-dragon-primary text-white border-dragon-primary"
        : "bg-surface-card text-surface-muted border-surface-border"}`}>
      {label}
      {count !== undefined && <span className={`ml-1.5 text-[10px] font-bold ${active ? "text-white/80" : "text-surface-muted"}`}>{count}</span>}
    </button>
  );
}

function DriveCard({ drive, abbr, color, inProgress }: { drive: QuarterDrive; abbr: string; color: string; inProgress: boolean }) {
  if (drive.kickoffOnly) {
    const kick = drive.plays.find((p) => p.play_type === "kickoff") ?? drive.plays[0];
    return (
      <div className="flex items-start gap-3 px-3 py-2 rounded-xl border border-surface-border/60 text-xs">
        <span className="font-black uppercase tracking-wider shrink-0" style={{ color }}>{abbr} kickoff</span>
        <span className="font-mono text-surface-muted shrink-0">{kick.clock ?? ""}</span>
        <span className="text-slate-300">{kick.description}</span>
      </div>
    );
  }

  const s = drive.stats;
  const ends = drive.continuesInto === null;
  const result = s && ends && !inProgress ? RESULT_LABEL[s.result] ?? { short: s.result, color: "text-surface-muted" } : null;
  return (
    <article className="card overflow-hidden border-l-4 break-inside-avoid" style={{ borderLeftColor: color }}>
      <header className="px-4 pt-3 pb-2 border-b border-surface-border/60">
        <div className="flex items-center gap-2">
          <span className="font-display font-extrabold uppercase tracking-wider" style={{ color }}>{abbr}</span>
          <span className="text-sm font-bold">Drive {drive.label}</span>
          {drive.continuedFrom !== null && (
            <span className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-surface-border/60 text-surface-muted">
              Cont. from {quarterLabel(drive.continuedFrom)}
            </span>
          )}
          <span className="flex-1" />
          {result && <span className={`text-xs font-black ${result.color}`}>{result.short}</span>}
          {ends && inProgress && <span className="text-[10px] font-black uppercase text-red-400">In progress</span>}
          {drive.continuesInto !== null && (
            <span className="text-[10px] font-bold uppercase text-surface-muted">Continues in {quarterLabel(drive.continuesInto)} ›</span>
          )}
        </div>
        {s && s.plays > 0 && (
          <div className="mt-0.5 text-xs text-surface-muted tabular-nums">
            Start Q{s.startQuarter} {s.startTime} · {yardLabel(s.startYardLine)} · {s.plays} play{s.plays === 1 ? "" : "s"} · {s.yards} yd{Math.abs(s.yards) === 1 ? "" : "s"} · {s.timeOfPossession}
            {drive.continuedFrom !== null || drive.continuesInto !== null ? " (whole drive)" : ""}
          </div>
        )}
      </header>
      <ol className="divide-y divide-surface-border/40">
        {drive.plays.map((p) => (
          <li key={p.id} className="flex items-start gap-2 px-4 py-2 text-xs">
            <span className="w-10 shrink-0 font-mono text-surface-muted">{p.clock ?? ""}</span>
            <span className="w-24 shrink-0 font-mono">
              {downDistance(p)}{downDistance(p) ? " · " : ""}<span className="text-surface-muted">{yardLabel(p.yard_line ?? 0)}</span>
            </span>
            <span className="flex-1 min-w-0 text-slate-300">
              {p.description}
              {p.is_touchdown && <Flag text="TD" cls="bg-emerald-900/50 text-emerald-400" />}
              {p.is_turnover && <Flag text="TO" cls="bg-red-900/50 text-red-400" />}
              {p.is_penalty && <Flag text="PEN" cls="bg-yellow-900/40 text-yellow-400" />}
              {isBadSnap(p.play_type, p.play_data) && <Flag text="BS" cls="bg-orange-900/40 text-orange-300" />}
            </span>
            <span className="w-9 shrink-0 text-right font-mono font-bold">{p.play_type === "timeout" ? "" : gain(p)}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function Flag({ text, cls }: { text: string; cls: string }) {
  return <span className={`ml-1.5 inline-block px-1 rounded text-[9px] font-black align-middle ${cls}`}>{text}</span>;
}
