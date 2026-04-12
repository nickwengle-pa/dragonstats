import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computePlayerSeasonStats, type PlayerGameLine } from "@/services/statsService";
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
    })();

    return () => { cancelled = true; };
  }, [playerId, program, season]);

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Player Profile</h1>
      </div>

      <div className="flex-1 px-5 space-y-4 overflow-y-auto pb-8">
        {/* Player header */}
        <div className="card p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-dragon-primary/20 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl font-black text-dragon-primary">
              #{player?.jersey_number ?? "—"}
            </span>
          </div>
          <div className="text-lg font-bold">
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
          </>
        )}
      </div>
    </div>
  );
}
