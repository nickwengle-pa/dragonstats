import type { DriveStats } from "football-stats-engine";
import { DriveResult } from "football-stats-engine";

interface Props {
  drives: DriveStats[];
  programTeamId: string;
  programAbbr?: string;
  opponentAbbr?: string;
}

const RESULT_LABEL: Record<DriveResult, { short: string; color: string }> = {
  [DriveResult.Touchdown]: { short: "TD", color: "text-emerald-400" },
  [DriveResult.FieldGoal]: { short: "FG", color: "text-amber-400" },
  [DriveResult.Punt]: { short: "PUNT", color: "text-surface-muted" },
  [DriveResult.Turnover]: { short: "TO", color: "text-red-400" },
  [DriveResult.TurnoverOnDowns]: { short: "DOWNS", color: "text-red-400" },
  [DriveResult.EndOfHalf]: { short: "1/2", color: "text-slate-500" },
  [DriveResult.EndOfGame]: { short: "EOG", color: "text-slate-500" },
  [DriveResult.Safety]: { short: "SAF", color: "text-red-500" },
  [DriveResult.MissedFieldGoal]: { short: "MISS FG", color: "text-red-400" },
};

function formatFieldPosition(yardLine: number): string {
  if (yardLine <= 50) return `Own ${yardLine}`;
  return `Opp ${100 - yardLine}`;
}

/**
 * Renders the engine's per-drive log. Pure presentation — derives nothing,
 * the engine already produced summary.drives for us.
 */
export default function DrivesList({ drives, programTeamId, programAbbr = "US", opponentAbbr = "OPP" }: Props) {
  if (drives.length === 0) {
    return (
      <div className="text-xs text-surface-muted italic px-1 py-3">
        No drives recorded yet.
      </div>
    );
  }

  // Aggregate counts per side for the header
  const us = drives.filter((d) => d.team === programTeamId);
  const them = drives.filter((d) => d.team !== programTeamId);
  const tdsUs = us.filter((d) => d.result === DriveResult.Touchdown).length;
  const tdsThem = them.filter((d) => d.result === DriveResult.Touchdown).length;
  const puntsUs = us.filter((d) => d.result === DriveResult.Punt).length;
  const puntsThem = them.filter((d) => d.result === DriveResult.Punt).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <SideSummary label={programAbbr} drives={us.length} tds={tdsUs} punts={puntsUs} />
        <SideSummary label={opponentAbbr} drives={them.length} tds={tdsThem} punts={puntsThem} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-surface-muted">
              <th className="text-left font-bold py-1.5 pr-1.5">#</th>
              <th className="text-left font-bold py-1.5 px-1.5">Team</th>
              <th className="text-left font-bold py-1.5 px-1.5">Start</th>
              <th className="text-right font-bold py-1.5 px-1.5">Plays</th>
              <th className="text-right font-bold py-1.5 px-1.5">Yds</th>
              <th className="text-right font-bold py-1.5 px-1.5">TOP</th>
              <th className="text-right font-bold py-1.5 pl-1.5">Result</th>
            </tr>
          </thead>
          <tbody>
            {drives.map((d) => {
              const isUs = d.team === programTeamId;
              const result = RESULT_LABEL[d.result] ?? { short: d.result, color: "text-surface-muted" };
              return (
                <tr key={d.driveNumber} className="border-t border-surface-border/40">
                  <td className="py-1.5 pr-1.5 font-bold tabular-nums">{d.driveNumber}</td>
                  <td className={`py-1.5 px-1.5 font-bold ${isUs ? "text-dragon-primary" : "text-slate-400"}`}>
                    {isUs ? programAbbr : opponentAbbr}
                  </td>
                  <td className="py-1.5 px-1.5 text-surface-muted tabular-nums">
                    Q{d.startQuarter} {d.startTime} · {formatFieldPosition(d.startYardLine)}
                  </td>
                  <td className="py-1.5 px-1.5 text-right text-surface-muted tabular-nums">{d.plays}</td>
                  <td className="py-1.5 px-1.5 text-right text-surface-muted tabular-nums">{d.yards}</td>
                  <td className="py-1.5 px-1.5 text-right text-surface-muted tabular-nums">{d.timeOfPossession}</td>
                  <td className={`py-1.5 pl-1.5 text-right font-bold ${result.color}`}>{result.short}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SideSummary({ label, drives, tds, punts }: { label: string; drives: number; tds: number; punts: number }) {
  return (
    <div className="rounded-xl border border-surface-border/60 bg-surface-bg p-2">
      <div className="text-[10px] font-display font-bold text-surface-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-xs flex items-baseline gap-2">
        <span className="text-lg font-display font-extrabold tabular-nums">{drives}</span>
        <span className="text-surface-muted text-[10px]">drives</span>
      </div>
      <div className="text-[10px] text-surface-muted mt-0.5 flex gap-3">
        <span><span className="text-emerald-400 font-bold">{tds}</span> TD</span>
        <span><span className="font-bold">{punts}</span> punt</span>
      </div>
    </div>
  );
}
