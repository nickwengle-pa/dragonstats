import { useState } from "react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import QuickActions from "@/components/game/QuickActions";
import { isKickoffDue } from "@/components/game/specialTeamsPrompt";
import { PLAY_TYPES, type GameState, type RosterPlayer, type TaggedPlayer, type PlayTypeDef } from "@/components/game/types";
import { advanceSituationAfterPlay } from "@/services/gameFlow";
import { DEFAULT_GAME_CONFIG } from "@/services/programService";

// A development-only practice game. This screen has no persistence callbacks.
const roster: RosterPlayer[] = [
  [7, "Alex", "Miller", "QB"], [12, "Sam", "Davis", "QB"],
  [22, "Jordan", "Reed", "RB"], [24, "Chris", "Bell", "RB"],
  [3, "Casey", "Hill", "WR"], [11, "Taylor", "King", "WR"],
  [80, "Drew", "Lane", "TE"], [44, "Morgan", "Stone", "LB"],
  [52, "Jamie", "Brooks", "LB"], [55, "Riley", "West", "DL"],
  [9, "Parker", "Cole", "DB"], [21, "Avery", "Fox", "DB"],
].map(([jersey, first, last, pos]) => ({
  id: `sample-${jersey}`, player_id: `sample-${jersey}`, jersey_number: Number(jersey),
  position: String(pos), positions: [String(pos)],
  player: { id: `sample-${jersey}`, first_name: String(first), last_name: String(last), preferred_name: null },
}));
const opponents = [2, 8, 20, 32, 40, 51].map(n => ({ id: `opp_UNK_${n}`, jersey_number: n, name: `Visitor ${n}`, position: null }));
const initial: GameState = { quarter: 1, clock: 600, down: 1, distance: 10, ballOn: 35, possession: "us", ourScore: 0, theirScore: 0 };
const qb: TaggedPlayer = { id: "sample-7", player_id: "sample-7", jersey_number: 7, name: "Alex Miller", role: "passer" };
interface PracticePlay { data: PlaySubmitData; before: GameState; remembered: Record<string, TaggedPlayer>; practiceKickoff: boolean; }

export default function FlowPreview() {
  const [situation, setSituation] = useState(initial);
  const [playType, setPlayType] = useState<PlayTypeDef | null>(null);
  const [formations, setFormations] = useState(false);
  const [practiceKickoff, setPracticeKickoff] = useState(false);
  const [plays, setPlays] = useState<PracticePlay[]>([]);
  const [remembered, setRemembered] = useState<Record<string, TaggedPlayer>>({ "passer:us": qb });
  const spot = (ballOn: number) => `${ballOn <= 50 ? (situation.possession === "us" ? "Dragons" : "Visitors") : (situation.possession === "us" ? "Visitors" : "Dragons")} ${ballOn <= 50 ? ballOn : 100 - ballOn}`;
  const record = (data: PlaySubmitData) => {
    setPracticeKickoff(false);
    setPlays(prev => [...prev, { data, before: situation, remembered, practiceKickoff }]);
    const next = advanceSituationAfterPlay({
      type: data.playType.id, yards: data.yards, result: data.result, penalty: data.penalty,
      penaltyCategory: data.penaltyCategory, penaltyEnforcement: data.penaltyEnforcement,
      flagYards: data.flagYards, isTouchdown: data.isTouchdown, firstDown: data.isFirstDown,
      turnover: data.turnover, isTouchback: data.isTouchback, blockedKickType: data.blockedKickType,
      fumbleRecoveredAt: data.fumbleRecoveredAt, fumbleReturnYards: data.fumbleReturnYards,
    }, situation, DEFAULT_GAME_CONFIG);
    setSituation(prev => ({ ...prev, ...next,
        ourScore: prev.ourScore + (data.isTouchdown && next.possession === "us" ? 6 : 0),
        theirScore: prev.theirScore + (data.isTouchdown && next.possession === "them" ? 6 : 0),
    }));
    setRemembered(prev => {
      const updated = { ...prev };
      for (const t of data.tagged) if (!t.isTeam && t.player_id !== "opp_team") updated[`${t.role}:${t.isOpponent ? "opp" : "us"}`] = t;
      return updated;
    });
    setPlayType(null);
  };
  const lastSnap = [...plays].reverse().find(p => !["timeout", "penalty_only"].includes(p.data.playType.id));
  const kickoffDue = practiceKickoff || isKickoffDue(situation, lastSnap ? {
    type: lastSnap.data.playType.id, result: lastSnap.data.result, isTouchdown: lastSnap.data.isTouchdown, quarter: lastSnap.before.quarter,
  } : undefined, DEFAULT_GAME_CONFIG);
  return <main className="min-h-dvh bg-surface-bg text-slate-100 p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
    <header className="space-y-2">
      <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Practice game · sample players</div>
      <h1 className="text-2xl font-black">Try the new live flow</h1>
      <p className="text-sm text-slate-400">Record a few plays, try shared tackles, and undo to repeat. Practice plays stay on this page and clear on reload. Clock prompts and official penalty review remain in the full game.</p>
    </header>
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-ghost min-h-11 px-3 border border-surface-border rounded-lg" onClick={() => { setPracticeKickoff(false); setSituation(prev => ({ ...prev, possession: prev.possession === "us" ? "them" : "us", down: 1, distance: 10, ballOn: 35 })); }}>Switch possession</button>
      <label className="flex items-center gap-2 min-h-11"><input type="checkbox" checked={formations} onChange={e => setFormations(e.target.checked)} />Track formations</label>
      <span className="text-sm text-slate-300">Tacklers on</span>
      <button className="btn-ghost min-h-11 px-3 border border-surface-border rounded-lg" onClick={() => { setPracticeKickoff(false); setSituation(prev => ({ ...prev, down: 4, distance: 5, ballOn: 35 })); }}>Try fourth down</button>
      <button className="btn-ghost min-h-11 px-3 border border-surface-border rounded-lg" onClick={() => { setPracticeKickoff(true); setSituation(prev => ({ ...prev, down: 1, distance: DEFAULT_GAME_CONFIG.first_down_distance, ballOn: DEFAULT_GAME_CONFIG.kickoff_yard_line })); }}>Try kickoff</button>
    </div>
    <div className="card p-3">
      <QuickActions possession={situation.possession} progName="Dragons" oppName="Visitors" down={situation.down} distance={situation.distance} ballOn={situation.ballOn} kickoffDue={kickoffDue} suggestedPhase={kickoffDue || situation.down === 4 ? "special" : "run"} spotLabel={spot(situation.ballOn)} onSelect={setPlayType} />
    </div>
    <section className="space-y-2">
      <div className="flex justify-between items-center"><h2 className="font-bold">Practice plays ({plays.length})</h2><button disabled={!plays.length} className="btn-ghost min-h-11 px-3 disabled:opacity-30" onClick={() => {
        const last = plays[plays.length - 1]; if (!last) return;
        setSituation(last.before); setPracticeKickoff(last.practiceKickoff); setRemembered(last.remembered); setPlays(prev => prev.slice(0, -1));
      }}>Undo last play</button></div>
      {!plays.length && <p className="text-sm text-slate-400">Start with Run, Complete, Incomplete, or Sack.</p>}
      {[...plays].reverse().map((play, i) => <div key={plays.length - i} className="border-b border-surface-border py-3">
        <div className="font-bold">{plays.length - i}. {play.data.description}</div>
        <div className="text-sm text-slate-400">{play.data.tagged.map(t => `${t.role}: ${t.isTeam ? "Identify on film" : t.name}${t.credit != null ? ` (${t.credit === 1 ? "solo" : "assist"})` : ""}`).join(" · ")}</div>
      </div>)}
    </section>
    {playType && <PlayEntryModal playType={playType} gameState={situation} roster={roster} opponentPlayers={opponents}
      progName="Dragons" oppName="Visitors" lastPlayerByRole={remembered} trackFormations={formations} trackTacklers
      offenseDirection={situation.possession === "us" ? "right" : "left"} onSubmit={record} onClose={() => setPlayType(null)} />}
  </main>;
}
