import { useState } from "react";
import { defenseFor, isKicker, offenseFor, type Kind } from "./model";
import { Field, FlagPicker, KindGrid, Nudge, PlayerChip, PuntEnds, Section, toggle, type ConceptProps } from "./parts";

/* Concept 1 · Field first.
 * The spot is the one thing you can only get by watching, and the first thing
 * you forget, so the field is the input: drag the ball to where the play died
 * while your eyes are still on it, then tell it what and who. */
export default function FieldFirst({ s, d, set, memory, phone }: ConceptProps) {
  const [target, setTarget] = useState<"end" | "return">("end");
  const offense = offenseFor(s);
  const defense = defenseFor(s);
  const end = d.gain === undefined ? undefined : s.ballOn + d.gain;
  const returnSpot = d.gain === undefined || d.returnYards === undefined ? undefined : s.ballOn + d.gain - d.returnYards;

  const pickKind = (k: Kind) => {
    const patch: Partial<typeof d> = { kind: k };
    if (k === "pass" || k === "inc" || k === "sack") patch.qb = d.qb ?? memory.qb;
    if (k === "punt" || k === "fg") patch.who = offense.find(isKicker);
    if (k === "inc") patch.gain = undefined;
    if (k === "punt") { patch.returner = memory.returner; setTarget("end"); }
    if ((k === "run" || k === "pass") && d.who && isKicker(d.who)) patch.who = undefined;
    set(patch);
  };
  const onField = (ballOn: number) => {
    if (target === "return" && d.gain !== undefined) set({ returnYards: Math.max(0, s.ballOn + d.gain - ballOn) });
    else set({ gain: ballOn - s.ballOn });
  };

  const isPass = d.kind === "pass" || d.kind === "inc" || d.kind === "sack";
  const whoList = isPass ? offense.filter(p => !/QB|K/.test(p.pos)) : offense.filter(p => !isKicker(p));
  const field = (
    <div className="ec-ff-field">
      <Field s={s} height={phone ? 92 : 168} value={target === "return" ? returnSpot ?? end : end} onChange={onField} mode={target}
        hint={target === "return" ? "Now drag to where the return ended" : d.kind === "punt" ? "Drag to where the punt landed" : "Drag or tap where the play ended"} />
      <div className="ec-ff-under">
        <Nudge onNudge={by => (target === "return" ? set({ returnYards: Math.max(0, (d.returnYards ?? 0) - by) }) : set({ gain: (d.gain ?? 0) + by }))} />
        <button className="ec-pill" onClick={() => set({ gain: 100 - s.ballOn })}>Touchdown</button>
        <button className="ec-pill" onClick={() => set({ gain: 0 })}>No gain</button>
      </div>
    </div>
  );

  const what = (
    <Section n={2} title="What was it">
      <KindGrid value={d.kind} onPick={pickKind} kinds={["run", "pass", "inc", "sack", "punt", "fg", "kneel", "pen"]} cols={4} />
    </Section>
  );

  let who: React.ReactNode = null;
  if (d.kind === "punt") {
    who = (
      <Section n={3} title="Punt" aside={d.who ? `#${d.who.jersey} punting` : undefined}>
        <PuntEnds value={d.puntEnd} onPick={e => { set({ puntEnd: e, returnYards: e === "return" ? d.returnYards ?? 0 : undefined }); setTarget(e === "return" ? "return" : "end"); }} />
        {(d.puntEnd === "return" || d.puntEnd === "fair") && (
          <div className="ec-chiprow">{defense.slice(0, phone ? 4 : 6).map(p => <PlayerChip key={p.id} p={p} size="sm" on={d.returner?.id === p.id} onClick={() => set({ returner: p })} />)}</div>
        )}
      </Section>
    );
  } else if (d.kind === "fg") {
    who = (
      <Section n={3} title="Kick">
        <div className="ec-row-wrap">
          <button className={`ec-pill ec-big${d.good === true ? " is-on" : ""}`} onClick={() => set({ good: true })}>Good</button>
          <button className={`ec-pill ec-big${d.good === false ? " is-on" : ""}`} onClick={() => set({ good: false })}>No good</button>
        </div>
      </Section>
    );
  } else if (d.kind && d.kind !== "pen" && d.kind !== "kneel") {
    who = (
      <>
        <Section n={3} title={d.kind === "run" ? "Runner" : d.kind === "sack" ? "Sacked QB" : "Receiver"}
          aside={isPass && d.kind !== "sack" && d.qb ? <button className="ec-link" onClick={() => set({ qb: offense.find(p => p.pos === "QB" && p.id !== d.qb?.id) ?? d.qb })}>QB #{d.qb.jersey} ▾</button> : undefined}>
          <div className="ec-chiprow">
            {(d.kind === "sack" ? offense.filter(p => p.pos === "QB") : whoList).slice(0, phone ? 6 : 8).map(p => (
              <PlayerChip key={p.id} p={p} size={phone ? "sm" : "md"} on={(d.kind === "sack" ? d.qb : d.who)?.id === p.id}
                onClick={() => set(d.kind === "sack" ? { qb: p } : { who: p })} />
            ))}
          </div>
        </Section>
        {d.kind !== "inc" && (
          <Section n={4} title="Tackled by" aside="optional">
            <div className="ec-chiprow">
              {defense.slice(0, phone ? 6 : 7).map(p => <PlayerChip key={p.id} p={p} size="sm" on={d.tacklers.some(t => t.id === p.id)} onClick={() => set({ tacklers: toggle(d.tacklers, p) })} />)}
            </div>
          </Section>
        )}
      </>
    );
  } else if (d.kind === "pen") {
    who = <Section n={3} title="Flag"><FlagPicker s={s} d={d} set={set} /></Section>;
  }

  return (
    <div className={`ec-ff ${phone ? "is-phone" : ""}`}>
      <Section n={1} title="Where did it end" className="ec-ff-top">{field}</Section>
      <div className="ec-ff-body">
        {what}
        <div className="ec-ff-who">{who ?? <p className="ec-note">Pick the play type and the players show here.</p>}</div>
      </div>
    </div>
  );
}
