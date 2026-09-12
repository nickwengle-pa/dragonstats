import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Film } from "lucide-react";
import type { TaggedPlayer } from "./types";
import { playerUseCount, type PlayerUsage } from "./playerUsage";

export function playerLabel(player: TaggedPlayer) {
  if (player.isTeam && player.teamCreditConfirmed) return "Team";
  return player.isTeam || player.player_id === "opp_team"
    ? "Identify on film later"
    : `#${player.jersey_number ?? "?"} ${player.name}`;
}

export default function PlayerPicker({ label, team, players, selected, multiple = false, onSelect, usage, role = "", onSelectTeam }: {
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
  const value = selected.map(playerLabel).join(", ");
  const close = () => { setOpen(false); setQuery(""); };
  const choose = (player: TaggedPlayer | null) => {
    onSelect(player);
    setQuery(""); setActive(0);
    if (!multiple || !player) { close(); input.current?.blur(); }
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      const above = rect.top - (viewport?.offsetTop ?? 0) - 12;
      const below = bottom - rect.bottom - 12;
      const height = Math.max(120, Math.min(340, Math.max(above, below)));
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

  return <div className="player-picker" ref={anchor}>
    <label htmlFor={id}>{label}<span>{team}</span></label>
    <div className="player-picker-input">
      <input id={id} ref={input} role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
        aria-autocomplete="list" aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined}
        autoComplete="off" inputMode="numeric" placeholder="Tap to select or type jersey #"
        value={open ? query : value} title={!open ? value : undefined}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); close(); input.current?.blur(); }
          if (e.key === "Tab") close();
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); setOpen(true);
            const next = Math.max(0, Math.min(filtered.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
            setActive(next); document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: "nearest" });
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            if (filtered[active]) choose(filtered[active]);
          }
        }} />
      <button type="button" aria-label={`Open ${label} list`} onClick={() => { setOpen(true); input.current?.focus(); }}><ChevronDown size={18} /></button>
    </div>
    {open && createPortal(<div ref={popup} className="player-picker-popup" style={position}>
      <div className="player-picker-heading"><strong>{label} · {team}</strong><button type="button" onClick={() => { close(); input.current?.blur(); }}>Done</button></div>
      <button type="button" className="player-film" onMouseDown={e => e.preventDefault()} onClick={() => choose(null)}><Film size={16} /> Identify on film later</button>
      {onSelectTeam && <button type="button" className="player-film" onMouseDown={e => e.preventDefault()} onClick={() => { onSelectTeam(); close(); input.current?.blur(); }}>Team{selected.some(player => player.teamCreditConfirmed) && <Check size={17} />}</button>}
      <div id={`${id}-list`} role="listbox" aria-label={`${label} players`} aria-multiselectable={multiple || undefined}>
        {filtered.map((player, index) => {
          const picked = selected.some(p => p.player_id === player.player_id);
          return <button type="button" role="option" aria-selected={picked} id={`${id}-${index}`} key={player.player_id}
            className={active === index ? "player-active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => choose(player)}>
            <span className="player-jersey">#{player.jersey_number ?? "?"}</span><span>{player.name}</span>{picked && <Check size={17} />}
          </button>;
        })}
        {!filtered.length && <p className="player-empty">No matching player. Choose “Identify on film later” to keep recording.</p>}
      </div>
    </div>, document.body)}
  </div>;
}
