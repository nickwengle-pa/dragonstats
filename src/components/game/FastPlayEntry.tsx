import { useState } from "react";
import { X, Flag } from "lucide-react";
import YardReel from "./YardReel";
import {
  type GameState, type TaggedPlayer, type PlayTypeDef,
  OFFENSIVE_FORMATIONS, DEFENSIVE_FORMATIONS,
} from "./types";

interface Props {
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
  onYards: (yards: number) => void;
  onTouchdown: () => void;
  onDetailed: (section: "players" | "penalty" | "fumble") => void;
  offFormation: string | null;
  defFormation: string | null;
  hashMark: string | null;
  onOffFormation: (value: string | null) => void;
  onDefFormation: (value: string | null) => void;
  onHash: (value: string | null) => void;
  onSubmit: () => void | Promise<void>;
  onClose: () => void;
}

const labels: Record<string, string> = { rusher: "Runner", passer: "QB", receiver: "Receiver", target: "Target", tackler: "Tacklers", sacker: "Sackers" };
const button = "min-h-11 px-3 py-2 rounded-lg border text-sm font-bold active:bg-surface-hover";
const idle = "border-surface-border bg-surface-bg text-slate-200";
const selected = "border-dragon-primary bg-dragon-primary/20 text-white";
function name(p: TaggedPlayer) {
  return p.isTeam || p.player_id === "opp_team" ? "Identify on film" : `#${p.jersey_number ?? "?"} ${p.name.split(" ").slice(-1)[0] ?? ""}`;
}

export default function FastPlayEntry(p: Props) {
  const incomplete = p.playType.id === "pass_inc";
  const sack = p.playType.id === "sack";
  const defenseRole = sack ? "sacker" : "tackler";
  const showTacklers = p.trackTacklers && !incomplete && !p.isTD;
  const ours = p.situation.possession === "us";
  const [activeRole, setActiveRole] = useState<string | null>(() => {
    if (!ours) return showTacklers ? defenseRole : null;
    return p.playType.roles.find(r => r !== "target" && !p.tagged.some(t => t.role === r)) ?? null;
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [spotTouched, setSpotTouched] = useState(incomplete || p.isTD || p.yards !== 0);
  const defenseActive = activeRole === defenseRole;
  const players = defenseActive ? p.defensePlayers : p.offensePlayers;
  const filtered = players.filter(t => `${t.jersey_number ?? ""} ${t.name}`.toLowerCase().includes(search.toLowerCase()));
  const missingRole = ours ? p.playType.roles.find(r => r !== "target" && !p.tagged.some(t => t.role === r)) : undefined;
  const missingTackle = showTacklers && !ours && !p.noTackle && p.tacklers.length === 0;
  const ready = !missingRole && !missingTackle && spotTouched;
  const endSpot = p.isTD ? 100 : p.situation.ballOn + p.yards;
  const [spotRaw, setSpotRaw] = useState(String(endSpot <= 50 ? endSpot : 100 - endSpot));
  const firstDown = !incomplete && p.yards >= p.situation.distance;
  const nextLabel = p.isTD ? "Touchdown · conversion next" : p.situation.down === 4 && !firstDown
    ? `Turnover on downs · ${p.formatSpot(endSpot)}`
    : `${firstDown ? 1 : p.situation.down + 1} & ${firstDown ? Math.min(10, 100 - endSpot) : p.situation.distance - (incomplete ? 0 : p.yards)} · ${p.formatSpot(endSpot)}`;
  const chooseRole = (role: string) => { setActiveRole(activeRole === role ? null : role); setSearch(""); };
  const tag = (pick: TaggedPlayer | null) => {
    if (!activeRole) return;
    p.onTag(activeRole, pick);
    const next = p.playType.roles.find(r => r !== activeRole && r !== "target" && !p.tagged.some(t => t.role === r));
    setActiveRole(next ?? null);
    setSearch("");
  };
  const changeYards = (yards: number) => {
    setSpotTouched(true); p.onYards(yards);
    const nextSpot = Math.max(1, Math.min(99, p.situation.ballOn + yards));
    setSpotRaw(String(nextSpot <= 50 ? nextSpot : 100 - nextSpot));
  };

  return (
    <div className="sheet bg-black/60 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="fast-title" className="sheet-panel sm:!max-w-3xl !max-h-[96dvh] flex flex-col">
        <header className="p-3 border-b border-surface-border flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 id="fast-title" className="text-lg font-black">{p.playType.label} <span className="text-slate-400 text-sm font-normal">· {p.offenseName}</span></h2>
            <div className="text-sm text-slate-300">Q{p.situation.quarter} · {Math.floor(p.situation.clock / 60)}:{String(p.situation.clock % 60).padStart(2, "0")} · {p.situation.down} & {p.situation.distance} · {p.formatSpot(p.situation.ballOn)}</div>
          </div>
          <button aria-label="Cancel play" onClick={p.onClose} className={`${button} ${idle}`}><X size={20} /></button>
        </header>
        <div className="overflow-y-auto min-h-0 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <section className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {p.playType.roles.map(role => {
                  const pick = p.tagged.find(t => t.role === role);
                  return <button key={role} onClick={() => chooseRole(role)} aria-pressed={activeRole === role}
                    className={`${button} flex-1 ${activeRole === role ? selected : idle}`}>
                    <span className="block text-xs text-slate-400">{labels[role] ?? role}</span>
                    {pick ? name(pick) : role === "target" ? "Optional" : ours ? "Choose / unknown" : "TEAM · change"}
                  </button>;
                })}
              </div>
              {!incomplete && <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold">Ending spot</span>
                  <span className="font-black text-lg tabular-nums">{p.isTD ? "TD" : `${p.yards > 0 ? "+" : ""}${p.yards} yds`}</span>
                </div>
                <div className="flex gap-2 items-end">
                  <button aria-pressed={endSpot <= 50} onClick={() => changeYards((endSpot <= 50 ? endSpot : 100 - endSpot) - p.situation.ballOn)} className={`${button} ${endSpot <= 50 ? selected : idle} flex-1`}>{p.offenseName}</button>
                  <button aria-pressed={endSpot > 50} onClick={() => changeYards((endSpot > 50 ? endSpot : 100 - endSpot) - p.situation.ballOn)} className={`${button} ${endSpot > 50 ? selected : idle} flex-1`}>{p.defenseName}</button>
                  <label className="text-xs text-slate-400 w-16 shrink-0">Yard line
                    <input aria-label="Ending yard line" inputMode="numeric" className="input !text-lg !px-2 text-center" value={spotRaw}
                      onFocus={e => e.target.select()} onBlur={() => setSpotRaw(String(endSpot <= 50 ? endSpot : 100 - endSpot))}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, "").slice(0, 2); setSpotRaw(raw);
                        const n = Number(raw);
                        if (n >= 1 && n <= 50) { setSpotTouched(true); p.onYards((endSpot <= 50 ? n : 100 - n) - p.situation.ballOn); }
                      }} />
                  </label>
                </div>
                <div className="flex gap-2 mt-2">
                  {[-1, 1, 5].map(delta => <button key={delta} onClick={() => changeYards(Math.max(1, Math.min(99, endSpot + delta)) - p.situation.ballOn)} className={`${button} ${idle} flex-1`}>{delta > 0 ? "+" : ""}{delta}</button>)}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => changeYards(0)} className={`${button} ${idle} flex-1`}>No gain</button>
                  {!sack && <button onClick={() => { setSpotTouched(true); p.onTouchdown(); }} aria-pressed={p.isTD} className={`${button} ${p.isTD ? selected : idle} flex-1`}>Touchdown</button>}
                </div>
                <details className="mt-2 text-sm text-slate-400"><summary className="py-2 cursor-pointer">Field ruler</summary>
                  <YardReel value={Math.max(1, Math.min(99, endSpot))} onChange={spot => changeYards(spot - p.situation.ballOn)}
                    offenseDirection={p.offenseDirection} formatSpot={p.formatSpot} accentColor={p.accentColor}
                    firstDownBallOn={p.situation.ballOn + p.situation.distance} />
                </details>
              </div>}
              {incomplete && <p className="text-sm text-slate-400">No yardage needed. Target is optional.</p>}
            </section>
            <section className="space-y-2">
              {showTacklers && <>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm font-bold">{p.defenseName} · {labels[defenseRole]}</span>
                  <button onClick={() => chooseRole(defenseRole)} aria-pressed={defenseActive} className={`${button} ${defenseActive ? selected : idle}`}>Choose {sack ? "sacker" : "tackler"}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.tacklers.map(t => <button key={t.id} onClick={() => p.onTackler(t)} className={`${button} ${t.isTeam ? "border-amber-600 text-amber-300" : selected}`}>
                    {name(t)} · {t.credit === 0.5 ? "assist" : "solo"} ×
                  </button>)}
                </div>
                {(!ours || defenseActive || p.tacklers.length > 0 || p.noTackle) && <div className="flex gap-2">
                  <button onClick={p.onUnknownTackle} className={`${button} ${idle} flex-1`}>Identify on film</button>
                  {!sack && <button aria-pressed={p.noTackle} onClick={p.onNoTackle} className={`${button} ${p.noTackle ? selected : idle} flex-1`}>No tackle</button>}
                </div>}
                <p className="text-xs text-slate-400">Tap two players for shared credit.{ours ? " Opponent names optional." : " Capture now for your tackle report."}</p>
              </>}
              {activeRole && (!defenseActive || showTacklers) && <div className="space-y-2" aria-label={`${labels[activeRole]} picker`}>
                <label className="block text-sm font-bold">{labels[activeRole]} · {defenseActive ? p.defenseName : p.offenseName}
                  <input value={search} onChange={e => setSearch(e.target.value)} inputMode="numeric" placeholder="Jersey or name" className="input mt-1 !text-base" />
                </label>
                <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto">
                  {filtered.map(t => {
                    const isPicked = defenseActive ? p.tacklers.some(x => x.player_id === t.player_id) : p.tagged.some(x => x.role === activeRole && x.player_id === t.player_id);
                    return <button key={t.id} aria-pressed={isPicked} aria-label={`Select ${labels[activeRole]} ${t.name} number ${t.jersey_number}`}
                      onClick={() => { if (defenseActive) { p.onTackler(t); setSearch(""); } else tag(t); }}
                      className={`${button} !px-1 ${isPicked ? selected : idle}`}>
                      <span className="block text-lg">{t.jersey_number ?? "?"}</span><span className="block text-xs truncate">{t.name.split(" ").slice(-1)[0]}</span>
                    </button>;
                  })}
                </div>
                {filtered.length === 0 && <p className="text-sm text-slate-400">No matching player. Identify on film or use full details to add a jersey.</p>}
                {!defenseActive && <button onClick={() => tag(null)} className={`${button} ${idle} w-full`}>Identify {labels[activeRole]} on film</button>}
              </div>}
            </section>
          </div>
          {p.trackFormations && <details className="text-sm">
            <summary className="cursor-pointer py-3 font-bold">Formations & hash · optional</summary>
            <div className="grid grid-cols-2 gap-2">
              <label>Offense<select aria-label="Offensive formation" className="input mt-1" value={p.offFormation ?? ""} onChange={e => p.onOffFormation(e.target.value || null)}><option value="">Not charted</option>{OFFENSIVE_FORMATIONS.map(f => <option key={f}>{f}</option>)}</select></label>
              <label>Defense<select aria-label="Defensive formation" className="input mt-1" value={p.defFormation ?? ""} onChange={e => p.onDefFormation(e.target.value || null)}><option value="">Not charted</option>{DEFENSIVE_FORMATIONS.map(f => <option key={f}>{f}</option>)}</select></label>
            </div>
            <div className="flex gap-2 mt-2">{["left", "middle", "right"].map(h => <button key={h} aria-pressed={p.hashMark === h} onClick={() => p.onHash(p.hashMark === h ? null : h)} className={`${button} ${p.hashMark === h ? selected : idle} flex-1`}>{h} hash</button>)}</div>
          </details>}
          <div className="flex gap-2">
            <button onClick={() => p.onDetailed("penalty")} className={`${button} ${idle}`}><Flag size={16} className="inline mr-1" />Flag</button>
            {!incomplete && <button onClick={() => p.onDetailed("fumble")} className={`${button} ${idle}`}>Fumble</button>}
            <button onClick={() => p.onDetailed("players")} className={`${button} ${idle} flex-1`}>Full details</button>
          </div>
        </div>
        <footer className="p-3 border-t border-surface-border shrink-0 safe-bottom space-y-2">
          <div className="text-sm" aria-live="polite">
            <span className="font-bold">{p.playType.label}{!incomplete ? ` · ${p.yards > 0 ? "+" : ""}${p.yards} yds` : ""}</span>
            <span className="text-slate-300"> · Next: {nextLabel}</span>
          </div>
          {!ready && <p className="text-xs text-amber-300">{missingRole ? `Choose ${labels[missingRole]} or identify on film.` : !spotTouched ? "Set the ending spot, or tap No gain." : "Choose a tackler, Identify on film, or No tackle."}</p>}
          {saveError && <p role="alert" className="text-sm text-red-400">{saveError}</p>}
          <button disabled={!ready || saving} onClick={async () => {
            setSaving(true); setSaveError("");
            try { await p.onSubmit(); } catch { setSaveError("Could not save. Try again."); } finally { setSaving(false); }
          }} className="btn-primary w-full min-h-12 text-base font-black disabled:opacity-40">{saving ? "Saving…" : "Save Play"}</button>
        </footer>
      </div>
    </div>
  );
}

