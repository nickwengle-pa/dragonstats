import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computePlayerSeasonStats, computePlayerCareerStats, type PlayerGameLine, type PlayerSeasonBlock } from "@/services/statsService";
import { exportPlayerSeasonCsv } from "@/services/csvExport";
import type { PassingStats, RushingStats, ReceivingStats, DefensiveStats } from "football-stats-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

/** Sum a numeric field across game lines, extracting from a given stat category */
function sumField<T>(lines: PlayerGameLine[], category: keyof PlayerGameLine, field: keyof T): number {
  let total = 0;
  for (const line of lines) {
    const stats = line[category] as T | null;
    if (stats) total += (stats[field] as number) ?? 0;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-black font-mono">{value}</div>
      <div className="text-[10px] text-slate-500 font-bold uppercase">{label}</div>
    </div>
  );
}

function PassingSection({ lines }: { lines: PlayerGameLine[] }) {
  const hasData = lines.some((l) => l.passing && l.passing.attempts > 0);
  if (!hasData) return null;

  const comp = sumField<PassingStats>(lines, "passing", "completions");
  const att = sumField<PassingStats>(lines, "passing", "attempts");
  const yds = sumField<PassingStats>(lines, "passing", "yards");
  const td = sumField<PassingStats>(lines, "passing", "touchdowns");
  const int_ = sumField<PassingStats>(lines, "passing", "interceptions");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Passing</div>
      <div className="grid grid-cols-5 gap-2 mb-4">
        <StatBox label="CMP/ATT" value={`${comp}/${att}`} />
        <StatBox label="YDS" value={fmt(yds)} />
        <StatBox label="TD" value={fmt(td)} />
        <StatBox label="INT" value={fmt(int_)} />
        <StatBox label="CMP%" value={att > 0 ? `${Math.round((comp / att) * 100)}` : "0"} />
      </div>
      <GameLog
        lines={lines}
        category="passing"
        columns={[
          { label: "C/A", render: (s: PassingStats) => `${s.completions}/${s.attempts}` },
          { label: "YDS", render: (s: PassingStats) => fmt(s.yards) },
          { label: "TD", render: (s: PassingStats) => fmt(s.touchdowns) },
          { label: "INT", render: (s: PassingStats) => fmt(s.interceptions) },
        ]}
      />
    </div>
  );
}

function RushingSection({ lines }: { lines: PlayerGameLine[] }) {
  const hasData = lines.some((l) => l.rushing && l.rushing.carries > 0);
  if (!hasData) return null;

  const car = sumField<RushingStats>(lines, "rushing", "carries");
  const yds = sumField<RushingStats>(lines, "rushing", "yards");
  const td = sumField<RushingStats>(lines, "rushing", "touchdowns");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Rushing</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="CAR" value={fmt(car)} />
        <StatBox label="YDS" value={fmt(yds)} />
        <StatBox label="TD" value={fmt(td)} />
        <StatBox label="YPC" value={car > 0 ? (yds / car).toFixed(1) : "0.0"} />
      </div>
      <GameLog
        lines={lines}
        category="rushing"
        columns={[
          { label: "CAR", render: (s: RushingStats) => fmt(s.carries) },
          { label: "YDS", render: (s: RushingStats) => fmt(s.yards) },
          { label: "TD", render: (s: RushingStats) => fmt(s.touchdowns) },
        ]}
      />
    </div>
  );
}

function ReceivingSection({ lines }: { lines: PlayerGameLine[] }) {
  const hasData = lines.some((l) => l.receiving && l.receiving.receptions > 0);
  if (!hasData) return null;

  const rec = sumField<ReceivingStats>(lines, "receiving", "receptions");
  const yds = sumField<ReceivingStats>(lines, "receiving", "yards");
  const td = sumField<ReceivingStats>(lines, "receiving", "touchdowns");
  const tgt = sumField<ReceivingStats>(lines, "receiving", "targets");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Receiving</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="REC" value={fmt(rec)} />
        <StatBox label="YDS" value={fmt(yds)} />
        <StatBox label="TD" value={fmt(td)} />
        <StatBox label="TGT" value={fmt(tgt)} />
      </div>
      <GameLog
        lines={lines}
        category="receiving"
        columns={[
          { label: "REC", render: (s: ReceivingStats) => fmt(s.receptions) },
          { label: "YDS", render: (s: ReceivingStats) => fmt(s.yards) },
          { label: "TD", render: (s: ReceivingStats) => fmt(s.touchdowns) },
        ]}
      />
    </div>
  );
}

function DefenseSection({ lines }: { lines: PlayerGameLine[] }) {
  const hasData = lines.some((l) => l.defense && l.defense.totalTackles > 0);
  if (!hasData) return null;

  const tkl = sumField<DefensiveStats>(lines, "defense", "totalTackles");
  const solo = sumField<DefensiveStats>(lines, "defense", "soloTackles");
  const tfl = sumField<DefensiveStats>(lines, "defense", "tacklesForLoss");
  const sck = sumField<DefensiveStats>(lines, "defense", "sacks");
  const int_ = sumField<DefensiveStats>(lines, "defense", "interceptions");
  const pbu = sumField<DefensiveStats>(lines, "defense", "passesDefended");
  const ff = sumField<DefensiveStats>(lines, "defense", "forcedFumbles");
  const fr = sumField<DefensiveStats>(lines, "defense", "fumbleRecoveries");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Defense</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="TKL" value={fmt(tkl)} />
        <StatBox label="SOLO" value={fmt(solo)} />
        <StatBox label="TFL" value={fmt(tfl)} />
        <StatBox label="SCK" value={fmt(sck)} />
        <StatBox label="INT" value={fmt(int_)} />
        <StatBox label="PBU" value={fmt(pbu)} />
        <StatBox label="FF" value={fmt(ff)} />
        <StatBox label="FR" value={fmt(fr)} />
      </div>
      <GameLog
        lines={lines}
        category="defense"
        columns={[
          { label: "TKL", render: (s: DefensiveStats) => fmt(s.totalTackles) },
          { label: "TFL", render: (s: DefensiveStats) => fmt(s.tacklesForLoss) },
          { label: "SCK", render: (s: DefensiveStats) => fmt(s.sacks) },
          { label: "INT", render: (s: DefensiveStats) => fmt(s.interceptions) },
        ]}
      />
    </div>
  );
}

interface Column<T> {
  label: string;
  render: (s: T) => string;
}

function GameLog<T>({
  lines,
  category,
  columns,
}: {
  lines: PlayerGameLine[];
  category: keyof PlayerGameLine;
  columns: Column<T>[];
}) {
  const gamesWithData = lines.filter((l) => l[category] != null);
  if (gamesWithData.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Game Log</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-medium py-1 pr-2">OPP</th>
              {columns.map((c) => (
                <th key={c.label} className="text-right font-medium py-1 px-1">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gamesWithData.map((line) => {
              const stats = line[category] as T;
              return (
                <tr key={line.gameId} className="border-t border-slate-800">
                  <td className="py-1 pr-2 text-slate-400">
                    <span className="text-slate-500 mr-1">{fmtDate(line.gameDate)}</span>
                    {line.opponentName}
                  </td>
                  {columns.map((c) => (
                    <td key={c.label} className="text-right py-1 px-1 font-mono">{c.render(stats)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

/**
 * Situational splits the engine already tracks (trackSituationalSplits: true).
 * Sums them across the season's per-game lines so coaches can see red-zone
 * efficiency and 3rd-down conversion in one place.
 */
function SituationalSection({ lines }: { lines: PlayerGameLine[] }) {
  const rzPassAtt = sumField<PassingStats>(lines, "passing", "redZoneAttempts");
  const rzPassCmp = sumField<PassingStats>(lines, "passing", "redZoneCompletions");
  const rzPassTd = sumField<PassingStats>(lines, "passing", "redZoneTouchdowns");
  const tdPassAtt = sumField<PassingStats>(lines, "passing", "thirdDownAttempts");
  const tdPassCmp = sumField<PassingStats>(lines, "passing", "thirdDownCompletions");
  const tdPassCnv = sumField<PassingStats>(lines, "passing", "thirdDownConversions");

  const rzRushCar = sumField<RushingStats>(lines, "rushing", "redZoneCarries");
  const rzRushTd = sumField<RushingStats>(lines, "rushing", "redZoneTouchdowns");
  const tdRushCar = sumField<RushingStats>(lines, "rushing", "thirdDownCarries");
  const tdRushCnv = sumField<RushingStats>(lines, "rushing", "thirdDownConversions");

  const rzRecTgt = sumField<ReceivingStats>(lines, "receiving", "redZoneTargets");
  const rzRecRec = sumField<ReceivingStats>(lines, "receiving", "redZoneReceptions");
  const rzRecTd = sumField<ReceivingStats>(lines, "receiving", "redZoneTouchdowns");
  const tdRecTgt = sumField<ReceivingStats>(lines, "receiving", "thirdDownTargets");
  const tdRecRec = sumField<ReceivingStats>(lines, "receiving", "thirdDownReceptions");
  const tdRecCnv = sumField<ReceivingStats>(lines, "receiving", "thirdDownConversions");

  const anyData =
    rzPassAtt + tdPassAtt + rzRushCar + tdRushCar + rzRecTgt + tdRecTgt > 0;
  if (!anyData) return null;

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Situational</div>

      {rzPassAtt + tdPassAtt > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Passing</div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="RZ C/A" value={`${rzPassCmp}/${rzPassAtt}`} />
            <StatBox label="RZ TD" value={fmt(rzPassTd)} />
            <StatBox label="3rd C/A" value={`${tdPassCmp}/${tdPassAtt}`} />
            <StatBox label="3rd Cnv" value={fmt(tdPassCnv)} />
          </div>
        </div>
      )}

      {rzRushCar + tdRushCar > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Rushing</div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="RZ Car" value={fmt(rzRushCar)} />
            <StatBox label="RZ TD" value={fmt(rzRushTd)} />
            <StatBox label="3rd Car" value={fmt(tdRushCar)} />
            <StatBox label="3rd Cnv" value={fmt(tdRushCnv)} />
          </div>
        </div>
      )}

      {rzRecTgt + tdRecTgt > 0 && (
        <div>
          <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Receiving</div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="RZ R/T" value={`${rzRecRec}/${rzRecTgt}`} />
            <StatBox label="RZ TD" value={fmt(rzRecTd)} />
            <StatBox label="3rd R/T" value={`${tdRecRec}/${tdRecTgt}`} />
            <StatBox label="3rd Cnv" value={fmt(tdRecCnv)} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Career (year-to-year) ── */

interface CareerRow {
  label: string;
  gp: number;
  cmp: number; att: number; paYds: number; paTd: number; paInt: number;
  car: number; ruYds: number; ruTd: number;
  rec: number; reYds: number; reTd: number;
  tkl: number; tfl: number; sck: number; dInt: number;
}

function careerRowFromLines(label: string, lines: PlayerGameLine[]): CareerRow {
  return {
    label,
    gp: lines.filter(l => l.passing || l.rushing || l.receiving || l.defense || l.kicking || l.returns).length,
    cmp: sumField<PassingStats>(lines, "passing", "completions"),
    att: sumField<PassingStats>(lines, "passing", "attempts"),
    paYds: sumField<PassingStats>(lines, "passing", "yards"),
    paTd: sumField<PassingStats>(lines, "passing", "touchdowns"),
    paInt: sumField<PassingStats>(lines, "passing", "interceptions"),
    car: sumField<RushingStats>(lines, "rushing", "carries"),
    ruYds: sumField<RushingStats>(lines, "rushing", "yards"),
    ruTd: sumField<RushingStats>(lines, "rushing", "touchdowns"),
    rec: sumField<ReceivingStats>(lines, "receiving", "receptions"),
    reYds: sumField<ReceivingStats>(lines, "receiving", "yards"),
    reTd: sumField<ReceivingStats>(lines, "receiving", "touchdowns"),
    tkl: sumField<DefensiveStats>(lines, "defense", "totalTackles"),
    tfl: sumField<DefensiveStats>(lines, "defense", "tacklesForLoss"),
    sck: sumField<DefensiveStats>(lines, "defense", "sacks"),
    dInt: sumField<DefensiveStats>(lines, "defense", "interceptions"),
  };
}

function CareerSection({ blocks }: { blocks: PlayerSeasonBlock[] }) {
  const withGames = blocks.filter(b => b.lines.length > 0);
  if (withGames.length === 0) return null;

  const rows = withGames.map(b => careerRowFromLines(String(b.year), b.lines));
  const total = careerRowFromLines("Career", withGames.flatMap(b => b.lines));
  const showPass = total.att > 0;
  const showRush = total.car > 0;
  const showRec = total.rec > 0;
  const showDef = total.tkl + total.sck + total.dInt > 0;

  const cell = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
  const head = "px-2 py-1.5 text-right text-[9px] text-slate-500 font-bold uppercase whitespace-nowrap";

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Career</div>
      <div className="overflow-x-auto -mx-1">
        <table className="text-xs w-full min-w-max">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-2 py-1.5 text-left text-[9px] text-slate-500 font-bold uppercase">Year</th>
              <th className={head}>GP</th>
              {showPass && <><th className={head}>C/A</th><th className={head}>Pa Yds</th><th className={head}>Pa TD</th><th className={head}>INT</th></>}
              {showRush && <><th className={head}>Car</th><th className={head}>Ru Yds</th><th className={head}>Ru TD</th></>}
              {showRec && <><th className={head}>Rec</th><th className={head}>Re Yds</th><th className={head}>Re TD</th></>}
              {showDef && <><th className={head}>Tkl</th><th className={head}>TFL</th><th className={head}>Sck</th><th className={head}>INT</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-surface-border/50">
                <td className="px-2 py-1.5 font-bold">{r.label}</td>
                <td className={cell}>{r.gp}</td>
                {showPass && <><td className={cell}>{r.cmp}/{r.att}</td><td className={cell}>{fmt(r.paYds)}</td><td className={cell}>{fmt(r.paTd)}</td><td className={cell}>{fmt(r.paInt)}</td></>}
                {showRush && <><td className={cell}>{fmt(r.car)}</td><td className={cell}>{fmt(r.ruYds)}</td><td className={cell}>{fmt(r.ruTd)}</td></>}
                {showRec && <><td className={cell}>{fmt(r.rec)}</td><td className={cell}>{fmt(r.reYds)}</td><td className={cell}>{fmt(r.reTd)}</td></>}
                {showDef && <><td className={cell}>{fmt(r.tkl)}</td><td className={cell}>{fmt(r.tfl)}</td><td className={cell}>{fmt(r.sck)}</td><td className={cell}>{fmt(r.dInt)}</td></>}
              </tr>
            ))}
            <tr className="font-black text-dragon-primary">
              <td className="px-2 py-1.5 uppercase">{total.label}</td>
              <td className={cell}>{total.gp}</td>
              {showPass && <><td className={cell}>{total.cmp}/{total.att}</td><td className={cell}>{fmt(total.paYds)}</td><td className={cell}>{fmt(total.paTd)}</td><td className={cell}>{fmt(total.paInt)}</td></>}
              {showRush && <><td className={cell}>{fmt(total.car)}</td><td className={cell}>{fmt(total.ruYds)}</td><td className={cell}>{fmt(total.ruTd)}</td></>}
              {showRec && <><td className={cell}>{fmt(total.rec)}</td><td className={cell}>{fmt(total.reYds)}</td><td className={cell}>{fmt(total.reTd)}</td></>}
              {showDef && <><td className={cell}>{fmt(total.tkl)}</td><td className={cell}>{fmt(total.tfl)}</td><td className={cell}>{fmt(total.sck)}</td><td className={cell}>{fmt(total.dInt)}</td></>}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PlayerInfo {
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  graduation_year: number | null;
  jersey_number: number | null;
  position: string | null;
  positions: string[] | null;
}

export default function PlayerScreen() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { program, season } = useProgramContext();

  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [lines, setLines] = useState<PlayerGameLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [career, setCareer] = useState<PlayerSeasonBlock[]>([]);

  useEffect(() => {
    if (!playerId || !program || !season) return;

    let cancelled = false;

    (async () => {
      setLoading(true);

      // Load player info
      const { data: pData } = await supabase
        .from("season_rosters")
        .select("jersey_number, position, positions, player:players(first_name, last_name, preferred_name, graduation_year)")
        .eq("season_id", season.id)
        .eq("player_id", playerId)
        .single();

      if (cancelled) return;

      if (pData) {
        const p = pData.player as any;
        setPlayer({
          first_name: p?.first_name ?? "",
          last_name: p?.last_name ?? "",
          preferred_name: p?.preferred_name ?? null,
          graduation_year: p?.graduation_year ?? null,
          jersey_number: pData.jersey_number,
          position: pData.position,
          positions: (pData as any).positions ?? null,
        });
      }

      // Compute season stats
      const result = await computePlayerSeasonStats(playerId, season.id, {
        id: program.id,
        name: program.name,
        abbreviation: program.abbreviation,
      });

      if (cancelled) return;
      setLines(result);
      setLoading(false);

      // Career (all seasons) loads after the current season — it can span
      // several years of games, so it fills in without blocking the page.
      const careerBlocks = await computePlayerCareerStats(playerId, {
        id: program.id,
        name: program.name,
        abbreviation: program.abbreviation,
      });
      if (!cancelled) setCareer(careerBlocks);
    })();

    return () => { cancelled = true; };
  }, [playerId, program, season]);

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] flex-1">Player Profile</h1>
        <button
          onClick={() => {
            if (!player || lines.length === 0) return;
            const name = player.preferred_name || player.first_name;
            const safe = `${name}_${player.last_name}`.replace(/[^a-z0-9-_]+/gi, "_");
            exportPlayerSeasonCsv(lines, {
              filename: `${safe}_season.csv`,
              playerName: `${name} ${player.last_name}`,
            });
          }}
          className="btn-ghost p-2 cursor-pointer"
          title="Download CSV"
          disabled={!player || lines.length === 0}
        >
          <Download className="w-5 h-5" />
        </button>
      </div>
      <div className="mx-5 mt-1 mb-4 accent-line" />

      <div className="flex-1 px-5 space-y-4 overflow-y-auto pb-8">
        {/* Player header */}
        <div className="card p-6 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.2), rgba(220,38,38,0.05))" }}>
            <span className="text-2xl font-display font-extrabold text-dragon-primary">
              #{player?.jersey_number ?? "\u2014"}
            </span>
          </div>
          <div className="text-lg font-display font-bold uppercase tracking-wide">
            {player
              ? `${player.preferred_name || player.first_name} ${player.last_name}`
              : "Loading..."}
          </div>
          {player?.preferred_name && (
            <div className="text-xs text-slate-600">
              {player.first_name} {player.last_name}
            </div>
          )}
          <div className="text-sm text-slate-500 mt-0.5">
            {player?.positions && player.positions.length > 0
              ? player.positions.join(" / ")
              : player?.position ?? ""}
            {player?.graduation_year ? ` \u00B7 Class of ${player.graduation_year}` : ""}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card p-8 text-center">
            <div className="text-slate-500 animate-pulse">Computing stats...</div>
          </div>
        )}

        {/* No data */}
        {!loading && lines.length === 0 && (
          <div className="card p-8 text-center">
            <div className="text-slate-500 text-sm">No game data yet this season.</div>
          </div>
        )}

        {/* Stat sections — only show categories where the player has data */}
        {!loading && lines.length > 0 && (
          <>
            <PassingSection lines={lines} />
            <RushingSection lines={lines} />
            <ReceivingSection lines={lines} />
            <DefenseSection lines={lines} />
            <SituationalSection lines={lines} />
          </>
        )}

        {/* Career — one row per season, plus totals */}
        {!loading && <CareerSection blocks={career} />}
      </div>
    </div>
  );
}
