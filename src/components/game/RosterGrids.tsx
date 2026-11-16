/* The two roster pickers play entry shows: our roster, and the opponent with
   quick-add by jersey. Moved out of PlayEntryModal unchanged. */
import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import Keypad from "./Keypad";
import { makePendingId, type OpponentPlayerRef, type RosterPlayer } from "./types";
import { OPP_TEAM_PLAYER, resolveSoftTarget } from "./playEntryRules";

/* ── Player selector grid (our roster) ── */
export function PlayerGrid({
  roster, label, onSelect, selectedId, search, onSearch, accentColor,
  onSelectPending, selectedPendingId, selectionIsCarried, addedIds,
}: {
  roster: RosterPlayer[];
  label: string;
  onSelect: (p: RosterPlayer) => void;
  selectedId: string | null;
  search: string;
  onSearch: (v: string) => void;
  /** Team color for the label and the selected chip. */
  accentColor?: string;
  /** Tag an unrostered jersey. Absent on grids where that isn't allowed. */
  onSelectPending?: (jersey: number) => void;
  /** Pending id currently tagged for this role, if any. */
  selectedPendingId?: string | null;
  /** The selection was carried from the last play, not picked here — render it
   *  amber so it reads as a suggestion awaiting confirmation. */
  selectionIsCarried?: boolean;
  /** Ids already added on a multi-select step (tacklers). `onSelect` toggles
   *  there, so the confirm bar has to say "Remove" rather than "Confirm". */
  addedIds?: Set<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    if (!search) return roster;
    const q = search.toLowerCase();
    const isNumeric = /^\d+$/.test(search);
    // Numbers filter by prefix, not substring: typing "2" means "the 2x
    // jerseys", not every number containing a 2.
    if (isNumeric) {
      return roster
        .filter(p => String(p.jersey_number).startsWith(search))
        .sort((a, b) => {
          const aExact = String(a.jersey_number) === search ? 0 : 1;
          const bExact = String(b.jersey_number) === search ? 0 : 1;
          return aExact - bExact;
        });
    }
    return roster.filter(p =>
      p.player.first_name.toLowerCase().includes(q) ||
      p.player.last_name.toLowerCase().includes(q) ||
      (p.position ?? "").toLowerCase().includes(q)
    );
  }, [roster, search]);

  /** A numeric search nobody on the roster wears — offer it as pending. */
  const pendingJersey = useMemo(() => {
    if (!/^\d+$/.test(search)) return null;
    const n = Number(search);
    if (!Number.isFinite(n) || n < 0 || n > 99) return null;
    return roster.some(p => p.jersey_number === n) ? null : n;
  }, [roster, search]);

  const soft = useMemo(() => {
    const numeric = resolveSoftTarget(
      search,
      roster.map(p => ({ jersey: p.jersey_number, item: p })),
      onSelectPending ? pendingJersey : null,
    );
    if (numeric) return numeric;
    // A name search that narrows to one player is just as unambiguous.
    if (search && !/^\d+$/.test(search) && filtered.length === 1) {
      return { kind: "player" as const, item: filtered[0] };
    }
    return null;
  }, [search, roster, pendingJersey, onSelectPending, filtered]);

  /** Commit the soft target. The only path that writes a tag from typing. */
  const confirmSoft = () => {
    if (!soft) return;
    if (soft.kind === "player") onSelect(soft.item);
    else onSelectPending?.(soft.jersey);
  };

  const softPlayerId = soft?.kind === "player" ? soft.item.player_id : null;
  const softIsAdded = softPlayerId != null && addedIds?.has(softPlayerId);
  const softLabel = soft == null
    ? ""
    : soft.kind === "pending"
      ? `Add & select #${soft.jersey}`
      // Jersey can legitimately be null; never render "Confirm #null".
      : `${softIsAdded ? "Remove" : "Confirm"} ${soft.item.jersey_number != null ? `#${soft.item.jersey_number} ` : ""}${soft.item.player.preferred_name || soft.item.player.first_name}`;
  // A tile that is already the confirmed pick needs no confirm bar.
  const showConfirmBar = soft != null
    && !(soft.kind === "player" && selectedId === soft.item.player_id && !selectionIsCarried)
    && !(soft.kind === "pending" && selectedPendingId === makePendingId(soft.jersey));

  return (
    <div>
      <div
        className="text-xs font-bold uppercase tracking-wider mb-2"
        style={{ color: accentColor ?? undefined }}
      >
        {label}
      </div>
      <input
        ref={inputRef}
        type="text"
        /* "none", not "numeric": the pad below is the number entry, and an OS
           keyboard here would cover the grid it filters. Hardware keyboards
           are unaffected, so typing and Enter still work on a laptop. */
        inputMode="none"
        placeholder="# or name..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !soft) return;
          // Enter confirms whatever is soft-selected and nothing else. Where
          // the old handler fell through to the pending tile even with several
          // numbers still matching, ambiguity is now simply a no-op.
          e.preventDefault();
          confirmSoft();
          // Toggling a tackler off leaves the search box holding his number,
          // which would keep him highlighted as if still pickable.
          if (softIsAdded) onSearch("");
        }}
        className="input mb-2 text-sm"
        autoFocus
      />
      {/* Solid amber = "your keystrokes point here". Dashed amber elsewhere
          means a suggestion from somewhere else (carried pick, unrostered
          jersey); both stay short of a confirmed pick, which is accent-colored. */}
      {showConfirmBar && (
        <button
          onClick={() => { confirmSoft(); if (softIsAdded) onSearch(""); }}
          className="mb-2 w-full py-2.5 rounded-xl text-sm font-black border-2 border-amber-400 bg-amber-500/15 text-amber-400 flex items-center justify-center gap-2"
        >
          {softLabel}
          <span className="opacity-60 text-xs">↵</span>
        </button>
      )}
      <div className="grid grid-cols-5 gap-1.5 max-h-56 overflow-y-auto">
        {/* Unrostered jersey. Amber + dashed matches the carried-tag styling:
            amber always means "not a confirmed pick". Never auto-selected —
            a typo must not silently invent a player. */}
        {pendingJersey != null && onSelectPending && (
          <button
            onClick={() => onSelectPending(pendingJersey)}
            className="flex flex-col items-center py-2 rounded-xl border-2 border-dashed transition-all duration-200 border-amber-500/50 bg-amber-500/5 text-amber-400 active:bg-amber-500/15"
            style={selectedPendingId === makePendingId(pendingJersey) || soft?.kind === "pending"
              ? { borderStyle: "solid", backgroundColor: "rgba(245,158,11,0.18)" }
              : undefined}
          >
            <span className="text-base font-black tabular-nums">{pendingJersey}</span>
            <span className="text-[8px] font-bold truncate w-full text-center">unrostered</span>
            <span className="text-[7px] font-bold text-amber-500/70">?</span>
          </button>
        )}
        {filtered.map(p => (
          <button
            key={p.player_id}
            onClick={() => onSelect(p)}
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-200 bg-surface-bg text-slate-400 active:bg-surface-hover ${
              // Precedence: confirmed (inline style below) > soft > carried.
              softPlayerId === p.player_id && !(selectedId === p.player_id && !selectionIsCarried)
                ? "border-amber-400 bg-amber-500/15 text-amber-400"
                : selectedId === p.player_id && selectionIsCarried
                  ? "border-dashed border-amber-500/60 bg-amber-500/10 text-amber-400"
                  : "border-transparent"
            }`}
            style={selectedId === p.player_id && !selectionIsCarried && accentColor
              ? { borderColor: accentColor, backgroundColor: `${accentColor}1a`, color: accentColor }
              : undefined}
          >
            <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
            <span className="text-[8px] font-bold text-slate-500 truncate w-full text-center">
              {p.player.preferred_name || p.player.first_name}
            </span>
            <span className="text-[7px] font-bold text-slate-600">{p.position ?? ""}</span>
          </button>
        ))}
      </div>
      <Keypad value={search} onChange={onSearch} inputRef={inputRef} />
    </div>
  );
}

/* ── Opponent player selector with quick-add ── */
export function OpponentPlayerGrid({
  players, label, onSelect, selectedId, search, onSearch, onQuickAdd, accentColor, addedIds,
}: {
  players: OpponentPlayerRef[];
  label: string;
  onSelect: (p: OpponentPlayerRef) => void;
  selectedId: string | null;
  search: string;
  onSearch: (v: string) => void;
  onQuickAdd?: (jersey: number) => void;
  /** Opponent's color for the label and the selected chip. */
  accentColor?: string;
  /** Ids already added on a multi-select step (tacklers) — `onSelect` toggles
   *  there, so the confirm bar has to say "Remove". */
  addedIds?: Set<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    if (!search) return players;
    const q = search.toLowerCase();
    const isNumeric = /^\d+$/.test(search);
    // Prefix, not substring — see PlayerGrid.
    if (isNumeric) {
      return players
        .filter(p => String(p.jersey_number).startsWith(search))
        .sort((a, b) => {
          const aExact = String(a.jersey_number) === search ? 0 : 1;
          const bExact = String(b.jersey_number) === search ? 0 : 1;
          return aExact - bExact;
        });
    }
    return players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.position ?? "").toLowerCase().includes(q)
    );
  }, [players, search]);

  // Check if search is a number that doesn't match any existing player
  const searchNum = parseInt(search, 10);
  const canQuickAdd = onQuickAdd && !isNaN(searchNum) && searchNum > 0
    && !players.some(p => p.jersey_number === searchNum);

  const soft = useMemo(() => {
    const numeric = resolveSoftTarget(
      search,
      players.map(p => ({ jersey: p.jersey_number, item: p })),
      canQuickAdd ? searchNum : null,
    );
    if (numeric) return numeric;
    if (search && !/^\d+$/.test(search) && filtered.length === 1) {
      return { kind: "player" as const, item: filtered[0] };
    }
    return null;
  }, [search, players, canQuickAdd, searchNum, filtered]);

  const confirmSoft = () => {
    if (!soft) return;
    if (soft.kind === "player") onSelect(soft.item);
    else onQuickAdd?.(soft.jersey);
  };

  const softPlayerId = soft?.kind === "player" ? soft.item.id : null;
  const softIsAdded = softPlayerId != null && addedIds?.has(softPlayerId);
  const softLabel = soft == null
    ? ""
    : soft.kind === "pending"
      ? `Add & select #${soft.jersey}`
      : `${softIsAdded ? "Remove" : "Confirm"} ${soft.item.jersey_number != null ? `#${soft.item.jersey_number} ` : ""}${soft.item.name}`;
  const showConfirmBar = soft != null
    && !(soft.kind === "player" && selectedId === soft.item.id);

  return (
    <div>
      <div
        className="text-xs font-bold uppercase tracking-wider mb-2"
        style={{ color: accentColor ?? undefined }}
      >
        {label}
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="none"
        placeholder="# or name..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !soft) return;
          e.preventDefault();
          // Quick-add on Enter creates the opponent player, which is fine here:
          // it only happens on an explicit confirm, never from typing alone.
          confirmSoft();
          if (softIsAdded) onSearch("");
        }}
        className="input mb-2 text-sm"
      />
      {showConfirmBar && (
        <button
          onClick={() => { confirmSoft(); if (softIsAdded) onSearch(""); }}
          className="mb-2 w-full py-2.5 rounded-xl text-sm font-black border-2 border-amber-400 bg-amber-500/15 text-amber-400 flex items-center justify-center gap-2"
        >
          {softLabel}
          <span className="opacity-60 text-xs">↵</span>
        </button>
      )}
      <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto">
        {/* Catch-all TEAM tile — always available so stats never go untracked */}
        <button
          onClick={() => onSelect(OPP_TEAM_PLAYER)}
          className="flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-200 border-dashed border-surface-border bg-surface-bg text-slate-400 active:bg-surface-hover"
          style={selectedId === OPP_TEAM_PLAYER.id && accentColor
            ? { borderStyle: "solid", borderColor: accentColor, backgroundColor: `${accentColor}1a`, color: accentColor }
            : undefined}
        >
          <span className="text-base font-black">★</span>
          <span className="text-[8px] font-bold text-slate-500 truncate w-full text-center">TEAM</span>
        </button>
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`flex flex-col items-center py-2 rounded-xl border-2 transition-all duration-200 bg-surface-bg text-slate-400 active:bg-surface-hover ${
              softPlayerId === p.id && selectedId !== p.id
                ? "border-amber-400 bg-amber-500/15 text-amber-400"
                : "border-transparent"
            }`}
            style={selectedId === p.id && accentColor
              ? { borderColor: accentColor, backgroundColor: `${accentColor}1a`, color: accentColor }
              : undefined}
          >
            <span className="text-base font-black tabular-nums">{p.jersey_number ?? "—"}</span>
            <span className="text-[8px] font-bold text-slate-500 truncate w-full text-center">{p.name}</span>
          </button>
        ))}
        {filtered.length === 0 && !canQuickAdd && (
          <div className="col-span-5 text-xs text-slate-600 text-center py-4">
            Tap TEAM, or type a jersey # to quick-add a player.
          </div>
        )}
      </div>
      {canQuickAdd && (
        <button
          onClick={() => onQuickAdd(searchNum)}
          className="mt-2 w-full py-2 rounded-xl text-xs font-bold border border-dashed border-amber-500/40 text-amber-400 bg-amber-500/5 flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add #{searchNum} to opponent roster & select
        </button>
      )}
      <Keypad value={search} onChange={onSearch} inputRef={inputRef} />
    </div>
  );
}
