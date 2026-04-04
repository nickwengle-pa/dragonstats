import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Zap, Target } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computeGameStats } from "@/services/statsService";
import type { GameSummary } from "football-stats-engine";

/* ─── Aggregate interfaces ─── */

interface AggPassing {
  playerId: string; name: string;
  attempts: number; completions: number; yards: number; tds: number; ints: number;
  games: number;
}
interface AggRushing {
  playerId: string; name: string;
  carries: number; yards: number; tds: number; long: number;
  games: number;
}
interface AggReceiving {
  playerId: string; name: string;
  receptions: number; targets: number; yards: number; tds: number; long: number;
  games: number;
}
interface AggDefense {
  playerId: string; name: string;
  totalTackles: number; soloTackles: number; assistedTackles: number;
  tacklesForLoss: number; sacks: number; interceptions: number;
  forcedFumbles: number; fumbleRecoveries: number;
  games: number;
}
interface AggKicking {
  playerId: string; name: string;
  fgAtt: number; fgMade: number; fgLong: number;
  xpAtt: number; xpMade: number;
  totalPoints: number;
  games: number;
}
interface AggPunting {
  playerId: string; name: string;
  punts: number; puntYards: number; puntLong: number;
  touchbacks: number; puntsInside20: number;
  games: number;
}
interface AggReturns {
  playerId: string; name: string;
  kickReturns: number; kickReturnYards: number; kickReturnLong: number; kickReturnTDs: number;
  puntReturns: number; puntReturnYards: number; puntReturnLong: number; puntReturnTDs: number;
  games: number;
}

type Tab = "offense" | "defense" | "specialteams";

/* ─── Helpers ─── */

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ─── Components ─── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">{children}</div>;
}

/* ═══════════════════════════════════════════════
   SEASON STATS SCREEN
   ═══════════════════════════════════════════════ */

export default function SeasonStatsScreen() {
  const navigate = useNavigate();
  const { program, season } = useProgramContext();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("offense");

  // Raw per-game summaries
  const [summaries, setSummaries] = useState<GameSummary[]>([]);
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!program || !season) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Load roster IDs
      const { data: rData } = await supabase
        .from("season_rosters")
        .select("player_id")
        .eq("season_id", season.id)
        .eq("is_active", true);
      if (cancelled) return;
      setRosterIds(new Set((rData ?? []).map((r: any) => r.player_id)));

      // Load all played games
      const { data: games } = await supabase
        .from("games")
        .select("id")
        .eq("season_id", season.id)
        .in("status", ["completed", "live"])
        .order("game_date");

      if (cancelled || !games) { setLoading(false); return; }

      const results: GameSummary[] = [];
      for (const g of games) {
        const s = await computeGameStats(g.id, {
          id: program.id, name: program.name, abbreviation: program.abbreviation, game_config: program.game_config,
        });
        if (cancelled) return;
        if (s) results.push(s);
      }

      setSummaries(results);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [program, season]);

  /* ── Aggregate stats across all games ── */
  const { passing, rushing, receiving, defense, kicking, punting, returns } = useMemo(() => {
    const pMap = new Map<string, AggPassing>();
    const rMap = new Map<string, AggRushing>();
    const rcMap = new Map<string, AggReceiving>();
    const dMap = new Map<string, AggDefense>();
    const kMap = new Map<string, AggKicking>();
    const puMap = new Map<string, AggPunting>();
    const retMap = new Map<string, AggReturns>();

    for (const s of summaries) {
      // Passing
      for (const [pid, ps] of Object.entries(s.passing)) {
        if (!rosterIds.has(pid) || ps.attempts === 0) continue;
        const e = pMap.get(pid) ?? { playerId: pid, name: ps.playerName, attempts: 0, completions: 0, yards: 0, tds: 0, ints: 0, games: 0 };
        e.attempts += ps.attempts; e.completions += ps.completions; e.yards += ps.yards;
        e.tds += ps.touchdowns; e.ints += ps.interceptions; e.games++;
        pMap.set(pid, e);
      }
      // Rushing
      for (const [pid, rs] of Object.entries(s.rushing)) {
        if (!rosterIds.has(pid) || rs.carries === 0) continue;
        const e = rMap.get(pid) ?? { playerId: pid, name: rs.playerName, carries: 0, yards: 0, tds: 0, long: 0, games: 0 };
        e.carries += rs.carries; e.yards += rs.yards; e.tds += rs.touchdowns;
        e.long = Math.max(e.long, rs.longRush); e.games++;
        rMap.set(pid, e);
      }
      // Receiving
      for (const [pid, rc] of Object.entries(s.receiving)) {
        if (!rosterIds.has(pid) || rc.receptions === 0) continue;
        const e = rcMap.get(pid) ?? { playerId: pid, name: rc.playerName, receptions: 0, targets: 0, yards: 0, tds: 0, long: 0, games: 0 };
        e.receptions += rc.receptions; e.targets += rc.targets; e.yards += rc.yards;
        e.tds += rc.touchdowns; e.long = Math.max(e.long, rc.longReception); e.games++;
        rcMap.set(pid, e);
      }
      // Defense
      for (const [pid, ds] of Object.entries(s.defense)) {
        if (!rosterIds.has(pid) || ds.totalTackles === 0) continue;
        const e = dMap.get(pid) ?? { playerId: pid, name: ds.playerName, totalTackles: 0, soloTackles: 0, assistedTackles: 0, tacklesForLoss: 0, sacks: 0, interceptions: 0, forcedFumbles: 0, fumbleRecoveries: 0, games: 0 };
        e.totalTackles += ds.totalTackles; e.soloTackles += ds.soloTackles;
        e.assistedTackles += ds.assistedTackles; e.tacklesForLoss += ds.tacklesForLoss;
        e.sacks += ds.sacks; e.interceptions += ds.interceptions;
        e.forcedFumbles += ds.forcedFumbles; e.fumbleRecoveries += ds.fumbleRecoveries;
        e.games++;
        dMap.set(pid, e);
      }
      // Kicking
      for (const [pid, ks] of Object.entries(s.kicking)) {
        if (!rosterIds.has(pid) || (ks.fieldGoalAttempts === 0 && ks.extraPointAttempts === 0)) continue;
        const e = kMap.get(pid) ?? { playerId: pid, name: ks.playerName, fgAtt: 0, fgMade: 0, fgLong: 0, xpAtt: 0, xpMade: 0, totalPoints: 0, games: 0 };
        e.fgAtt += ks.fieldGoalAttempts; e.fgMade += ks.fieldGoalMade;
        e.fgLong = Math.max(e.fgLong, ks.fieldGoalLong);
        e.xpAtt += ks.extraPointAttempts; e.xpMade += ks.extraPointMade;
        e.totalPoints += ks.totalPoints; e.games++;
        kMap.set(pid, e);
      }
      // Punting
      for (const [pid, ps] of Object.entries(s.punting)) {
        if (!rosterIds.has(pid) || ps.punts === 0) continue;
        const e = puMap.get(pid) ?? { playerId: pid, name: ps.playerName, punts: 0, puntYards: 0, puntLong: 0, touchbacks: 0, puntsInside20: 0, games: 0 };
        e.punts += ps.punts; e.puntYards += ps.puntYards;
        e.puntLong = Math.max(e.puntLong, ps.puntLong);
        e.touchbacks += ps.touchbacks; e.puntsInside20 += ps.puntsInside20; e.games++;
        puMap.set(pid, e);
      }
      // Returns
      for (const [pid, rs] of Object.entries(s.returns)) {
        if (!rosterIds.has(pid) || (rs.kickReturns === 0 && rs.puntReturns === 0)) continue;
        const e = retMap.get(pid) ?? { playerId: pid, name: rs.playerName, kickReturns: 0, kickReturnYards: 0, kickReturnLong: 0, kickReturnTDs: 0, puntReturns: 0, puntReturnYards: 0, puntReturnLong: 0, puntReturnTDs: 0, games: 0 };
        e.kickReturns += rs.kickReturns; e.kickReturnYards += rs.kickReturnYards;
        e.kickReturnLong = Math.max(e.kickReturnLong, rs.kickReturnLong);
        e.kickReturnTDs += rs.kickReturnTouchdowns;
        e.puntReturns += rs.puntReturns; e.puntReturnYards += rs.puntReturnYards;
        e.puntReturnLong = Math.max(e.puntReturnLong, rs.puntReturnLong);
        e.puntReturnTDs += rs.puntReturnTouchdowns; e.games++;
        retMap.set(pid, e);
      }
    }

    return {
      passing: Array.from(pMap.values()).sort((a, b) => b.yards - a.yards),
      rushing: Array.from(rMap.values()).sort((a, b) => b.yards - a.yards),
      receiving: Array.from(rcMap.values()).sort((a, b) => b.yards - a.yards),
      defense: Array.from(dMap.values()).sort((a, b) => b.totalTackles - a.totalTackles),
      kicking: Array.from(kMap.values()).sort((a, b) => b.totalPoints - a.totalPoints),
      punting: Array.from(puMap.values()).sort((a, b) => b.punts - a.punts),
      returns: Array.from(retMap.values()).sort((a, b) => (b.kickReturnYards + b.puntReturnYards) - (a.kickReturnYards + a.puntReturnYards)),
    };
  }, [summaries, rosterIds]);

  /* ── Team season totals ── */
  const teamTotals = useMemo(() => {
    let rushYds = 0, passYds = 0, totalYds = 0, pts = 0, ptsAllowed = 0, firstDowns = 0, turnovers = 0;
    for (const s of summaries) {
      const us = program && s.homeTeamStats.teamId === program.id ? s.homeTeamStats : s.awayTeamStats;
      const them = us === s.homeTeamStats ? s.awayTeamStats : s.homeTeamStats;
      rushYds += us.rushingYards; passYds += us.passingYards; totalYds += us.totalYards;
      pts += us.pointsScored; ptsAllowed += them.pointsScored;
      firstDowns += us.firstDowns; turnovers += us.turnovers;
    }
    const gp = summaries.length || 1;
    return { rushYds, passYds, totalYds, pts, ptsAllowed, firstDowns, turnovers, gp,
      ppg: (pts / gp).toFixed(1), papg: (ptsAllowed / gp).toFixed(1), ypg: (totalYds / gp).toFixed(1) };
  }, [summaries, program]);

  const primaryColor = program?.primary_color ?? "#ef4444";

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={() => navigate("/")} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Season Stats</h1>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-8 space-y-4">
        {loading && (
          <div className="card p-8 text-center">
            <div className="text-neutral-500 animate-pulse">Computing season stats...</div>
          </div>
        )}

        {!loading && summaries.length === 0 && (
          <div className="card p-8 text-center">
            <div className="text-neutral-500 text-sm">No completed games yet this season.</div>
          </div>
        )}

        {!loading && summaries.length > 0 && (
          <>
            {/* Team overview cards */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "PPG", val: teamTotals.ppg },
                { label: "YPG", val: teamTotals.ypg },
                { label: "PPG Allowed", val: teamTotals.papg },
              ].map(s => (
                <div key={s.label} className="card p-3 text-center">
                  <div className="text-2xl font-black" style={{ color: primaryColor }}>{s.val}</div>
                  <div className="text-[9px] font-bold text-neutral-500 uppercase">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "Total Pts", val: teamTotals.pts },
                { label: "Rush Yds", val: teamTotals.rushYds },
                { label: "Pass Yds", val: teamTotals.passYds },
                { label: "1st Downs", val: teamTotals.firstDowns },
              ].map(s => (
                <div key={s.label} className="card p-2 text-center">
                  <div className="text-sm font-black tabular-nums">{s.val}</div>
                  <div className="text-[8px] font-bold text-neutral-600">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tab switcher */}
            <div className="flex gap-2">
              <button onClick={() => setTab("offense")}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-colors flex items-center justify-center gap-1 ${
                  tab === "offense" ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-surface-border text-neutral-500"
                }`}>
                <Zap className="w-3.5 h-3.5" /> Offense
              </button>
              <button onClick={() => setTab("defense")}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-colors flex items-center justify-center gap-1 ${
                  tab === "defense" ? "border-red-500 bg-red-500/10 text-red-400" : "border-surface-border text-neutral-500"
                }`}>
                <Shield className="w-3.5 h-3.5" /> Defense
              </button>
              <button onClick={() => setTab("specialteams")}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-colors flex items-center justify-center gap-1 ${
                  tab === "specialteams" ? "border-purple-500 bg-purple-500/10 text-purple-400" : "border-surface-border text-neutral-500"
                }`}>
                <Target className="w-3.5 h-3.5" /> Special Teams
              </button>
            </div>

            {/* ═══ OFFENSE TAB ═══ */}
            {tab === "offense" && (
              <div className="space-y-4">
                {/* Passing */}
                {passing.length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Passing</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">C/A</th>
                            <th className="text-right py-1.5 font-bold">Yds</th>
                            <th className="text-right py-1.5 font-bold">TD</th>
                            <th className="text-right py-1.5 font-bold">INT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {passing.map(p => (
                            <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                              onClick={() => navigate(`/player/${p.playerId}`)}>
                              <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                              <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                              <td className="py-1.5 text-right font-mono">{p.completions}/{p.attempts}</td>
                              <td className="py-1.5 text-right font-mono font-bold">{p.yards}</td>
                              <td className="py-1.5 text-right font-mono text-emerald-400">{p.tds}</td>
                              <td className="py-1.5 text-right font-mono text-red-400">{p.ints}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Rushing */}
                {rushing.length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Rushing</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">Car</th>
                            <th className="text-right py-1.5 font-bold">Yds</th>
                            <th className="text-right py-1.5 font-bold">Avg</th>
                            <th className="text-right py-1.5 font-bold">TD</th>
                            <th className="text-right py-1.5 font-bold">Lng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rushing.map(p => (
                            <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                              onClick={() => navigate(`/player/${p.playerId}`)}>
                              <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                              <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                              <td className="py-1.5 text-right font-mono">{p.carries}</td>
                              <td className="py-1.5 text-right font-mono font-bold">{p.yards}</td>
                              <td className="py-1.5 text-right font-mono">{p.carries > 0 ? (p.yards / p.carries).toFixed(1) : "0.0"}</td>
                              <td className="py-1.5 text-right font-mono text-emerald-400">{p.tds}</td>
                              <td className="py-1.5 text-right font-mono">{p.long}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Receiving */}
                {receiving.length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Receiving</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">Rec</th>
                            <th className="text-right py-1.5 font-bold">Yds</th>
                            <th className="text-right py-1.5 font-bold">Avg</th>
                            <th className="text-right py-1.5 font-bold">TD</th>
                            <th className="text-right py-1.5 font-bold">Lng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiving.map(p => (
                            <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                              onClick={() => navigate(`/player/${p.playerId}`)}>
                              <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                              <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                              <td className="py-1.5 text-right font-mono">{p.receptions}</td>
                              <td className="py-1.5 text-right font-mono font-bold">{p.yards}</td>
                              <td className="py-1.5 text-right font-mono">{p.receptions > 0 ? (p.yards / p.receptions).toFixed(1) : "0.0"}</td>
                              <td className="py-1.5 text-right font-mono text-emerald-400">{p.tds}</td>
                              <td className="py-1.5 text-right font-mono">{p.long}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ DEFENSE TAB ═══ */}
            {tab === "defense" && (
              <div className="space-y-4">
                {/* Tackle leaders */}
                {defense.length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Tackle Leaders</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">Tot</th>
                            <th className="text-right py-1.5 font-bold">Solo</th>
                            <th className="text-right py-1.5 font-bold">Ast</th>
                            <th className="text-right py-1.5 font-bold">TFL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {defense.map(p => (
                            <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                              onClick={() => navigate(`/player/${p.playerId}`)}>
                              <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                              <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                              <td className="py-1.5 text-right font-mono font-bold">{fmt(p.totalTackles)}</td>
                              <td className="py-1.5 text-right font-mono">{fmt(p.soloTackles)}</td>
                              <td className="py-1.5 text-right font-mono">{fmt(p.assistedTackles)}</td>
                              <td className="py-1.5 text-right font-mono">{fmt(p.tacklesForLoss)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Playmakers (sacks, INTs, FF) */}
                {defense.filter(d => d.sacks > 0 || d.interceptions > 0 || d.forcedFumbles > 0).length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Playmakers</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">Sacks</th>
                            <th className="text-right py-1.5 font-bold">INT</th>
                            <th className="text-right py-1.5 font-bold">FF</th>
                            <th className="text-right py-1.5 font-bold">FR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {defense
                            .filter(d => d.sacks > 0 || d.interceptions > 0 || d.forcedFumbles > 0)
                            .sort((a, b) => (b.sacks + b.interceptions + b.forcedFumbles) - (a.sacks + a.interceptions + a.forcedFumbles))
                            .map(p => (
                              <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                                onClick={() => navigate(`/player/${p.playerId}`)}>
                                <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                                <td className="py-1.5 text-right font-mono text-amber-400">{fmt(p.sacks)}</td>
                                <td className="py-1.5 text-right font-mono text-red-400">{p.interceptions}</td>
                                <td className="py-1.5 text-right font-mono text-orange-400">{p.forcedFumbles}</td>
                                <td className="py-1.5 text-right font-mono">{p.fumbleRecoveries}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {defense.length === 0 && (
                  <div className="card p-6 text-center text-neutral-500 text-sm">
                    No defensive stats recorded yet. Add tackler info during PBP to populate this.
                  </div>
                )}
              </div>
            )}

            {/* ═══ SPECIAL TEAMS TAB ═══ */}
            {tab === "specialteams" && (
              <div className="space-y-4">
                {/* Kicking */}
                {kicking.length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Kicking</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">FG</th>
                            <th className="text-right py-1.5 font-bold">FG%</th>
                            <th className="text-right py-1.5 font-bold">Lng</th>
                            <th className="text-right py-1.5 font-bold">XP</th>
                            <th className="text-right py-1.5 font-bold">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kicking.map(p => (
                            <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                              onClick={() => navigate(`/player/${p.playerId}`)}>
                              <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                              <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                              <td className="py-1.5 text-right font-mono">{p.fgMade}/{p.fgAtt}</td>
                              <td className="py-1.5 text-right font-mono">{p.fgAtt > 0 ? (p.fgMade / p.fgAtt * 100).toFixed(0) : "0"}%</td>
                              <td className="py-1.5 text-right font-mono">{p.fgLong || "-"}</td>
                              <td className="py-1.5 text-right font-mono">{p.xpMade}/{p.xpAtt}</td>
                              <td className="py-1.5 text-right font-mono font-bold text-emerald-400">{p.totalPoints}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Punting */}
                {punting.length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Punting</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">Punts</th>
                            <th className="text-right py-1.5 font-bold">Yds</th>
                            <th className="text-right py-1.5 font-bold">Avg</th>
                            <th className="text-right py-1.5 font-bold">Lng</th>
                            <th className="text-right py-1.5 font-bold">I20</th>
                            <th className="text-right py-1.5 font-bold">TB</th>
                          </tr>
                        </thead>
                        <tbody>
                          {punting.map(p => (
                            <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                              onClick={() => navigate(`/player/${p.playerId}`)}>
                              <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                              <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                              <td className="py-1.5 text-right font-mono">{p.punts}</td>
                              <td className="py-1.5 text-right font-mono font-bold">{p.puntYards}</td>
                              <td className="py-1.5 text-right font-mono">{p.punts > 0 ? (p.puntYards / p.punts).toFixed(1) : "0.0"}</td>
                              <td className="py-1.5 text-right font-mono">{p.puntLong}</td>
                              <td className="py-1.5 text-right font-mono">{p.puntsInside20}</td>
                              <td className="py-1.5 text-right font-mono">{p.touchbacks}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Kick Returns */}
                {returns.filter(r => r.kickReturns > 0).length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Kick Returns</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">Ret</th>
                            <th className="text-right py-1.5 font-bold">Yds</th>
                            <th className="text-right py-1.5 font-bold">Avg</th>
                            <th className="text-right py-1.5 font-bold">Lng</th>
                            <th className="text-right py-1.5 font-bold">TD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returns.filter(r => r.kickReturns > 0)
                            .sort((a, b) => b.kickReturnYards - a.kickReturnYards)
                            .map(p => (
                              <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                                onClick={() => navigate(`/player/${p.playerId}`)}>
                                <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                                <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                                <td className="py-1.5 text-right font-mono">{p.kickReturns}</td>
                                <td className="py-1.5 text-right font-mono font-bold">{p.kickReturnYards}</td>
                                <td className="py-1.5 text-right font-mono">{p.kickReturns > 0 ? (p.kickReturnYards / p.kickReturns).toFixed(1) : "0.0"}</td>
                                <td className="py-1.5 text-right font-mono">{p.kickReturnLong}</td>
                                <td className="py-1.5 text-right font-mono text-emerald-400">{p.kickReturnTDs}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Punt Returns */}
                {returns.filter(r => r.puntReturns > 0).length > 0 && (
                  <div className="card p-4">
                    <SectionTitle>Punt Returns</SectionTitle>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-neutral-500 border-b border-surface-border">
                            <th className="text-left py-1.5 font-bold">Player</th>
                            <th className="text-right py-1.5 font-bold">GP</th>
                            <th className="text-right py-1.5 font-bold">Ret</th>
                            <th className="text-right py-1.5 font-bold">Yds</th>
                            <th className="text-right py-1.5 font-bold">Avg</th>
                            <th className="text-right py-1.5 font-bold">Lng</th>
                            <th className="text-right py-1.5 font-bold">TD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returns.filter(r => r.puntReturns > 0)
                            .sort((a, b) => b.puntReturnYards - a.puntReturnYards)
                            .map(p => (
                              <tr key={p.playerId} className="border-b border-surface-border/50 cursor-pointer active:bg-surface-hover"
                                onClick={() => navigate(`/player/${p.playerId}`)}>
                                <td className="py-1.5 font-bold truncate max-w-[120px]">{p.name}</td>
                                <td className="py-1.5 text-right font-mono text-neutral-400">{p.games}</td>
                                <td className="py-1.5 text-right font-mono">{p.puntReturns}</td>
                                <td className="py-1.5 text-right font-mono font-bold">{p.puntReturnYards}</td>
                                <td className="py-1.5 text-right font-mono">{p.puntReturns > 0 ? (p.puntReturnYards / p.puntReturns).toFixed(1) : "0.0"}</td>
                                <td className="py-1.5 text-right font-mono">{p.puntReturnLong}</td>
                                <td className="py-1.5 text-right font-mono text-emerald-400">{p.puntReturnTDs}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {kicking.length === 0 && punting.length === 0 && returns.length === 0 && (
                  <div className="card p-6 text-center text-neutral-500 text-sm">
                    No special teams stats recorded yet.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
