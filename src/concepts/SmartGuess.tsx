import { useState } from "react";
import { defenseFor, isKicker, KIND_LABEL, offenseFor, type Draft, type Kind, type P, type Situation } from "./model";
import { Field, FlagPicker, KindGrid, Nudge, PlayerChip, PuntEnds, Section, toggle, type ConceptProps } from "./parts";

/* Concept 4 · Smart guesses.
 * Most snaps in a high school game are one of five or six players doing one of
 * two things, and the down and distance says a lot about which. So the screen
 * opens on its best guesses, already filled in, and you tap the one that
 * happened. Only the yards and the tackler are left. Anything else is one tap
 * away, and nothing is pre-picked: a guess only counts once you tap it. */

interface Guess { key: string; kind: Kind; who?: P; qb?: P; why: string; line: string }

const USAGE: Record<number, string> = { 22: "14 car · 88 yds", 24: "6 car · 31 yds", 3: "5 rec · 71 yds", 11: "3 rec · 40 yds", 80: "2 rec · 18 yds", 18: "4 punts · 36.2", 4: "11 car · 47 yds", 1: "4 rec · 52 yds", 17: "3 punts · 31.0" };

function guesses(s: Situation, offense: P[], qb?: P): Guess[] {
  const rbs = offense.filter(p => p.pos === "RB");
  const wrs = offense.filter(p => /WR|TE/.test(p.pos));
  const kicker = offense.find(isKicker);
  const runs = rbs.slice(0, 2).map(p => ({ key: `run${p.id}`, kind: "run" as Kind, who: p, why: USAGE[p.jersey] ?? "", line: `Run · #${p.jersey}` }));
  const passes = wrs.slice(0, 2).map(p => ({ key: `pass${p.id}`, kind: "pass" as Kind, who: p, qb, why: USAGE[p.jersey] ?? "", line: `Pass #${qb?.jersey ?? "?"} → #${p.jersey}` }));
  const inc: Guess = { key: "inc", kind: "inc", qb, why: "no yards, no tackle", line: `Incomplete · #${qb?.jersey ?? "?"}` };
  const kicks: Guess[] = kicker ? [
    { key: "punt", kind: "punt", who: kicker, why: USAGE[kicker.jersey] ?? "", line: `Punt · #${kicker.jersey}` },
    { key: "fg", kind: "fg", who: kicker, why: `${100 - s.ballOn + 17} yd try`, line: `Field goal · #${kicker.jersey}` },
  ] : [];
  if (s.down === 4) return s.ballOn >= 65 ? [kicks[1], kicks[0], runs[0], passes[0]] : [kicks[0], runs[0], passes[0], inc];
  if (s.distance >= 7 && s.down >= 2) return [passes[0], inc, passes[1], runs[0]];
  return [runs[0], passes[0], runs[1], inc];
}

export default function SmartGuess({ s, d, set, memory, phone }: ConceptProps) {
  const offense = offenseFor(s);
  const defense = defenseFor(s);
  const [other, setOther] = useState(false);
  const list = guesses(s, offense, memory.qb);
  const chosen = list.find(g => d.kind === g.kind && d.who?.id === g.who?.id && (g.kind !== "inc" || !d.who));
  const end = d.gain === undefined ? undefined : s.ballOn + d.gain;
  const pick = (g: Guess) => {
    setOther(false);
    set({ kind: g.kind, who: g.who, qb: g.qb, gain: undefined, tacklers: [], returner: g.kind === "punt" ? memory.returner : undefined, puntEnd: undefined, good: undefined } as Partial<Draft>);
  };
  const strip = [-3, 0, 2, 4, 6, 10];

  const cards = (
    <div className={`ec-guess-cards${d.kind ? " is-picked" : ""}`}>
      {list.map(g => (
        <button key={g.key} className={`ec-guess ec-kind-${g.kind}${chosen?.key === g.key ? " is-on" : ""}`} onClick={() => pick(g)}>
          <span className="ec-guess-kind">{KIND_LABEL[g.kind]}</span>
          {g.who ? <b><i>#{g.who.jersey}</i> {g.who.side === "us" ? g.who.name.split(" ")[1] : g.who.pos}</b> : <b><i>#{g.qb?.jersey}</i> {g.qb?.name.split(" ")[1]}</b>}
          <span className="ec-guess-why">{g.kind === "pass" ? `from #${g.qb?.jersey} · ${g.why}` : g.why}</span>
        </button>
      ))}
      <button className={`ec-guess ec-guess-else${other ? " is-on" : ""}`} onClick={() => { setOther(true); set({ kind: undefined, who: undefined }); }}>
        <span className="ec-guess-kind">Not listed</span><b>Something else</b><span className="ec-guess-why">any play, any player</span>
      </button>
    </div>
  );

  const fallback = other && (
    <Section title="Something else">
      <KindGrid value={d.kind} onPick={k => set({ kind: k, qb: k === "pass" || k === "inc" || k === "sack" ? memory.qb : undefined })} kinds={["run", "pass", "sack", "kneel", "pen"]} cols={phone ? 3 : 4} />
      {d.kind === "pen" ? <FlagPicker s={s} d={d} set={set} /> : d.kind && (
        <div className="ec-chiprow">
          {(d.kind === "sack" || d.kind === "kneel" ? offense.filter(p => p.pos === "QB") : offense.filter(p => !isKicker(p))).map(p => (
            <PlayerChip key={p.id} p={p} size="sm" on={(d.kind === "sack" || d.kind === "kneel" ? d.qb : d.who)?.id === p.id}
              onClick={() => set(d.kind === "sack" || d.kind === "kneel" ? { qb: p } : { who: p })} />
          ))}
        </div>
      )}
    </Section>
  );

  const showYards = d.kind && !["inc", "fg", "pen"].includes(d.kind);
  const yards = showYards && (
    <Section n={2} title={d.kind === "punt" ? "Where did the punt land" : "How far"}>
      <Field s={s} height={phone ? 70 : 96} value={end} onChange={b => set({ gain: b - s.ballOn })} hint={d.kind === "punt" ? "Drag to the landing spot" : "Tap a gain or drag the ball"} />
      <div className="ec-row-wrap">
        {d.kind !== "punt" && strip.map(g => <button key={g} className={`ec-pill ec-num${d.gain === g ? " is-on" : ""}`} onClick={() => set({ gain: g })}>{g > 0 ? `+${g}` : g}</button>)}
        {d.kind !== "punt" && <button className="ec-pill ec-num" onClick={() => set({ gain: 100 - s.ballOn })}>TD</button>}
        <Nudge onNudge={by => set({ gain: (d.gain ?? 0) + by })} />
      </div>
    </Section>
  );

  const tail = d.kind === "punt" ? (
    <Section n={3} title="How it ended">
      <PuntEnds value={d.puntEnd} onPick={e => set({ puntEnd: e, returnYards: e === "return" ? 0 : undefined })} />
      {d.puntEnd === "return" && (
        <div className="ec-row-wrap">{[0, 5, 10, 15, 20].map(r => <button key={r} className={`ec-pill ec-num${d.returnYards === r ? " is-on" : ""}`} onClick={() => set({ returnYards: r })}>{r} ret</button>)}</div>
      )}
    </Section>
  ) : d.kind === "fg" ? (
    <Section n={2} title="Kick">
      <div className="ec-row-wrap">
        <button className={`ec-pill ec-big${d.good === true ? " is-on" : ""}`} onClick={() => set({ good: true })}>Good</button>
        <button className={`ec-pill ec-big${d.good === false ? " is-on" : ""}`} onClick={() => set({ good: false })}>No good</button>
      </div>
    </Section>
  ) : showYards && (
    <Section n={3} title="Tackled by" aside="likely first · optional">
      <div className="ec-chiprow">
        {defense.slice(0, phone ? 5 : 7).map(p => <PlayerChip key={p.id} p={p} size="sm" on={d.tacklers.some(t => t.id === p.id)} onClick={() => set({ tacklers: toggle(d.tacklers, p) })} />)}
      </div>
    </Section>
  );

  return (
    <div className={`ec-sg ${phone ? "is-phone" : ""}`}>
      <Section n={1} title={`Most likely on ${s.down === 4 ? "4th down" : s.distance >= 7 && s.down >= 2 ? "a passing down" : "this down"}`}>{cards}</Section>
      {fallback}
      {yards}
      {tail}
    </div>
  );
}
