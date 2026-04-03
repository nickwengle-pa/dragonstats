import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Zap } from "lucide-react";
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

type Tab = "offense" | "defense";

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
          id: program.id, name: program.name, abbreviation: program.abbreviation,
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
  const { passing, rushing, receiving, defense } = useMemo(() => {
    const pMap = new Map<string, AggPassing>();
    const rMap = new Map<string, AggRushing>();
    const rcMap = new Map<string, AggReceiving>();
    const dMap = new Map<string, AggDefense>();

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
    }

    return {
      passing: Array.from(pMap.values()).sort((a, b) => b.yards - a.yards),
      rushing: Array.from(rMap.values()).sort((a, b) => b.yards - a.yards),
      receiving: Array.from(rcMap.values()).sort((a, b) => b.yards - a.yards),
      defense: Array.from(dMap.values()).sort((a, b) => b.totalTackles - a.totalTackles),
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
          </>
        )}
      </div>
    </div>
  );
}
