import { useEffect, useState } from "react";
import { defenseFor, isKicker, offenseFor, type Kind, type P } from "./model";
import { FlagPicker, PlayerChip, PuntEnds, Section, toggle, type ConceptProps } from "./parts";

/* Concept 2 · Player first.
 * A spotter calls a play by the man: "22, for five, 44 on the tackle". So the
 * screen is the roster. Tap who had the ball and only the plays that player
 * can make appear (tap the punter and you're in a punt), then a yard pad, then
 * the defender. The player is the first, biggest, deliberate pick, which is
 * the hardest place to mis-credit someone. */

const ACTIONS: Array<[RegExp, Kind[]]> = [
  [/QB/, ["run", "inc", "sack", "kneel"]],
  [/K|P/, ["punt", "fg"]],
  [/RB/, ["run", "pass", "inc"]],
  [/.*/, ["pass", "inc", "run"]],
];
const LABEL: Partial<Record<Kind, string>> = { run: "Run", pass: "Catch", inc: "Incomplete to", sack: "Sacked", kneel: "Kneel", punt: "Punt", fg: "Field goal" };

type Step = 0 | 1 | 2 | 3;

export default function PlayerFirst({ s, d, set, memory, phone }: ConceptProps) {
  const offense = offenseFor(s);
  const defense = defenseFor(s);
  const [pad, setPad] = useState("");
  const [padFor, setPadFor] = useState<"gain" | "return">("gain");
  const [step, setStep] = useState<Step>(0);
  useEffect(() => { if (!d.kind && !d.who) { setPad(""); setPadFor("gain"); setStep(0); } }, [d.kind, d.who]);

  const actionsFor = (p: P) => ACTIONS.find(([re]) => re.test(p.pos))![1];
  const pickPlayer = (p: P) => {
    const acts = actionsFor(p);
    const patch: Partial<typeof d> = { who: p, kind: acts.length === 1 ? acts[0] : d.who?.id === p.id ? d.kind : undefined };
    if (/QB/.test(p.pos)) { patch.qb = p; }
    set(patch);
    setStep(1);
  };
  const pickAction = (k: Kind) => {
    const patch: Partial<typeof d> = { kind: k };
    if ((k === "pass" || k === "inc") && d.who && !/QB/.test(d.who.pos)) patch.qb = memory.qb;
    if (k === "sack" || k === "kneel") { patch.qb = d.who; }
    if (k === "inc") patch.gain = undefined;
    if (k === "punt") patch.returner = memory.returner;
    set(patch);
    setPad(""); setPadFor("gain");
    setStep(k === "inc" ? 3 : 2);
  };
  const press = (key: string) => {
    let next = pad;
    if (key === "⌫") next = pad.slice(0, -1);
    else if (key === "±") next = pad.startsWith("-") ? pad.slice(1) : `-${pad}`;
    else if (key === "TD") { set({ gain: 100 - s.ballOn }); setPad(String(100 - s.ballOn)); setStep(3); return; }
    else if (pad.replace("-", "").length < 2) next = pad + key;
    setPad(next);
    const n = Number(next);
    const val = next === "" || next === "-" || Number.isNaN(n) ? undefined : n;
    if (padFor === "return") set({ returnYards: val });
    else set({ gain: val });
  };

  const isPunt = d.kind === "punt";
  const isFg = d.kind === "fg";
  const gainVal = padFor === "return" ? d.returnYards : d.gain;
  const end = d.gain === undefined ? undefined : Math.min(100, s.ballOn + d.gain);

  const board = (
    <Section n={1} title={s.possession === "us" ? "Who had the ball" : "Who had the ball (theirs)"} className="ec-pf-col"
      aside={<button className={`ec-link${d.kind === "pen" ? " is-on" : ""}`} onClick={() => { set({ kind: "pen", who: undefined }); setStep(1); }}>⚑ Flag</button>}>
      <div className="ec-tiles">
        {offense.map(p => <PlayerChip key={p.id} p={p} size="lg" on={d.who?.id === p.id} onClick={() => pickPlayer(p)} />)}
      </div>
    </Section>
  );

  const what = (
    <Section n={2} title={d.kind === "pen" ? "Which flag" : d.who ? `What did #${d.who.jersey} do` : "What happened"} className="ec-pf-col">
      {d.kind === "pen" ? <FlagPicker s={s} d={d} set={set} /> : !d.who ? <p className="ec-note">Tap a player first. Only the plays he can make show here.</p> : (
        <>
          <div className="ec-acts">
            {actionsFor(d.who).map(k => (
              <button key={k} className={`ec-kind ec-kind-${k}${d.kind === k ? " is-on" : ""}`} onClick={() => pickAction(k)}>{LABEL[k]}</button>
            ))}
          </div>
          {(d.kind === "pass" || d.kind === "inc") && d.qb && (
            <button className="ec-from" onClick={() => set({ qb: offense.find(p => p.pos === "QB" && p.id !== d.qb?.id) ?? d.qb })}>
              thrown by <b>#{d.qb.jersey} {d.qb.name.split(" ")[1] ?? ""}</b> <span>change</span>
            </button>
          )}
          {isFg && (
            <div className="ec-row-wrap">
              <button className={`ec-pill ec-big${d.good === true ? " is-on" : ""}`} onClick={() => set({ good: true })}>Good</button>
              <button className={`ec-pill ec-big${d.good === false ? " is-on" : ""}`} onClick={() => set({ good: false })}>No good</button>
            </div>
          )}
        </>
      )}
      {(phone ? step === 2 : true) && d.kind && !["inc", "fg", "pen", "kneel"].includes(d.kind) && (
        <div className="ec-pad">
          <div className="ec-pad-read">
            <span>{padFor === "return" ? "Return yards" : isPunt ? "Punt yards" : "Yards gained"}</span>
            <b>{gainVal === undefined ? "–" : gainVal > 0 && !isPunt && padFor === "gain" ? `+${gainVal}` : gainVal}</b>
            {end !== undefined && padFor === "gain" && !isPunt && <em>{end >= 100 ? "Touchdown" : `to the ${end > 50 ? 100 - end : end}`}</em>}
          </div>
          <div className="ec-keys">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "±", "0", "⌫"].map(k => <button key={k} onClick={() => press(k)}>{k}</button>)}
            {!isPunt && <button className="ec-key-td" onClick={() => press("TD")}>TD</button>}
          </div>
        </div>
      )}
    </Section>
  );

  const stop = (
    <Section n={3} title={isPunt ? "Return" : "Who made the tackle"} aside={isPunt ? undefined : "optional"} className="ec-pf-col">
      {isPunt ? (
        <>
          <PuntEnds value={d.puntEnd} onPick={e => { set({ puntEnd: e }); if (e === "return") { setPadFor("return"); setPad(""); if (phone) setStep(2); } }} />
          <div className="ec-tiles ec-tiles-sm">
            {defense.slice(0, 6).map(p => <PlayerChip key={p.id} p={p} size="sm" on={d.returner?.id === p.id} onClick={() => set({ returner: p })} />)}
          </div>
        </>
      ) : (
        <div className="ec-tiles">
          {defense.map(p => <PlayerChip key={p.id} p={p} size="lg" on={d.tacklers.some(t => t.id === p.id)} onClick={() => set({ tacklers: toggle(d.tacklers, p) })} />)}
        </div>
      )}
    </Section>
  );

  if (!phone) return <div className="ec-pf">{board}{what}{stop}</div>;
  const steps = ["Who", "What", "Yards", isPunt ? "Return" : "Tackle"];
  return (
    <div className="ec-pf is-phone">
      <nav className="ec-steps">
        {steps.map((t, i) => <button key={t} className={step === i ? "is-on" : ""} onClick={() => setStep(i as Step)}>{t}</button>)}
      </nav>
      <div className="ec-pf-phone">{step === 0 ? board : step === 3 ? stop : what}</div>
      {step === 2 && d.kind && d.kind !== "inc" && <button className="ec-pill ec-next" onClick={() => setStep(3)}>Next: {steps[3]} →</button>}
    </div>
  );
}
