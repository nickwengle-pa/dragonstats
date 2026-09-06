import { useState } from "react";
import Scoreboard from "@/components/game/Scoreboard";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import FieldVisualizer from "@/components/game/FieldVisualizer";
import { type GameState, type PlayRecord, type TaggedPlayer, PLAY_TYPES, fmtClock } from "@/components/game/types";
import { advanceSituationAfterPlay } from "@/services/gameFlow";
import { DEFAULT_GAME_CONFIG } from "@/services/programService";
import "./uiPreview.css";

const initial: GameState = { quarter: 2, clock: 448, down: 2, distance: 8, ballOn: 27, possession: "us", ourScore: 14, theirScore: 6 };
const home = ["#8 Engle", "#24 Davis", "#3 Johnston", "#2 Frantz", "#34 Lotson", "TEAM", "#22 Little", "#7 Miller"];
const away = ["#11 Brawley", "#1 Farrell", "#7", "#22", "TEAM", "#54", "#32", "#40"];
type Draft = { runner: string; yards: number; spotted: boolean; tackles: string[]; tackleStatus: string; formation: string; notes: string; kind: string; details?: PlaySubmitData };
const empty = (): Draft => ({ runner: "", yards: 0, spotted: false, tackles: [], tackleStatus: "", formation: "", notes: "", kind: "Run" });
type Entry = { before: GameState; draft: Draft; label: string; yards: number; td: boolean };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function UiPreview() {
  const [state, setState] = useState(initial);
  const [draft, setDraft] = useState(empty);
  const [mobilePanel, setMobilePanel] = useState("play");
  const [logPage, setLogPage] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [detail, setDetail] = useState(false);
  const [detailSeed, setDetailSeed] = useState<PlayRecord>();
  const [more, setMore] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tilted, setTilted] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [clockEdit, setClockEdit] = useState(false);
  const [clockText, setClockText] = useState("7:28");
  const [notice, setNotice] = useState("");
  const [paused, setPaused] = useState(false);
  const ours = state.possession === "us";
  const runners = ours ? home : away;
  const defenders = ours ? away : home;
  const end = clamp(state.ballOn + draft.yards, 1, 100);
  const td = end === 100;
  const spot = (n: number) => n <= 50 ? `${ours ? "PL" : "NC"} ${n}` : `${ours ? "NC" : "PL"} ${100 - n}`;
  const right = ours !== flipped;
  const patch = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));
  const yards = (n: number) => patch({ yards: clamp(n, 1 - state.ballOn, 100 - state.ballOn), spotted: true });
  const tackle = (name: string) => patch({ tackles: draft.tackles.includes(name) ? draft.tackles.filter(t => t !== name) : [...draft.tackles, name], tackleStatus: "" });
  const ready = !!draft.runner && draft.spotted && (td || draft.tackles.length > 0 || !!draft.tackleStatus) && !paused;
  const reset = () => { setState(initial); setDraft(empty()); setEntries([]); setLogPage(0); setNotice(""); setPaused(false); setDetail(false); };
  const playerTag = (label: string, role: string, opponent: boolean): TaggedPlayer => {
    const number = Number(label.match(/^#(\d+)/)?.[1]) || null;
    const id = `${opponent ? "opp" : "sample"}-${number ?? "team"}`;
    return { id, player_id: id, jersey_number: number, name: label.replace(/^#\d+\s*/, "") || String(number), role, isOpponent: opponent, isTeam: label === "TEAM" };
  };
  const tagLabel = (tag: TaggedPlayer) => tag.isTeam || tag.jersey_number == null ? "TEAM" : `#${tag.jersey_number}${tag.name && tag.name !== String(tag.jersey_number) ? ` ${tag.name.trim()}` : ""}`;
  const roster = home.filter(n => n !== "TEAM").map(n => { const t = playerTag(n, "rusher", false); return { id: t.id, player_id: t.id, jersey_number: t.jersey_number, position: "RB", positions: ["RB"], player: { id: t.id, first_name: "", last_name: t.name, preferred_name: null } }; });
  const opponents = away.filter(n => n !== "TEAM").map(n => { const t = playerTag(n, "rusher", true); return { id: t.id, jersey_number: t.jersey_number, name: t.name, position: null }; });
  function openDetails() {
    const d = draft.details;
    setDetailSeed({ ...d, id: "practice-draft", ...state, type: d?.playType.id ?? (draft.kind === "Kneel" ? "kneel" : draft.kind === "Scramble" ? "scramble" : "rush"), yards: draft.yards, result: d?.result ?? "", penalty: d?.penalty ?? null, flagYards: d?.flagYards ?? 0, isTouchdown: td, firstDown: draft.yards >= state.distance, turnover: d?.turnover ?? false, description: d?.description ?? "", tagged: [...(d?.tagged.filter(t => t.role !== "rusher" && t.role !== "tackler") ?? []), ...(draft.runner ? [playerTag(draft.runner, "rusher", !ours)] : []), ...draft.tackles.map(t => playerTag(t, "tackler", ours))], playData: { ...d?.playData, no_tackle: draft.tackleStatus === "No tackle" } });
    setDetail(true);
  }
  function returnToSimple(data: PlaySubmitData, completed = false) {
    const runner = data.tagged.find(t => t.role === "rusher");
    patch({ runner: runner ? tagLabel(runner) : "", yards: data.yards, spotted: completed || draft.spotted || data.yards !== 0, tackles: data.tagged.filter(t => t.role === "tackler").map(tagLabel), tackleStatus: data.playData?.no_tackle ? "No tackle" : draft.tackleStatus, formation: data.offensiveFormation ?? "", details: data });
    setDetail(false);
  }
  function save() {
    if (!ready) return;
    if (draft.details?.penalty || draft.details?.turnover || (draft.details && !["rush", "scramble", "kneel"].includes(draft.details.playType.id))) { setNotice("This practice version cannot save penalties or fumbles yet. Your detailed draft is retained."); return; }
    const type = draft.kind === "Kneel" ? "kneel" : draft.kind === "Scramble" ? "scramble" : "rush";
    const next = advanceSituationAfterPlay({ type, yards: draft.yards, result: "", penalty: null, flagYards: 0, isTouchdown: td, firstDown: draft.yards >= state.distance }, state, DEFAULT_GAME_CONFIG);
    setLogPage(0);
    setEntries(p => [...p, { before: state, draft: { ...draft, tackles: td ? [] : draft.tackles }, label: `${draft.runner} ${draft.kind.toLowerCase()}`, yards: draft.yards, td }]);
    setState({ ...state, ...next, clock: draft.details?.clock ?? state.clock, ourScore: state.ourScore + (td && ours ? 6 : 0), theirScore: state.theirScore + (td && !ours ? 6 : 0) });
    setDraft(empty()); setDetail(false);
    if (td) { setPaused(true); setNotice("Touchdown saved. Conversion entry comes in the next prototype. Reset practice to try another run."); }
    else if (next.possession !== state.possession) { setClockText(fmtClock(state.clock)); setClockEdit(true); setNotice("Turnover on downs. Confirm the game clock for the new possession."); }
    else setNotice("Practice play saved.");
  }
  function undo() {
    const last = entries[entries.length - 1]; if (!last) return;
    setState(last.before); setDraft(last.draft); setEntries(p => p.slice(0, -1)); setLogPage(0); setPaused(false); setClockEdit(false); setMobilePanel("play"); setNotice("Last play restored for editing.");
  }
  const openClock = () => { setClockText(fmtClock(state.clock)); setClockEdit(true); };
  const pick = (name: string) => { if (more === "runner") patch({ runner: name }); else tackle(name); };
  const chip = (name: string, selected: boolean, fn: () => void) => <button key={name} className={`ui-chip ${selected ? "chosen" : ""}`} aria-pressed={selected} onClick={fn}>{name}{selected ? " ✓" : ""}</button>;
  return <main className="ui-preview">
    <header className="ui-top"><div><strong>PL STATS <span>/ UI LAB</span></strong><p>Working Run prototype · sample data · clears on reload</p></div><button className="ui-chip" onClick={reset}>Reset practice</button></header>
    <div className="ui-scoreboard"><Scoreboard state={state} progName="Purchase Line" oppName="Northern Cambria" progAbbr="PL" oppAbbr="NC" primaryColor="#dc2626" oppColor="#eab308" ballLabel={spot(state.ballOn)}
      onPreviousQuarter={() => setState(s => ({ ...s, quarter: Math.max(1, s.quarter - 1) }))} onNextQuarter={() => setState(s => ({ ...s, quarter: Math.min(4, s.quarter + 1) }))} canPreviousQuarter={state.quarter > 1} canNextQuarter={state.quarter < 4}
      onEditClock={openClock} onEndGame={() => { setPaused(true); setNotice("Practice ended. Reset practice to start again."); }} onSetDown={down => setState(s => ({ ...s, down }))}
      onAdjustDistance={n => setState(s => ({ ...s, distance: clamp(s.distance + n, 1, 99) }))} onAdjustBall={n => { setState(s => ({ ...s, ballOn: clamp(s.ballOn + n, 1, 99) })); setDraft(empty()); }}
      onEditBall={() => setNotice("Use the scoreboard − / + controls to set the starting spot. Tap the field to set the run’s ending spot.")}
      ourTimeoutsRemaining={3} theirTimeoutsRemaining={3} onTakeTimeout={team => { setNotice(`${team === "us" ? "Purchase Line" : "Northern Cambria"} timeout: edit the practice clock.`); openClock(); }}
      onFlipPossession={() => { setState(s => ({ ...s, possession: s.possession === "us" ? "them" : "us", down: 1, distance: 10 })); setDraft(empty()); }} /></div>
    {clockEdit && <div className="ui-clock"><label>Game clock <input aria-label="Game clock" value={clockText} onChange={e => setClockText(e.target.value)} placeholder="7:28" /></label><button className="ui-save" disabled={!/^\d{1,2}:[0-5]\d$/.test(clockText) || Number(clockText.split(":")[0]) > 12} onClick={() => { const [m,s] = clockText.split(":").map(Number); setState(p => ({ ...p, clock: m * 60 + s })); setClockEdit(false); }}>Set clock</button><button className="ui-chip" onClick={() => setClockEdit(false)}>Cancel</button></div>}
    <div className="ui-field"><FieldVisualizer tilted={tilted} ballOn={draft.spotted ? end : state.ballOn} ballPosition={right ? (draft.spotted ? end : state.ballOn) : 100 - (draft.spotted ? end : state.ballOn)} firstDownPosition={right ? Math.min(100, state.ballOn + state.distance) : Math.max(0, 100 - state.ballOn - state.distance)} possession={state.possession} ourEndZoneSide={flipped ? "right" : "left"} primaryColor="#dc2626" progName="Purchase Line" oppName="Northern Cambria" progAbbr="PL" oppAbbr="NC" oppColor="#b89b24" onFlipDirection={() => setFlipped(f => !f)} onPickSpot={n => yards(Math.round(right ? n : 100 - n) - state.ballOn)} /></div>
    <div className="ui-field-caption"><button className="ui-link" onClick={() => setTilted(t => !t)}>{tilted ? "Tilted field / switch to flat" : "Flat field / switch to tilted"}</button><span>Tap the field to set the ending spot</span><span>Snap: {spot(state.ballOn)}{draft.spotted ? ` → End: ${spot(end)}` : ""}</span></div>
    <div className="ui-stats"><span>RUNS <b>{entries.length}</b></span><span>YARDS <b>{entries.reduce((n,p) => n + p.yards, 0)}</b></span><span>TOUCHDOWNS <b>{entries.filter(p => p.td).length}</b></span><span>MODE <b>PRACTICE</b></span></div>
    <nav className="ui-mobile-panels" aria-label="Live game panels"><button aria-pressed={mobilePanel === "play"} onClick={() => setMobilePanel("play")}>PLAY</button><button aria-pressed={mobilePanel === "plays"} onClick={() => setMobilePanel("plays")}>PLAYS ({entries.length})</button></nav>
    <div className={`ui-columns ui-show-${mobilePanel}`}><section className="ui-entry">
      <div className="ui-entry-title"><div><span className="ui-eyebrow">{ours ? "PURCHASE LINE" : "NORTHERN CAMBRIA"} BALL</span><h1>{detail ? "RUN · FULL DETAILS" : "Record a play"}</h1></div>{detail ? <button className="ui-chip" onClick={() => setDetail(false)}>← Back to simple</button> : <span>{state.down} & {state.distance} · {spot(state.ballOn)}</span>}</div>
      <div className="ui-tabs">{["RUN", "PASS", "ST", "PEN"].map(t => <button key={t} disabled={t !== "RUN"} title={t === "RUN" ? "Run entry" : "Coming in the next prototype"} className={t === "RUN" ? "active" : ""}>{t}{t !== "RUN" && <small>Next phase</small>}</button>)}</div>
      <div className="ui-body">
        <div className="ui-chips">{["Run", "Scramble", "Kneel"].map(k => chip(k, draft.kind === k, () => patch({ kind: k })))}</div>
        <div className="ui-runner-group"><h2>Who ran?</h2><div className="ui-chips">{runners.slice(0,5).map(r => chip(r, draft.runner === r, () => patch({ runner: r })))}{draft.runner && !runners.slice(0,5).includes(draft.runner) && chip(draft.runner, true, () => patch({ runner: "" }))}<button className="ui-chip" onClick={() => { setMore("runner"); setSearch(""); }}>More…</button></div>
        </div><div className="ui-yard-group"><div className="ui-gain-title"><h2>Where did it end?</h2><strong>{draft.spotted ? `${spot(end)} · ${draft.yards > 0 ? "+" : ""}${draft.yards} YDS` : "Choose gain or tap field"}</strong></div>
        <div className="ui-gain"><button className="ui-chip" onClick={() => yards(draft.yards - 1)}>−1</button><label>Gain <input aria-label="Run gain" type="number" min={1-state.ballOn} max={100-state.ballOn} value={draft.spotted ? draft.yards : ""} placeholder="0" onChange={e => e.target.value === "" ? patch({ spotted: false }) : yards(Number(e.target.value))} /></label><button className="ui-chip" onClick={() => yards(draft.yards + 1)}>+1</button><button className="ui-chip" onClick={() => yards(draft.yards + 5)}>+5</button><button className="ui-chip" onClick={() => yards(0)}>No gain</button>{chip("TD", td, () => yards(td ? 0 : 100 - state.ballOn))}</div>
        </div>{!td && <div className="ui-tackles"><h2>Who made the tackle? <span>{ours ? "NORTHERN CAMBRIA" : "PURCHASE LINE"}</span></h2><p>Tap all involved · shared credit for multiple tacklers</p><div className="ui-chips">{defenders.slice(0,4).map(t => chip(t, draft.tackles.includes(t), () => tackle(t)))}{draft.tackles.filter(t => !defenders.slice(0,4).includes(t)).map(t => chip(t,true,()=>tackle(t)))}<button className="ui-chip" onClick={() => { setMore("tackle"); setSearch(""); }}>More…</button></div><div className="ui-chips">{["No tackle", "Review on film"].map(t => chip(t, draft.tackleStatus === t, () => patch({ tackleStatus: t, tackles: [] })))}</div></div>}
      </div>
      <footer className="ui-entry-footer"><div><button className="ui-link" onClick={openDetails}>{detail ? "Back to simple" : "Full details →"}</button><p>{!draft.runner ? "Choose a runner" : !draft.spotted ? "Set the ending spot" : !td && !draft.tackles.length && !draft.tackleStatus ? "Select tacklers or a review option" : `${draft.runner} · ${draft.yards > 0 ? "+" : ""}${draft.yards} yards · ${td ? "TD" : draft.tackles.length ? `${draft.tackles.length} tackler(s)` : draft.tackleStatus}`}</p></div><button className="ui-save" disabled={!ready} onClick={save}>SAVE PLAY →</button></footer>
      <p className="ui-scope">Run entry is working. Pass, special teams, fumbles, and penalties are the next phase.</p>
    </section><aside className="ui-log"><header><h2>PLAYS ({entries.length})</h2><button className="ui-link" disabled={!entries.length} onClick={undo}>↶ Undo last</button></header>{!entries.length && <div className="ui-empty"><strong>Your practice plays appear here.</strong><p>Pick a runner, set yards, add tackles, then save. Your field and clock stay above.</p></div>}{[...entries].reverse().slice(logPage * 3, logPage * 3 + 3).map((p,i) => <article key={entries.length-logPage*3-i}><div className="ui-log-line"><strong>{p.label}</strong><b>{p.yards > 0 ? "+" : ""}{p.yards}{p.td ? " TD" : ""}</b></div><p>#{entries.length-logPage*3-i} · Q{p.before.quarter} · {fmtClock(p.before.clock)} · {p.before.down} & {p.before.distance}</p><p>{p.draft.tackles.length ? p.draft.tackles.join(" + ") + (p.draft.tackles.length > 1 ? ` · shared (${(1/p.draft.tackles.length).toFixed(2)} each)` : " · solo") : p.td ? "Touchdown" : p.draft.tackleStatus}</p>{p.draft.formation && <p>{p.draft.formation}</p>}{p.draft.notes && <p>{p.draft.notes}</p>}</article>)}{entries.length > 3 && <div className="ui-log-pages"><button className="ui-chip" disabled={logPage === 0} onClick={() => setLogPage(p => p - 1)}>Newer</button><span>{logPage + 1} / {Math.ceil(entries.length / 3)}</span><button className="ui-chip" disabled={(logPage + 1) * 3 >= entries.length} onClick={() => setLogPage(p => p + 1)}>Older</button></div>}</aside></div>
    {notice && <div role="status" className="ui-notice">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div>}
    {detail && detailSeed && <PlayEntryModal playType={PLAY_TYPES.find(p => p.id === detailSeed.type)!} gameState={state} roster={roster} opponentPlayers={opponents} progName="Purchase Line" oppName="Northern Cambria" progAbbr="PL" oppAbbr="NC" startDetailed submitLabel="Apply details" initialDraft={detailSeed} onReturnToSimple={returnToSimple} onClose={() => setDetail(false)} onSubmit={data => { returnToSimple(data, true); setNotice("Details applied to your practice draft. Confirm with Save Play."); }} />}
    {more && <div className="ui-modal"><section role="dialog" aria-modal="true" aria-label={more === "runner" ? "Choose runner" : "Choose tacklers"}><header><h2>{more === "runner" ? "WHO RAN?" : "WHO MADE THE TACKLE?"}</h2><button className="ui-chip" onClick={() => setMore(null)}>Done</button></header><input autoFocus aria-label="Search players" placeholder="Search number or name" value={search} onChange={e => setSearch(e.target.value)} /><div className="ui-chips">{(more === "runner" ? runners : defenders).filter(n => n.toLowerCase().includes(search.toLowerCase())).map(n => chip(n, more === "runner" ? draft.runner === n : draft.tackles.includes(n), () => { pick(n); if (more === "runner") setMore(null); }))}</div></section></div>}
  </main>;
}
