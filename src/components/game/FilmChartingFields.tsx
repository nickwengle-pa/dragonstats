import { useState } from "react";
import { describePersonnel, type PlayCharting, type PlayChartingDraft } from "@/services/chartingService";
import NumberField from "./NumberField";
import { DEFENSIVE_FORMATIONS, OFFENSIVE_FORMATIONS } from "./types";
import type { EditPane, EditRow, EditSection } from "./EditPlayLayout";
import type { PlaySubmitData } from "./PlayEntryModal";

/**
 * The Film Chart's half of the edit-a-play screen: hash, formation, play
 * call, tags and notes, and the play's start.
 *
 * The charting lines are notes about a play, not stats. They live in
 * play_charting and never touch plays or play_players, so a coach who may
 * not change a final game's stats can still chart it, and they save beside a
 * stats edit rather than through it.
 *
 * They used to be a separate sheet of free-text boxes with its own Save, and
 * the stats editor opened on top of it with another - two screens and two
 * saves for one play. Here they are lines on the same summary, picked by
 * tapping rather than typed, and one Save writes whatever changed.
 */

export type FilmPane = "film:formation" | "film:call" | "film:tags" | "film:notes" | "film:start";
export const isFilmPane = (pane: unknown): pane is FilmPane => typeof pane === "string" && pane.startsWith("film:");

/** What this game has used already, most used first: it comes back as chips. */
export interface FilmSeen {
  personnel: string[];
  offense: string[];
  defense: string[];
  motion: string[];
  calls: string[];
  tags: string[];
}

/** A play's start as stored: yard_line counts from the offense's own goal. */
export interface FilmStart {
  possession: "us" | "them";
  down: number;
  distance: number;
  yard_line: number;
}

export interface FilmEdit {
  draft: PlayChartingDraft;
  /** The charting as the play opened, for what changed. */
  saved: PlayChartingDraft;
  onChange: (patch: Partial<PlayChartingDraft>) => void;
  /** The charting lines can be changed. */
  canChart: boolean;
  /** The play's stats can be changed (the final lock). */
  canEditStats: boolean;
  /** Why the stats are locked, when they are. */
  lockNote?: string | null;
  seen: FilmSeen;
  /** Change start. It saves on its own, re-figures the plays after it and
   *  reopens this one, because every spot on the play is measured from it. */
  start?: { value: FilmStart; save: (next: FilmStart) => Promise<boolean> } | null;
  nav?: {
    prev?: { label: string; go: () => void } | null;
    next?: { label: string; go: () => void } | null;
  } | null;
  hasNext: boolean;
  /** stats is the play edit, or null when the play itself did not change.
   *  Resolves false when a write failed, which leaves the screen up. */
  onSave: (stats: PlaySubmitData | null, then: "close" | "next") => Promise<boolean>;
}

const PERSONNEL = ["10", "11", "12", "13", "20", "21", "22", "23"];
const MOTIONS = ["Jet", "Orbit", "Shift", "Trade"];
const HASHES = ["left", "middle", "right"] as const;

const clean = (value: string | null | undefined) => (value ?? "").trim();
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const tagList = (tags: string[] | null | undefined) => (tags ?? []).map(t => t.trim()).filter(Boolean);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** True when the charting differs from how it opened, blank and empty alike. */
export function chartingChanged(a: PlayChartingDraft, b: PlayChartingDraft): boolean {
  const keys = ["hash_mark", "personnel", "offensive_formation", "defensive_formation", "motion", "play_call", "passer", "receiver", "notes"] as const;
  return keys.some(k => clean(a[k]) !== clean(b[k])) || tagList(a.tags).join("\n") !== tagList(b.tags).join("\n");
}

/** Count what a game has used, so the chips offer it on every other play. */
export function collectFilmSeen(
  charting: PlayCharting[],
  plays: Array<{ offensive_formation?: string | null; defensive_formation?: string | null }>,
): FilmSeen {
  const tally = () => new Map<string, { label: string; n: number }>();
  const counts = { personnel: tally(), offense: tally(), defense: tally(), motion: tally(), calls: tally(), tags: tally() };
  const add = (key: keyof typeof counts, value: string | null | undefined) => {
    const label = clean(value);
    if (!label) return;
    const k = label.toLowerCase();
    const hit = counts[key].get(k);
    if (hit) hit.n += 1; else counts[key].set(k, { label, n: 1 });
  };
  for (const c of charting) {
    add("personnel", c.personnel);
    add("offense", c.offensive_formation);
    add("defense", c.defensive_formation);
    add("motion", c.motion);
    add("calls", c.play_call);
    for (const t of tagList(c.tags)) add("tags", t);
  }
  // Formations recorded live, so a game charted at the snap offers them too.
  for (const p of plays) {
    add("offense", p.offensive_formation);
    add("defense", p.defensive_formation);
  }
  const sorted = (key: keyof typeof counts) => [...counts[key].values()].sort((a, b) => b.n - a.n).map(e => e.label);
  return {
    personnel: sorted("personnel"), offense: sorted("offense"), defense: sorted("defense"),
    motion: sorted("motion"), calls: sorted("calls"), tags: sorted("tags"),
  };
}

/** Presets in their own order, then what the game has used that they lack. */
function pickList(presets: readonly string[], seen: readonly string[]): string[] {
  const out = [...presets];
  const have = new Set(presets.map(p => p.toLowerCase()));
  for (const value of seen) {
    const label = value.trim();
    if (label && !have.has(label.toLowerCase())) { have.add(label.toLowerCase()); out.push(label); }
  }
  return out;
}

const motionText = (motion: string) => (/motion|shift|trade/i.test(motion) ? motion : `${motion} motion`);

/** The Film charting lines for the summary, and how many of them changed. */
export function filmSection(
  film: FilmEdit,
  open: (pane: FilmPane) => void,
  active: FilmPane | null,
): { section: EditSection; changes: number } {
  const { draft, saved, canChart, onChange } = film;
  const opener = (pane: FilmPane) => (canChart ? () => open(pane) : undefined);
  const rows: EditRow[] = [];

  const hash = clean(draft.hash_mark);
  rows.push({
    id: "film:hash", label: "Hash", text: hash,
    value: canChart ? "" : hash ? cap(hash) : "Not charted",
    tone: !canChart && !hash ? "dim" : undefined,
    inline: canChart
      ? HASHES.map(h => (
        <button key={h} type="button" aria-pressed={hash === h} aria-label={`${cap(h)} hash`}
          onClick={() => onChange({ hash_mark: hash === h ? null : h })}>{h.charAt(0)}</button>
      ))
      : undefined,
    changed: hash !== clean(saved.hash_mark),
  });

  const personnel = clean(draft.personnel);
  const offense = clean(draft.offensive_formation);
  const defense = clean(draft.defensive_formation);
  const motion = clean(draft.motion);
  const head = [personnel, offense].filter(Boolean).join(" · ");
  const tail = [defense && `vs ${defense}`, motion && motionText(motion)].filter(Boolean).join(" · ");
  const formation = [head, tail].filter(Boolean).join(" · ");
  rows.push({
    id: "film:formation", label: "Formation", text: formation,
    value: head || tail || "Not charted", sub: head && tail ? tail : undefined,
    tone: formation ? undefined : "dim",
    onOpen: opener("film:formation"), active: active === "film:formation",
    changed: personnel !== clean(saved.personnel) || offense !== clean(saved.offensive_formation)
      || defense !== clean(saved.defensive_formation) || motion !== clean(saved.motion),
  });

  const call = clean(draft.play_call);
  rows.push({
    id: "film:call", label: "Play call", text: call, value: call || "Not charted", tone: call ? undefined : "dim",
    onOpen: opener("film:call"), active: active === "film:call", changed: call !== clean(saved.play_call),
  });

  const tags = tagList(draft.tags);
  const tagText = tags.join(" · ");
  rows.push({
    id: "film:tags", label: "Tags", text: tagText, value: tagText || "None", tone: tags.length ? undefined : "dim",
    onOpen: opener("film:tags"), active: active === "film:tags", changed: tagText !== tagList(saved.tags).join(" · "),
  });

  const notes = clean(draft.notes);
  rows.push({
    id: "film:notes", label: "Notes", text: notes,
    value: notes ? clip(notes.replace(/\s+/g, " "), 90) : canChart ? "Add a note" : "None",
    tone: notes ? undefined : "dim",
    onOpen: opener("film:notes"), active: active === "film:notes", changed: notes !== clean(saved.notes),
  });

  return {
    section: { id: "film", title: "Film charting", note: "notes, not stats", rows },
    changes: rows.filter(r => r.changed).length,
  };
}

/** The pane a Film charting line opens. */
export function filmPane(
  film: FilmEdit,
  pane: FilmPane,
  ctx: { teams: { us: string; them: string }; beforeStartSave: () => boolean },
): EditPane | null {
  switch (pane) {
    case "film:formation":
      return {
        title: "Formation",
        hint: "Tap to pick, or type your own. Whatever this game has used shows up here.",
        body: <FormationPane film={film} />,
      };
    case "film:call":
      return { title: "Play call", hint: "The call the way your staff says it.", body: <CallPane film={film} /> };
    case "film:tags":
      return { title: "Tags", hint: "Tap to put one on or take it off.", body: <TagsPane film={film} /> };
    case "film:notes":
      return { title: "Notes", hint: "For the film room. Not part of the stats.", body: <NotesPane film={film} /> };
    case "film:start":
      return film.start
        ? {
          title: "Start of the play",
          hint: "Where this snap really started. Every spot on the play is measured from it.",
          body: <StartPane start={film.start} teams={ctx.teams} beforeSave={ctx.beforeStartSave} />,
          doneLabel: "Cancel",
        }
        : null;
  }
}

function PickGroup({ label, note, options, value, onChange, placeholder, numeric = false }: {
  label: string;
  note?: string | null;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  const current = clean(value).toLowerCase();
  const onChip = options.some(o => o.toLowerCase() === current);
  /* The box is for anything the chips lack, so a picked chip leaves it
     empty. While typing it holds the text as typed - "Trip" on its way to
     "Trips Right" must not vanish the moment it spells a chip. */
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <div>
      <p className="ep-lab">{label}{note && <small>{note}</small>}</p>
      <div className="ep-chips">
        {options.map(option => {
          const on = current === option.toLowerCase();
          return (
            <button key={option} type="button" className="ep-chip" aria-pressed={on} onClick={() => { setTyping(null); onChange(on ? null : option); }}>
              {option}
            </button>
          );
        })}
      </div>
      <input className="ep-field" value={typing ?? (onChip ? "" : value ?? "")} placeholder={placeholder}
        onFocus={() => setTyping(onChip ? "" : value ?? "")} onBlur={() => setTyping(null)}
        onChange={e => { setTyping(e.target.value); onChange(e.target.value); }}
        inputMode={numeric ? "numeric" : undefined} aria-label={`${label}, or type your own`} />
    </div>
  );
}

function FormationPane({ film }: { film: FilmEdit }) {
  const { draft, onChange, seen } = film;
  return (
    <>
      <PickGroup label="Personnel" note={describePersonnel(draft.personnel)} numeric placeholder="Or type it, e.g. 11"
        options={pickList(PERSONNEL, seen.personnel)} value={draft.personnel} onChange={personnel => onChange({ personnel })} />
      <PickGroup label="Offense" placeholder="Or type it" options={pickList(OFFENSIVE_FORMATIONS, seen.offense)}
        value={draft.offensive_formation} onChange={offensive_formation => onChange({ offensive_formation })} />
      <PickGroup label="Defense" placeholder="Or type it" options={pickList(DEFENSIVE_FORMATIONS, seen.defense)}
        value={draft.defensive_formation} onChange={defensive_formation => onChange({ defensive_formation })} />
      <PickGroup label="Motion" placeholder="Or type it, e.g. jet right, trade TE" options={pickList(MOTIONS, seen.motion)}
        value={draft.motion} onChange={motion => onChange({ motion })} />
    </>
  );
}

function CallPane({ film }: { film: FilmEdit }) {
  const { draft, onChange, seen } = film;
  const current = clean(draft.play_call).toLowerCase();
  const recent = seen.calls.slice(0, 18);
  return (
    <>
      <input className="ep-field" autoFocus value={draft.play_call ?? ""} onChange={e => onChange({ play_call: e.target.value })}
        placeholder="Power Right, Y-Cross…" aria-label="Play call" />
      {recent.length > 0 && (
        <div>
          <p className="ep-lab">Called this game</p>
          <div className="ep-chips">
            {recent.map(call => {
              const on = current === call.toLowerCase();
              return (
                <button key={call} type="button" className="ep-chip" aria-pressed={on} onClick={() => onChange({ play_call: on ? null : call })}>
                  {call}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function TagsPane({ film }: { film: FilmEdit }) {
  const { draft, onChange, seen } = film;
  const [text, setText] = useState("");
  const tags = tagList(draft.tags);
  const has = (tag: string) => tags.some(t => t.toLowerCase() === tag.toLowerCase());
  // The game's tags first, in a fixed order, so a chip does not jump when tapped.
  const options = pickList(seen.tags, tags);
  const toggle = (tag: string) => onChange({ tags: has(tag) ? tags.filter(t => t.toLowerCase() !== tag.toLowerCase()) : [...tags, tag] });
  const add = () => {
    const fresh = text.split(",").map(t => t.trim()).filter(t => t && !has(t));
    if (fresh.length) onChange({ tags: [...tags, ...fresh] });
    setText("");
  };
  return (
    <>
      {options.length > 0 && (
        <div className="ep-chips">
          {options.map(tag => (
            <button key={tag} type="button" className="ep-chip" aria-pressed={has(tag)} onClick={() => toggle(tag)}>{tag}</button>
          ))}
        </div>
      )}
      <div>
        <p className="ep-lab">New tag</p>
        <div className="ep-inline-row">
          <input className="ep-field" value={text} onChange={e => setText(e.target.value)} placeholder="explosive, RPO, blitz beater"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} aria-label="New tag" />
          <button type="button" className="ep-go" disabled={!text.trim()} onClick={add}>Add</button>
        </div>
      </div>
    </>
  );
}

function NotesPane({ film }: { film: FilmEdit }) {
  return (
    <textarea className="ep-area" autoFocus rows={7} value={film.draft.notes ?? ""} onChange={e => film.onChange({ notes: e.target.value })}
      placeholder="Coaching notes for the film room…" aria-label="Notes" />
  );
}

/**
 * Down, distance, who had it and where. The ball stays put when the team
 * changes - the spot is the same patch of grass, counted from the other goal.
 */
function StartPane({ start, teams, beforeSave }: {
  start: NonNullable<FilmEdit["start"]>;
  teams: { us: string; them: string };
  beforeSave: () => boolean;
}) {
  const [sit, setSit] = useState<FilmStart>(start.value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const offense = sit.possession === "us" ? teams.us : teams.them;
  const defense = sit.possession === "us" ? teams.them : teams.us;
  const ownHalf = sit.yard_line <= 50;
  const yard = ownHalf ? sit.yard_line : 100 - sit.yard_line;
  const spot = sit.yard_line === 50 ? "the 50" : `${ownHalf ? offense : defense} ${yard}`;
  const moved = sit.possession !== start.value.possession || sit.down !== start.value.down
    || sit.distance !== start.value.distance || sit.yard_line !== start.value.yard_line;
  const patch = (next: Partial<FilmStart>) => { setFailed(false); setSit(s => ({ ...s, ...next })); };
  const save = async () => {
    if (!moved || busy || !beforeSave()) return;
    setBusy(true);
    const ok = await start.save(sit).catch(() => false);
    // A good save reopens the play, so this pane is gone by now.
    if (!ok) { setBusy(false); setFailed(true); }
  };
  return (
    <>
      <div>
        <p className="ep-lab">Ball for</p>
        <div className="ep-chips">
          {(["us", "them"] as const).map(side => (
            <button key={side} type="button" className="ep-chip" aria-pressed={sit.possession === side}
              onClick={() => side !== sit.possession && patch({ possession: side, yard_line: 100 - sit.yard_line })}>
              {side === "us" ? teams.us : teams.them}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="ep-lab">Down</p>
        <div className="ep-chips">
          {[1, 2, 3, 4].map(d => (
            <button key={d} type="button" className="ep-chip" aria-pressed={sit.down === d} onClick={() => patch({ down: d })}>{d}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="ep-lab">To go</p>
        <NumberField className="ep-field" min={0} max={99} value={sit.distance} onChange={distance => patch({ distance })} aria-label="Yards to go" />
      </div>
      <div>
        <p className="ep-lab">Ball on<small>{spot}</small></p>
        <div className="ep-inline-row">
          <div className="ep-chips" style={{ marginTop: 8 }}>
            {([true, false] as const).map(own => (
              <button key={String(own)} type="button" className="ep-chip" aria-pressed={sit.yard_line !== 50 && ownHalf === own}
                onClick={() => patch({ yard_line: own ? Math.min(50, yard || 1) : 100 - Math.min(50, yard || 1) })}>
                {own ? offense : defense}
              </button>
            ))}
          </div>
          <NumberField className="ep-field" min={1} max={50} value={yard || 1} aria-label="Yard line"
            onChange={y => patch({ yard_line: ownHalf ? y : 100 - y })} />
        </div>
      </div>
      <div>
        <button type="button" className="ep-go primary" disabled={!moved || busy} onClick={() => { void save(); }}>
          {busy ? "Saving…" : "Save start"}
        </button>
        <p className="ep-hint">Saves right away and re-figures every play after this one.</p>
        {failed && <p className="ep-hint warn">Couldn't save the start. Check the connection and try again.</p>}
      </div>
    </>
  );
}
