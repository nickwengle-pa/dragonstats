import { useCallback, useEffect, useRef, useState } from "react";
import CallIt from "./CallIt";
import FieldFirst from "./FieldFirst";
import PlayerFirst from "./PlayerFirst";
import SmartGuess from "./SmartGuess";
import type { ConceptProps } from "./parts";
import { ABBR, downLine, emptyDraft, missing, nextSituation, sentence, spotLabel, START, type Draft, type P, type Situation } from "./model";
import "./entryConcepts.css";

/* Four ways to record a live play, side by side on one practice game, so they
 * can be compared by feel rather than by description. Each concept owns only
 * its input; the scorebug, the read-back sentence and Save are shared and
 * pinned, so every concept is judged on the same "is it obvious how to save"
 * bar. Taps and seconds per play are counted to make the comparison honest. */

const CONCEPTS = [
  { id: "field", n: 1, name: "Field first", pitch: "Drag the ball to where it ended, then say what and who.", C: FieldFirst },
  { id: "player", n: 2, name: "Player first", pitch: "Tap who had it. Only his plays show. Yards on a pad, then the tackler.", C: PlayerFirst },
  { id: "call", n: 3, name: "Call it", pitch: "One fixed keypad. Key it like you'd say it: 22 RUN 5 TK 44.", C: CallIt },
  { id: "guess", n: 4, name: "Smart guesses", pitch: "It opens on its best guesses for this down. Tap the one that happened.", C: SmartGuess },
] as const;

const PRESETS: Array<[string, Partial<Situation>]> = [
  ["1st & 10", { down: 1, distance: 10, ballOn: 35 }],
  ["3rd & 8", { down: 3, distance: 8, ballOn: 42 }],
  ["4th & 6, own 40", { down: 4, distance: 6, ballOn: 40 }],
  ["4th & 4, their 18", { down: 4, distance: 4, ballOn: 82 }],
];

interface Logged { s: Situation; d: Draft; taps: number; secs: number; concept: string }

function usePhone() {
  const q = () => window.innerWidth < 760;
  const [phone, setPhone] = useState(q);
  useEffect(() => { const on = () => setPhone(q()); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return phone;
}

const initialConcept = () => {
  const c = new URLSearchParams(window.location.search).get("c");
  return CONCEPTS.find(x => x.id === c || String(x.n) === c)?.id ?? "field";
};

export default function EntryConcepts() {
  const phone = usePhone();
  const [concept, setConcept] = useState<string>(initialConcept);
  const [s, setS] = useState<Situation>(START);
  const [d, setD] = useState<Draft>(emptyDraft);
  const [log, setLog] = useState<Logged[]>([]);
  const [memory, setMemory] = useState<Record<string, { qb?: P; returner?: P }>>({
    us: { qb: { id: "us-7", jersey: 7, name: "Alex Miller", pos: "QB", side: "us" }, returner: { id: "them-1", jersey: 1, name: "#1", pos: "WR", side: "them" } },
    them: { qb: { id: "them-10", jersey: 10, name: "#10", pos: "QB", side: "them" }, returner: { id: "us-3", jersey: 3, name: "Casey Hill", pos: "WR", side: "us" } },
  });
  const taps = useRef(0);
  const started = useRef<number | null>(null);
  const [tapView, setTapView] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  /* Keys typed on an iPad keyboard count as taps too (Call it accepts them). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.metaKey || e.ctrlKey || e.key.length > 1 && e.key !== "Backspace") return;
      if (started.current === null) started.current = Date.now();
      taps.current += 1; setTapView(taps.current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const set = useCallback((patch: Partial<Draft>) => setD(prev => ({ ...prev, ...patch })), []);
  const reset = () => { setD(emptyDraft()); taps.current = 0; started.current = null; setTapView(0); };
  const need = missing(d);
  const save = useCallback(() => {
    if (missing(d).length) return;
    const secs = started.current ? (Date.now() - started.current) / 1000 : 0;
    setLog(prev => [{ s, d, taps: taps.current, secs, concept }, ...prev].slice(0, 30));
    const side = s.possession;
    setMemory(prev => ({ ...prev, [side]: { qb: d.qb ?? prev[side].qb, returner: prev[side].returner } }));
    setFlash(sentence(s, d));
    setTimeout(() => setFlash(null), 1800);
    setS(nextSituation(s, d));
    reset();
  }, [concept, d, s]);
  const undo = () => { const [last, ...rest] = log; if (!last) return; setS(last.s); setLog(rest); reset(); };
  const switchTo = (id: string) => { setConcept(id); reset(); const u = new URL(window.location.href); u.searchParams.set("c", id); window.history.replaceState(null, "", u); };

  const C = CONCEPTS.find(c => c.id === concept)!;
  const Body = C.C;
  const avg = (() => { const mine = log.filter(l => l.concept === concept); return mine.length ? `${(mine.reduce((a, l) => a + l.taps, 0) / mine.length).toFixed(1)} taps avg over ${mine.length}` : null; })();

  return (
    <div className={`ec ${phone ? "ec-phone" : ""}`}>
      <div className="ec-top">
        <nav className="ec-tabs" aria-label="Concepts">
          {CONCEPTS.map(c => (
            <button key={c.id} className={c.id === concept ? "is-on" : ""} onClick={() => switchTo(c.id)}>
              <i>{c.n}</i>{phone ? c.name.split(" ")[0] : c.name}
            </button>
          ))}
        </nav>
        {!phone && <p className="ec-pitch">{C.pitch}</p>}
      </div>

      <div className="ec-bug">
        <div className={`ec-team ec-side-us${s.possession === "us" ? " has-ball" : ""}`}><b>DRG</b><span>{s.us}</span></div>
        <div className="ec-clock"><small>{["", "1st", "2nd", "3rd", "4th"][s.quarter]}</small>{s.clock}</div>
        <div className={`ec-team ec-side-them${s.possession === "them" ? " has-ball" : ""}`}><span>{s.them}</span><b>VIS</b></div>
        <div className="ec-dd"><b>{downLine(s)}</b> <span>at</span> <b>{spotLabel(s, s.ballOn)}</b><em>{ABBR[s.possession]} ball</em></div>
        <div className="ec-presets">
          {PRESETS.map(([label, p]) => <button key={label} onClick={() => { setS(prev => ({ ...prev, ...p, possession: "us" })); reset(); }}>{label}</button>)}
          <button onClick={() => { setS(prev => ({ ...prev, possession: prev.possession === "us" ? "them" : "us" })); reset(); }}>Swap ball</button>
        </div>
      </div>

      <main className="ec-main" onPointerDownCapture={e => {
        if (!(e.target as Element).closest("button,[data-tap]")) return;
        if (started.current === null) started.current = Date.now();
        taps.current += 1; setTapView(taps.current);
      }}>
        <Body key={concept} s={s} d={d} set={set} memory={memory[s.possession]} phone={phone} save={save} />
      </main>

      <footer className="ec-foot">
        <div className="ec-read">
          <p className={need.length ? "" : "is-ready"}>{sentence(s, d)}</p>
          <small>
            {need.length && d.kind ? <span className="ec-need">Still need: {need.join(", ")}</span> : null}
            <span className="ec-taps">{tapView} taps</span>{avg && <span className="ec-avg">{avg}</span>}
          </small>
        </div>
        <div className="ec-foot-btns">
          <button className="ec-clear" onClick={reset} disabled={!d.kind && !d.who}>Clear</button>
          <button className="ec-undo" onClick={undo} disabled={!log.length}>Undo</button>
          <button className="ec-save" disabled={need.length > 0} onClick={() => { taps.current += 1; save(); }}>Save play</button>
        </div>
      </footer>
      {flash && <div className="ec-flash">Saved · {flash}</div>}
    </div>
  );
}
