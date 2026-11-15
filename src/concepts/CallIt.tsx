import { useCallback, useEffect, useState } from "react";
import { defenseFor, findJersey, isKicker, offenseFor, type Draft, type Kind, type P, type PuntEnd } from "./model";
import { FlagPicker, type ConceptProps } from "./parts";

/* Concept 3 · Call it.
 * One keypad that never moves, and you key the play the way you'd say it:
 *   22 RUN 5 TK 44        3 PASS 12 TK 21        18 PUNT 38 FC
 * Every key lands in the same place every snap, so after a game or two your
 * thumb finds it without looking away from the field. Digits are read live
 * into whatever comes next (the player, then the yards, then a tackler), so
 * there is nothing to "enter" before Save. An iPad keyboard works too. */

type Expect = "who" | "yards" | "tackler" | "return" | "none";

const VERBS: Array<[Kind, string, string]> = [
  ["run", "RUN", "r"], ["pass", "PASS", "p"], ["inc", "INC", "i"], ["sack", "SACK", "s"],
  ["punt", "PUNT", "u"], ["fg", "FG", "f"], ["kneel", "KNEEL", "k"], ["pen", "FLAG", "l"],
];

export default function CallIt({ s, d, set, memory, phone, save }: ConceptProps) {
  const offense = offenseFor(s);
  const defense = defenseFor(s);
  const [buf, setBuf] = useState("");
  const [expect, setExpect] = useState<Expect>("who");
  const [tk, setTk] = useState<P[]>([]); // tacklers already committed; d.tacklers = tk + the one being typed
  useEffect(() => { if (!d.kind && !d.who && !d.qb) { setBuf(""); setExpect("who"); setTk([]); } }, [d.kind, d.who, d.qb]);

  const apply = useCallback((text: string, mode: Expect) => {
    const n = text === "" || text === "-" ? undefined : Number(text);
    if (mode === "who") set({ who: n === undefined ? undefined : findJersey(offense, n) ?? { id: `x${n}`, jersey: n, name: "not on roster", pos: "?", side: s.possession } });
    if (mode === "yards") set({ gain: n });
    if (mode === "return") set({ returnYards: n });
    if (mode === "tackler") {
      const p = n === undefined ? undefined : findJersey(defense, n);
      set({ tacklers: p ? [...tk, p] : tk });
    }
  }, [defense, offense, s.possession, set, tk]);

  const verb = useCallback((k: Kind) => {
    const patch: Partial<Draft> = { kind: k };
    const typed = d.who;
    if (k === "pass" || k === "inc") patch.qb = d.qb ?? memory.qb;
    if (k === "sack" || k === "kneel") { patch.qb = typed && /QB/.test(typed.pos) ? typed : d.qb ?? memory.qb; patch.who = undefined; }
    if ((k === "punt" || k === "fg") && !typed) patch.who = offense.find(isKicker);
    if (k === "punt") patch.returner = memory.returner;
    set(patch);
    setBuf("");
    setExpect(k === "inc" || k === "fg" || k === "pen" ? "none" : "yards");
  }, [d.qb, d.who, memory, offense, set]);

  const key = useCallback((k: string) => {
    if (/^\d$/.test(k)) {
      const mode = expect === "none" ? "tackler" : expect;
      const next = (buf.replace("-", "").length >= 2 ? (buf.startsWith("-") ? "-" : "") : buf) + k;
      setBuf(next); setExpect(mode); apply(next, mode);
    } else if (k === "−") {
      const next = buf.startsWith("-") ? buf.slice(1) : `-${buf}`;
      setBuf(next); apply(next, expect);
    } else if (k === "⌫") {
      if (buf) { const next = buf.slice(0, -1); setBuf(next); apply(next, expect); }
      else if (tk.length) { setTk(tk.slice(0, -1)); set({ tacklers: tk.slice(0, -1) }); }
    } else if (k === "TK") {
      setTk(d.tacklers); setBuf(""); setExpect("tackler");
    } else if (k === "TD") {
      set({ gain: 100 - s.ballOn }); setBuf(""); setExpect("tackler");
    } else if (k === "RET") {
      set({ puntEnd: "return" }); setBuf(""); setExpect("return");
    } else if (["FC", "DOWN", "TB", "OOB"].includes(k)) {
      set({ puntEnd: ({ FC: "fair", DOWN: "downed", TB: "touchback", OOB: "oob" } as Record<string, PuntEnd>)[k] }); setBuf(""); setExpect("none");
    } else if (k === "GOOD" || k === "MISS") {
      set({ good: k === "GOOD" });
    }
  }, [apply, buf, d.tacklers, expect, s.ballOn, set, tk]);

  /* A hardware keyboard on the iPad: digits, letters for the verbs, Enter saves. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const v = VERBS.find(([, , hot]) => hot === e.key.toLowerCase());
      if (/^\d$/.test(e.key)) key(e.key);
      else if (e.key === "Backspace") key("⌫");
      else if (e.key === "-") key("−");
      else if (e.key.toLowerCase() === "t") key("TK");
      else if (e.key === "Enter") save();
      else if (v) verb(v[0]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, save, verb]);

  const context: string[] = d.kind === "punt" ? ["FC", "RET", "DOWN", "TB"] : d.kind === "fg" ? ["GOOD", "MISS"] : ["TD", "TK"];
  const tokens: Array<{ t: string; amber?: boolean; live?: boolean }> = [];
  const subject = d.kind === "sack" || d.kind === "kneel" ? d.qb : d.who;
  if (subject) tokens.push({ t: `#${subject.jersey} ${subject.side === "us" ? subject.name.split(" ")[1] ?? "" : ""}`.trim(), amber: subject.pos === "?", live: expect === "who" && !d.kind });
  if (d.kind) tokens.push({ t: VERBS.find(v => v[0] === d.kind)![1] });
  if (d.gain !== undefined && d.kind !== "inc") tokens.push({ t: d.gain >= 100 - s.ballOn && d.kind !== "punt" ? "TD" : d.gain > 0 && d.kind !== "punt" ? `+${d.gain}` : `${d.gain}`, live: expect === "yards" });
  if (d.puntEnd) tokens.push({ t: { fair: "FC", downed: "DOWN", touchback: "TB", oob: "OOB", return: `RET ${d.returnYards ?? ""}` }[d.puntEnd], live: expect === "return" });
  if (d.good !== undefined) tokens.push({ t: d.good ? "GOOD" : "MISS" });
  d.tacklers.forEach((p, i) => tokens.push({ t: `TK #${p.jersey}`, live: expect === "tackler" && i === d.tacklers.length - 1 && !!buf }));
  if (expect === "tackler" && buf && !d.tacklers.some(t => String(t.jersey) === buf)) tokens.push({ t: `TK #${buf}?`, amber: true, live: true });
  const prompt = { who: d.kind ? "" : "type a jersey, then the play", yards: d.kind === "punt" ? "punt yards" : "yards", tackler: "tackler #", return: "return yards", none: d.kind === "fg" ? "good or miss" : d.kind === "pen" ? "pick the flag" : "tackler #, or save" }[expect];

  return (
    <div className={`ec-ci ${phone ? "is-phone" : ""}`}>
      <div className="ec-tape">
        {tokens.map((t, i) => <span key={i} className={`${t.amber ? "is-amber" : ""}${t.live ? " is-live" : ""}`}>{t.t}</span>)}
        <i className="ec-caret">{prompt}</i>
      </div>
      {d.kind === "pen" ? <div className="ec-ci-flag"><FlagPicker s={s} d={d} set={set} /></div> : null}
      <div className="ec-ci-pad">
        <div className="ec-ci-digits">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3", "−", "0", "⌫"].map(k => <button key={k} onClick={() => key(k)}>{k}</button>)}
        </div>
        <div className="ec-ci-verbs">
          {VERBS.map(([k, label, hot]) => (
            <button key={k} className={`ec-kind-${k}${d.kind === k ? " is-on" : ""}`} onClick={() => verb(k)}>{label}{!phone && <small>{hot.toUpperCase()}</small>}</button>
          ))}
          {context.map(k => <button key={k} className={`ec-ci-ctx${expect === "tackler" && k === "TK" ? " is-on" : ""}`} onClick={() => key(k)}>{k}</button>)}
        </div>
      </div>
      {!phone && <p className="ec-cheat">22 RUN 5 TK 44 · 3 PASS 12 · INC · 18 PUNT 38 FC · 7 SACK −6 · a QB you used before is filled in for you</p>}
    </div>
  );
}
