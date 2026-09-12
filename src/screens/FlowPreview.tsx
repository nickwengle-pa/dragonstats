import { useRef, useState } from "react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import FieldVisualizer from "@/components/game/FieldVisualizer";
import Scoreboard from "@/components/game/Scoreboard";
import ClockInput from "@/components/game/ClockInput";
import { countPlayerUsage } from "@/components/game/playerUsage";
import { OffensivePlayBadge, PlayTacklers } from "@/components/game/PlayRowDetails";
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
  const [clockDraft, setClockDraft] = useState<number | null>(null);
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
      playData: data.playData,
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
    type: lastSnap.data.playType.id, result: lastSnap.data.result, isTouchdown: lastSnap.data.isTouchdown, quarter: lastSnap.before.quarter, playData: lastSnap.data.playData,
  } : undefined, DEFAULT_GAME_CONFIG);
  const [tilted, setTilted] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [draftSpot, setDraftSpot] = useState<number | null>(null);
  const [spotRequest, setSpotRequest] = useState<{ballOn:number;id:number} | null>(null);
  const [pane, setPane] = useState("play");
  const pickId = useRef(0);
  const right = (situation.possession === "us") !== flipped;
  const shownSpot = playType && draftSpot != null ? draftSpot : situation.ballOn;
  const selectPlay = (pt: PlayTypeDef) => { setSpotRequest(null); setDraftSpot(null); setPlayType(pt); };
  const flipPossession = () => { setPlayType(null); setPracticeKickoff(false); setSituation(prev=>({...prev, possession:prev.possession==="us"?"them":"us",down:1,distance:10,ballOn:35})); };
  return <main className={`screen live-game-screen ${playType ? "live-recording" : ""} h-dvh overflow-hidden`}>
    <header className="flex items-center flex-wrap gap-3 px-4 py-2 shrink-0">
      <h1 className="font-bold text-sm">Practice live game</h1>
      <button className="btn-ghost min-h-11" onClick={flipPossession}>Switch possession</button>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={formations} onChange={e=>setFormations(e.target.checked)} />Formations</label>
      <button className="btn-ghost min-h-11" onClick={()=>{setPlayType(null);setPracticeKickoff(true);}}>Try kickoff</button>
    </header>
    <div className="live-pinned shrink-0 px-3 lg:px-5 pb-2 space-y-2">
      <Scoreboard state={situation} progName="Dragons" oppName="Visitors" progAbbr="DRG" oppAbbr="VIS" primaryColor="#164e63" oppColor="#854d0e" ballLabel={spot(situation.ballOn)} locked={!!playType}
        onPreviousQuarter={()=>setSituation(prev=>({...prev,quarter:Math.max(1,prev.quarter-1)}))} onNextQuarter={()=>setSituation(prev=>({...prev,quarter:prev.quarter+1}))} canPreviousQuarter={situation.quarter>1} canNextQuarter={situation.quarter<4}
        onEditClock={()=>setClockDraft(situation.clock)} onEndGame={()=>{}} onSetDown={down=>setSituation(prev=>({...prev,down}))} onAdjustDistance={delta=>setSituation(prev=>({...prev,distance:Math.max(1,prev.distance+delta)}))}
        onAdjustBall={delta=>setSituation(prev=>({...prev,ballOn:Math.max(1,Math.min(99,prev.ballOn+delta))}))} onEditBall={()=>{}} ourTimeoutsRemaining={3} theirTimeoutsRemaining={3} onTakeTimeout={()=>{}} onFlipPossession={flipPossession} />
      <div className="live-field-block">
        <FieldVisualizer compact tilted={tilted} ballOn={shownSpot} ballPosition={right?shownSpot:100-shownSpot}
          firstDownPosition={right?situation.ballOn+situation.distance:100-situation.ballOn-situation.distance} possession={situation.possession}
          ourEndZoneSide={flipped?"right":"left"} primaryColor="#164e63" oppColor="#854d0e" progName="Dragons" oppName="Visitors" progAbbr="DRG" oppAbbr="VIS" onFlipDirection={()=>setFlipped(v=>!v)}
          onPickSpot={playType && draftSpot==null?undefined:display=>{const ballOn=Math.max(1,Math.min(99,right?display:100-display));if(playType)setSpotRequest({ballOn,id:++pickId.current});else setSituation(prev=>({...prev,ballOn}));}} />
        <div className="live-field-toolbar"><span>{playType?"Tap field to set ending spot":"Tap field to set starting yard line"}</span><button className="border border-surface-border rounded" onClick={()=>setTilted(v=>!v)} aria-label={tilted?"Switch to flat field":"Switch to tilted field"}>{tilted?"Tilted / Flat":"Flat / Tilted"}</button></div>
      </div>
    </div>
    <div className="live-pane-switch lg:hidden px-3 flex gap-3 pb-2"><button className="btn-ghost" onClick={()=>setPane("play")}>Play</button><button className="btn-ghost" onClick={()=>setPane("plays")}>Plays ({plays.length})</button></div>
    <div className="live-workspace flex-1 min-h-0 px-3 lg:px-5 pb-4 overflow-y-auto flex gap-4">
      <div className={`live-entry-column flex-1 min-w-0 lg:block ${pane === "play" ? "" : "hidden"}`} data-pane={pane}>
        {playType ? <PlayEntryModal inlineSimple key={playType.id} playType={playType} gameState={situation} roster={roster} opponentPlayers={opponents}
          playerUsage={countPlayerUsage(plays.map(play => play.data))}
          fieldSpotRequest={spotRequest} onFieldPreview={setDraftSpot} progName="Dragons" oppName="Visitors" progColor="#164e63" oppColor="#854d0e" lastPlayerByRole={remembered} trackFormations={formations} trackTacklers
          offenseDirection={right?"right":"left"} ourEndZoneSide={flipped?"right":"left"} onSubmit={record} onClose={()=>setPlayType(null)} /> : <div className="card p-3"><QuickActions possession={situation.possession} progName="Dragons" oppName="Visitors" down={situation.down} distance={situation.distance} ballOn={situation.ballOn} kickoffDue={kickoffDue} suggestedPhase={kickoffDue||situation.down===4?"special":"run"} spotLabel={spot(situation.ballOn)} onSelect={selectPlay} /></div>}
      </div>
      <section className={`live-log-column space-y-2 lg:block ${pane === "plays" ? "" : "hidden"}`} data-pane={pane}>
        <div className="flex justify-between items-center"><h2 className="font-bold">Practice plays ({plays.length})</h2><button disabled={!plays.length} className="btn-ghost min-h-11 disabled:opacity-30" onClick={()=>{const last=plays[plays.length-1];if(!last)return;setSituation(last.before);setPracticeKickoff(last.practiceKickoff);setRemembered(last.remembered);setPlays(prev=>prev.slice(0,-1));}}>Undo</button></div>
        {!plays.length && <p className="text-sm text-slate-400">Sample players. Nothing is saved to your live games.</p>}
        {[...plays].reverse().map((play,i)=><div key={plays.length-i} className="border-b border-surface-border py-3"><div className="font-bold">{plays.length-i}. {play.data.description}</div><OffensivePlayBadge play={{type:play.data.playType.id,possession:play.before.possession,tagged:play.data.tagged}} /><div className="text-[10px] text-slate-400">{play.before.down}{play.before.down === 1 ? "st" : play.before.down === 2 ? "nd" : play.before.down === 3 ? "rd" : "th"}&{play.before.distance} · {play.before.ballOn === 50 ? "50" : `${(play.before.ballOn < 50) === (play.before.possession === "us") ? "DRG" : "VIS"} ${play.before.ballOn < 50 ? play.before.ballOn : 100-play.before.ballOn}`}</div><PlayTacklers play={{type:play.data.playType.id,possession:play.before.possession,tagged:play.data.tagged}} /><div className="text-sm text-slate-400">{play.data.tagged.map(t=>`${t.role}: ${t.teamCreditConfirmed?"Team":t.isTeam||t.player_id==="opp_team"?"Identify on film later":t.name}${t.credit!=null?` (${t.credit===1?"solo":"assist"})`:""}`).join(" · ")}</div></div>)}
      </section>
    </div>
    {clockDraft != null && <div className="sheet bg-black/80" role="dialog" aria-modal="true" aria-label="Set Clock">
      <div className="sheet-panel p-6 space-y-3 max-w-xs mx-auto">
        <h2 className="text-sm font-black text-center">Set Clock</h2>
        <ClockInput seconds={clockDraft} onChange={setClockDraft} maxSeconds={DEFAULT_GAME_CONFIG.quarter_length_secs} autoFocus />
        <button className="btn-primary w-full" onClick={()=>{setSituation(prev=>({...prev,clock:clockDraft}));setClockDraft(null);}}>Set Clock</button>
        <button className="w-full py-2 text-sm text-slate-400" onClick={()=>setClockDraft(null)}>Cancel</button>
      </div>
    </div>}
  </main>;
}
