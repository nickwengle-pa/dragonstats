import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import TeamCrest from "@/components/TeamCrest";
import { supabase } from "@/lib/supabase";
import { computeGameStats } from "@/services/statsService";
import { TEAM_JERSEY, TEAM_PLAYER_ID } from "@/components/game/types";
import type {
  GameSummary, PassingStats, RushingStats, ReceivingStats, DefensiveStats, KickingStats,
} from "football-stats-engine";

/* ═══════════════════════════════════════════════
   BOX SCORE — compact, print-ready game report
   (TurboStats-style: line score, team stats,
   individual stat lines)
   ═══════════════════════════════════════════════ */

interface GameInfo {
  our_score: number;
  opponent_score: number;
  is_home: boolean;
  status: string;
  opponent_name: string;
  opponent_abbrev: string | null;
  opponent_color: string;
  opponent_logo_url: string | null;
  game_date: string;
}

interface RosterEntry { jersey: number | null; name: string }

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}.${parts.slice(1).join(" ")}`;
}

/** "#22 M.Webb" when the jersey is known, otherwise "M.Webb". */
function playerLabel(id: string, name: string, roster: Map<string, RosterEntry>) {
  if (id === TEAM_PLAYER_ID) return `#${TEAM_JERSEY} TEAM`;
  const jersey = roster.get(id)?.jersey;
  return jersey != null ? `#${jersey} ${shortName(name)}` : shortName(name);
}

/** Sort stat records for display: our roster only, biggest line first. */
function ourLines<T extends { playerName: string }>(
  records: Record<string, T>,
  rosterIds: Set<string>,
  sortBy: (s: T) => number,
  include: (s: T) => boolean,
): Array<[string, T]> {
  return Object.entries(records)
    .filter(([id, s]) => rosterIds.has(id) && include(s))
    .sort((a, b) => sortBy(b[1]) - sortBy(a[1]));
}

const QUARTER_COLS = ["1", "2", "3", "4"];

/** Same O/D/K accents the play log and PostGameReview use — blue-500,
 *  red-500 and purple-500 are the exact hex values in their UNIT_COLOR map.
 *  Written as literal classes because Tailwind can't see interpolated ones. */
const UNIT_GROUPS = {
  offense: { label: "Offense", text: "text-blue-500", border: "border-blue-500" },
  defense: { label: "Defense", text: "text-red-500", border: "border-red-500" },
  special: { label: "Special Teams", text: "text-purple-500", border: "border-purple-500" },
} as const;

/** One side of the box-score header: crest, score, name. */
function TeamSide({
  logoUrl,
  abbr,
  name,
  color,
  score,
}: {
  logoUrl: string | null;
  abbr: string;
  name: string;
  color?: string | null;
  score: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <TeamCrest logoUrl={logoUrl} abbr={abbr} color={color} size="lg" />
      <div className="text-3xl font-display font-black tabular-nums leading-none">{score}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 print:text-neutral-600 truncate max-w-[9rem]">
        {name}
      </div>
    </div>
  );
}

/** Individual stat lines as a real table — the previous run-on text lines
 *  ("#22 M.Webb 5-12-1, 88 yds, 1 TD") were unscannable down a column. */
function StatTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <table className="w-full text-xs print:text-[11px]">
      <thead>
        <tr className="text-[10px] uppercase text-slate-500 print:text-neutral-600 border-b border-surface-border/60 print:border-neutral-300">
          {headers.map((h, i) => (
            <th
              key={h}
              className={`py-1 font-bold ${i === 0 ? "text-left" : "text-right w-10"}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-surface-border/30 print:border-neutral-200">
            {row.map((cell, j) => (
              <td
                key={j}
                className={`py-1 ${j === 0 ? "text-left font-bold" : "text-right text-slate-300 print:text-black"}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BoxScoreScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { program, season } = useProgramContext();

  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [roster, setRoster] = useState<Map<string, RosterEntry>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId || !program || !season) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [{ data: gData }, { data: rData }, result] = await Promise.all([
        supabase
          .from("games")
          .select("our_score, opponent_score, is_home, status, game_date, opponent:opponents(name, abbreviation, primary_color, logo_url)")
          .eq("id", gameId)
          .single(),
        supabase
          .from("season_rosters")
          .select("player_id, jersey_number, player:players(first_name, last_name, preferred_name)")
          .eq("season_id", season.id),
        computeGameStats(gameId, {
          id: program.id,
          name: program.name,
          abbreviation: program.abbreviation,
          game_config: program.game_config,
        }),
      ]);
      if (cancelled) return;

      if (gData) {
        const opp = gData.opponent as any;
        setGameInfo({
          our_score: gData.our_score,
          opponent_score: gData.opponent_score,
          is_home: gData.is_home,
          status: gData.status,
          opponent_name: opp?.name ?? "Opponent",
          opponent_abbrev: opp?.abbreviation ?? null,
          opponent_color: opp?.primary_color ?? "#6b7280",
          opponent_logo_url: opp?.logo_url ?? null,
          game_date: gData.game_date,
        });
      }
      const map = new Map<string, RosterEntry>();
      for (const r of rData ?? []) {
        const p = (r as any).player;
        map.set((r as any).player_id, {
          jersey: (r as any).jersey_number,
          name: `${p?.preferred_name || p?.first_name || ""} ${p?.last_name || ""}`.trim(),
        });
      }
      setRoster(map);
      setSummary(result);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [gameId, program, season]);

  /* TEAM holds our stats that nobody got a number on, so it belongs in the
     box score alongside the named players - the same way it does on the
     printed report. */
  const rosterIds = useMemo(
    () => new Set([...roster.keys(), TEAM_PLAYER_ID]),
    [roster],
  );

  // Our team vs theirs, engine-side
  const ourStats = summary && program
    ? (summary.homeTeamStats.teamId === program.id ? summary.homeTeamStats : summary.awayTeamStats)
    : null;
  const theirStats = summary
    ? (ourStats === summary.homeTeamStats ? summary.awayTeamStats : summary.homeTeamStats)
    : null;

  // Line score: points per quarter per team, from scoring plays.
  const lineScore = useMemo(() => {
    const us: Record<number, number> = {};
    const them: Record<number, number> = {};
    let hasOT = false;
    for (const sp of summary?.scoringPlays ?? []) {
      const q = Number(sp.quarter);
      if (q > 4) hasOT = true;
      const bucket = program && sp.team === program.id ? us : them;
      bucket[q] = (bucket[q] ?? 0) + sp.pointsScored;
    }
    return { us, them, hasOT };
  }, [summary, program]);

  const quarterCols = lineScore.hasOT ? [...QUARTER_COLS, "OT"] : QUARTER_COLS;
  const qPoints = (bucket: Record<number, number>, col: string, idx: number) =>
    col === "OT"
      ? Object.entries(bucket).filter(([q]) => Number(q) > 4).reduce((s, [, v]) => s + v, 0)
      : bucket[idx + 1] ?? 0;

  // Individual lines
  const passing = summary ? ourLines<PassingStats>(summary.passing, rosterIds, s => s.yards, s => s.attempts > 0) : [];
  const rushing = summary ? ourLines<RushingStats>(summary.rushing, rosterIds, s => s.yards, s => s.carries > 0) : [];
  const receiving = summary ? ourLines<ReceivingStats>(summary.receiving, rosterIds, s => s.yards, s => s.receptions > 0) : [];
  const defense = summary ? ourLines<DefensiveStats>(summary.defense, rosterIds,
    s => s.totalTackles * 10 + s.sacks + s.interceptions,
    s => s.totalTackles > 0 || s.sacks > 0 || s.interceptions > 0 || s.passesDefended > 0 || s.forcedFumbles > 0) : [];
  const kicking = summary ? ourLines<KickingStats>(summary.kicking, rosterIds,
    s => s.totalPoints,
    s => s.fieldGoalAttempts > 0 || s.extraPointAttempts > 0) : [];

  const progAbbr = program?.abbreviation ?? "US";
  const oppAbbr = gameInfo?.opponent_abbrev ?? "OPP";
  const dateLabel = gameInfo?.game_date
    ? new Date(gameInfo.game_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : "";

  const statRow = (label: string, us: string, them: string) => (
    <tr key={label} className="border-b border-surface-border/40 print:border-neutral-300">
      <td className="py-1 pr-2 text-slate-400 print:text-neutral-600">{label}</td>
      <td className="py-1 px-2 text-right font-bold tabular-nums">{us}</td>
      <td className="py-1 pl-2 text-right font-bold tabular-nums">{them}</td>
    </tr>
  );

  // Sub-headings stay neutral so the unit heading above them carries the
  // colour — dragon-primary here would collide with the red of Defense.
  const section = (title: string, headers: string[], rows: Array<Array<string | number>>) =>
    rows.length > 0 && (
      <div key={title} className="mt-2">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 print:text-neutral-700 mb-1">{title}</div>
        <StatTable headers={headers} rows={rows} />
      </div>
    );

  const unitGroup = (unit: keyof typeof UNIT_GROUPS, sections: React.ReactNode[]) => {
    const filled = sections.filter(Boolean);
    if (filled.length === 0) return null;
    const { label, text, border } = UNIT_GROUPS[unit];
    return (
      <div className="mt-4">
        <div className={`border-t-2 ${border} print:border-black pt-1.5 mb-1`}>
          <span className={`text-[11px] font-display font-black uppercase tracking-[0.15em] ${text} print:text-black`}>
            {label}
          </span>
        </div>
        {filled}
      </div>
    );
  };

  return (
    <div className="screen safe-top safe-bottom print:bg-white print:text-black">
      <div className="flex items-center gap-3 px-5 pt-5 pb-2 print:hidden">
        <button onClick={() => navigate(`/game/${gameId}/summary`)} className="btn-ghost p-2 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] flex-1">Box Score</h1>
        <button onClick={() => window.print()} className="btn-ghost p-2 cursor-pointer" title="Print / Save as PDF" disabled={!summary}>
          <Printer className="w-5 h-5" />
        </button>
      </div>
      <div className="mx-5 mt-1 mb-4 accent-line print:hidden" />

      <div className="flex-1 px-5 overflow-y-auto pb-8 print:overflow-visible print:px-0">
        {loading && <div className="card p-8 text-center text-slate-500 animate-pulse">Building box score...</div>}

        {!loading && summary && gameInfo && (
          <div className="card p-5 space-y-1 print:border-0 print:shadow-none print:bg-white">
            {/* Header — crests identify the two sides without reading, which
                is the whole job on a sheet that gets printed and passed
                around. Order matches the line score below: us, then them. */}
            <div className="mb-3">
              <div className="flex items-end justify-center gap-5">
                <TeamSide
                  logoUrl={program?.logo_url ?? null}
                  abbr={progAbbr}
                  name={program?.name ?? "Us"}
                  color={program?.primary_color}
                  score={gameInfo.our_score}
                />
                <div className="text-[11px] font-bold text-slate-600 print:text-neutral-500 pb-2">vs</div>
                <TeamSide
                  logoUrl={gameInfo.opponent_logo_url}
                  abbr={oppAbbr}
                  name={gameInfo.opponent_name}
                  color={gameInfo.opponent_color}
                  score={gameInfo.opponent_score}
                />
              </div>
              <div className="text-center text-[11px] text-slate-500 print:text-neutral-600 mt-2">
                {gameInfo.is_home ? "Home" : "Away"}
                {dateLabel ? ` · ${dateLabel}` : ""}
                {gameInfo.status === "live" ? " · IN PROGRESS" : " · FINAL"}
              </div>
            </div>

            {/* Line score */}
            <table className="w-full text-sm mb-2">
              <thead>
                <tr className="text-[10px] text-slate-500 print:text-neutral-600 uppercase">
                  <th className="text-left py-1 font-bold">Team</th>
                  {quarterCols.map(c => <th key={c} className="text-center py-1 w-10 font-bold">{c}</th>)}
                  <th className="text-center py-1 w-12 font-black">F</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-t border-surface-border/40 print:border-neutral-300">
                  <td className="py-1">
                    <span className="flex items-center gap-2 font-bold">
                      <TeamCrest logoUrl={program?.logo_url} abbr={progAbbr} color={program?.primary_color} size="sm" />
                      {progAbbr}
                    </span>
                  </td>
                  {quarterCols.map((c, i) => <td key={c} className="text-center py-1">{qPoints(lineScore.us, c, i)}</td>)}
                  <td className="text-center py-1 font-black">{gameInfo.our_score}</td>
                </tr>
                <tr className="border-t border-surface-border/40 print:border-neutral-300">
                  <td className="py-1">
                    <span className="flex items-center gap-2 font-bold">
                      <TeamCrest logoUrl={gameInfo.opponent_logo_url} abbr={oppAbbr} color={gameInfo.opponent_color} size="sm" />
                      {oppAbbr}
                    </span>
                  </td>
                  {quarterCols.map((c, i) => <td key={c} className="text-center py-1">{qPoints(lineScore.them, c, i)}</td>)}
                  <td className="text-center py-1 font-black">{gameInfo.opponent_score}</td>
                </tr>
              </tbody>
            </table>

            {/* Scoring plays */}
            {summary.scoringPlays.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-dragon-primary print:text-black mb-1">Scoring</div>
                {summary.scoringPlays.map((sp, i) => (
                  <div key={i} className="text-[11px] leading-5 text-slate-300 print:text-black">
                    <span className="text-slate-500 print:text-neutral-600">Q{Number(sp.quarter)} {sp.gameClock}</span>
                    {" — "}{sp.description}
                  </div>
                ))}
              </div>
            )}

            {/* Team stats */}
            <div className="text-[10px] font-black uppercase tracking-wider text-dragon-primary print:text-black mb-1">Team Stats</div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-500 print:text-neutral-600 uppercase border-b border-surface-border print:border-neutral-400">
                  <th className="text-left py-1"></th>
                  <th className="py-1 px-2 w-20">
                    <span className="flex items-center justify-end gap-1.5">
                      <TeamCrest logoUrl={program?.logo_url} abbr={progAbbr} color={program?.primary_color} size="sm" />
                      {progAbbr}
                    </span>
                  </th>
                  <th className="py-1 pl-2 w-20">
                    <span className="flex items-center justify-end gap-1.5">
                      <TeamCrest logoUrl={gameInfo.opponent_logo_url} abbr={oppAbbr} color={gameInfo.opponent_color} size="sm" />
                      {oppAbbr}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {statRow("First Downs", fmt(ourStats?.firstDowns), fmt(theirStats?.firstDowns))}
                {statRow("Rushes–Yards", `${fmt(ourStats?.rushAttempts)}–${fmt(ourStats?.rushingYards)}`, `${fmt(theirStats?.rushAttempts)}–${fmt(theirStats?.rushingYards)}`)}
                {statRow("Comp–Att–Int", `${fmt(ourStats?.passCompletions)}–${fmt(ourStats?.passAttempts)}–${fmt(ourStats?.interceptionsThrown)}`, `${fmt(theirStats?.passCompletions)}–${fmt(theirStats?.passAttempts)}–${fmt(theirStats?.interceptionsThrown)}`)}
                {statRow("Passing Yards", fmt(ourStats?.passingYards), fmt(theirStats?.passingYards))}
                {statRow("Total Yards", fmt(ourStats?.totalYards), fmt(theirStats?.totalYards))}
                {statRow("3rd Down", `${fmt(ourStats?.thirdDownConversions)}/${fmt(ourStats?.thirdDownAttempts)}`, `${fmt(theirStats?.thirdDownConversions)}/${fmt(theirStats?.thirdDownAttempts)}`)}
                {statRow("Turnovers", fmt(ourStats?.turnovers), fmt(theirStats?.turnovers))}
                {statRow("Penalties", `${fmt(ourStats?.penalties)}–${fmt(ourStats?.penaltyYards)}`, `${fmt(theirStats?.penalties)}–${fmt(theirStats?.penaltyYards)}`)}
                {statRow("Time of Poss.", ourStats?.timeOfPossession ?? "—", theirStats?.timeOfPossession ?? "—")}
              </tbody>
            </table>

            {/* Individual stats, grouped by unit. Colour alone won't separate
                these on a printed sheet, so each unit gets its own rule and
                heading and the groups stay legible in black and white. */}
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 print:text-neutral-600 mt-4">
              Individual — {program?.name}
            </div>

            {unitGroup("offense", [
              section(
                "Passing",
                ["Player", "C/ATT", "YDS", "TD", "INT"],
                passing.map(([id, s]) => [
                  playerLabel(id, s.playerName, roster),
                  `${s.completions}/${s.attempts}`,
                  fmt(s.yards),
                  s.touchdowns,
                  s.interceptions,
                ]),
              ),
              section(
                "Rushing",
                ["Player", "CAR", "YDS", "AVG", "TD", "LNG"],
                rushing.map(([id, s]) => [
                  playerLabel(id, s.playerName, roster),
                  s.carries,
                  // Negative rushing totals read as "(7)" on a box score sheet.
                  s.yards < 0 ? `(${fmt(Math.abs(s.yards))})` : fmt(s.yards),
                  s.carries > 0 ? (s.yards / s.carries).toFixed(1) : "0.0",
                  s.touchdowns,
                  s.longRush ?? 0,
                ]),
              ),
              section(
                "Receiving",
                ["Player", "REC", "YDS", "AVG", "TD", "LNG"],
                receiving.map(([id, s]) => [
                  playerLabel(id, s.playerName, roster),
                  s.receptions,
                  fmt(s.yards),
                  s.receptions > 0 ? (s.yards / s.receptions).toFixed(1) : "0.0",
                  s.touchdowns,
                  s.longReception ?? 0,
                ]),
              ),
            ])}

            {unitGroup("defense", [
              section(
                "Tackles & Takeaways",
                ["Player", "TKL", "TFL", "SCK", "INT", "PBU", "FF", "FR"],
                defense.map(([id, s]) => [
                  playerLabel(id, s.playerName, roster),
                  fmt(s.totalTackles),
                  fmt(s.tacklesForLoss),
                  fmt(s.sacks),
                  s.interceptions,
                  s.passesDefended,
                  s.forcedFumbles,
                  s.fumbleRecoveries,
                ]),
              ),
            ])}

            {unitGroup("special", [
              section(
                "Kicking",
                ["Player", "XP", "FG", "PTS"],
                kicking.map(([id, s]) => [
                  playerLabel(id, s.playerName, roster),
                  `${s.extraPointMade}/${s.extraPointAttempts}`,
                  `${s.fieldGoalMade}/${s.fieldGoalAttempts}`,
                  s.totalPoints,
                ]),
              ),
            ])}
          </div>
        )}

        {!loading && !summary && (
          <div className="card p-8 text-center text-slate-500 text-sm">No plays recorded for this game yet.</div>
        )}
      </div>
    </div>
  );
}
