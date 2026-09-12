import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { ChartingPrefs, FieldDirection, TeamSide, TossChoice } from "@/services/gameFlow";
import "./pregameSetup.css";

type Team = { name: string; tag: string; color: string };
type Layout = "expanded" | "simple";
const VIEW_KEY = "dragonstats.pregame-view";

// Keep the school's actual fill. Text and selection outlines adapt to it,
// including pure black, white, shorthand hex, and missing team colours.
function palette(raw: string) {
  let hex = raw.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) hex = [...hex].map(c => c + c).join("");
  if (!/^[\da-f]{6}$/i.test(hex)) hex = "64748b";
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return {
    backgroundColor: `#${hex}`,
    color: luminance > 0.179 ? "#000000" : "#ffffff",
    borderColor: luminance < 0.15 ? "#cbd5e1" : `#${hex}`,
  };
}

function Choice<T extends string>({ value, options, color, onChange, label }: {
  value: T;
  options: Array<{ value: T; label: ReactNode; color?: string }>;
  color: string;
  onChange: (value: T) => void;
  label: string;
}) {
  return <div className="pg-choices" role="group" aria-label={label}>
    {options.map(option => {
      const selected = value === option.value;
      return <button key={option.value} type="button" aria-pressed={selected}
        onClick={() => onChange(option.value)} className="pg-choice"
        style={selected ? palette(option.color ?? color) : undefined}>
        <span className="pg-check" aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>
        <span className="pg-choice-label">{option.color && <span className="pg-swatch" style={{ backgroundColor: palette(option.color).backgroundColor }} />}{option.label}</span>
      </button>;
    })}
  </div>;
}

function Row({ title, hint, children }: { title: ReactNode; hint?: string; children: ReactNode }) {
  return <div className="pg-row"><div className="pg-row-heading"><h3>{title}</h3>{hint && <p>{hint}</p>}</div><div className="pg-row-controls">{children}</div></div>;
}

interface Props {
  teams: Record<TeamSide, Team>;
  winner: TeamSide;
  choice: TossChoice;
  loserChoice: "receive" | "kick";
  direction: FieldDirection;
  receiver: TeamSide;
  secondHalfReceiver: TeamSide;
  charting: ChartingPrefs;
  setWinner: (side: TeamSide) => void;
  setChoice: (choice: TossChoice) => void;
  setLoserChoice: (choice: "receive" | "kick") => void;
  setDirection: (direction: FieldDirection) => void;
  setCharting: (value: ChartingPrefs) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}

export default function PregameSetupView(p: Props) {
  const [layout, setLayout] = useState<Layout>(() => {
    try { return localStorage.getItem(VIEW_KEY) === "simple" ? "simple" : "expanded"; }
    catch { return "expanded"; }
  });
  const switchLayout = (next: Layout) => {
    setLayout(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* Optional device preference. */ }
  };
  const us = p.teams.us;
  const winner = p.teams[p.winner];
  const loser = p.teams[p.winner === "us" ? "them" : "us"];
  const loserDecides = p.choice === "defer" || p.choice === "defend_goal";
  const hints: Record<TossChoice, string> = {
    receive: `${winner.name} receive the opening kickoff.`,
    kick: `${winner.name} kick to ${loser.name}.`,
    defer: `${winner.name} save their choice for the second half.`,
    defend_goal: `${winner.name} choose which goal to defend.`,
  };
  const teamLabel = (side: TeamSide) => <span className="pg-team"><span className="pg-swatch" style={{ backgroundColor: palette(p.teams[side].color).backgroundColor }} />{p.teams[side].tag}</span>;
  const summary = (label: string, receiver: TeamSide) => <div className="pg-kickoff"><span>{label}</span><strong>{teamLabel(receiver === "us" ? "them" : "us")}<span className="pg-kicks">kicks to</span>{teamLabel(receiver)}</strong></div>;
  return <div className="sheet bg-black/80">
    <div className={`sheet-panel pg-panel pg-${layout}`} role="dialog" aria-modal="true" aria-labelledby="pregame-title">
      <header className="pg-header"><div><h2 id="pregame-title">Pregame setup</h2><p>{us.name} vs. {p.teams.them.name}</p></div><button type="button" className="pg-close" onClick={p.onClose} aria-label="Close pregame setup"><X size={22} /></button></header>
      <div className="pg-view" role="group" aria-label="Pregame layout">
        {(["expanded", "simple"] as const).map(view => <button key={view} type="button" aria-pressed={layout === view} onClick={() => switchLayout(view)}>{layout === view && <Check size={16} />} {view === "expanded" ? "Expanded" : "Simple"}</button>)}
      </div>
      <div className="pg-body">
        <div className="pg-sections">
          <section className="pg-section pg-toss" aria-label="Coin toss and kickoff">
            {layout === "expanded" && <h2>Coin toss & kickoff</h2>}
            <Row title="Coin toss winner"><Choice label="Coin toss winner" value={p.winner} color={winner.color} options={(["us", "them"] as const).map(side => ({ value: side, label: p.teams[side].name, color: p.teams[side].color }))} onChange={p.setWinner} /></Row>
            <Row title={`${winner.name} choose`}><Choice label={`${winner.name} toss choice`} value={p.choice} color={winner.color} options={[
              { value: "receive", label: "Receive" }, { value: "kick", label: "Kick" },
              { value: "defer", label: "Defer" }, { value: "defend_goal", label: "Defend goal" },
            ]} onChange={p.setChoice} /><p className="pg-hint" aria-live="polite">{hints[p.choice]}</p></Row>
            {loserDecides && <Row title={`${loser.name} choose`} hint="Opening kickoff decision"><Choice label={`${loser.name} opening kickoff choice`} value={p.loserChoice} color={loser.color} options={[{ value: "receive", label: "Receive" }, { value: "kick", label: "Kick" }]} onChange={p.setLoserChoice} /></Row>}
          </section>
          <section className="pg-section pg-field-charting" aria-label="Field and charting">
            {layout === "expanded" && <h2>Field & live charting</h2>}
            <Row title={`${us.name} drive in Q1`} hint="Left and right on your screen"><Choice label="First quarter drive direction" value={p.direction} color={us.color} options={[
              { value: "left", label: <><ArrowLeft size={17} /> Left</> },
              { value: "right", label: <>Right <ArrowRight size={17} /></> },
            ]} onChange={p.setDirection} />
              {layout === "expanded" && <div className="pg-field" aria-live="polite"><span style={palette(us.color)}>{p.direction === "left" && <ArrowLeft size={23} />}{us.tag} drive{p.direction === "right" && <ArrowRight size={23} />}</span></div>}
            </Row>
            <div className="pg-charting" role="group" aria-label="Live charting">{([
              ["formations", "Formations + hash", "Record during play entry"],
              ["tacklers", "Tacklers", "Solo and assisted tackles"],
            ] as const).map(([key, label, hint]) => <button key={key} type="button" className="pg-chart" role="switch" aria-checked={p.charting[key]} aria-label={label} onClick={() => p.setCharting({ ...p.charting, [key]: !p.charting[key] })}>
              <span><strong>{label}</strong><small>{hint}</small></span><span className="pg-onoff" style={p.charting[key] ? palette(us.color) : undefined}>{p.charting[key] && <Check size={14} />}{p.charting[key] ? "ON" : "OFF"}</span>
            </button>)}</div>
          </section>
        </div>
        <section className="pg-summary" aria-label="Kickoff summary" aria-live="polite">{summary("Opening kickoff", p.receiver)}{summary("Second-half kickoff", p.secondHalfReceiver)}</section>
      </div>
      <footer className="pg-footer"><span>Switch views without losing your selections.</span><button type="button" onClick={p.onSave} disabled={p.saving} style={palette(us.color)}>{p.saving ? "Saving…" : "Save pregame"}</button></footer>
    </div>
  </div>;
}
