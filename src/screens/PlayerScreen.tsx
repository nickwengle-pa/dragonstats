import { useState, useEffect } from "react";
import PeriodSwitch, { useStatPeriod } from "@/components/report/PeriodSwitch";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computePlayerSeasonStats, computePlayerCareerStats, type PlayerGameLine, type PlayerSeasonBlock } from "@/services/statsService";
import { exportPlayerSeasonCsv } from "@/services/csvExport";
import type { PassingStats, RushingStats, ReceivingStats, DefensiveStats, KickingStats, PuntingStats, ReturnStats } from "football-stats-engine";
import type { PlayerScoring } from "@/services/gameReport";

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

/** Largest value of a field across game lines - for the longs, which do not add. */
function maxField<T>(lines: PlayerGameLine[], category: keyof PlayerGameLine, field: keyof T): number {
  let best = 0;
  for (const line of lines) {
    const stats = line[category] as T | null;
    if (stats) best = Math.max(best, (stats[field] as number) ?? 0);
  }
  return best;
}

/* What counts as "has a line" for each area. A section with nothing in it is
   left off the page, and a whole group (offense, defense, special teams) with
   it. */
const has = {
  scoring: (l: PlayerGameLine) => !!l.scoring && l.scoring.points > 0,
  passing: (l: PlayerGameLine) => !!l.passing && l.passing.attempts > 0,
  rushing: (l: PlayerGameLine) => !!l.rushing && (l.rushing.carries > 0 || l.rushing.fumbles > 0),
  receiving: (l: PlayerGameLine) => !!l.receiving && (l.receiving.receptions > 0 || l.receiving.targets > 0),
  // Not just tackles - a corner whose only stat is a pick-six still has a line.
  defense: (l: PlayerGameLine) => !!l.defense && (l.defense.totalTackles > 0 || l.defense.interceptions > 0
    || l.defense.fumbleRecoveries > 0 || l.defense.sacks > 0 || l.defense.forcedFumbles > 0
    || l.defense.passesDefended > 0 || l.defense.pressures > 0 || l.defense.safeties > 0),
  kicking: (l: PlayerGameLine) => !!l.kicking && (l.kicking.fieldGoalAttempts > 0 || l.kicking.extraPointAttempts > 0
    || l.kicking.kickoffs > 0 || l.kicking.onsideKickAttempts > 0),
  punting: (l: PlayerGameLine) => !!l.punting && l.punting.punts > 0,
  kickReturns: (l: PlayerGameLine) => !!l.returns && (l.returns.kickReturns > 0 || l.returns.kickReturnFumbles > 0),
  puntReturns: (l: PlayerGameLine) => !!l.returns && (l.returns.puntReturns > 0 || l.returns.puntReturnFumbles > 0
    || l.returns.puntReturnFairCatches > 0),
};
type Area = keyof typeof has;
const any = (lines: PlayerGameLine[], ...areas: Area[]) => lines.some(l => areas.some(a => has[a](l)));

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

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-display font-extrabold uppercase tracking-[0.15em] text-dragon-primary pt-2">{children}</div>;
}

function ScoringSection({ lines }: { lines: PlayerGameLine[] }) {
  if (!any(lines, "scoring")) return null;

  const pts = sumField<PlayerScoring>(lines, "scoring", "points");
  const td = sumField<PlayerScoring>(lines, "scoring", "touchdowns");
  const two = sumField<PlayerScoring>(lines, "scoring", "twoPointMade");
  const pat = sumField<PlayerScoring>(lines, "scoring", "patMade");
  const fg = sumField<PlayerScoring>(lines, "scoring", "fgMade");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Scoring</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="PTS" value={fmt(pts)} />
        <StatBox label="TD" value={fmt(td)} />
        {two > 0 && <StatBox label="2-PT" value={fmt(two)} />}
        {pat > 0 && <StatBox label="PAT" value={fmt(pat)} />}
        {fg > 0 && <StatBox label="FG" value={fmt(fg)} />}
      </div>
      <GameLog
        lines={lines.filter(has.scoring)}
        category="scoring"
        columns={[
          { label: "PTS", render: (s: PlayerScoring) => fmt(s.points) },
          { label: "TD", render: (s: PlayerScoring) => fmt(s.touchdowns) },
          { label: "2-PT", render: (s: PlayerScoring) => fmt(s.twoPointMade) },
        ]}
      />
    </div>
  );
}

function PassingSection({ lines }: { lines: PlayerGameLine[] }) {
  if (!any(lines, "passing")) return null;

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
  if (!any(lines, "rushing")) return null;

  const car = sumField<RushingStats>(lines, "rushing", "carries");
  const yds = sumField<RushingStats>(lines, "rushing", "yards");
  const td = sumField<RushingStats>(lines, "rushing", "touchdowns");
  const lng = maxField<RushingStats>(lines, "rushing", "longRush");
  const fum = sumField<RushingStats>(lines, "rushing", "fumbles");
  const lost = sumField<RushingStats>(lines, "rushing", "fumblesLost");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Rushing</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="CAR" value={fmt(car)} />
        <StatBox label="YDS" value={fmt(yds)} />
        <StatBox label="TD" value={fmt(td)} />
        <StatBox label="YPC" value={car > 0 ? (yds / car).toFixed(1) : "0.0"} />
        <StatBox label="LONG" value={fmt(lng)} />
        {fum > 0 && <StatBox label="FUM" value={fmt(fum)} />}
        {fum > 0 && <StatBox label="LOST" value={fmt(lost)} />}
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
  if (!any(lines, "receiving")) return null;

  const rec = sumField<ReceivingStats>(lines, "receiving", "receptions");
  const yds = sumField<ReceivingStats>(lines, "receiving", "yards");
  const td = sumField<ReceivingStats>(lines, "receiving", "touchdowns");
  const tgt = sumField<ReceivingStats>(lines, "receiving", "targets");
  const lng = maxField<ReceivingStats>(lines, "receiving", "longReception");
  const drops = sumField<ReceivingStats>(lines, "receiving", "drops");
  const fum = sumField<ReceivingStats>(lines, "receiving", "fumbles");
  const lost = sumField<ReceivingStats>(lines, "receiving", "fumblesLost");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Receiving</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="REC" value={fmt(rec)} />
        <StatBox label="YDS" value={fmt(yds)} />
        <StatBox label="TD" value={fmt(td)} />
        <StatBox label="TGT" value={fmt(tgt)} />
        <StatBox label="AVG" value={rec > 0 ? (yds / rec).toFixed(1) : "0.0"} />
        <StatBox label="LONG" value={fmt(lng)} />
        {drops > 0 && <StatBox label="DROP" value={fmt(drops)} />}
        {fum > 0 && <StatBox label="FUM" value={fmt(fum)} />}
        {fum > 0 && <StatBox label="LOST" value={fmt(lost)} />}
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
  if (!any(lines, "defense")) return null;

  const tkl = sumField<DefensiveStats>(lines, "defense", "totalTackles");
  const solo = sumField<DefensiveStats>(lines, "defense", "soloTackles");
  const tfl = sumField<DefensiveStats>(lines, "defense", "tacklesForLoss");
  const sck = sumField<DefensiveStats>(lines, "defense", "sacks");
  const int_ = sumField<DefensiveStats>(lines, "defense", "interceptions");
  const pbu = sumField<DefensiveStats>(lines, "defense", "passesDefended");
  const ff = sumField<DefensiveStats>(lines, "defense", "forcedFumbles");
  const fr = sumField<DefensiveStats>(lines, "defense", "fumbleRecoveries");
  const defTd = sumField<DefensiveStats>(lines, "defense", "interceptionTouchdowns")
    + sumField<DefensiveStats>(lines, "defense", "fumbleRecoveryTouchdowns");
  const intYds = sumField<DefensiveStats>(lines, "defense", "interceptionYards");
  const frYds = sumField<DefensiveStats>(lines, "defense", "fumbleRecoveryYards");
  const hurries = sumField<DefensiveStats>(lines, "defense", "pressures");
  const safeties = sumField<DefensiveStats>(lines, "defense", "safeties");

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
        {int_ > 0 && <StatBox label="INT YDS" value={fmt(intYds)} />}
        {fr > 0 && <StatBox label="FR YDS" value={fmt(frYds)} />}
        {hurries > 0 && <StatBox label="HURRY" value={fmt(hurries)} />}
        {safeties > 0 && <StatBox label="SAFETY" value={fmt(safeties)} />}
        {defTd > 0 && <StatBox label="DEF TD" value={fmt(defTd)} />}
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

function KickingSection({ lines }: { lines: PlayerGameLine[] }) {
  if (!any(lines, "kicking")) return null;

  const fgM = sumField<KickingStats>(lines, "kicking", "fieldGoalMade");
  const fgA = sumField<KickingStats>(lines, "kicking", "fieldGoalAttempts");
  const fgLong = maxField<KickingStats>(lines, "kicking", "fieldGoalLong");
  const fgBlk = sumField<KickingStats>(lines, "kicking", "fieldGoalBlocked");
  const xpM = sumField<KickingStats>(lines, "kicking", "extraPointMade");
  const xpA = sumField<KickingStats>(lines, "kicking", "extraPointAttempts");
  const ko = sumField<KickingStats>(lines, "kicking", "kickoffs");
  const tb = sumField<KickingStats>(lines, "kicking", "kickoffTouchbacks");
  const onA = sumField<KickingStats>(lines, "kicking", "onsideKickAttempts");
  const onR = sumField<KickingStats>(lines, "kicking", "onsideKickRecoveries");
  // A per-game average, so weight each game by its kickoffs.
  const koYds = lines.reduce((t, l) => t + (l.kicking ? l.kicking.averageKickoffDistance * l.kicking.kickoffs : 0), 0);

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Kicking</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {fgA > 0 && <StatBox label="FG" value={`${fgM}/${fgA}`} />}
        {fgA > 0 && <StatBox label="FG LONG" value={fmt(fgLong)} />}
        {fgBlk > 0 && <StatBox label="FG BLK" value={fmt(fgBlk)} />}
        {xpA > 0 && <StatBox label="PAT" value={`${xpM}/${xpA}`} />}
        {ko > 0 && <StatBox label="KO" value={fmt(ko)} />}
        {ko > 0 && <StatBox label="KO AVG" value={(koYds / ko).toFixed(1)} />}
        {ko > 0 && <StatBox label="TB" value={fmt(tb)} />}
        {onA > 0 && <StatBox label="ONSIDE" value={`${onR}/${onA}`} />}
      </div>
      <GameLog
        lines={lines.filter(has.kicking)}
        category="kicking"
        columns={[
          { label: "FG", render: (s: KickingStats) => `${s.fieldGoalMade}/${s.fieldGoalAttempts}` },
          { label: "PAT", render: (s: KickingStats) => `${s.extraPointMade}/${s.extraPointAttempts}` },
          { label: "KO", render: (s: KickingStats) => fmt(s.kickoffs) },
        ]}
      />
    </div>
  );
}

function PuntingSection({ lines }: { lines: PlayerGameLine[] }) {
  if (!any(lines, "punting")) return null;

  const no = sumField<PuntingStats>(lines, "punting", "punts");
  const yds = sumField<PuntingStats>(lines, "punting", "puntYards");
  const lng = maxField<PuntingStats>(lines, "punting", "puntLong");
  const in20 = sumField<PuntingStats>(lines, "punting", "puntsInside20");
  const tb = sumField<PuntingStats>(lines, "punting", "touchbacks");
  const blk = sumField<PuntingStats>(lines, "punting", "puntsBlocked");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Punting</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatBox label="PUNTS" value={fmt(no)} />
        <StatBox label="YDS" value={fmt(yds)} />
        <StatBox label="AVG" value={no > 0 ? (yds / no).toFixed(1) : "0.0"} />
        <StatBox label="LONG" value={fmt(lng)} />
        <StatBox label="IN 20" value={fmt(in20)} />
        <StatBox label="TB" value={fmt(tb)} />
        {blk > 0 && <StatBox label="BLK" value={fmt(blk)} />}
      </div>
      <GameLog
        lines={lines.filter(has.punting)}
        category="punting"
        columns={[
          { label: "NO", render: (s: PuntingStats) => fmt(s.punts) },
          { label: "YDS", render: (s: PuntingStats) => fmt(s.puntYards) },
          { label: "IN 20", render: (s: PuntingStats) => fmt(s.puntsInside20) },
        ]}
      />
    </div>
  );
}

function ReturnsSection({ lines }: { lines: PlayerGameLine[] }) {
  const showKr = any(lines, "kickReturns");
  const showPr = any(lines, "puntReturns");
  if (!showKr && !showPr) return null;

  const kr = sumField<ReturnStats>(lines, "returns", "kickReturns");
  const krYds = sumField<ReturnStats>(lines, "returns", "kickReturnYards");
  const krLong = maxField<ReturnStats>(lines, "returns", "kickReturnLong");
  const krTd = sumField<ReturnStats>(lines, "returns", "kickReturnTouchdowns");
  const krFum = sumField<ReturnStats>(lines, "returns", "kickReturnFumbles");
  const pr = sumField<ReturnStats>(lines, "returns", "puntReturns");
  const prYds = sumField<ReturnStats>(lines, "returns", "puntReturnYards");
  const prLong = maxField<ReturnStats>(lines, "returns", "puntReturnLong");
  const prTd = sumField<ReturnStats>(lines, "returns", "puntReturnTouchdowns");
  const prFum = sumField<ReturnStats>(lines, "returns", "puntReturnFumbles");
  const fc = sumField<ReturnStats>(lines, "returns", "puntReturnFairCatches");

  return (
    <div className="card p-5">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">Returns</div>
      {showKr && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Kick Returns</div>
          <div className="grid grid-cols-4 gap-2">
            <StatBox label="NO" value={fmt(kr)} />
            <StatBox label="YDS" value={fmt(krYds)} />
            <StatBox label="AVG" value={kr > 0 ? (krYds / kr).toFixed(1) : "0.0"} />
            <StatBox label="LONG" value={fmt(krLong)} />
            {krTd > 0 && <StatBox label="TD" value={fmt(krTd)} />}
            {krFum > 0 && <StatBox label="FUM" value={fmt(krFum)} />}
          </div>
        </div>
      )}
      {showPr && (
        <div className="mb-4">
          <div className="text-[10px] font-bold text-slate-600 uppercase mb-2">Punt Returns</div>
          <div className="grid grid-cols-4 gap-2">
            <StatBox label="NO" value={fmt(pr)} />
            <StatBox label="YDS" value={fmt(prYds)} />
            <StatBox label="AVG" value={pr > 0 ? (prYds / pr).toFixed(1) : "0.0"} />
            <StatBox label="LONG" value={fmt(prLong)} />
            {prTd > 0 && <StatBox label="TD" value={fmt(prTd)} />}
            {fc > 0 && <StatBox label="FC" value={fmt(fc)} />}
            {prFum > 0 && <StatBox label="FUM" value={fmt(prFum)} />}
          </div>
        </div>
      )}
      <GameLog
        lines={lines.filter(l => has.kickReturns(l) || has.puntReturns(l))}
        category="returns"
        columns={[
          { label: "KR", render: (s: ReturnStats) => `${s.kickReturns}-${fmt(s.kickReturnYards)}` },
          { label: "PR", render: (s: ReturnStats) => `${s.puntReturns}-${fmt(s.puntReturnYards)}` },
          { label: "TD", render: (s: ReturnStats) => fmt((s.kickReturnTouchdowns ?? 0) + (s.puntReturnTouchdowns ?? 0)) },
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
  const navigate = useNavigate();
  const here = useLocation().pathname;
  const gamesWithData = lines.filter((l) => l[category] != null);
  if (gamesWithData.length === 0) return null;
  // A game's line opens that game's box score, whose back arrow comes here.
  const open = (gameId: string) => navigate(`/game/${gameId}/boxscore`, { state: { from: here } });

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
                <tr key={line.gameId} className="border-t border-slate-800 cursor-pointer hover:bg-surface-hover"
                  onClick={() => open(line.gameId)} title="Open this game's box score">
                  <td className="py-1 pr-2 text-slate-400">
                    <span className="text-slate-500 mr-1">{fmtDate(line.gameDate)}</span>
                    <button type="button" className="underline decoration-dotted underline-offset-2 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); open(line.gameId); }}>
                      {line.opponentName}
                    </button>
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
    gp: lines.filter(l => (Object.keys(has) as Area[]).some(a => has[a](l))).length,
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
  const [period, setPeriod] = useStatPeriod("season");

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
      // game_config carries the FG snap add, so kick lengths match Season Stats.
      const programInfo = {
        id: program.id,
        name: program.name,
        abbreviation: program.abbreviation,
        game_config: program.game_config,
      };
      const result = await computePlayerSeasonStats(playerId, season.id, programInfo, period);

      if (cancelled) return;
      setLines(result);
      setLoading(false);

      // Career (all seasons) loads after the current season — it can span
      // several years of games, so it fills in without blocking the page.
      const careerBlocks = await computePlayerCareerStats(playerId, programInfo, period);
      if (!cancelled) setCareer(careerBlocks);
    })();

    return () => { cancelled = true; };
  }, [playerId, program, season, period]);

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
              filename: `${safe}_season${period === "game" ? "" : `_${period}`}.csv`,
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
      <div className="mx-5 mt-1 mb-3 accent-line" />
      <PeriodSwitch value={period} onChange={setPeriod} showOT className="px-5 pb-3" />

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

        {/* No data. A game the player sat out still comes back as a line,
            just an empty one, so count the lines that hold something. */}
        {!loading && !any(lines, ...(Object.keys(has) as Area[])) && (
          <div className="card p-8 text-center">
            <div className="text-slate-500 text-sm">No stats recorded for this player yet this season.</div>
          </div>
        )}

        {/* Stat sections — only areas the player has something in */}
        {!loading && (
          <>
            <ScoringSection lines={lines} />
            {any(lines, "passing", "rushing", "receiving") && <GroupTitle>Offense</GroupTitle>}
            <PassingSection lines={lines} />
            <RushingSection lines={lines} />
            <ReceivingSection lines={lines} />
            <SituationalSection lines={lines} />
            {any(lines, "defense") && <GroupTitle>Defense</GroupTitle>}
            <DefenseSection lines={lines} />
            {any(lines, "kicking", "punting", "kickReturns", "puntReturns") && <GroupTitle>Special Teams</GroupTitle>}
            <KickingSection lines={lines} />
            <PuntingSection lines={lines} />
            <ReturnsSection lines={lines} />
          </>
        )}

        {/* Career — one row per season, plus totals */}
        {!loading && <CareerSection blocks={career} />}
      </div>
    </div>
  );
}
