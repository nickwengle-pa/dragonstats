import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { computeGameStats } from "@/services/statsService";
import { loadGamePlays } from "@/services/gameService";
import { DriveResult, type GameSummary, type TeamStats, type PassingStats, type RushingStats, type ReceivingStats, type DefensiveStats } from "football-stats-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pct(n: number | undefined): string {
  if (n === undefined || n === null) return "0%";
  return `${Math.round(n)}%`;
}

/** Pick the top player from a stat record by a numeric key */
function topPlayer<T extends { playerId: string; playerName: string }>(
  stats: Record<string, T>,
  key: keyof T,
  rosterIds: Set<string>,
): T | null {
  let best: T | null = null;
  for (const s of Object.values(stats)) {
    if (!rosterIds.has(s.playerId)) continue;
    if (!best || (s[key] as number) > (best[key] as number)) best = s;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatRow({ label, home, away }: { label: string; home: string; away: string }) {
  return (
    <div className="flex items-center py-1.5 text-sm">
      <span className="w-16 text-right font-mono font-bold">{home}</span>
      <span className="flex-1 text-center text-xs text-slate-500 font-medium">{label}</span>
      <span className="w-16 text-left font-mono font-bold">{away}</span>
    </div>
  );
}

function LeaderCard({ title, line1, line2 }: { title: string; line1: string; line2: string }) {
  return (
    <div className="bg-surface-card rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">{title}</div>
      <div className="text-sm font-bold truncate">{line1}</div>
      <div className="text-xs text-slate-400 font-mono">{line2}</div>
    </div>
  );
}

interface FormationBreakdown {
  formation: string;
  plays: number;
  yards: number;
  avg: number;
  tds: number;
}

function computeFormationStats(plays: any[], possession: "us" | "them", field: "offensive_formation" | "defensive_formation"): FormationBreakdown[] {
  const map = new Map<string, { plays: number; yards: number; tds: number }>();
  for (const p of plays) {
    if (p.possession !== possession) continue;
    const f = p[field];
    if (!f) continue;
    const entry = map.get(f) ?? { plays: 0, yards: 0, tds: 0 };
    entry.plays++;
    entry.yards += p.yards_gained ?? 0;
    if (p.is_touchdown) entry.tds++;
    map.set(f, entry);
  }
  return Array.from(map.entries())
    .map(([formation, s]) => ({ formation, ...s, avg: s.plays > 0 ? +(s.yards / s.plays).toFixed(1) : 0 }))
    .sort((a, b) => b.plays - a.plays);
}

function FormationTable({ title, data, color }: { title: string; data: FormationBreakdown[]; color: string }) {
  if (data.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-surface-border">
              <th className="text-left py-1.5 font-bold">Formation</th>
              <th className="text-right py-1.5 font-bold w-10">Plays</th>
              <th className="text-right py-1.5 font-bold w-12">Yards</th>
              <th className="text-right py-1.5 font-bold w-10">Avg</th>
              <th className="text-right py-1.5 font-bold w-8">TD</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.formation} className="border-b border-surface-border/50">
                <td className="py-1.5 font-bold" style={{ color }}>{row.formation}</td>
                <td className="py-1.5 text-right font-mono">{row.plays}</td>
                <td className="py-1.5 text-right font-mono">{row.yards}</td>
                <td className="py-1.5 text-right font-mono">{row.avg}</td>
                <td className="py-1.5 text-right font-mono">{row.tds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface GameInfo {
  our_score: number;
  opponent_score: number;
  is_home: boolean;
  status: string;
  opponent_name: string;
  opponent_color: string;
  game_date: string;
}

export default function GameSummaryScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { program, season } = useProgramContext();

  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [roster, setRoster] = useState<Set<string>>(new Set());
  const [offFormations, setOffFormations] = useState<FormationBreakdown[]>([]);
  const [defFormations, setDefFormations] = useState<FormationBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId || !program || !season) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // Load game info for display
        const { data: gData } = await supabase
          .from("games")
          .select("our_score, opponent_score, is_home, status, game_date, opponent:opponents(name, primary_color)")
          .eq("id", gameId)
          .single();

        if (cancelled) return;

        if (gData) {
          const opp = gData.opponent as any;
          setGameInfo({
            our_score: gData.our_score,
            opponent_score: gData.opponent_score,
            is_home: gData.is_home,
            status: gData.status,
            opponent_name: opp?.name ?? "Opponent",
            opponent_color: opp?.primary_color ?? "#6b7280",
            game_date: gData.game_date,
          });
        }

        // Load roster IDs to filter "our" players
        const { data: rData } = await supabase
          .from("season_rosters")
          .select("player_id")
          .eq("season_id", season.id)
          .eq("is_active", true);

        if (cancelled) return;
        setRoster(new Set((rData ?? []).map((r: any) => r.player_id)));

        // Compute stats
        const result = await computeGameStats(gameId, {
          id: program.id,
          name: program.name,
          abbreviation: program.abbreviation,
          game_config: program.game_config,
        });

        if (cancelled) return;
        setSummary(result);

        // Load raw plays for formation breakdowns
        const rawPlays = await loadGamePlays(gameId);
        if (!cancelled) {
          setOffFormations(computeFormationStats(rawPlays, "us", "offensive_formation"));
          setDefFormations(computeFormationStats(rawPlays, "us", "defensive_formation"));
        }
      } catch (e) {
        if (!cancelled) setError("Failed to compute stats");
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [gameId, program, season]);

  // Determine which team stats are "ours"
  const ourTeamStats: TeamStats | null = summary
    ? (program && summary.homeTeamStats.teamId === program.id
        ? summary.homeTeamStats
        : summary.awayTeamStats)
    : null;
  const theirTeamStats: TeamStats | null = summary
    ? (ourTeamStats === summary.homeTeamStats
        ? summary.awayTeamStats
        : summary.homeTeamStats)
    : null;

  // Player leaders (our team only)
  const topPasser = summary ? topPlayer<PassingStats>(summary.passing, "yards", roster) : null;
  const topRusher = summary ? topPlayer<RushingStats>(summary.rushing, "yards", roster) : null;
  const topReceiver = summary ? topPlayer<ReceivingStats>(summary.receiving, "yards", roster) : null;
  const topDefender = summary ? topPlayer<DefensiveStats>(summary.defense, "totalTackles", roster) : null;

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate(`/game/${gameId}`)} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Game Summary</h1>
        <button className="btn-ghost p-2"><Share2 className="w-5 h-5" /></button>
        <button className="btn-ghost p-2"><Download className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 px-5 space-y-4 overflow-y-auto pb-8">
        {/* Return to live game banner */}
        {gameInfo?.status === "live" && (
          <button
            onClick={() => navigate(`/game/${gameId}`)}
            className="w-full card p-3 flex items-center justify-center gap-2 border border-red-500/30 active:scale-[0.98] transition-transform"
            style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.08), rgba(220,38,38,0.02))" }}
          >
            <span className="text-red-400 text-[10px] font-black uppercase animate-pulse">LIVE</span>
            <span className="text-sm font-bold text-red-400">Return to Game</span>
          </button>
        )}

        {/* Loading / error */}
        {loading && (
          <div className="card p-8 text-center">
            <div className="text-slate-500 animate-pulse">Computing stats...</div>
          </div>
        )}

        {error && (
          <div className="card p-5 border border-red-500/30">
            <div className="text-red-400 text-sm">{error}</div>
          </div>
        )}

        {!loading && !summary && !error && (
          <div className="card p-8 text-center">
            <div className="text-slate-500 text-sm">No play data recorded yet.</div>
          </div>
        )}

        {/* Score */}
        {gameInfo && (
          <div className="card p-6 text-center">
            <div className="text-xs font-bold text-slate-500 uppercase mb-3">
              {gameInfo.status === "completed" ? "Final" : gameInfo.status === "live" ? "Live" : "Score"}
            </div>
            <div className="flex items-center justify-center gap-8">
              <div>
                <div className="text-4xl font-black" style={{ color: program?.primary_color }}>
                  {gameInfo.our_score}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1">
                  {program?.abbreviation ?? "US"}
                </div>
              </div>
              <div className="text-slate-600 text-sm font-bold">&mdash;</div>
              <div>
                <div className="text-4xl font-black" style={{ color: gameInfo.opponent_color }}>
                  {gameInfo.opponent_score}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1">
                  {gameInfo.opponent_name}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Team stats comparison */}
        {summary && ourTeamStats && theirTeamStats && (
          <div className="card p-5">
            <div className="text-xs font-bold text-slate-500 uppercase mb-3">Team Stats</div>
            <StatRow label="Total Yards" home={fmt(ourTeamStats.totalYards)} away={fmt(theirTeamStats.totalYards)} />
            <StatRow label="Rush Yards" home={fmt(ourTeamStats.rushingYards)} away={fmt(theirTeamStats.rushingYards)} />
            <StatRow label="Pass Yards" home={fmt(ourTeamStats.passingYards)} away={fmt(theirTeamStats.passingYards)} />
            <StatRow label="First Downs" home={fmt(ourTeamStats.firstDowns)} away={fmt(theirTeamStats.firstDowns)} />
            <StatRow
              label="3rd Down"
              home={`${ourTeamStats.thirdDownConversions}/${ourTeamStats.thirdDownAttempts}`}
              away={`${theirTeamStats.thirdDownConversions}/${theirTeamStats.thirdDownAttempts}`}
            />
            <StatRow label="Turnovers" home={fmt(ourTeamStats.turnovers)} away={fmt(theirTeamStats.turnovers)} />
            <StatRow
              label="Penalties"
              home={`${ourTeamStats.penalties}-${ourTeamStats.penaltyYards}`}
              away={`${theirTeamStats.penalties}-${theirTeamStats.penaltyYards}`}
            />
            <StatRow label="TOP" home={ourTeamStats.timeOfPossession} away={theirTeamStats.timeOfPossession} />
          </div>
        )}

        {/* Player leaders */}
        {summary && (topPasser || topRusher || topReceiver || topDefender) && (
          <div className="card p-5">
            <div className="text-xs font-bold text-slate-500 uppercase mb-3">Player Leaders</div>
            <div className="grid grid-cols-2 gap-2">
              {topPasser && topPasser.attempts > 0 && (
                <LeaderCard
                  title="Passing"
                  line1={topPasser.playerName}
                  line2={`${topPasser.completions}/${topPasser.attempts} ${topPasser.yards} yds ${topPasser.touchdowns} TD ${topPasser.interceptions} INT`}
                />
              )}
              {topRusher && topRusher.carries > 0 && (
                <LeaderCard
                  title="Rushing"
                  line1={topRusher.playerName}
                  line2={`${topRusher.carries} car ${topRusher.yards} yds ${topRusher.touchdowns} TD`}
                />
              )}
              {topReceiver && topReceiver.receptions > 0 && (
                <LeaderCard
                  title="Receiving"
                  line1={topReceiver.playerName}
                  line2={`${topReceiver.receptions} rec ${topReceiver.yards} yds ${topReceiver.touchdowns} TD`}
                />
              )}
              {topDefender && topDefender.totalTackles > 0 && (
                <LeaderCard
                  title="Defense"
                  line1={topDefender.playerName}
                  line2={`${fmt(topDefender.totalTackles)} tkl ${topDefender.tacklesForLoss} TFL ${topDefender.sacks} sck ${topDefender.interceptions} INT`}
                />
              )}
            </div>
          </div>
        )}

        {/* Formation Breakdowns */}
        {(offFormations.length > 0 || defFormations.length > 0) && (
          <div className="card p-5 space-y-4">
            <div className="text-xs font-bold text-slate-500 uppercase">Formation Breakdown</div>
            <FormationTable title="Offensive Formations" data={offFormations} color={program?.primary_color ?? "#3b82f6"} />
            <FormationTable title="Defensive Formations" data={defFormations} color="#ef4444" />
          </div>
        )}

        {/* Scoring plays */}
        {summary && summary.scoringPlays.length > 0 && (
          <div className="card p-5">
            <div className="text-xs font-bold text-slate-500 uppercase mb-3">Scoring</div>
            <div className="space-y-2">
              {summary.scoringPlays.map((sp, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-slate-500 font-mono w-12 shrink-0 pt-0.5">
                    Q{sp.quarter} {sp.gameClock}
                  </span>
                  <span className="flex-1 text-slate-300">{sp.description}</span>
                  <span className="font-mono font-bold text-xs whitespace-nowrap">
                    {sp.homeScore}-{sp.awayScore}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drive summary */}
        {summary && summary.drives.length > 0 && (
          <div className="card p-5">
            <div className="text-xs font-bold text-slate-500 uppercase mb-3">Drives</div>
            <div className="space-y-1">
              {summary.drives.map((d, i) => {
                const isOurs = d.team === program?.id;
                return (
                  <div key={i} className="flex items-center gap-2 text-xs py-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOurs ? "bg-dragon-primary" : "bg-slate-500"}`} />
                    <span className="text-slate-500 font-mono w-8">Q{d.startQuarter}</span>
                    <span className="flex-1 truncate text-slate-300">
                      {d.plays} plays, {d.yards} yds
                    </span>
                    <span className="font-mono text-slate-400">{d.timeOfPossession}</span>
                    <span className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                      d.result === DriveResult.Touchdown ? "bg-green-500/20 text-green-400"
                      : d.result === DriveResult.FieldGoal ? "bg-yellow-500/20 text-yellow-400"
                      : d.result === DriveResult.Turnover || d.result === DriveResult.TurnoverOnDowns ? "bg-red-500/20 text-red-400"
                      : "bg-slate-700 text-slate-400"
                    }`}>
                      {d.result}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Export actions */}
        <div className="flex gap-3">
          <button className="btn-primary flex-1 gap-2">
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button className="btn-secondary flex-1 gap-2">
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
