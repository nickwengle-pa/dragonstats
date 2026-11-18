import { useRef } from "react";
import { ABBR, KIND_LABEL, PENALTIES, spotLabel, type Draft, type Kind, type P, type PuntEnd, type Situation } from "./model";

export interface ConceptProps {
  s: Situation;
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  /** Remembered from earlier snaps, per offense: the passer and the punt returner. */
  memory: { qb?: P; returner?: P };
  phone: boolean;
  save: () => void;
}

/* ── Field ───────────────────────────────────────────────────────────────
 * Drawn in the offense's frame: the offense always drives left to right, so
 * "drag right" always means "gained yards" whoever has the ball. The value is
 * a spot (yards from the offense's goal), the caller turns it into a gain. */
export function Field({ s, value, onChange, height, mode = "end", hint }: {
  s: Situation; value?: number; onChange: (ballOn: number) => void; height: number;
  mode?: "end" | "return"; hint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const EZ = 7; // end zone width, % of the field box
  const pct = (ballOn: number) => EZ + (Math.max(-6, Math.min(106, ballOn)) / 100) * (100 - 2 * EZ);
  const fromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const p = ((clientX - r.left) / r.width) * 100;
    return Math.round(((p - EZ) / (100 - 2 * EZ)) * 100);
  };
  const drag = (e: React.PointerEvent) => {
    if (e.type === "pointerdown") (e.target as Element).setPointerCapture?.(e.pointerId);
    else if (!(e.buttons & 1)) return;
    onChange(Math.max(-2, Math.min(102, fromX(e.clientX))));
  };
  const own = s.possession;
  const other = own === "us" ? "them" : "us";
  const gain = value === undefined ? undefined : value - s.ballOn;
  return (
    <div className="ec-field-wrap">
      <div ref={ref} className="ec-field" style={{ height }} data-tap onPointerDown={drag} onPointerMove={drag}>
        <div className={`ec-ez ec-ez-${own}`} style={{ left: 0, width: `${EZ}%` }}><span>{ABBR[own]}</span></div>
        <div className={`ec-ez ec-ez-${other}`} style={{ right: 0, width: `${EZ}%` }}><span>{ABBR[other]}</span></div>
        {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map(y => (
          <div key={y} className={`ec-yl${y % 10 ? " ec-yl-5" : ""}`} style={{ left: `${pct(y)}%` }}>
            {y % 10 === 0 && <span>{y <= 50 ? y : 100 - y}</span>}
          </div>
        ))}
        <div className="ec-los" style={{ left: `${pct(s.ballOn)}%` }} />
        {s.ballOn + s.distance < 100 && <div className="ec-ltg" style={{ left: `${pct(s.ballOn + s.distance)}%` }} />}
        {value !== undefined && (
          <>
            <div className={`ec-run ${gain! < 0 ? "ec-run-loss" : ""}`}
              style={{ left: `${pct(Math.min(s.ballOn, value))}%`, width: `${pct(Math.max(s.ballOn, value)) - pct(Math.min(s.ballOn, value))}%` }} />
            <div className="ec-ball" style={{ left: `${pct(value)}%` }}>
              <b>{mode === "return" ? "RET" : gain! >= 100 - s.ballOn ? "TD" : gain! > 0 ? `+${gain}` : gain}</b>
            </div>
          </>
        )}
        {value === undefined && <div className="ec-ball ec-ball-ghost" style={{ left: `${pct(s.ballOn)}%` }}><b>LOS</b></div>}
      </div>
      <div className="ec-field-cap">
        <span>{hint ?? "Drag or tap where the ball ended"}</span>
        {value !== undefined && <strong>{spotLabel(s, value)}</strong>}
      </div>
    </div>
  );
}

/* Nudge a spot by a yard either way: a drag is fast but never exact. */
export function Nudge({ onNudge }: { onNudge: (by: number) => void }) {
  return (
    <div className="ec-nudge">
      <button onClick={() => onNudge(-1)}>−1</button>
      <button onClick={() => onNudge(1)}>+1</button>
    </div>
  );
}

export function PlayerChip({ p, on, onClick, size = "md", note }: { p: P; on?: boolean; onClick: () => void; size?: "sm" | "md" | "lg"; note?: string }) {
  const last = p.side === "us" ? p.name.split(" ").slice(1).join(" ") : "";
  return (
    <button className={`ec-chip ec-chip-${size} ec-side-${p.side}${on ? " is-on" : ""}`} onClick={onClick}>
      <span className="ec-chip-num">{p.jersey}</span>
      <span className="ec-chip-txt">
        <span className="ec-chip-name">{last || p.pos}</span>
        {size !== "sm" && <span className="ec-chip-pos">{note ?? (last ? p.pos : "")}</span>}
      </span>
    </button>
  );
}

export function KindGrid({ value, onPick, kinds, cols = 4 }: { value?: Kind; onPick: (k: Kind) => void; kinds: Kind[]; cols?: 2 | 3 | 4 }) {
  return (
    <div className={`ec-kinds ec-cols-${cols}`}>
      {kinds.map(k => (
        <button key={k} className={`ec-kind ec-kind-${k}${value === k ? " is-on" : ""}`} onClick={() => onPick(k)}>{KIND_LABEL[k]}</button>
      ))}
    </div>
  );
}

export const PUNT_ENDS: Array<[PuntEnd, string]> = [["fair", "Fair catch"], ["return", "Returned"], ["downed", "Downed"], ["touchback", "Touchback"], ["oob", "Out of bounds"]];

export function PuntEnds({ value, onPick }: { value?: PuntEnd; onPick: (e: PuntEnd) => void }) {
  return (
    <div className="ec-row-wrap">
      {PUNT_ENDS.map(([k, label]) => (
        <button key={k} className={`ec-pill${value === k ? " is-on" : ""}`} onClick={() => onPick(k)}>{label}</button>
      ))}
    </div>
  );
}

export function toggle(list: P[], p: P, max = 3): P[] {
  return list.some(t => t.id === p.id) ? list.filter(t => t.id !== p.id) : [...list, p].slice(-max);
}

export function Section({ n, title, children, aside, className = "" }: { n?: number | string; title: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={`ec-sec ${className}`}>
      <header>{n !== undefined && <i>{n}</i>}<span>{title}</span>{aside && <em>{aside}</em>}</header>
      {children}
    </section>
  );
}

export function FlagPicker({ s, d, set }: Pick<ConceptProps, "s" | "d" | "set">) {
  const other = s.possession === "us" ? "them" : "us";
  return (
    <div className="ec-row-wrap">
      {PENALTIES.map(f => (
        <button key={f.name} className={`ec-pill${d.flag?.name === f.name ? " is-on" : ""}`}
          onClick={() => set({ flag: { name: f.name, yards: f.yards, on: f.on === "o" ? s.possession : other } })}>
          {f.name} <small>{f.on === "o" ? "O" : "D"} {f.yards}</small>
        </button>
      ))}
    </div>
  );
}
