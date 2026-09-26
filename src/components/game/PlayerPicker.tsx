import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Film, Plus } from "lucide-react";
import Keypad from "./Keypad";
import type { TaggedPlayer } from "./types";
import { playerUseCount, type PlayerUsage } from "./playerUsage";

export function playerLabel(player: TaggedPlayer) {
  if (player.isTeam && player.teamCreditConfirmed) return "Team";
  return player.isTeam || player.player_id === "opp_team"
    ? "Identify on film later"
    : numberOnly(player) ? `#${player.jersey_number}` : `#${player.jersey_number ?? "?"} ${player.name}`;
}

/** Added by jersey alone: the name IS the number, so show it once. */
const numberOnly = (player: TaggedPlayer) => (player.name ?? "").trim() === `#${player.jersey_number}`;

export default function PlayerPicker({ label, team, players, selected, multiple = false, onSelect, usage, role = "", onSelectTeam, accentColor, onAddJersey }: {
  accentColor?: string;
  /** Mint a player for a typed jersey nobody in `players` wears. Only for a
   *  side where a bare number is a real pick — the opponent, whose roster is
   *  often missing. Without it an unknown number is a dead end. */
  onAddJersey?: (jersey: number) => TaggedPlayer;
  onSelectTeam?: () => void;
  usage?: PlayerUsage;
  role?: string;
  label: string;
  team: string;
  players: TaggedPlayer[];
  selected: TaggedPlayer[];
  multiple?: boolean;
  onSelect: (player: TaggedPlayer | null) => void;
}) {
  const id = useId();
  const teamStyle = accentColor ? { "--picker-accent": accentColor } as CSSProperties : undefined;
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 300, maxHeight: 280 });
  const filtered = players.filter(player => `${player.jersey_number ?? ""} ${player.name}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(String(b.jersey_number) === query.trim()) - Number(String(a.jersey_number) === query.trim())
      || playerUseCount(usage, role, b.player_id, b.isOpponent) - playerUseCount(usage, role, a.player_id, a.isOpponent)
      || (a.jersey_number ?? 1000) - (b.jersey_number ?? 1000));
  /* A whole jersey nobody listed wears. Never picked for the operator: it is
     offered as an amber row they have to tap, so a mistyped digit cannot
     quietly invent a player. */
  const typed = query.trim();
  const newJersey = onAddJersey && /^(0|[1-9]\d?)$/.test(typed)
    && !players.some(player => String(player.jersey_number) === typed) ? Number(typed) : null;
  /* The add row leads the options, so Enter on a typed "7" adds #7 rather
     than taking the first partial match, #17. */
  const addOffset = newJersey != null ? 1 : 0;
  const value = selected.map(playerLabel).join(", ");
  const close = () => {
    setOpen(false); setQuery("");
    // ABC switches the DOM node to a text keyboard; put it back so the next
    // open is keypad-only again. React never knew it changed.
    if (input.current) input.current.inputMode = "none";
  };
  const choose = (player: TaggedPlayer | null) => {
    onSelect(player);
    setQuery(""); setActive(0);
    if (!multiple || !player) { close(); input.current?.blur(); }
  };
  const addJersey = (jersey: number) => { if (onAddJersey) choose(onAddJersey(jersey)); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      const above = rect.top - (viewport?.offsetTop ?? 0) - 12;
      const below = bottom - rect.bottom - 12;
      // Room for the keypad (~150px) plus a useful list. With no OS keyboard
      // up there is space for it on either side of the field on an iPad.
      const height = Math.max(240, Math.min(560, Math.max(above, below)));
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24);
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width,
        ...(below >= height ? { top: rect.bottom + 5 } : { bottom: window.innerHeight - rect.top + 5 }), maxHeight: height });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!anchor.current?.contains(node) && !popup.current?.contains(node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return <div className={`player-picker${accentColor ? " player-picker-team" : ""}`} style={teamStyle} ref={anchor}>
    <label htmlFor={id}>{label}<span>{team}</span></label>
    <div className="player-picker-input">
      <input id={id} ref={input} role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
        aria-autocomplete="list" aria-activedescendant={open && active < filtered.length + addOffset ? `${id}-${active}` : undefined}
        /* "none", not "numeric": an iPad has no number pad, so "numeric" raised
           the full keyboard, which shoved the page up and covered the names
           being picked from. The keypad in the list is the number entry; ABC
           there hands off to the OS keyboard for a name. Hardware keyboards
           still type, so a laptop works as before. */
        autoComplete="off" inputMode="none" placeholder="Tap to select or type jersey #"
        value={open ? query : value} title={!open ? value : undefined}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); close(); input.current?.blur(); }
          if (e.key === "Tab") close();
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); setOpen(true);
            const next = Math.max(0, Math.min(filtered.length + addOffset - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
            setActive(next); document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: "nearest" });
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            if (active < addOffset && newJersey != null) addJersey(newJersey);
            else if (filtered[active - addOffset]) choose(filtered[active - addOffset]);
          }
        }} />
      <button type="button" aria-label={`Open ${label} list`} onClick={() => { setOpen(true); input.current?.focus(); }}><ChevronDown size={18} /></button>
    </div>
    {open && createPortal(<div ref={popup} className={`player-picker-popup${accentColor ? " player-picker-team" : ""}`} style={{ ...position, ...teamStyle }}>
      <div className="player-picker-heading"><strong>{label} · {team}</strong><button type="button" onClick={() => { close(); input.current?.blur(); }}>Done</button></div>
      <button type="button" className="player-film" onMouseDown={e => e.preventDefault()} onClick={() => choose(null)}><Film size={16} /> Identify on film later</button>
      {onSelectTeam && <button type="button" className="player-film" onMouseDown={e => e.preventDefault()} onClick={() => { onSelectTeam(); if (!multiple) { close(); input.current?.blur(); } }}>Team{selected.some(player => player.teamCreditConfirmed) && <Check size={17} />}</button>}
      <div id={`${id}-list`} role="listbox" aria-label={`${label} players`} aria-multiselectable={multiple || undefined}>
        {newJersey != null && <button type="button" role="option" aria-selected={false} id={`${id}-0`}
          className={`player-add${active === 0 ? " player-active" : ""}`} onMouseDown={e => e.preventDefault()} onClick={() => addJersey(newJersey)}>
          <span className="player-jersey">#{newJersey}</span><span>Add #{newJersey} · number only</span><Plus size={17} />
        </button>}
        {filtered.map((player, index) => {
          const picked = selected.some(p => p.player_id === player.player_id);
          return <button type="button" role="option" aria-selected={picked} id={`${id}-${index + addOffset}`} key={player.player_id}
            className={active === index + addOffset ? "player-active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => choose(player)}>
            <span className="player-jersey">#{player.jersey_number ?? "?"}</span><span>{numberOnly(player) ? "" : player.name}</span>{picked && <Check size={17} />}
          </button>;
        })}
        {!filtered.length && newJersey == null && <p className="player-empty">{
          !onAddJersey ? "No matching player. Choose “Identify on film later” to keep recording."
            : players.length ? "No matching player. Type a jersey number to add one, or choose “Identify on film later”."
              : "No roster for this team. Type a jersey number to add that player."
        }</p>}
      </div>
      <div className="player-picker-keypad">
        <Keypad value={query} onChange={next => { setQuery(next); setActive(0); }} inputRef={input} />
      </div>
    </div>, document.body)}
  </div>;
}
