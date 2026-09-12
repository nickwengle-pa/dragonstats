import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X, Flag } from "lucide-react";
import YardReel from "./YardReel";
import PlayerPicker, { playerLabel } from "./PlayerPicker";
import type { PlayerUsage } from "./playerUsage";
import "./liveEntry.css";
import {
  type GameState, type TaggedPlayer, type PlayTypeDef,
  OFFENSIVE_FORMATIONS, DEFENSIVE_FORMATIONS,
} from "./types";

interface Props {
  playerUsage?: PlayerUsage;
  inline?: boolean;
  spotConfirmed?: boolean;
  fieldSpotRequest?: { ballOn: number; id: number } | null;
  onFieldPreview?: (ballOn: number | null) => void;
  playType: PlayTypeDef;
  situation: GameState;
  offenseName: string;
  defenseName: string;
  offensePlayers: TaggedPlayer[];
  defensePlayers: TaggedPlayer[];
  tagged: TaggedPlayer[];
  tacklers: TaggedPlayer[];
  noTackle: boolean;
  trackTacklers: boolean;
  trackFormations: boolean;
  isTD: boolean;
  yards: number;
  offenseDirection: "left" | "right";
  accentColor: string;
  formatSpot: (spot: number) => string;
  onTag: (role: string, player: TaggedPlayer | null) => void;
  onTackler: (player: TaggedPlayer) => void;
  onNoTackle: () => void;
  onUnknownTackle: () => void;
  onTeamTackle?: () => void;
  onYards: (yards: number) => void;
  onTouchdown: () => void;
  onDetailed: (section: "players" | "penalty" | "fumble") => void;
  offFormation: string | null;
  defFormation: string | null;
  hashMark: string | null;
  onOffFormation: (value: string | null) => void;
  onDefFormation: (value: string | null) => void;
  onHash: (value: string | null) => void;
  attachedDetails?: string;
  onSubmit: () => void | Promise<void>;
  onClose: () => void;
  onBadSnap: () => void;
  onKneel: () => void | Promise<void>;
}

const labels: Record<string, string> = { rusher: "Runner", passer: "QB", receiver: "Receiver", target: "Target", tackler: "Tacklers", sacker: "Sackers" };
const button = "min-h-11 px-3 py-2 rounded-lg border text-sm font-bold active:bg-surface-hover";
const idle = "border-surface-border bg-surface-bg text-slate-200";
const selected = "border-dragon-primary bg-dragon-primary/20 text-white";

export default function FastPlayEntry(p: Props) {
  const incomplete = p.playType.id === "pass_inc";
  const sack = p.playType.id === "sack";
  const defenseRole = sack ? "sacker" : "tackler";
  const showTacklers = p.trackTacklers && !incomplete && !p.isTD;
  const ours = p.situation.possession === "us";
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [spotTouched, setSpotTouched] = useState(p.spotConfirmed || incomplete || p.isTD || p.yards !== 0);
  const missingRole = ours ? p.playType.roles.find(r => r !== "target" && !p.tagged.some(t => t.role === r)) : undefined;
  const missingTackle = showTacklers && !ours && !p.noTackle && p.tacklers.length === 0;
  const endSpot = p.isTD ? 100 : p.situation.ballOn + p.yards;
  const [spotRaw, setSpotRaw] = useState(String(endSpot <= 50 ? endSpot : 100 - endSpot));
  const validSpot = incomplete || p.isTD || (spotRaw.trim() !== "" && Number(spotRaw) >= 1 && Number(spotRaw) <= 50);
  const ready = !missingRole && !missingTackle && spotTouched && validSpot;
  const requiredMessage = !validSpot ? "Enter a yard line from 1 to 50, or choose Touchdown." : missingRole ? `Choose ${labels[missingRole]} or identify on film later.` : !spotTouched ? "Set the ending spot, or tap No gain." : "Choose a tackler, Identify on film later, or No tackle.";
  const firstDown = !incomplete && p.yards >= p.situation.distance;
  const nextLabel = p.isTD ? "Touchdown · conversion next" : p.situation.down === 4 && !firstDown
    ? `Turnover on downs · ${p.formatSpot(endSpot)}`
    : `${firstDown ? 1 : p.situation.down + 1} & ${firstDown ? Math.min(10, 100 - endSpot) : p.situation.distance - (incomplete ? 0 : p.yards)} · ${p.formatSpot(endSpot)}`;
  const changeYards = (yards: number) => {
    setSpotTouched(true); p.onYards(yards);
    const nextSpot = Math.max(1, Math.min(99, p.situation.ballOn + yards));
    setSpotRaw(String(nextSpot <= 50 ? nextSpot : 100 - nextSpot));
  };

  // A tap on the main field is a request, not a change to the snap situation.
  // A request already present on remount was applied before Full Details.
  // Do not replay it over any yardage changed in that view.
  const appliedRequest = useRef<number | null>(p.fieldSpotRequest?.id ?? null);
  useEffect(() => {
    const request = p.fieldSpotRequest;
    if (!request || appliedRequest.current === request.id || incomplete) return;
    appliedRequest.current = request.id;
    changeYards(Math.max(1, Math.min(99, request.ballOn)) - p.situation.ballOn);
  }, [p.fieldSpotRequest]);
  useEffect(() => {
    p.onFieldPreview?.(incomplete ? null : endSpot);
  }, [endSpot, incomplete, p.onFieldPreview]);
  useEffect(() => () => { p.onFieldPreview?.(null); }, [p.onFieldPreview]);

  return (
    <div className={p.inline ? "live-inline-entry" : "sheet bg-black/60 backdrop-blur-sm"}>
      <div role={p.inline ? "region" : "dialog"} aria-modal={p.inline ? undefined : true} aria-labelledby="fast-title" style={{ "--fast-accent": p.accentColor } as CSSProperties} className={p.inline ? "card !p-0 fast-entry" : "sheet-panel sm:!max-w-3xl !max-h-[96dvh] fast-entry"}>
        <header className="fast-header">
          <div><h2 id="fast-title">{p.playType.label} <span>· {p.offenseName}</span></h2><p>{p.situation.down} & {p.situation.distance} · From {p.formatSpot(p.situation.ballOn)}</p></div>
          <button aria-label={p.inline ? "Change play" : "Cancel play"} onClick={p.onClose} className={`${button} ${idle}`}>{p.inline ? "Change play" : <X size={20} />}</button>
        </header>
        <div className="fast-body">
          <div className="fast-columns">
            <section className="fast-personnel" aria-label="Play participants">
              {p.playType.id === "rush" && <button type="button" onClick={p.onBadSnap} className={`${button} ${idle} w-full`}>Bad Snap · charge rushing to Team</button>}
              {p.playType.id === "rush" && <button type="button" disabled={saving} onClick={async () => {
                setSaving(true); setSaveError("");
                try { await p.onKneel(); } catch { setSaveError("Could not save. Try again."); } finally { setSaving(false); }
              }} className={`${button} ${idle} w-full disabled:opacity-40`}>Kneel · QB or Team · −1 yd</button>}
              {p.playType.id === "bad_snap" && <p className="text-sm text-slate-300"><strong>Team rushing</strong> · Set where the ball ended. No individual runner is charged.</p>}
              {p.playType.roles.map(role => <PlayerPicker key={role} label={`${labels[role] ?? role}${role === "target" ? " (optional)" : ""}`} team={p.offenseName}
                players={p.offensePlayers} usage={p.playerUsage} role={role} selected={p.tagged.filter(t => t.role === role)} onSelect={player => p.onTag(role, player)} />)}
              {showTacklers && <div className="fast-tacklers">
                <PlayerPicker label={labels[defenseRole]} team={p.defenseName} players={p.defensePlayers} selected={p.tacklers} multiple
                  onSelectTeam={p.onTeamTackle}
                  onSelect={player => player ? p.onTackler(player) : p.onUnknownTackle()} />
                <div className="fast-tackle-options">
                  <span>{p.tacklers.length > 1 ? "Shared tackle credit" : "Select up to 3 tacklers"}</span>
                  {!sack && <button type="button" aria-pressed={p.noTackle} onClick={p.onNoTackle} className={`${button} ${p.noTackle ? selected : idle}`}>No tackle</button>}
                </div>
                {p.tacklers.length > 0 && <div className="fast-tags">{p.tacklers.map(t => <button key={t.player_id} type="button" onClick={() => p.onTackler(t)} aria-label={`Remove ${playerLabel(t)}`}>
                  {t.isTeam || t.player_id === "opp_team" ? "Film later" : `#${t.jersey_number}`} · {t.credit === .5 ? "assist" : "solo"} ×
                </button>)}</div>}
              </div>}
            </section>
            <section className="fast-position" aria-label="Field position">
              {!incomplete ? <>
                <div className="fast-spot-heading"><h3>Ending spot</h3><strong aria-live="polite">{p.isTD ? "Touchdown" : p.formatSpot(endSpot)}</strong></div>
                <p className="fast-hint">Enter the yard line or gain / loss.</p>
                <div className="fast-side-buttons">
                  <button type="button" aria-pressed={endSpot <= 50} onClick={() => changeYards((endSpot <= 50 ? endSpot : 100 - endSpot) - p.situation.ballOn)} className={`${button} ${endSpot <= 50 ? selected : idle}`}>{p.offenseName} side</button>
                  <button type="button" aria-pressed={endSpot > 50} onClick={() => changeYards((endSpot > 50 ? endSpot : 100 - endSpot) - p.situation.ballOn)} className={`${button} ${endSpot > 50 ? selected : idle}`}>{p.defenseName} side</button>
                </div>
                <div className="fast-number-fields">
                  <label>Yard line<input aria-label="Ending yard line" aria-invalid={!validSpot} disabled={p.isTD} inputMode="numeric" className="input" value={p.isTD ? "0" : spotRaw}
                    onFocus={e => e.target.select()} onChange={e => {
                      const raw = e.target.value.replace(/\D/g, "").slice(0,2); setSpotRaw(raw);
                      const n = Number(raw);
                      if (n >= 1 && n <= 50) { setSpotTouched(true); p.onYards((endSpot <= 50 ? n : 100 - n) - p.situation.ballOn); }
                    }} /></label>
                  <label>Gain / loss<input aria-label="Play gain" type="number" inputMode="text" min={1-p.situation.ballOn} max={100-p.situation.ballOn} className="input"
                    value={spotTouched || p.isTD ? p.yards : ""} placeholder="0" onFocus={e => e.target.select()}
                    onChange={e => { if (!e.target.value) { setSpotTouched(false); return; } changeYards(Math.max(1-p.situation.ballOn, Math.min(100-p.situation.ballOn, Number(e.target.value)))); }} /></label>
                </div>
                <div className="fast-nudges">{[-1,1,5].map(delta => <button type="button" key={delta} onClick={() => changeYards(Math.max(1,Math.min(99,endSpot+delta))-p.situation.ballOn)} className={`${button} ${idle}`}>{delta>0?"+":""}{delta}</button>)}
                  <button type="button" onClick={() => changeYards(0)} className={`${button} ${idle}`}>No gain</button>
                  {!sack && <button type="button" onClick={() => { setSpotTouched(true); p.onTouchdown(); }} aria-pressed={p.isTD} className={`${button} ${p.isTD?selected:idle}`}>Touchdown</button>}
                </div>
                <details open className="fast-ruler"><summary>Fine-tune with field ruler</summary><YardReel value={Math.max(1,Math.min(99,endSpot))} onChange={spot=>changeYards(spot-p.situation.ballOn)} offenseDirection={p.offenseDirection} formatSpot={p.formatSpot} accentColor={p.accentColor} firstDownBallOn={p.situation.ballOn+p.situation.distance} /></details>
              </> : <p className="fast-hint">No yardage needed for an incomplete pass. Target is optional.</p>}
            </section>
          </div>
          {p.trackFormations && <details className="fast-formations"><summary>Formations & hash · optional</summary><div className="grid grid-cols-2 gap-2">
            <label>Offense<select aria-label="Offensive formation" className="input mt-1" value={p.offFormation??""} onChange={e=>p.onOffFormation(e.target.value||null)}><option value="">Not charted</option>{OFFENSIVE_FORMATIONS.map(f=><option key={f}>{f}</option>)}</select></label>
            <label>Defense<select aria-label="Defensive formation" className="input mt-1" value={p.defFormation??""} onChange={e=>p.onDefFormation(e.target.value||null)}><option value="">Not charted</option>{DEFENSIVE_FORMATIONS.map(f=><option key={f}>{f}</option>)}</select></label>
          </div><div className="flex gap-2 mt-2">{["left","middle","right"].map(h=><button key={h} aria-pressed={p.hashMark===h} onClick={()=>p.onHash(p.hashMark===h?null:h)} className={`${button} ${p.hashMark===h?selected:idle} flex-1`}>{h} hash</button>)}</div></details>}
        </div>
        <footer className="fast-footer safe-bottom">
          <div className="fast-review" aria-live="polite"><strong>{p.playType.label}{!incomplete?` · ${p.yards>0?"+":""}${p.yards} yds`:""}</strong><span className={!ready ? "fast-required" : undefined}>{ready ? `Next: ${nextLabel}` : requiredMessage}</span></div>
          {p.attachedDetails && <p className="text-sm text-amber-300">{p.attachedDetails} · review before saving</p>}
          {saveError && <p role="alert" className="text-sm text-red-400">{saveError}</p>}
          <div className="fast-actions">
            <button onClick={()=>p.onDetailed("penalty")} className={`${button} ${idle}`}><Flag size={15} />Penalty</button>
            {!incomplete && <button onClick={()=>p.onDetailed("fumble")} className={`${button} ${idle}`}>Fumble</button>}
            <button onClick={()=>p.onDetailed("players")} className={`${button} ${idle}`}>Full details</button>
            <button disabled={!ready||saving} onClick={async()=>{setSaving(true);setSaveError("");try{await p.onSubmit();}catch{setSaveError("Could not save. Try again.");}finally{setSaving(false);}}} className="btn-primary fast-save disabled:opacity-40">{saving?"Saving…":p.attachedDetails?"Review details":"Save Play"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

