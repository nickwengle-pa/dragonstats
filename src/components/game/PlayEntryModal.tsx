import { useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Flag, Plus, Trash2 } from "lucide-react";
import Keypad from "./Keypad";
import {
  type BlockedKickType,
  type PlayTypeDef,
  type PenaltySide,
  type RosterPlayer,
  type OpponentPlayerRef,
  type TaggedPlayer,
  type GameState,
  type PlayRecord,
  BLOCKED_KICK_TYPES,
  PLAY_TYPES,
  PENALTIES,
  PENALTY_DEFAULT_YARDS,
  STICKY_ROLES,
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  getPenaltyDefaultSide,
  isSpotFoul,
  makePendingId,
  makeTeamTag,
  pendingDisplayName,
  yardLabel,
  buildDescription,
} from "./types";
import { buildEditSeed } from "./playEntrySeed";
import ClockInput from "./ClockInput";
import { readableAccent } from "@/utils/teamColor";
import FieldVisualizer from "./FieldVisualizer";
import YardReel from "./YardReel";
import { advanceSituationAfterPlay } from "@/services/gameFlow";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "@/services/programService";

interface Props {
  playType: PlayTypeDef;
  gameState: GameState;
  roster: RosterPlayer[];
  opponentPlayers: OpponentPlayerRef[];
  progName: string;
  oppName: string;
  /** Rules config, so the penalty preview matches what actually gets recorded. */
  gameConfig?: GameConfig;
  /** Last player used per role, keyed "<role>:us" / "<role>:opp". Used to
   *  pre-fill recurring roles (QB, RB, kicker...) on the next play. */
  lastPlayerByRole?: Record<string, TaggedPlayer>;
  /** Team colors — the modal tints itself to whichever team you're working on,
   *  so a glance tells you whose players you're tagging. */
  progColor?: string;
  oppColor?: string;
  progAbbr?: string;
  oppAbbr?: string;
  progLogoUrl?: string | null;
  oppLogoUrl?: string | null;
  /** Which end zone is ours on screen, and which way the offense is driving.
   *  Needed to render a field the same way round as the main screen. */
  ourEndZoneSide?: "left" | "right";
  offenseDirection?: "left" | "right";
  /** Per-game charting prefs — skip these steps when the crew isn't tracking
   *  them live. Film Chart can still fill them in afterwards. */
  trackFormations?: boolean;
  trackTacklers?: boolean;
  onSubmit: (data: PlaySubmitData) => void;
  onClose: () => void;
  onAddOpponentPlayer?: (player: OpponentPlayerRef) => void;
  /** Sticky defaults: last player tagged per role (side-resolved by the
   *  parent). Pre-tagged on open so repeat personnel costs zero taps —
   *  tapping a different player replaces the pre-fill. */
  prefillTags?: Record<string, TaggedPlayer>;
  /** Editing an already-recorded play rather than entering a new one.
   *
   *  The whole modal is reused: same steps, same field, same ruler, same order.
   *  A separate editor could only ever be a partial copy of this one, and was —
   *  it had no kick flow worth the name and spotted the ball wrong. Every piece
   *  of state seeds from the play (see playEntrySeed.ts), so an edit opens
   *  showing what was entered. */
  editing?: PlayRecord | null;
  /** Remove the play being edited. Absent when entering. */
  onDelete?: () => void;
}

export type PenaltyEnforcement = "accepted" | "declined" | "offset";

export interface PlaySubmitData {
  playType: PlayTypeDef;
  tagged: TaggedPlayer[];
  yards: number;
  isTouchdown: boolean;
  isFirstDown: boolean;
  isTouchback: boolean;
  /** Whether possession changed. Defaults to play-type behavior; set explicitly
   *  for fumbles (false = offense recovered, true = lost). */
  turnover?: boolean;
  /** Yards the recoverer carried it after a fumble. The engine's FumbleEvent
   *  has always had a recoveryYards field; nothing ever filled it. */
  fumbleReturnYards?: number;
  /** Where the ball was picked up, offense-relative. The next situation is
   *  measured from here, not from where the play ended. */
  fumbleRecoveredAt?: number;
  /** Onside kicks only: true when the kicking team recovered its own kick. */
  onsideRecoveredByKicker?: boolean;
  /** Scoreboard time at the snap, in seconds. */
  clock: number;
  result: string; // "Good" | "No Good" | "Returned" | "Complete" | "Incomplete" | ""
  penalty: string | null;
  penaltyCategory: PenaltySide | null;
  penaltyEnforcement: PenaltyEnforcement;
  flagYards: number;
  blockedKickType: BlockedKickType | null;
  offensiveFormation: string | null;
  defensiveFormation: string | null;
  hashMark: string | null;
  description: string;
  playData?: Record<string, unknown>;
  /** Manual next-situation override — set when the recorder spots the ball
   *  themselves instead of trusting the computed penalty enforcement. */
  nextSituation?: { ballOn: number; down: number; distance: number } | null;
}

type Step = "players" | "yards" | "penalty" | "formations" | "defense" | "review"
  | "kick_kicker" | "kick_location" | "kick_returner" | "kick_return_yards"
  | "fumble_return";
type FieldTeam = "program" | "opponent";
type KickOutcome = "returned" | "fair_catch" | "downed" | "out_of_bounds" | "touchback";

const KICK_OUTCOMES: Array<{ value: KickOutcome; label: string }> = [
  { value: "returned", label: "Returned" },
  { value: "fair_catch", label: "Fair Catch" },
  { value: "downed", label: "Downed" },
  { value: "out_of_bounds", label: "Out of Bounds" },
  { value: "touchback", label: "Touchback" },
];

/** Roles that belong to the team WITHOUT the ball. */
const DEFENSIVE_ROLES = new Set([
  "tackler", "assist", "sacker", "interceptor", "forced_fumble", "defender", "blocker",
]);

/**
 * Which roster a role is picked from: true = the opponent's.
 *
 * Single source of truth — this rule used to be written out three separate
 * times (player step, carry-forward seed, submit auto-fill) and they disagreed
 * about `returner`, which pre-filled one of OUR players as the returner on our
 * own punt.
 *
 * The subtle ones:
 *   returner        — the team WITHOUT the ball fields the kick, so it's the
 *                     opposite of possession. Reverses only when the kicking
 *                     team recovers its own onside kick.
 *   fumble_recovery — whoever ends up with it; follows the "recovered by" flag.
 */
function roleUsesOpponentRoster(
  role: string,
  isTheirBall: boolean,
  opts: {
    playTypeId?: string;
    fumbleRecoveredByUs?: boolean;
    onsideRecoveredByKicker?: boolean;
    blockedRecoveredByKicking?: boolean;
  } = {},
): boolean {
  if (role === "fumble_recovery") {
    return opts.fumbleRecoveredByUs ? isTheirBall : !isTheirBall;
  }
  if (role === "returner" || role === "recoverer") {
    // A blocked kick is a live ball either team can fall on, so the recoverer's
    // roster follows the toggle rather than a fixed side.
    if (opts.playTypeId === "blocked_kick") {
      return opts.blockedRecoveredByKicking ? isTheirBall : !isTheirBall;
    }
    return opts.playTypeId === "onside_kick" && opts.onsideRecoveredByKicker
      ? isTheirBall
      : !isTheirBall;
  }
  if (DEFENSIVE_ROLES.has(role)) return !isTheirBall;
  return isTheirBall; // offensive roles, incl. kicker/punter
}

/** Catch-all opponent placeholder — collects stats when no jersey was caught.
 *  Not a real roster row; persisted per-play via play_data.opp_tagged. */
const OPP_TEAM_PLAYER: OpponentPlayerRef = {
  id: "opp_team",
  name: "TEAM",
  jersey_number: null,
  position: null,
};

function defaultBlockedKickType(gameState: GameState): BlockedKickType {
  if (gameState.ballOn >= 95) return "extra_point";
  if (gameState.down === 4 && gameState.ballOn >= 60) return "field_goal";
  if (gameState.down === 4) return "punt";
  return "field_goal";
}

/** "2nd", "3rd" — matches the readout in the possession band. */
function ordinalDown(down: number): string {
  if (down === 1) return "1st";
  if (down === 2) return "2nd";
  if (down === 3) return "3rd";
  return `${down}th`;
}

function teamTag(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TEAM";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

/**
 * What the operator's keystrokes point at — a suggestion, never a commitment.
 *
 * Typing a jersey number used to tag the player and advance the step outright.
 * That guessed wrong in the case that matters: the opponent grid only knows the
 * opponents quick-added so far, so with #2 on the list and #21 not yet added,
 * "2" looked unambiguous and fired. No guard can fix that — the candidate list
 * cannot know a longer number is still being typed. So nothing selects itself
 * any more; typing narrows, and the operator confirms.
 */
type SoftTarget<T> =
  | { kind: "player"; item: T }
  | { kind: "pending"; jersey: number };

/**
 * Resolve what a search points at. A pure derivation of (search, candidates) —
 * deliberately not an effect. The previous hook needed a ref guard and an
 * "already tagged" escape hatch only because it fired side effects; deriving
 * the highlight instead makes every one of those cases disappear.
 *
 * `pendingJersey` is the unrostered/quick-add number this grid would offer, or
 * null when the grid has no such affordance.
 */
function resolveSoftTarget<T>(
  search: string,
  candidates: Array<{ jersey: number | null; item: T }>,
  pendingJersey: number | null,
): SoftTarget<T> | null {
  if (!search) return null;
  if (!/^\d+$/.test(search)) return null;

  const exact = candidates.filter(c => c.jersey != null && String(c.jersey) === search);
  if (exact.length === 1) return { kind: "player", item: exact[0].item };
  // Two players wearing the same number (opponent quick-add allows it): never
  // guess which one, make the operator tap.
  if (exact.length > 1) return null;

  const prefix = candidates.filter(c => c.jersey != null && String(c.jersey).startsWith(search));
  if (prefix.length === 1) return { kind: "player", item: prefix[0].item };
  // Only offer to invent a player once no rostered number could still be meant.
  if (prefix.length === 0 && pendingJersey != null) return { kind: "pending", jersey: pendingJersey };
  return null;
}

/* ── Player selector grid (our roster) ── */
function PlayerGrid({
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
function OpponentPlayerGrid({
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

/* ═══════════════════════════════════════════════
   PLAY ENTRY MODAL (Progressive, FSA-style)
   ═══════════════════════════════════════════════ */

export default function PlayEntryModal({
  playType: chosenPlayType, gameState, roster, opponentPlayers, progName, oppName,
  gameConfig = DEFAULT_GAME_CONFIG, lastPlayerByRole,
  progColor = "#dc2626", oppColor = "#6b7280", progAbbr, oppAbbr,
  progLogoUrl, oppLogoUrl, ourEndZoneSide = "left", offenseDirection = "right",
  trackFormations = true, trackTacklers = true,
  onSubmit, onClose, onAddOpponentPlayer, editing = null, onDelete,
}: Props) {
  /* The recorded play, read back into the state that produced it. Built once:
     every state initialiser below reads it during the first render, and it must
     not change identity between them. See playEntrySeed.ts. */
  const edit = useMemo(() => (editing ? buildEditSeed(editing) : null), [editing]);
  const isEditing = edit != null;
  /* The spot-seeding effects below all fire on mount, and on an edit they would
     immediately overwrite the spots just read off the play with the defaults a
     fresh entry starts from. They have to keep running afterwards - moving the
     catch spot should still drag the return with it - so each gets a one-shot
     pass rather than being disabled outright. */
  const skipFirstReturnSeed = useRef(isEditing);
  const skipFirstKickReturnSeed = useRef(isEditing);
  const skipFirstIntReturnSeed = useRef(isEditing);
  /**
   * The play type can change mid-flow.
   *
   * A field goal that gets blocked IS a blocked_kick, and it has to be one by
   * the time it's written: four separate paths key next_situation_source off
   * the type, and a blocked kick must land as "pending_review" instead of
   * letting the engine compute a possession and spot it cannot know. Swapping
   * the result alone would record the block while quietly auto-computing a
   * confidently wrong next situation.
   *
   * MUST stay at the top of the component. `playType` used to be a destructured
   * prop, readable from the first line; as a const it has a temporal dead zone,
   * and the state initialisers below (seedFromLastPlay among them) read it
   * during the first render. Declared any lower, those reads throw
   * "Cannot access before initialization" and the modal never opens — and
   * TypeScript cannot catch it, because the reads sit inside callback bodies
   * it has no way to order.
   */
  const [playTypeOverride, setPlayTypeOverride] = useState<PlayTypeDef | null>(null);
  const playType = playTypeOverride ?? chosenPlayType;

  // Local copy of opponent players (can grow via quick-add)
  const [localOppPlayers, setLocalOppPlayers] = useState<OpponentPlayerRef[]>(opponentPlayers);

  /* ── Carry recurring players forward ──────────────────────────────────────
     Same QB, same RB, same kicker, play after play. Rather than re-picking
     every snap, sticky roles open pre-tagged with whoever filled them last.
     Keyed by side as well as role, so their QB never lands in our passer slot
     after a change of possession. Only STICKY_ROLES qualify — see types.ts. */
  const seedFromLastPlay = (): { tags: TaggedPlayer[]; roles: Set<string> } => {
    const tags: TaggedPlayer[] = [];
    const carried = new Set<string>();
    if (!lastPlayerByRole) return { tags, roles: carried };

    const theirBall = gameState.possession === "them";
    // Kneels are never sticky: the "rusher" on a kneel is the QB, not whoever
    // carried last. Two-point tries pick their own personnel too.
    const activeRoles = playType.id === "two_pt" || playType.id === "kneel"
      ? []
      : playType.roles;

    for (const role of activeRoles) {
      if (!STICKY_ROLES.has(role)) continue;
      // Seeds assume the un-reversed case (no onside recovery yet, fumble not
      // yet marked recovered) — both are decided later in the flow.
      const usesOpp = roleUsesOpponentRoster(role, theirBall, { playTypeId: playType.id });
      const remembered = lastPlayerByRole[`${role}:${usesOpp ? "opp" : "us"}`];
      // The TEAM placeholder is a fallback, not a real pick — never carry it.
      if (!remembered || remembered.player_id === OPP_TEAM_PLAYER.id) continue;
      tags.push({ ...remembered, role });
      carried.add(role);
    }
    return { tags, roles: carried };
  };

  const seeded = useMemo(seedFromLastPlay, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tagged players for this play
  const [tagged, setTagged] = useState<TaggedPlayer[]>(edit ? edit.tagged : seeded.tags);
  // Roles filled from the previous play rather than picked here — rendered
  // differently so a stale carry-over can't masquerade as a confirmed pick.
  // Nothing is carried over on an edit - every tag on the play was picked.
  const [carriedRoles, setCarriedRoles] = useState<Set<string>>(
    edit ? new Set<string>() : seeded.roles,
  );
  // Always open on the first role, even when it's already carried over. The
  // carried pick shows highlighted so it can be eyeballed and changed — a
  // wrong passer that was never displayed is worse than one extra Next tap.
  const [currentRoleIdx, setCurrentRoleIdx] = useState(0);
  const [searches, setSearches] = useState<Record<string, string>>({});

  // Yards — yard-line picker
  // Convert ballOn (possessing team's perspective) to program-perspective side + yard line
  const initResult = (() => {
    let programBallOn: number;
    if (gameState.possession === "us") {
      programBallOn = gameState.ballOn; // 0=our goal, 100=opp goal
    } else {
      programBallOn = 100 - gameState.ballOn; // flip to our perspective
    }
    const side: "our" | "opp" = programBallOn <= 50 ? "our" : "opp";
    const yl = programBallOn <= 50 ? programBallOn : 100 - programBallOn;
    return { side, yl: yl || 1 };
  })();
  const [resultYardLine, setResultYardLine] = useState(edit?.resultYardLine ?? initResult.yl);
  const [resultSide, setResultSide] = useState<"our" | "opp">(edit?.resultSide ?? initResult.side);
  const [resultYardRaw, setResultYardRaw] = useState("");
  const [totalYardsRaw, setTotalYardsRaw] = useState("");

  // Helper: adjust yard line and flip side when crossing 50
  const adjustFieldTeamYardLine = (
    currentYL: number,
    delta: number,
    currentSide: FieldTeam,
    setYL: (value: number) => void,
    setSide: (value: FieldTeam) => void,
  ) => {
    const newYL = currentYL + delta;
    const oppositeSide: FieldTeam = currentSide === "program" ? "opponent" : "program";
    if (newYL > 50) {
      setSide(oppositeSide);
      setYL(Math.min(50, 100 - newYL));
    } else if (newYL < 1) {
      setSide(oppositeSide);
      setYL(Math.max(1, Math.abs(newYL) + 1));
    } else {
      setYL(newYL);
    }
  };

  // Toggles
  const [isTD, setIsTD] = useState(edit?.isTD ?? false);
  const [isFirstDown, setIsFirstDown] = useState(edit?.isFirstDown ?? false);
  // Fumble recovery: false = lost (turnover, default), true = offense recovered.
  const [fumbleRecoveredByUs, setFumbleRecoveredByUs] = useState(edit?.fumbleRecoveredByUs ?? false);
  /**
   * A fumble ON another play — a sack-fumble, a runner stripped, a receiver
   * losing it after the catch.
   *
   * The engine has always modelled a fumble this way: RushPlay and PassPlay
   * both carry a `fumble` built from the forced_fumble and fumble_recovery
   * roles. Only entry insisted it was a play TYPE, which forced a choice
   * between recording the sack and recording the turnover — and picking the
   * sack left possession unchanged for every play that followed, because game
   * state is replayed from the play list.
   */
  const [hasFumble, setHasFumble] = useState(edit?.hasFumble ?? false);
  const [fumbleReturnRaw, setFumbleReturnRaw] = useState(edit?.fumbleReturnRaw ?? "");
  /** Where the ball was actually picked up. Null means "where the play ended",
   *  which is the common case and costs no taps; a loose ball that bounced is
   *  set explicitly. */
  const [fumbleRecoveredAt, setFumbleRecoveredAt] = useState<number | null>(edit?.fumbleRecoveredAt ?? null);
  const [recoverySearch, setRecoverySearch] = useState("");
  const [recoveryTacklerSearch, setRecoveryTacklerSearch] = useState("");
  const fumbleReturnYards = (() => {
    const n = parseInt(fumbleReturnRaw, 10);
    return Number.isFinite(n) ? n : 0;
  })();
  // Onside kicks: true when the kicking team recovered its own kick.
  const [onsideRecoveredByKicker, setOnsideRecoveredByKicker] = useState(edit?.onsideRecoveredByKicker ?? false);
  /* ── How the kick ended ───────────────────────────────────────────────────
     Only "returned" involves an actual return. The rest all spot the ball at
     the landing point with zero return yards; they differ in who's credited
     and how the play reads. Touchback is the exception — the receiving team
     starts at their own 20 regardless of where it came down. */
  const [kickOutcome, setKickOutcome] = useState<KickOutcome>(edit?.kickOutcome ?? "returned");
  const isTouchback = kickOutcome === "touchback";
  const wasReturned = kickOutcome === "returned";
  const [result, setResult] = useState<"Good" | "No Good" | "Returned" | "">(edit?.result ?? "");

  // Penalty
  const [penalty, setPenalty] = useState<string | null>(edit?.penalty ?? null);
  const [penaltyCategory, setPenaltyCategory] = useState<PenaltySide | null>(edit?.penaltyCategory ?? null);
  const [penaltyEnforcement, setPenaltyEnforcement] = useState<PenaltyEnforcement>(edit?.penaltyEnforcement ?? "accepted");
  const [flagYards, setFlagYards] = useState(edit?.flagYards ?? 5);
  // Raw text mirror so the yards box can be cleared and retyped without the
  // controlled value snapping back to 0 on every keystroke.
  const [flagYardsRaw, setFlagYardsRaw] = useState(String(edit?.flagYards ?? 5));
  // Manual spot: when the officials' spot doesn't match the computed
  // enforcement, the recorder's eyes win over the math.
  /* Where the foul itself happened, offense-relative.
     Null for the ordinary case: a false start or a hold marked off from the
     previous spot has no spot of its own worth recording. A SPOT foul does -
     a block in the back is enforced from where the block was, not from where
     the return ended - and without this the app could place the ball but
     could never say afterwards where the foul actually was. */
  const [foulSpotBallOn, setFoulSpotBallOn] = useState<number | null>(edit?.foulSpotBallOn ?? null);
  const [overrideSpot, setOverrideSpot] = useState(false);
  const [spotSide, setSpotSide] = useState<"our" | "opp">("our");
  const [spotYardLine, setSpotYardLine] = useState(25);
  const [spotYardRaw, setSpotYardRaw] = useState("25");
  const [spotDown, setSpotDown] = useState(1);
  const [spotDistance, setSpotDistance] = useState(10);
  // Penalty-only plays get their own dedicated step now, so this toggle only
  // governs the optional flag on a normal play.
  // A play that already carries a flag opens with the picker open, or the
  // penalty on it is invisible until something is tapped.
  const [showPenalties, setShowPenalties] = useState(edit?.penalty != null);
  const [blockedKickType, setBlockedKickType] = useState<BlockedKickType>(
    () => edit?.blockedKickType ?? defaultBlockedKickType(gameState),
  );
  /** Who fell on the blocked kick. Drives which roster `recoverer` picks from. */
  const [blockedRecoveredByKicking, setBlockedRecoveredByKicking] = useState(edit?.blockedRecoveredByKicking ?? false);

  // Formations
  const [offFormation, setOffFormation] = useState<string | null>(edit?.offFormation ?? null);
  const [defFormation, setDefFormation] = useState<string | null>(edit?.defFormation ?? null);
  const [hashMark, setHashMark] = useState<string | null>(edit?.hashMark ?? null);
  /* Which way the ball went, from the OFFENSE's point of view - the same left
     and right the play was called with, not press-box left and right, so it
     stays the same fact after the teams change ends. */
  const [playDirection, setPlayDirection] = useState<"left" | "right" | null>(edit?.playDirection ?? null);
  /* The wristband call as it was sent in ("R42", "L7"). Free text on purpose:
     the letter and number scheme belongs to the coaching staff and changes week
     to week, so there is nothing here worth constraining. */
  const [wristbandCall, setWristbandCall] = useState(edit?.wristbandCall ?? "");
  /* What the scoreboard read at the snap. The running clock supplies it on
     entry, but it is a fact ABOUT the play and belongs on the play - a game
     charted from film, or an operator who fell a snap behind, needs it
     correctable without leaving the play. */
  const [clockSecs, setClockSecs] = useState(gameState.clock);

  // Defensive credit (tacklers)
  const [tacklers, setTacklers] = useState<TaggedPlayer[]>(edit?.tacklers ?? []);
  /**
   * No tackle happened — ran out of bounds, scored, knelt, or just fell.
   *
   * A ball carrier does not imply a tackler, so canHaveTackle can't screen
   * these out: they're ordinary runs. Without an explicit answer the step has
   * no way to tell "nobody tackled him" from "I haven't filled this in", which
   * would either nag on every sideline run or push a TEAM tackle that never
   * happened into the tackle counts.
   *
   * Deliberately not persisted. Blank already means no tackle, and TEAM means
   * a tackle nobody identified — between them film review can read the play.
   * This only says the blank was on purpose.
   */
  const [noTackle, setNoTackle] = useState(false);
  /* On a sack the defender who got there IS the tackler — the engine already
     reads sackers first and falls back to tacklers. Tagging the role by play
     type keeps one step instead of two and lets a split sack hold both names. */
  const defensiveCreditRole = playType.id === "sack" ? "sacker" : "tackler";
  const [tacklerSearch, setTacklerSearch] = useState("");

  // Kickoff / Punt specific state (includes onside + fair catch variants)
  const isKickPlay =
    playType.id === "kickoff" ||
    playType.id === "punt" ||
    playType.id === "onside_kick" ||
    playType.id === "fair_catch";
  /** Kickoffs have a kicker, punts have a punter, and the tag role differs. */
  const kickerRole = (playType.id === "kickoff" || playType.id === "onside_kick")
    ? "kicker"
    : "punter";
  const [kickedToYard, setKickedToYard] = useState(edit?.kickedToYard ?? 5); // receiving team's yard line where ball lands
  const [kickedToRaw, setKickedToRaw] = useState("");
  const [returnToYardLine, setReturnToYardLine] = useState(edit?.returnToYardLine ?? 20);

  // Default the return spot to wherever the kick was caught (a 0-yard return),
  // matching the INT flow. A hardcoded default let a rushed operator silently
  // record backwards returns (caught at the 35, "returned to" the 20 = -15).
  useEffect(() => {
    if (!isKickPlay) return;
    if (skipFirstReturnSeed.current) { skipFirstReturnSeed.current = false; return; }
    const onKickingSide = kickedToYard > 50;
    setReturnToYardLine(Math.max(1, onKickingSide ? 100 - kickedToYard : kickedToYard));
    setReturnToTeam(onKickingSide
      ? (receivingFieldSide === "program" ? "opponent" : "program")
      : receivingFieldSide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickedToYard]);
  const receivingFieldSide: FieldTeam = gameState.possession === "us" ? "opponent" : "program";
  const [returnToTeam, setReturnToTeam] = useState<FieldTeam>(edit?.returnToTeam ?? receivingFieldSide);
  const [returnToRaw, setReturnToRaw] = useState("");
  // Alternate entry: type the distance instead of the spot. Same numbers, just
  // whichever one you actually saw — a "42-yard punt" or "caught at the 12".
  const [kickDistanceRaw, setKickDistanceRaw] = useState("");
  const [returnYardsRaw, setReturnYardsRaw] = useState("");
  const [kickerSearch, setKickerSearch] = useState("");
  const [returnerSearch, setReturnerSearch] = useState("");
  const isInterception = playType.id === "int";

  const toProgramBallOn = (fieldSide: FieldTeam, yardLine: number) =>
    fieldSide === "program" ? yardLine : 100 - yardLine;

  const toOffensePerspectiveBallOn = (fieldSide: FieldTeam, yardLine: number) => {
    const programBallOn = toProgramBallOn(fieldSide, yardLine);
    return gameState.possession === "us" ? programBallOn : 100 - programBallOn;
  };

  const toFieldSpot = (offenseBallOn: number): { side: FieldTeam; yardLine: number } => {
    const programBallOn = gameState.possession === "us" ? offenseBallOn : 100 - offenseBallOn;
    return programBallOn <= 50
      ? { side: "program", yardLine: Math.max(1, Math.min(50, programBallOn)) }
      : { side: "opponent", yardLine: Math.max(1, Math.min(50, 100 - programBallOn)) };
  };

  const initialIntCatchSpot = toFieldSpot(Math.max(1, Math.min(99, gameState.ballOn + 10)));
  const [intCaughtTeam, setIntCaughtTeam] = useState<FieldTeam>(edit?.intCaughtTeam ?? initialIntCatchSpot.side);
  const [intCaughtYardLine, setIntCaughtYardLine] = useState(edit?.intCaughtYardLine ?? initialIntCatchSpot.yardLine);
  const [intReturnTeam, setIntReturnTeam] = useState<FieldTeam>(edit?.intReturnTeam ?? initialIntCatchSpot.side);
  const [intReturnYardLine, setIntReturnYardLine] = useState(edit?.intReturnYardLine ?? initialIntCatchSpot.yardLine);

  // Step management
  const [twoPointStyle, setTwoPointStyle] = useState<"pass" | "run">(edit?.twoPointStyle ?? "pass");
  /* Somebody has to be holding the ball to lose it. "fumble" is excluded
     because it already IS one — the standalone play type stays for a plain
     runner-fumbles, which is one tap. */
  const canHaveFumble = ["rush", "scramble", "pass_comp", "sack", "kneel", "bad_snap"]
    .includes(playType.id);
  /* Either the dedicated play type or the modifier means the fumble roles and
     the recovered-by question apply. */
  const isFumblePlay = playType.id === "fumble" || (canHaveFumble && hasFumble);

  const roles = useMemo(() => {
    // A blocked punt wants the PUNTER, not a kicker. The tag made before the
    // block was discovered carries role "punter", so asking for "kicker" here
    // would strand it and show an empty role the operator already filled.
    if (playType.id === "blocked_kick") {
      const kickerRole = blockedKickType === "punt" ? "punter" : "kicker";
      return [kickerRole, "blocker", "recoverer"];
    }
    const base = playType.id !== "two_pt"
      ? playType.roles
      : twoPointStyle === "run" ? ["rusher"] : ["passer", "receiver"];
    // Who knocked it out and who came up with it, appended so the base play's
    // own roles are still asked for first.
    // Only who forced it belongs with the play's own players. Who recovered it
    // is asked on the recovery step, next to the return it produced.
    if (canHaveFumble && hasFumble) return [...base, "forced_fumble"];
    return base;
  }, [playType, twoPointStyle, blockedKickType, canHaveFumble, hasFumble]);
  const isTheirBall = gameState.possession === "them";
  /* Whether the opponent's kicker is worth naming on this play. Off by
     default: their punter records as TEAM unless the operator asks for the
     step, which the kick location screen offers in one tap. */
  const [showOppKicker, setShowOppKicker] = useState(false);
  const progTag = teamTag(progName);
  const oppTag = teamTag(oppName);
  const perspectiveSideLabel = (side: "our" | "opp") => side === "our" ? progName : oppName;
  const perspectiveSideTag = (side: "our" | "opp") => side === "our" ? progTag : oppTag;
  const fieldTeamLabel = (side: FieldTeam) => side === "program" ? progName : oppName;
  const fieldTeamTag = (side: FieldTeam) => side === "program" ? progTag : oppTag;
  const kickingFieldSide: FieldTeam = receivingFieldSide === "program" ? "opponent" : "program";
  const receivingTeamLabel = fieldTeamLabel(receivingFieldSide);
  const formatFieldSpot = (ballOn: number, possession: "us" | "them") => {
    const offenseTag = possession === "us" ? progTag : oppTag;
    const defenseTag = possession === "us" ? oppTag : progTag;
    if (ballOn === 50) return "50";
    return ballOn <= 50 ? `${offenseTag} ${ballOn}` : `${defenseTag} ${100 - ballOn}`;
  };
  const kickStartLabel = formatFieldSpot(gameState.ballOn, gameState.possession);
  /* kickedToYard counts up from the RECEIVING team's goal line, so a value
     over 50 means the ball came down on the KICKING team's side — a punt that
     never reached midfield. Rendering it as a receiving-team yard line printed
     impossible spots like "OPP 55" and put the ball on the wrong side of the
     field. */
  const landingLabel = kickedToYard === 0
    ? `${fieldTeamTag(receivingFieldSide)} EZ`
    : kickedToYard <= 50
      ? `${fieldTeamTag(receivingFieldSide)} ${kickedToYard}`
      : `${fieldTeamTag(receivingFieldSide === "program" ? "opponent" : "program")} ${100 - kickedToYard}`;
  const kickDistance = isKickPlay ? Math.max(0, (100 - kickedToYard) - gameState.ballOn) : 0;

  /** Inverse of kickDistance: given a distance, where did the ball come down? */
  /* The landing spot in the SAME terms the field and the reel speak: distance
     from the kicking team's own goal line. kickedToYard counts the other way,
     from the receiving team's goal, so the two are simple complements. Keeping
     the conversion in one place stops the field and the number boxes drifting
     apart. */
  const kickLandingBallOn = 100 - kickedToYard;
  /* Where the return ended, offense-relative, so the field graphic and the
     ruler can drive it the same way the run/pass spot picker does. The
     team + yard-line pair stays the source of truth; this is a view of it. */
  const returnSpotBallOn = toOffensePerspectiveBallOn(returnToTeam, returnToYardLine);
  const setReturnSpotFromBallOn = (ballOn: number) => {
    const spot = toFieldSpot(ballOn);
    setReturnToTeam(spot.side);
    setReturnToYardLine(spot.yardLine);
    // The typed alternatives are now stale — they described a different spot.
    setReturnToRaw("");
    setReturnYardsRaw("");
  };
  const setKickedToYardFromBallOn = (ballOn: number) => {
    setKickedToYard(Math.max(0, Math.min(100, 100 - ballOn)));
    // Both typed boxes are now stale — they described a different spot.
    setKickedToRaw("");
    setKickDistanceRaw("");
  };

  const setKickedToYardFromDistance = (distance: number) => {
    const landingYard = 100 - gameState.ballOn - distance;
    // 0..100, not 0..50. Clamped at 50 every short punt pinned the spot to
    // midfield, so the derived distance stopped responding to what was typed
    // and the readout claimed the far side of the 50.
    setKickedToYard(Math.max(0, Math.min(100, landingYard)));
  };

  /** Inverse of the return-yards readout: given return yardage, what's the spot?
   *  receiverYard counts up from the receiving team's goal line, so a return
   *  past midfield flips which team's side of the field the spot is on. */
  const setReturnSpotFromYards = (returnYards: number) => {
    const receiverYard = Math.max(0, Math.min(100, kickedToYard + returnYards));
    const kickingFieldSideLocal: FieldTeam = receivingFieldSide === "program" ? "opponent" : "program";
    if (receiverYard <= 50) {
      setReturnToTeam(receivingFieldSide);
      setReturnToYardLine(Math.max(1, receiverYard));
    } else {
      setReturnToTeam(kickingFieldSideLocal);
      setReturnToYardLine(Math.max(1, 100 - receiverYard));
    }
  };
  const isPenaltyOnly = playType.id === "penalty_only";

  /* ── Who makes the tackle ── */
  // Two cases invert the normal rule, both because whoever carries the ball
  // at the END of the play is not who had it at the snap:
  //   kicks     - the kicking team has possession going in, and they are the
  //               ones running down the returner.
  //   turnovers - a pick or a lost fumble flips possession mid-play, so the
  //               offense that gave it away makes the tackle on the return.
  //               A fumble the offense recovers is not a turnover and keeps
  //               the normal rule.
  const isReturnedTurnover = playType.id === "int"
    || (playType.id === "fumble" && !fumbleRecoveredByUs);
  const tacklersAreOurs = (isKickPlay || isReturnedTurnover) ? !isTheirBall : isTheirBall;
  /* A tackle needs a ball carrier to bring down — these plays never have one. */
  const canHaveTackle = !["pass_inc", "throwaway", "drop", "spike", "penalty_only", "pat", "fg"]
    .includes(playType.id);
  const needsYards = !["pass_inc", "throwaway", "drop", "spike", "penalty_only", "pat", "two_pt", "kickoff", "punt", "onside_kick", "fair_catch"].includes(playType.id);
  const needsResult = ["pat", "fg", "two_pt"].includes(playType.id);
  /* A try is a fixed down at a fixed spot and the only thing recorded about it
     is whether it was good. Nothing downstream reads a hash, a formation or a
     tackler on one, so asking costs taps on every score and returns nothing. */
  const isConversion = ["pat", "two_pt"].includes(playType.id);
  /* The ball hit the ground or never left: no yardage, no score, no first
     down. These still need the step for its penalty picker. */
  const isDeadBall = ["pass_inc", "throwaway", "drop", "spike"].includes(playType.id);
  const needsTouchback = false; // handled in kick-specific flow now
  const interceptionSpotBallOn = isInterception
    ? toOffensePerspectiveBallOn(intCaughtTeam, intCaughtYardLine)
    : null;
  const interceptionReturnBallOn = isInterception
    ? (isTD ? 0 : toOffensePerspectiveBallOn(intReturnTeam, intReturnYardLine))
    : null;
  const interceptionNetYards = isInterception && interceptionReturnBallOn != null
    ? interceptionReturnBallOn - gameState.ballOn
    : 0;
  const interceptionReturnYards = isInterception && interceptionSpotBallOn != null && interceptionReturnBallOn != null
    ? interceptionSpotBallOn - interceptionReturnBallOn
    : 0;
  const interceptionReturnLabel = isInterception
    ? (isTD
      ? `${fieldTeamTag(gameState.possession === "us" ? "program" : "opponent")} EZ`
      : `${fieldTeamTag(intReturnTeam)} ${intReturnYardLine}`)
    : null;

  // Compute yards from the yard-line picker
  const yards = (() => {
    if (!needsYards) return 0;
    let targetBallOn: number;
    if (gameState.possession === "us") {
      targetBallOn = resultSide === "our" ? resultYardLine : 100 - resultYardLine;
    } else {
      targetBallOn = resultSide === "our" ? 100 - resultYardLine : resultYardLine;
    }
    return targetBallOn - gameState.ballOn;
  })();

  /* Where the ball was when it came loose: the play's own result. A sack
     fumble comes loose behind the line, so the return starts there and not at
     the snap. */
  const fumbleSpotBallOn = Math.max(0, Math.min(100, gameState.ballOn + yards));
  /* A defence that recovers runs the OTHER way, so its return counts down in
     the offense's frame. Recovered by the offense and it counts up. Without
     this a 20-yard return by the defence would push the ball 20 yards toward
     the goal the offense was already attacking. */
  const fumbleReturnDirection = fumbleRecoveredByUs ? 1 : -1;
  /* The return starts where it was RECOVERED, which is not always where the
     play ended: a ball can come loose behind the line and be fallen on ten
     yards further downfield. Defaults to the play's end spot so the common
     case is still zero taps. */
  const fumbleRecoveredAtBallOn = fumbleRecoveredAt ?? fumbleSpotBallOn;
  const fumbleReturnBallOn = Math.max(0, Math.min(100,
    fumbleRecoveredAtBallOn + fumbleReturnDirection * fumbleReturnYards));
  const setFumbleReturnFromBallOn = (ballOn: number) => {
    const gained = fumbleReturnDirection * (ballOn - fumbleRecoveredAtBallOn);
    setFumbleReturnRaw(String(Math.round(gained)));
  };

  const setResultFromTotalYards = (totalYards: number) => {
    const rawTarget = gameState.ballOn + totalYards;
    /* Reaching the goal line IS the touchdown, and the spot pair below cannot
       express it: resultYardLine tops out at 50 per side, so targetBallOn was
       clamped to 1..99 and you could type your way to the 1 and no further —
       10 yards from the 10 came out as 9. A play that gets there sets the TD
       flag instead, which submit already turns into 100 - ballOn. Turnover
       returns score at the other end, so they check the opposite bound. */
    const scoresOnTurnover = ["int", "fumble"].includes(playType.id);
    if (scoresOnTurnover ? rawTarget <= 0 : rawTarget >= 100) {
      setIsTD(true);
      return;
    }
    // Typing a shorter gain after marking a TD un-marks it, or the flag would
    // silently outrank the number just entered.
    if (isTD) setIsTD(false);
    const targetBallOn = Math.max(1, Math.min(99, rawTarget));
    const programBallOn = gameState.possession === "us" ? targetBallOn : 100 - targetBallOn;
    const side: "our" | "opp" = programBallOn <= 50 ? "our" : "opp";
    const yardLine = programBallOn <= 50 ? programBallOn : 100 - programBallOn;
    setResultSide(side);
    setResultYardLine(Math.max(1, Math.min(50, yardLine)));
    setResultYardRaw(String(Math.max(1, Math.min(50, yardLine))));
  };

  useEffect(() => {
    if (!needsYards) return;
    setTotalYardsRaw(String(yards));
  }, [needsYards, yards]);

  /* A return starts where the ball was caught, not at some fixed yard line.
     Seeding the return spot to the landing spot means a no-gain return is zero
     taps, and any actual return is a nudge from the right starting point.
     Re-seeds if the catch spot is changed on the way back through. */
  useEffect(() => {
    if (!isKickPlay) return;
    if (skipFirstKickReturnSeed.current) { skipFirstKickReturnSeed.current = false; return; }
    // A short punt comes down on the kicking team's side, so the return has to
    // start there. Clamping to 50 seeded every short punt at midfield on the
    // receiving team's side — the wrong half of the field.
    const onKickingSide = kickedToYard > 50;
    setReturnToTeam(onKickingSide
      ? (receivingFieldSide === "program" ? "opponent" : "program")
      : receivingFieldSide);
    setReturnToYardLine(Math.max(1, onKickingSide ? 100 - kickedToYard : kickedToYard));
    setReturnToRaw("");
    setReturnYardsRaw("");
  }, [isKickPlay, kickedToYard, receivingFieldSide]);

  /* Same for an interception: the return starts where it was picked off. Seeding
     it means a pick with no return is zero taps rather than re-entering the spot
     chosen one control above. Re-seeds if the catch spot is changed on the way
     back through, exactly as the kick return does. */
  useEffect(() => {
    if (!isInterception) return;
    if (skipFirstIntReturnSeed.current) { skipFirstIntReturnSeed.current = false; return; }
    setIntReturnTeam(intCaughtTeam);
    setIntReturnYardLine(intCaughtYardLine);
  }, [isInterception, intCaughtTeam, intCaughtYardLine]);

  const steps: Step[] = [];
  if (isKickPlay) {
    // Kickoff/Punt specific flow.
    // Their kicker is a name we do not have and do not chart, so it records as
    // TEAM and the step is skipped outright. The location screen offers it back
    // in one tap for the rare case worth naming - and a play that already
    // names him keeps the step, or editing one would hide the very tag it was
    // opened to change.
    const namedKicker = tagged.some(
      t => t.role === kickerRole && t.player_id !== OPP_TEAM_PLAYER.id,
    );
    if (!isTheirBall || showOppKicker || namedKicker) steps.push("kick_kicker");
    steps.push("kick_location");
    // Downed / out of bounds / touchback: nobody fielded it, so there's no
    // returner to tag. A fair catch DOES have a receiver worth crediting, but
    // by definition no return yards.
    if (kickOutcome === "returned" || kickOutcome === "fair_catch") {
      steps.push("kick_returner");
    }
    if (wasReturned) {
      steps.push("kick_return_yards");
      // Nobody brought down a returner who scored, so a return TD skips the
      // tackler question instead of asking for a name that doesn't exist.
      if (trackTacklers && !isTD) steps.push("defense");
    }
    // Same as the scrimmage flow: the flag is its own question.
    if (showPenalties || penalty) steps.push("penalty");
    steps.push("review");
  } else if (isPenaltyOnly) {
    // Penalty-only (incl. pre-snap flags): no snap happened, so there are no
    // players to tag, no yards gained, and no formation worth charting. The
    // penalty picker is the whole play — it used to live inside the "yards"
    // step, which this play type skips, leaving nothing to fill in.
    steps.push("penalty");
    steps.push("review");
  } else {
    if (roles.length > 0) steps.push("players");
    /* An incompletion has no yardage and no result to pick, so it used to skip
       this step outright - and the step is also where the penalty picker, the
       fumble modifier and the score toggles live. That left a dropped pass or
       a throwaway with nowhere to flag the pass interference that caused it,
       and nothing to edit afterwards but the passer and the target. The step
       renders only the controls a given play type actually has, so showing it
       here costs one Next and reaches everything. */
    steps.push("yards");
    // A touchdown was, by definition, not tackled. Asking anyway put a step
    // and a skip warning between the score and the review on every TD.
    if (canHaveTackle && trackTacklers && !isTD && !isConversion) steps.push("defense");
    // After the tackle: who came up with it, how far he carried it, and who
    // stopped him. Its own step because a recovery return is its own play
    // within the play, with its own spot and its own tackler.
    if (canHaveFumble && hasFumble) steps.push("fumble_return");
    if (trackFormations && !isConversion) steps.push("formations");
    /* A flag is its own question and deserves its own screen. It used to
       unfold underneath the yardage controls - a penalty list, a side, an
       enforcement, a yardage and now a foul spot, all stacked below the spot
       picker on a modal 512px wide at its widest. Adding the step only once a
       flag is wanted keeps the ordinary snap exactly as short as it was. */
    if (showPenalties || penalty) steps.push("penalty");
    steps.push("review");
  }

  // Always open on the first step, even when every role arrived pre-tagged.
  // An earlier revision skipped straight past the players step in that case;
  // it saved a tap but meant a carried-over passer could be submitted without
  // ever being displayed. Carried picks are shown in amber instead, so they're
  // one glance to verify and one tap to change.
  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx] ?? "review";

  const canGoNext = (): boolean => {
    // A penalty-only play with no flag chosen is meaningless — this is the one
    // step worth hard-blocking on, since there's nothing else to record.
    if (currentStep === "penalty") {
      return !!penalty && !!penaltyCategory;
    }
    if (currentStep === "review" && penalty) {
      return !!penaltyCategory;
    }
    // Player-tag steps are intentionally skippable: live entry must never
    // hard-block on a missing tag (empty opponent roster, unforced fumble,
    // unidentified returner). Stats fall back to generic attribution and the
    // play can be re-tagged later from the log or Film Chart.
    return true;
  };

  const goNext = () => { if (stepIdx < steps.length - 1 && canGoNext()) setStepIdx(s => s + 1); };
  const goBack = () => { if (stepIdx > 0) setStepIdx(s => s - 1); };

  /**
   * Blank roles that will actually go unrecorded.
   *
   * Opponent-side roles are deliberately excluded. handleSubmit auto-fills
   * those with the TEAM placeholder, so skipping the other side's passer and
   * receiver is the intended fast path rather than a mistake — warning about
   * it would put a second Next tap on most defensive snaps to report something
   * the app already handles correctly. Our own skipped roles get no fallback,
   * so those are the only ones worth stopping for.
   */
  const untaggedRoles = roles.filter(r =>
    !tagged.some(t => t.role === r)
    && !roleUsesOpponentRoster(r, isTheirBall, {
      playTypeId: playType.id,
      fumbleRecoveredByUs,
      onsideRecoveredByKicker,
    blockedRecoveredByKicking,
    }),
  );
  /**
   * Opponent-side roles nobody has named. These record as TEAM.
   *
   * Their stats have to land somewhere - a punt with no punter is a punt that
   * never happened as far as the report is concerned - and we do not chart
   * their roster. So the fallback has always existed; it just happened silently
   * at submit, described in a comment, with nothing on screen to say which
   * roles it was about to cover. This is that same list, computed once, so the
   * steps and the review can show it and the submit can write it.
   */
  const teamDefaultRoles = (isKickPlay
    /* Only kicks somebody actually fielded have a returner. Downed and out of
       bounds never show the returner step, so defaulting one to TEAM invented
       a return attempt on a play where nobody touched the ball - and the
       review screen now displays that list, so it was visible as well as
       wrong. Touchback was already excluded; the other two were not. */
    ? [kickerRole, ...((wasReturned || kickOutcome === "fair_catch") ? ["returner"] : [])]
    : roles
  ).filter(role =>
    !tagged.some(t => t.role === role)
    && roleUsesOpponentRoster(role, isTheirBall, {
      playTypeId: playType.id,
      fumbleRecoveredByUs,
      onsideRecoveredByKicker,
      blockedRecoveredByKicking,
    }),
  );

  /** Set when Next is held back to ask about blank roles; null the rest of the time. */
  const [skipWarning, setSkipWarning] = useState<string[] | null>(null);

  /**
   * The Next BUTTON walks roles before it walks steps.
   *
   * goNext moves stepIdx, so on the players step it left the step outright and
   * every role after the current one was never asked for — a pass recorded
   * with a passer and no receiver, the receiver picker never once displayed.
   * Picking a player already advances role-by-role (see handlePlayerSelect);
   * Next now agrees with it. This also makes the carried-pick hint literal:
   * "Next to keep" keeps this role and moves to the next one.
   *
   * Leaving the step with a role still blank asks first. It does not block —
   * canGoNext stays permissive on purpose (empty opponent roster, unforced
   * fumble, unidentified returner all have to go through) — but a skip should
   * be a decision rather than the default outcome of one extra tap.
   */
  /**
   * The tackler step needs the same guard, and it lives in its own state.
   * Only when the tackle is ours: an untagged opponent tackler is somebody
   * else's player and there is nothing useful to record against him.
   */
  const defenseNeedsTackler =
    currentStep === "defense" && tacklersAreOurs && tacklers.length === 0 && !noTackle;

  const goNextFromButton = () => {
    if (currentStep === "players") {
      if (currentRoleIdx < roles.length - 1) {
        setCurrentRoleIdx(i => i + 1);
        return;
      }
      if (untaggedRoles.length > 0 && !skipWarning) {
        setSkipWarning(untaggedRoles);
        return;
      }
    }
    if (defenseNeedsTackler && !skipWarning) {
      setSkipWarning([defensiveCreditRole]);
      return;
    }
    setSkipWarning(null);
    goNext();
  };

  /**
   * Send the outstanding roles to TEAM and move on.
   *
   * "Our team did this, I could not see who" is a different fact from a blank
   * role, and only one of them survives to film review as something to fix. A
   * TEAM tackle is still one tackle, so it carries credit 1 exactly as a named
   * solo tackler would; re-picking the role in the editor replaces it.
   */
  const assignSkippedToTeam = () => {
    if (!skipWarning) return;
    if (currentStep === "defense") {
      setTacklers([{ ...makeTeamTag(defensiveCreditRole), credit: 1 }]);
    } else {
      setTagged(prev => [
        ...prev.filter(t => !skipWarning.includes(t.role)),
        ...skipWarning.map(r => makeTeamTag(r)),
      ]);
    }
    setSkipWarning(null);
    goNext();
  };

  /** Mirror of the above, so Back can reach the passer again without leaving
   *  the step and losing the receiver you just tagged. */
  const goBackFromButton = () => {
    setSkipWarning(null);
    if (currentStep === "players" && currentRoleIdx > 0) {
      setCurrentRoleIdx(i => i - 1);
      return;
    }
    goBack();
  };

  /* ── Player selection — when opponent has ball, offensive roles use opponent roster ── */
  const handlePlayerSelect = (p: RosterPlayer) => {
    const role = roles[currentRoleIdx];
    if (!role) return;
    const tp: TaggedPlayer = {
      id: p.player_id,
      player_id: p.player_id,
      jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`,
      role,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    // An explicit pick supersedes the carry-over for this role.
    setCarriedRoles(prev => {
      if (!prev.has(role)) return prev;
      const next = new Set(prev);
      next.delete(role);
      return next;
    });
    if (currentRoleIdx < roles.length - 1) {
      setCurrentRoleIdx(i => i + 1);
    } else {
      goNext();
    }
  };

  /** Tag an unrostered jersey for the current role. Same rhythm as picking a
   *  rostered player — it advances the step exactly the same way. */
  const handlePendingSelect = (jersey: number) => {
    const role = roles[currentRoleIdx];
    if (!role) return;
    const id = makePendingId(jersey);
    const tp: TaggedPlayer = {
      id,
      player_id: id,
      jersey_number: jersey,
      name: pendingDisplayName(jersey),
      role,
      isPending: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    setCarriedRoles(prev => {
      if (!prev.has(role)) return prev;
      const next = new Set(prev);
      next.delete(role);
      return next;
    });
    if (currentRoleIdx < roles.length - 1) {
      setCurrentRoleIdx(i => i + 1);
    } else {
      goNext();
    }
  };

  const handleOpponentSelect = (p: OpponentPlayerRef) => {
    const role = roles[currentRoleIdx];
    if (!role) return;
    const tp: TaggedPlayer = {
      id: p.id,
      player_id: p.id,
      jersey_number: p.jersey_number,
      name: p.name,
      role,
      isOpponent: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    // An explicit pick supersedes the carry-over for this role.
    setCarriedRoles(prev => {
      if (!prev.has(role)) return prev;
      const next = new Set(prev);
      next.delete(role);
      return next;
    });
    if (currentRoleIdx < roles.length - 1) {
      setCurrentRoleIdx(i => i + 1);
    } else {
      goNext();
    }
  };

  /**
   * Change which side recovered the blocked kick.
   *
   * Any recoverer already tagged came off the other team's roster, so the tag
   * has to go with the flip — keeping it would credit the recovery to a player
   * who isn't on the recovering team. Same reasoning the fumble flow needs;
   * this one is easier to hit because the block is discovered mid-flow.
   */
  const changeBlockedRecoveredBy = (byKicking: boolean) => {
    if (byKicking === blockedRecoveredByKicking) return;
    setBlockedRecoveredByKicking(byKicking);
    setTagged(prev => prev.filter(t => t.role !== "recoverer"));
  };

  /** Which side ended up with the ball. The recoverer and the man who stops
   *  him are on opposite teams, so both pickers key off this one answer. */
  const recoveryUsesOpponentRoster = roleUsesOpponentRoster("fumble_recovery", isTheirBall, {
    playTypeId: playType.id,
    fumbleRecoveredByUs,
    onsideRecoveredByKicker,
    blockedRecoveredByKicking,
  });

  const tagRole = (role: string, p: RosterPlayer) => {
    setTagged(prev => [...prev.filter(t => t.role !== role), {
      id: p.player_id,
      player_id: p.player_id,
      jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`,
      role,
    }]);
  };

  const tagRoleOpp = (role: string, p: OpponentPlayerRef) => {
    setTagged(prev => [...prev.filter(t => t.role !== role), {
      id: p.id,
      player_id: p.id,
      jersey_number: p.jersey_number,
      name: p.name,
      role,
      isOpponent: true,
    }]);
  };

  /* ── Quick-add opponent player by jersey number ── */
  /**
   * The id has to be `opp_{position}_{jersey}`, and it has to be stable.
   *
   * That format is a contract, not a detail: LiveStatsPanel decides which
   * SIDE a stat belongs to from the id alone — `startsWith("opp_")` or a hit
   * in the opponent name map, everything else is ours. A `quick_6_...` id
   * satisfied neither, so a quick-added opponent's tackles were counted on our
   * defense, under a label that was the raw id because no name lookup matched.
   *
   * The timestamp made it worse: re-adding #6 minted a different id, so one
   * player's stats split across several lines. `opp_UNK_{jersey}` is exactly
   * the key GameScreen already derives for a position-less opponent, so the
   * optimistic tag and the saved row resolve to the same place — and the tag
   * lands immediately, with no wait on a network call that press-box wifi may
   * not complete.
   */
  const handleQuickAddOpponent = (jersey: number) => {
    const newPlayer: OpponentPlayerRef = {
      id: `opp_UNK_${jersey}`,
      name: `#${jersey}`,
      jersey_number: jersey,
      position: null,
    };
    setLocalOppPlayers(prev => [...prev, newPlayer]);
    // Notify parent to persist this player to the DB
    onAddOpponentPlayer?.(newPlayer);
    // Auto-select the new player
    handleOpponentSelect(newPlayer);
  };

  const handleAddTackler = (p: RosterPlayer) => {
    if (tacklers.some(t => t.player_id === p.player_id)) {
      // De-selecting: if that leaves exactly one tackler, it's a solo again.
      setTacklers(prev => {
        const next = prev.filter(t => t.player_id !== p.player_id);
        return next.length === 1 ? next.map(t => ({ ...t, credit: 1 })) : next;
      });
      return;
    }
    if (tacklers.length >= 3) return;
    const credit = tacklers.length === 0 ? 1 : 0.5;
    const tp: TaggedPlayer = {
      id: p.player_id,
      player_id: p.player_id,
      jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`,
      role: defensiveCreditRole,
      credit,
    };
    setTacklers(prev => {
      const updated = [...prev, tp];
      if (updated.length > 1) {
        return updated.map(t => ({ ...t, credit: 0.5 }));
      }
      return updated;
    });
    setTacklerSearch("");
  };

  const handleAddOpponentTackler = (p: OpponentPlayerRef) => {
    if (tacklers.some(t => t.id === p.id)) {
      // De-selecting: if that leaves exactly one tackler, it's a solo again.
      setTacklers(prev => {
        const next = prev.filter(t => t.id !== p.id);
        return next.length === 1 ? next.map(t => ({ ...t, credit: 1 })) : next;
      });
      return;
    }
    if (tacklers.length >= 3) return;
    const credit = tacklers.length === 0 ? 1 : 0.5;
    const tp: TaggedPlayer = {
      id: p.id,
      player_id: p.id,
      jersey_number: p.jersey_number,
      name: p.name,
      role: defensiveCreditRole,
      credit,
      isOpponent: true,
    };
    setTacklers(prev => {
      const updated = [...prev, tp];
      if (updated.length > 1) {
        return updated.map(t => ({ ...t, credit: 0.5 }));
      }
      return updated;
    });
    setTacklerSearch("");
  };

  /* ── Kick-specific player selection helpers ── */
  const handleKickerSelect = (p: RosterPlayer) => {
    const role = kickerRole;
    setCarriedRoles(prev => { const next = new Set(prev); next.delete(role); return next; });
    const tp: TaggedPlayer = {
      id: p.player_id, player_id: p.player_id, jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`, role,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    goNext();
  };

  const handleKickerSelectOpp = (p: OpponentPlayerRef) => {
    const role = kickerRole;
    setCarriedRoles(prev => { const next = new Set(prev); next.delete(role); return next; });
    const tp: TaggedPlayer = {
      id: p.id, player_id: p.id, jersey_number: p.jersey_number,
      name: p.name, role, isOpponent: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== role), tp]);
    goNext();
  };

  const handleReturnerSelect = (p: RosterPlayer) => {
    setCarriedRoles(prev => { const next = new Set(prev); next.delete("returner"); return next; });
    const tp: TaggedPlayer = {
      id: p.player_id, player_id: p.player_id, jersey_number: p.jersey_number,
      name: `${p.player.first_name} ${p.player.last_name}`, role: "returner",
    };
    setTagged(prev => [...prev.filter(t => t.role !== "returner"), tp]);
    goNext();
  };

  const handleReturnerSelectOpp = (p: OpponentPlayerRef) => {
    setCarriedRoles(prev => { const next = new Set(prev); next.delete("returner"); return next; });
    const tp: TaggedPlayer = {
      id: p.id, player_id: p.id, jersey_number: p.jersey_number,
      name: p.name, role: "returner", isOpponent: true,
    };
    setTagged(prev => [...prev.filter(t => t.role !== "returner"), tp]);
    goNext();
  };

  const handleSubmit = () => {
    const allTagged = [...tagged, ...tacklers];

    /* A bad snap is charged to TEAM, not to the quarterback who was waiting
       for it. There is nobody to pick, so the tag is written here - our own
       TEAM placeholder rather than the opponent's, since it is our loss. */
    if (playType.id === "bad_snap" && !allTagged.some(t => t.role === "rusher")) {
      allTagged.push(makeTeamTag("rusher"));
    }

    // ── Fill opponent-side roles nobody named with the TEAM placeholder ──
    // Our own skipped roles stay untagged: a coach should attribute his own
    // players, and a blank is the signal to go back and do it. Their side has
    // no roster to attribute to, so the stat lands on TEAM rather than
    // vanishing. teamDefaultRoles is the same list the steps and the review
    // showed on the way here, so nothing appears at submit that was not on
    // screen first.
    for (const role of teamDefaultRoles) {
      allTagged.push({
        id: OPP_TEAM_PLAYER.id,
        player_id: OPP_TEAM_PLAYER.id,
        jersey_number: null,
        name: OPP_TEAM_PLAYER.name,
        role,
        isOpponent: true,
      });
    }
    const passResult = playType.id === "pass_comp" ? "Complete" : playType.id === "pass_inc" ? "Incomplete" : "";
    const finalResult = result || passResult;

    const isZeroYard = ["pass_inc", "throwaway", "drop", "spike", "penalty_only"].includes(playType.id) || needsResult;
    let playYards: number;
    // Compute return yards from yard-line picker for kick plays
    let computedReturnYards = 0;
    // Only an actual return moves the ball off the landing spot. Fair catch,
    // downed, out of bounds and touchback are all zero-return by definition.
    if (isKickPlay && wasReturned) {
      const isReceiverSide = returnToTeam === receivingFieldSide;
      const receiverYard = isReceiverSide ? returnToYardLine : 100 - returnToYardLine;
      computedReturnYards = receiverYard - kickedToYard;
    }

    if (isKickPlay) {
      playYards = kickDistance - computedReturnYards;
    } else if (isInterception && interceptionReturnBallOn != null) {
      playYards = interceptionNetYards;
    } else if (isTD) {
      // TD: yards = distance from line of scrimmage to endzone
      // Turnovers (int/fumble) score in the opposite direction, so yards go negative (towards LOS endzone)
      const isTurnover = ["int", "fumble"].includes(playType.id);
      playYards = isTurnover ? -gameState.ballOn : 100 - gameState.ballOn;
    } else {
      playYards = isZeroYard ? 0 : yards;
    }
    const newBallOn = Math.min(100, Math.max(0, gameState.ballOn + playYards));
    const earnedFirst = isFirstDown || (!isKickPlay && playYards >= gameState.distance && gameState.down <= 4);
    const scored = isTD || (!isKickPlay && newBallOn >= 100);

    const desc = buildDescription(playType, allTagged, playYards, scored, penalty, finalResult, isKickPlay ? {
      kickDistance,
      kickedToYard,
      returnYards: computedReturnYards,
      isTouchback,
      landingLabel,
    } : undefined, isInterception ? {
      turnoverSpotLabel: `${fieldTeamTag(intCaughtTeam)} ${intCaughtYardLine}`,
      returnSpotLabel: interceptionReturnLabel ?? undefined,
      returnYards: interceptionReturnYards,
    } : undefined);

    onSubmit({
      playType,
      tagged: allTagged,
      yards: playYards,
      isTouchdown: scored,
      isFirstDown: earnedFirst,
      isTouchback,
      clock: clockSecs,
      // The flag, not the play type, is what says the ball changed hands — a
      // sack-fumble is a sack that was lost.
      turnover: isFumblePlay ? !fumbleRecoveredByUs : playType.id === "int" ? true : undefined,
      fumbleReturnYards: isFumblePlay ? fumbleReturnYards : undefined,
      fumbleRecoveredAt: isFumblePlay ? fumbleRecoveredAtBallOn : undefined,
      onsideRecoveredByKicker: playType.id === "onside_kick" ? onsideRecoveredByKicker : undefined,
      result: finalResult,
      penalty,
      penaltyCategory,
      penaltyEnforcement: penalty ? penaltyEnforcement : "accepted",
      flagYards: penalty && penaltyEnforcement === "accepted" ? flagYards : 0,
      blockedKickType: playType.id === "blocked_kick" ? blockedKickType : null,
      offensiveFormation: offFormation,
      defensiveFormation: defFormation,
      hashMark,
      description: desc,
      nextSituation: overrideSpot && penalty
        ? { ballOn: overrideBallOn, down: spotDown, distance: spotDistance }
        : null,
      playData: {
        ...(penalty && foulSpotBallOn != null
          ? { foul_spot_ball_on: foulSpotBallOn }
          : {}),
        ...(playDirection ? { play_direction: playDirection } : {}),
        ...(wristbandCall.trim() ? { wristband_call: wristbandCall.trim() } : {}),
        ...(isInterception ? {
        interception_spot: {
          field_side: intCaughtTeam,
          yard_line: intCaughtYardLine,
          ball_on: interceptionSpotBallOn,
          label: `${fieldTeamTag(intCaughtTeam)} ${intCaughtYardLine}`,
        },
        interception_return_to: {
          field_side: isTD ? (gameState.possession === "us" ? "program" : "opponent") : intReturnTeam,
          yard_line: isTD ? 0 : intReturnYardLine,
          ball_on: interceptionReturnBallOn,
          label: interceptionReturnLabel,
        },
        interception_return_yards: interceptionReturnYards,
        interception_net_yards: playYards,
        } : isKickPlay ? {
          kick_outcome: kickOutcome,
          // The two spots the kick flow is built around. Derivable from the
          // yardage only by re-running the whole flow's arithmetic backwards,
          // and not at all once a return or a touchback is in the mix, so they
          // are written down instead of inferred.
          kicked_to_yard: kickedToYard,
          return_to_ball_on: returnSpotBallOn,
          ...(playType.id === "onside_kick"
            ? { onside_recovered_by_kicker: onsideRecoveredByKicker }
            : {}),
        } : {}),
        ...(playType.id === "blocked_kick"
          ? { blocked_recovered_by_kicking: blockedRecoveredByKicking }
          : {}),
      },
    });
  };

  /* ── Determine which roster to show for current role ── */
  const currentRole = roles[currentRoleIdx];
  // Offensive roles belong to the team with the ball; defensive roles belong
  // to the other team. Fumble recovery follows the "Recovered by" toggle.
  const showOpponentRoster = roleUsesOpponentRoster(currentRole, isTheirBall, {
    playTypeId: playType.id,
    fumbleRecoveredByUs,
    onsideRecoveredByKicker,
    blockedRecoveredByKicking,
  });

  /* Two versions of each team colour, on purpose.
     The raw colour fills crests and chips, where it sits on its own ground and
     IS the identity. The accent is the same colour lifted far enough to be
     seen against this app's near-black surfaces, and is what borders, labels
     and the yard ruler use - a team that wears black turned the whole ruler
     into a black marker with black numbers inside it. */
  const progAccent = readableAccent(progColor);
  const oppAccent = readableAccent(oppColor);

  // Identity of whichever team's roster is on screen right now.
  const activeTeamColor = showOpponentRoster ? oppColor : progColor;
  const activeTeamAccent = showOpponentRoster ? oppAccent : progAccent;
  const activeTeamName = showOpponentRoster ? oppName : progName;
  const activeTeamTag = showOpponentRoster ? oppTag : progTag;
  const activeTeamLogo = showOpponentRoster ? oppLogoUrl : progLogoUrl;
  // The offense owns the ball-spot field, so it's tinted to whoever has it.
  const offenseColor = isTheirBall ? oppColor : progColor;
  const offenseAccent = isTheirBall ? oppAccent : progAccent;
  // An interception belongs to the defense — they caught it and they're
  // returning it — so those reels wear the defending team's color.
  const defenseColor = isTheirBall ? progColor : oppColor;
  const defenseAccent = isTheirBall ? progAccent : oppAccent;

  /* ── Field spot picking ───────────────────────────────────────────────────
     ballOn is possession-relative (0 = offense's own goal). The field draws
     left→right on screen, so the mapping is a straight flip when the offense
     drives left. It's an involution, so the same expression converts both
     directions — matching toDisplayFieldPosition on the main screen. */
  const toFieldDisplay = (ballOn: number) =>
    offenseDirection === "right" ? ballOn : 100 - ballOn;

  /** Currently-selected spot, back in possession-relative terms. */
  const resultBallOn = gameState.possession === "us"
    ? (resultSide === "our" ? resultYardLine : 100 - resultYardLine)
    : (resultSide === "our" ? 100 - resultYardLine : resultYardLine);

  /* Order the half-of-field buttons to match the field drawn above them: the
     team whose end zone is on the left gets the left button. A fixed
     "us then them" order reads backwards half the time, since the sides swap
     by quarter. */
  const spotSideOrder: Array<"our" | "opp"> =
    ourEndZoneSide === "left" ? ["our", "opp"] : ["opp", "our"];

  /** Same idea for the program/opponent pickers on the kick-return and
   *  interception steps. */
  const fieldSideOrder: FieldTeam[] =
    ourEndZoneSide === "left" ? ["program", "opponent"] : ["opponent", "program"];

  /** Single writer for the spot, so the field tap, the reel, and the typed box
   *  all land in the same side/yard-line/raw-text state. */
  const applySpotBallOn = (ballOn: number) => {
    setResultFromTotalYards(ballOn - gameState.ballOn);
  };

  /** Field taps arrive as a screen position; the reel already speaks ballOn. */
  const handleFieldPick = (displayPosition: number) => {
    applySpotBallOn(toFieldDisplay(displayPosition)); // involution
  };

  /* ── Where the ball ends up after this flag ───────────────────────────────
     Runs the exact same enforcement the recorder would otherwise get after
     submitting (advanceSituationAfterPlay — half-the-distance, auto first
     downs, replay-the-down), so the preview can't drift from the result. */
  const penaltyProjection = useMemo(() => {
    if (!penalty) return null;
    return advanceSituationAfterPlay(
      {
        type: playType.id,
        yards: 0,
        result: "",
        penalty,
        penaltyCategory,
        penaltyEnforcement,
        flagYards,
        isTouchdown: false,
        firstDown: false,
      },
      {
        possession: gameState.possession,
        down: gameState.down,
        distance: gameState.distance,
        ballOn: gameState.ballOn,
      },
      gameConfig,
    );
  }, [penalty, penaltyCategory, penaltyEnforcement, flagYards, playType.id, gameState, gameConfig]);

  /** Program-relative spot (side + 1–50) → possession-relative ballOn (0–100). */
  const spotToBallOn = (side: "our" | "opp", yardLine: number) => {
    const programBallOn = side === "our" ? yardLine : 100 - yardLine;
    return gameState.possession === "us" ? programBallOn : 100 - programBallOn;
  };

  /** Inverse of spotToBallOn — seeds the manual picker from the projection. */
  const seedSpotFromBallOn = (ballOn: number) => {
    const programBallOn = gameState.possession === "us" ? ballOn : 100 - ballOn;
    const side: "our" | "opp" = programBallOn <= 50 ? "our" : "opp";
    const yardLine = programBallOn <= 50 ? programBallOn : 100 - programBallOn;
    const clamped = Math.max(1, Math.min(50, yardLine));
    setSpotSide(side);
    setSpotYardLine(clamped);
    setSpotYardRaw(String(clamped));
  };

  const overrideBallOn = spotToBallOn(spotSide, spotYardLine);

  /** Where the ball finished, offense-relative: the return spot on a kick,
   *  the interception return on a pick, the spotted ball otherwise. A spot
   *  foul happened somewhere along that, so it is the seed worth offering. */
  const playEndBallOn = isKickPlay
    ? returnSpotBallOn
    : isInterception && interceptionReturnBallOn != null
      ? interceptionReturnBallOn
      : resultBallOn;

  /** Open the flag's own step, adding it to the flow if it is not there yet. */
  const openPenaltyStep = () => {
    const alreadyThere = steps.indexOf("penalty");
    if (alreadyThere >= 0) { setStepIdx(alreadyThere); return; }
    setShowPenalties(true);
    // Inserted just before review, so it takes review's current index.
    setStepIdx(Math.max(0, steps.length - 1));
  };

  const selectPenalty = (label: string) => {
    setPenalty(label);
    setPenaltyCategory(getPenaltyDefaultSide(label));
    setFlagYards(PENALTY_DEFAULT_YARDS[label] ?? 5);
    setFlagYardsRaw(String(PENALTY_DEFAULT_YARDS[label] ?? 5));
    /* Prefill the spot, because almost every foul has an obvious one and
       nobody should have to set the line of scrimmage by hand on a false
       start. A spot foul seeds to where the play ended instead - the return
       spot on a kick - which is the right neighbourhood for a block in the
       back and a nudge away from exact. */
    setFoulSpotBallOn(isSpotFoul(label) ? playEndBallOn : gameState.ballOn);
  };

  const clearPenalty = () => {
    setPenalty(null);
    setPenaltyCategory(null);
    setFoulSpotBallOn(null);
    setFlagYards(5);
    setFlagYardsRaw("5");
    setPenaltyEnforcement("accepted");
  };

  /* ── Penalty picker ──────────────────────────────────────────────────────
     Shared by the "yards" step (a flag on a normal play) and the dedicated
     "penalty" step (penalty-only, where this IS the play). Each penalty shows
     its standard NFHS yardage so you don't have to remember them mid-drive;
     the yardage is a starting point, not a lock — override it by tapping a
     chip or typing the number. */
  const penaltyPicker = (
    <div className="space-y-3">
      <div>
        <span className="text-xs text-slate-500 block mb-1.5">Penalty · standard yards</span>
        <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto">
          {PENALTIES.map(p => (
            <button key={p} onClick={() => selectPenalty(p)}
              className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border text-left transition-all duration-200 flex items-center justify-between gap-1 ${
                penalty === p ? "border-orange-500 bg-orange-500/15 text-orange-400" : "border-surface-border text-slate-400"
              }`}>
              <span className="truncate">{p}</span>
              <span className={`shrink-0 tabular-nums ${penalty === p ? "text-orange-300/80" : "text-slate-600"}`}>
                {PENALTY_DEFAULT_YARDS[p] ?? 5}
              </span>
            </button>
          ))}
        </div>
      </div>

      {penalty && (
        <div className="space-y-3">
          <div>
            <span className="text-xs text-slate-500 block mb-1">Flag On</span>
            <div className="grid grid-cols-2 gap-2">
              {(["offense", "defense"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setPenaltyCategory(side)}
                  className={`py-2.5 rounded-xl text-xs font-bold border-2 capitalize transition-all duration-200 ${
                    penaltyCategory === side
                      ? "border-orange-500 bg-orange-500/15 text-orange-400"
                      : "border-surface-border bg-surface-bg text-slate-500"
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-slate-500 block mb-1">Enforcement</span>
            <div className="grid grid-cols-3 gap-2">
              {(["accepted", "declined", "offset"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPenaltyEnforcement(mode)}
                  className={`py-2 rounded-xl text-[11px] font-bold border-2 capitalize transition-all duration-200 ${
                    penaltyEnforcement === mode
                      ? mode === "accepted" ? "border-orange-500 bg-orange-500/15 text-orange-400"
                        : mode === "declined" ? "border-slate-500 bg-slate-500/15 text-slate-300"
                        : "border-yellow-500 bg-yellow-500/15 text-yellow-300"
                      : "border-surface-border bg-surface-bg text-slate-500"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-slate-500 block mb-1">
              Penalty Yards
              {penaltyEnforcement !== "accepted" && (
                <span className="text-slate-600"> — not enforced ({penaltyEnforcement})</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {[5, 10, 15].map(y => (
                <button
                  key={y}
                  onClick={() => { setFlagYards(y); setFlagYardsRaw(String(y)); }}
                  disabled={penaltyEnforcement !== "accepted"}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 disabled:opacity-30 ${
                    flagYards === y
                      ? "border-orange-500 bg-orange-500/15 text-orange-400"
                      : "border-surface-border bg-surface-bg text-slate-500"
                  }`}
                >
                  {y}
                </button>
              ))}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={flagYardsRaw}
                onChange={e => {
                  const raw = e.target.value;
                  setFlagYardsRaw(raw);
                  // Allow an empty box mid-typing; only commit real numbers.
                  if (raw === "") return;
                  const n = Number(raw);
                  if (!Number.isNaN(n)) setFlagYards(Math.max(0, Math.min(99, n)));
                }}
                onBlur={() => setFlagYardsRaw(String(flagYards))}
                disabled={penaltyEnforcement !== "accepted"}
                className="input w-20 text-center text-sm font-bold"
                placeholder="yds"
              />
            </div>
          </div>

          {/* Where the foul happened.
              Prefilled the moment a penalty is picked - the line of scrimmage
              for the ordinary foul, the end of the play for a spot foul - so
              the common case costs nothing and only a spot foul asks for a
              nudge. It is recorded whether or not it drives enforcement,
              because "where was the block in the back" is a question the app
              could not answer at all before: it could place the ball, but the
              foul's own spot was never written down. */}
          {foulSpotBallOn != null && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-slate-500">Spot of foul</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  isSpotFoul(penalty) ? "text-amber-400" : "text-slate-600"
                }`}>
                  {isSpotFoul(penalty)
                    ? "Spot foul — check this"
                    : foulSpotBallOn === gameState.ballOn
                      ? "Line of scrimmage"
                      : "Adjusted"}
                </span>
              </div>
              <YardReel
                value={foulSpotBallOn}
                onChange={setFoulSpotBallOn}
                offenseDirection={offenseDirection}
                accentColor="#fb923c"
                formatSpot={(ballOn) => formatFieldSpot(ballOn, gameState.possession)}
              />
            </div>
          )}

          <button onClick={clearPenalty} className="text-xs text-red-400 font-bold">
            Clear penalty
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="sheet bg-black/60 backdrop-blur-sm">
      <div className="sheet-panel max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-2 shrink-0 border-b border-surface-border">
          {stepIdx > 0 ? (
            <button onClick={goBack} className="btn-ghost p-1.5"><ChevronLeft className="w-5 h-5" /></button>
          ) : (
            <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
          )}
          <div className="flex-1">
            <div className="text-sm font-black">
              {playType.label}
              {isEditing && (
                <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  Editing
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500">
              Step {stepIdx + 1} of {steps.length}: {
                ({
                  players: "Players", yards: "Yards", penalty: "Penalty",
                  formations: "Formations", defense: "Tacklers", review: "Review",
                  kick_kicker: (playType.id === "kickoff" || playType.id === "onside_kick") ? "Kicker" : "Punter",
                  kick_location: "Kick Location", kick_returner: "Returner",
                  kick_return_yards: "Return To",
                } as Record<string, string>)[currentStep] ?? currentStep
              }
              {isTheirBall && currentStep === "players" && (
                <span className="text-red-400 ml-1">({oppName} ball)</span>
              )}
            </div>
          </div>
          {/* Step dots */}
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === stepIdx ? "bg-dragon-primary" : i < stepIdx ? "bg-emerald-500" : "bg-slate-700"}`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* ── STEP: Players ── */}
          {currentStep === "players" && (
            <>
              {playType.id === "two_pt" && (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conversion Type</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["pass", "run"] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => {
                          setTwoPointStyle(style);
                          setTagged([]);
                          setCurrentRoleIdx(0);
                        }}
                        className={`py-2.5 rounded-xl text-sm font-black border-2 capitalize transition-all duration-200 ${
                          twoPointStyle === style
                            ? "border-dragon-primary bg-dragon-primary/15 text-dragon-primary"
                            : "border-surface-border bg-surface-bg text-slate-500"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Blocked kick recovery.
                  Above the role chips on purpose: it decides which roster the
                  `recoverer` role picks from, so it has to be answered BEFORE
                  that pick. It lived on the yards step first, which comes
                  after — you chose a recoverer from the defending team's
                  roster and only then got asked who recovered, with no way to
                  reach your own players. */}
              {playType.id === "blocked_kick" && (
                <div className="mb-1">
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Recovered by</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => changeBlockedRecoveredBy(false)}
                      className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all cursor-pointer ${
                        !blockedRecoveredByKicking ? "border-red-500 bg-red-500/20 text-red-400" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>
                      {gameState.possession === "us" ? oppName : progName}
                    </button>
                    <button onClick={() => changeBlockedRecoveredBy(true)}
                      className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all cursor-pointer ${
                        blockedRecoveredByKicking ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>
                      {gameState.possession === "us" ? progName : oppName} (kicking team)
                    </button>
                  </div>
                </div>
              )}

              {/* Fumble as a modifier, on the PLAYERS step because that is
                  where the roles it adds are collected. It sat on the yards
                  step first, which runs after this one, so turning it on
                  appended forced_fumble and fumble_recovery to a step already
                  behind you and nobody was ever asked who forced it or who
                  came up with it. Next walks the new roles from here. */}
              {canHaveFumble && (
                <button
                  onClick={() => setHasFumble(f => !f)}
                  className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer mb-1 ${
                    hasFumble
                      ? "border-orange-500 bg-orange-500/20 text-orange-400"
                      : "border-dashed border-surface-border bg-surface-bg text-slate-500"
                  }`}
                >
                  {hasFumble ? "Fumble on this play" : "+ Fumble"}
                </button>
              )}

              {/* Role tabs — amber = carried over from the last play, green = picked here */}
              <div className="flex gap-1.5 flex-wrap">
                {roles.map((role, i) => {
                  const tp = tagged.find(t => t.role === role);
                  // Amber = not a confirmed pick, whether that's a carry-over
                  // from the last play or an unrostered jersey.
                  const unconfirmed = carriedRoles.has(role) || !!tp?.isPending;
                  return (
                    <button key={role} onClick={() => setCurrentRoleIdx(i)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all duration-200 cursor-pointer ${
                        currentRoleIdx === i
                          ? "text-white"
                          : tp
                            ? unconfirmed
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            // Grey-on-dark read as "just another chip" at a
                            // glance. Dashed says unfilled the way the rest of
                            // the modal uses dashed for "not a real pick yet".
                            : "bg-surface-bg text-slate-500 border border-dashed border-slate-600"
                      }`}
                      style={currentRoleIdx === i ? { backgroundColor: activeTeamColor } : undefined}>
                      {/* Fall back to the name when there's no jersey, rather
                          than rendering "#null". */}
                      {role}{tp ? `: ${tp.jersey_number != null ? `#${tp.jersey_number}` : tp.name}${tp.isPending ? "?" : ""}` : ": —"}
                    </button>
                  );
                })}
              </div>

              {carriedRoles.size > 0 && (
                <div className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
                  <span className="text-amber-400/90">
                    Carried from last play:{" "}
                    <span className="font-bold">
                      {roles
                        .filter(r => carriedRoles.has(r))
                        .map(r => {
                          const tp = tagged.find(t => t.role === r);
                          return `${r} #${tp?.jersey_number ?? "?"}${tp?.isPending ? "?" : ""}`;
                        })
                        .join(", ")}
                    </span>
                    {carriedRoles.has(currentRole) && (
                      <span className="text-amber-400/60"> — Next to keep, or tap another</span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      setTagged(prev => prev.filter(t => !carriedRoles.has(t.role)));
                      setCarriedRoles(new Set());
                      setCurrentRoleIdx(0);
                    }}
                    className="text-amber-400 font-bold shrink-0 underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Whose players am I looking at? Team color + logo answers it
                  without reading, which matters when the rosters look alike. */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                style={{
                  borderColor: `${activeTeamAccent}66`,
                  background: `linear-gradient(90deg, ${activeTeamAccent}22, transparent)`,
                }}
              >
                {activeTeamLogo ? (
                  <img src={activeTeamLogo} alt="" className="w-6 h-6 object-contain rounded" />
                ) : (
                  <span
                    className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white"
                    style={{ backgroundColor: activeTeamColor }}
                  >
                    {activeTeamTag}
                  </span>
                )}
                <span className="text-sm font-display font-black uppercase tracking-wide" style={{ color: activeTeamAccent }}>
                  {activeTeamName}
                </span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {currentRole}
                </span>
              </div>

              {/* Their side is recorded as TEAM unless a number was caught, so
                  say so here instead of leaving it to happen at submit. */}
              {showOpponentRoster && teamDefaultRoles.includes(currentRole) && (
                <div className="px-3 py-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 text-[11px] text-amber-400/80">
                  Records as <span className="font-black">TEAM</span> unless you pick someone.
                </div>
              )}

              {/* Show opponent or our roster */}
              {showOpponentRoster ? (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Select ${currentRole} — ${oppName}`}
                  onSelect={handleOpponentSelect}
                  selectedId={tagged.find(t => t.role === currentRole)?.id ?? null}
                  search={searches[currentRole] ?? ""}
                  onSearch={v => setSearches(s => ({ ...s, [currentRole]: v }))}
                  onQuickAdd={handleQuickAddOpponent}
                  accentColor={oppAccent}
                />
              ) : (
                <PlayerGrid
                  roster={roster}
                  label={`Select ${currentRole} — ${progName}`}
                  onSelect={handlePlayerSelect}
                  selectedId={tagged.find(t => t.role === currentRole)?.player_id ?? null}
                  search={searches[currentRole] ?? ""}
                  onSearch={v => setSearches(s => ({ ...s, [currentRole]: v }))}
                  accentColor={progAccent}
                  onSelectPending={handlePendingSelect}
                  selectedPendingId={tagged.find(t => t.role === currentRole && t.isPending)?.player_id ?? null}
                  selectionIsCarried={carriedRoles.has(currentRole)}
                />
              )}
            </>
          )}

          {/* ── KICK STEP: Kicker / Punter ── */}
          {currentStep === "kick_kicker" && (
            <>
              {carriedRoles.has(kickerRole) && (
                <div className="mb-2 px-3 py-2 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/10 text-[11px] text-amber-400/90">
                  Carried from the last kick - Next keeps him, tap anyone to change.
                </div>
              )}
              {isTheirBall ? (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Select ${kickerRole} (opponent)`}
                  onSelect={handleKickerSelectOpp}
                  selectedId={tagged.find(t => t.role === kickerRole)?.id ?? null}
                  search={kickerSearch}
                  onSearch={setKickerSearch}
                  onQuickAdd={handleQuickAddOpponent}
                  accentColor={oppAccent}
                />
              ) : (
                <PlayerGrid
                  roster={roster}
                  label={`Select ${kickerRole}`}
                  onSelect={handleKickerSelect}
                  selectedId={tagged.find(t => t.role === kickerRole)?.player_id ?? null}
                  search={kickerSearch}
                  onSearch={setKickerSearch}
                  accentColor={progAccent}
                  selectionIsCarried={carriedRoles.has(kickerRole)}
                />
              )}
            </>
          )}

          {/* ── KICK STEP: Kick Location ── */}
          {currentStep === "kick_location" && (
            <>
              {isTheirBall && !showOppKicker && (
                <button
                  onClick={() => { setShowOppKicker(true); setStepIdx(0); }}
                  className="w-full mb-1 px-3 py-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 text-[11px] font-bold text-amber-400/80 flex items-center justify-between"
                >
                  <span className="uppercase tracking-wide">
                    {kickerRole}: <span className="font-black">TEAM</span>
                  </span>
                  <span className="underline">Name him</span>
                </button>
              )}
              {/* Same spot-picking as the run/pass yards step: tap the field
                  or drag the ruler. It's also the only control here that can
                  place the ball on EITHER side of the 50 — the "caught at" box
                  takes a receiving-team yard line by definition, so a punt
                  that never reached midfield can't be expressed in it. */}
              <div className="mb-3">
                <FieldVisualizer
                  compact
                  ballOn={kickLandingBallOn}
                  ballPosition={toFieldDisplay(kickLandingBallOn)}
                  firstDownPosition={toFieldDisplay(gameState.ballOn)}
                  possession={gameState.possession}
                  ourEndZoneSide={ourEndZoneSide}
                  primaryColor={progColor}
                  oppColor={oppColor}
                  progName={progName}
                  oppName={oppName}
                  progAbbr={progTag}
                  oppAbbr={oppTag}
                  progLogoUrl={progLogoUrl}
                  oppLogoUrl={oppLogoUrl}
                  onPickSpot={(displayPosition) => setKickedToYardFromBallOn(toFieldDisplay(displayPosition))}
                />
                <div className="text-[10px] text-slate-600 text-center mt-1">
                  Tap the field where it came down · kicked from {yardLabel(gameState.ballOn)}
                </div>
              </div>

              <YardReel
                value={kickLandingBallOn}
                onChange={setKickedToYardFromBallOn}
                offenseDirection={offenseDirection}
                accentColor="#a78bfa"
                formatSpot={(ballOn) => formatFieldSpot(ballOn, gameState.possession)}
              />

              <div className="mt-3">
                <label className="label block mb-2">
                  {(playType.id === "kickoff" || playType.id === "onside_kick") ? "Kicked" : "Punted"} To ({receivingTeamLabel} Yard Line)
                </label>
                <div className="flex items-center gap-1.5">
                  {[-10, -5, -1].map(n => (
                    <button key={n} onClick={() => setKickedToYard(y => Math.max(0, Math.min(100, y + n)))}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">{n}</button>
                  ))}
                  {/* Holds a full label like "OPP 30", not just digits, so it
                      needs more room than the plain yard-line readouts. */}
                  <div className="min-w-[5.5rem] px-2 h-10 shrink-0 rounded-lg bg-surface-bg flex items-center justify-center text-base font-black tabular-nums text-purple-400 whitespace-nowrap">
                    {landingLabel}
                  </div>
                  {[1, 5, 10].map(n => (
                    <button key={n} onClick={() => setKickedToYard(y => Math.max(0, Math.min(100, y + n)))}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                  ))}
                </div>
                {/* Type whichever number you actually caught — each derives the other. */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Caught at (yd line)</span>
                    <input
                      type="number" inputMode="numeric" min={0} max={50}
                      placeholder="e.g. 5"
                      value={kickedToRaw}
                      onChange={e => {
                        setKickedToRaw(e.target.value);
                        setKickDistanceRaw("");
                        const n = parseInt(e.target.value, 10);
                        if (!isNaN(n)) setKickedToYard(Math.max(0, Math.min(50, n)));
                      }}
                      className="input w-full text-center text-sm font-black"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">
                      Or {(playType.id === "kickoff" || playType.id === "onside_kick") ? "kick" : "punt"} distance
                    </span>
                    <input
                      type="number" inputMode="numeric" min={0} max={100}
                      placeholder="e.g. 42"
                      value={kickDistanceRaw}
                      onChange={e => {
                        setKickDistanceRaw(e.target.value);
                        setKickedToRaw("");
                        const n = parseInt(e.target.value, 10);
                        if (!isNaN(n)) setKickedToYardFromDistance(Math.max(0, Math.min(100, n)));
                      }}
                      className="input w-full text-center text-sm font-black"
                    />
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {(playType.id === "kickoff" || playType.id === "onside_kick") ? "Kick" : "Punt"} distance: <span className="font-bold text-slate-300">{kickDistance} yards</span>
                  {" "}({kickStartLabel} → {landingLabel})
                </div>
              </div>

              <div>
                <label className="label block mb-1.5">What happened to it?</label>
                <div className="grid grid-cols-2 gap-2">
                  {KICK_OUTCOMES.map((outcome) => (
                    <button
                      key={outcome.value}
                      onClick={() => setKickOutcome(outcome.value)}
                      className={`py-2.5 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                        outcome.value === "out_of_bounds" ? "col-span-2" : ""
                      } ${
                        kickOutcome === outcome.value
                          ? outcome.value === "touchback"
                            ? "border-sky-500 bg-sky-500/20 text-sky-400"
                            : "border-purple-500 bg-purple-500/20 text-purple-400"
                          : "border-surface-border bg-surface-bg text-slate-500"
                      }`}
                    >
                      {outcome.label}
                    </button>
                  ))}
                </div>
                {/* Same escape as the FG/PAT result step. A punt that never
                    got away isn't one of these outcomes at all — it's a
                    different play — and it has to BE a blocked_kick before it
                    is written, so next_situation_source lands on
                    "pending_review" instead of the engine computing a spot and
                    possession off a kick that never happened. */}
                <button
                  onClick={() => {
                    const blocked = PLAY_TYPES.find(pt => pt.id === "blocked_kick");
                    if (!blocked) return;
                    // fair_catch is a punt that was fair caught, so a block on
                    // it is a blocked punt — not a blocked kickoff.
                    setBlockedKickType(
                      ["punt", "fair_catch"].includes(playType.id) ? "punt" : "kickoff",
                    );
                    setPlayTypeOverride(blocked);
                    // Roles change to kicker/blocker/recoverer, so restart. The
                    // kicker or punter already tagged keeps his tag.
                    setCurrentRoleIdx(0);
                    setStepIdx(0);
                  }}
                  className="mt-2 w-full py-2.5 rounded-xl text-sm font-black border-2 border-dashed border-red-500/50 bg-red-500/10 text-red-400"
                >
                  Blocked
                </button>
              </div>

              <div className="text-xs text-slate-500 text-center">
                {kickOutcome === "returned" && "You'll pick the returner and where they got to."}
                {kickOutcome === "fair_catch" && `Ball spotted at ${landingLabel}. No return yards — you'll still tag who signaled.`}
                {kickOutcome === "downed" && `Downed by the kicking team. Ball spotted at ${landingLabel}.`}
                {kickOutcome === "out_of_bounds" && `Out of bounds at ${landingLabel}. No return.`}
                {kickOutcome === "touchback" && "Receiving team will start at their own 20 yard line."}
              </div>

              {/* Every play can carry a live-ball foul, so every play has to
                  have somewhere to put one. The standalone Penalty play type
                  is for dead-ball fouls - a flag between snaps, where there is
                  no play to attach it to.

                  This step is the one every kick reaches, whatever the outcome,
                  so it covers the kicks that never get a return step at all:
                  a fair catch, a touchback, one downed or out of bounds.
                  Roughing the kicker and holding on the return are not rare.
                  A returned kick sees the control again on the return step,
                  where a block in the back actually happens - same flag, two
                  places to reach it, and the button reads back whatever is
                  already set. */}
              <button onClick={openPenaltyStep}
                className={`w-full py-2 rounded-xl text-xs font-bold border transition-all duration-200 ${
                  penalty ? "border-orange-500/50 bg-orange-500/10 text-orange-400" : "border-surface-border bg-surface-bg text-slate-500"
                }`}>
                <Flag className="w-3 h-3 inline mr-1" />
                {penalty ? `${penalty} · ${flagYards} yds` : "Add Penalty"}
              </button>
            </>
          )}

          {/* ── KICK STEP: Returner ── */}
          {currentStep === "kick_returner" && (
            <>
              <div className="text-xs text-slate-400 mb-1">
                {(playType.id === "kickoff" || playType.id === "onside_kick") ? "Kicked" : "Punted"} to {landingLabel} ({kickDistance} yds). Select the {playType.id === "onside_kick" ? "recoverer" : "returner"}.
              </div>

              {/* Onside: who came up with it — drives possession */}
              {playType.id === "onside_kick" && (
                <div className="mb-3">
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Recovered by</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setOnsideRecoveredByKicker(false)}
                      className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all cursor-pointer ${
                        !onsideRecoveredByKicker ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>
                      {isTheirBall ? progName : oppName} (receivers)
                    </button>
                    <button onClick={() => setOnsideRecoveredByKicker(true)}
                      className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all cursor-pointer ${
                        onsideRecoveredByKicker ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>
                      {isTheirBall ? oppName : progName} (kickers)
                    </button>
                  </div>
                </div>
              )}

              {(playType.id === "onside_kick" && onsideRecoveredByKicker ? !isTheirBall : isTheirBall) ? (
                <PlayerGrid
                  roster={roster}
                  label={`Select ${playType.id === "onside_kick" ? "recoverer" : "returner"} (${progName})`}
                  onSelect={handleReturnerSelect}
                  selectedId={tagged.find(t => t.role === "returner")?.player_id ?? null}
                  search={returnerSearch}
                  onSearch={setReturnerSearch}
                  accentColor={progAccent}
                  selectionIsCarried={carriedRoles.has("returner")}
                />
              ) : (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Select ${playType.id === "onside_kick" ? "recoverer" : "returner"} (${oppName})`}
                  onSelect={handleReturnerSelectOpp}
                  selectedId={tagged.find(t => t.role === "returner")?.id ?? null}
                  search={returnerSearch}
                  onSearch={setReturnerSearch}
                  onQuickAdd={handleQuickAddOpponent}
                  accentColor={oppAccent}
                />
              )}
            </>
          )}

          {/* -- FUMBLE STEP: recovery, return, and who stopped it -- */}
          {currentStep === "fumble_return" && (
            <>
              <div className="text-xs text-slate-400 mb-1">
                {fumbleRecoveredByUs
                  ? `${isTheirBall ? oppName : progName} kept it.`
                  : `${isTheirBall ? progName : oppName} recovered it.`}
                {" "}Who came up with it, how far he carried it, and who stopped him.
              </div>

              {recoveryUsesOpponentRoster ? (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Recovered by (${oppName})`}
                  onSelect={(pl) => tagRoleOpp("fumble_recovery", pl)}
                  selectedId={tagged.find(t => t.role === "fumble_recovery")?.id ?? null}
                  search={recoverySearch}
                  onSearch={setRecoverySearch}
                  onQuickAdd={handleQuickAddOpponent}
                  accentColor={oppAccent}
                />
              ) : (
                <PlayerGrid
                  roster={roster}
                  label={`Recovered by (${progName})`}
                  onSelect={(pl) => tagRole("fumble_recovery", pl)}
                  selectedId={tagged.find(t => t.role === "fumble_recovery")?.player_id ?? null}
                  search={recoverySearch}
                  onSearch={setRecoverySearch}
                  /* Without this the confirmed tile renders exactly like an
                     unpicked one: PlayerGrid paints the selection through an
                     inline style gated on accentColor. The tap registered and
                     showed nothing, which reads as a dead button. */
                  accentColor={fumbleRecoveredByUs ? offenseAccent : defenseAccent}
                />
              )}

              <div className="mt-3">
                <label className="label block mb-1">Recovered At</label>
                <div className="text-[10px] text-slate-600 mb-1">
                  Defaults to where the play ended{" "}
                  ({formatFieldSpot(fumbleSpotBallOn, gameState.possession)}) - move it if the ball bounced
                </div>
                <YardReel
                  value={fumbleRecoveredAtBallOn}
                  onChange={(b) => setFumbleRecoveredAt(b)}
                  offenseDirection={offenseDirection}
                  accentColor="#f59e0b"
                  formatSpot={(b) => formatFieldSpot(b, gameState.possession)}
                />
              </div>

              {/* Same spot picking the yards step uses, because a recovery
                  return is a spot on the field like any other. */}
              <div className="mt-3">
                <label className="label block mb-2">Returned To</label>
                <FieldVisualizer
                  compact
                  ballOn={fumbleReturnBallOn}
                  ballPosition={toFieldDisplay(fumbleReturnBallOn)}
                  firstDownPosition={toFieldDisplay(gameState.ballOn)}
                  possession={gameState.possession}
                  ourEndZoneSide={ourEndZoneSide}
                  primaryColor={progColor}
                  oppColor={oppColor}
                  progName={progName}
                  oppName={oppName}
                  progAbbr={progTag}
                  oppAbbr={oppTag}
                  progLogoUrl={progLogoUrl}
                  oppLogoUrl={oppLogoUrl}
                  onPickSpot={(displayPosition) => setFumbleReturnFromBallOn(toFieldDisplay(displayPosition))}
                />
                <div className="text-[10px] text-slate-600 text-center mt-1">
                  Tap the field, drag the ruler, or type the yards
                </div>
              </div>

              <YardReel
                value={fumbleReturnBallOn}
                onChange={setFumbleReturnFromBallOn}
                offenseDirection={offenseDirection}
                accentColor="#fb923c"
                formatSpot={(b) => formatFieldSpot(b, gameState.possession)}
              />

              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-slate-500">Return yards:</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={fumbleReturnRaw}
                  onChange={e => setFumbleReturnRaw(e.target.value)}
                  className="input w-24 text-center text-sm font-black"
                />
                <span className="text-[10px] text-slate-600">by the recoverer</span>
              </div>

              <div className="mt-3">
                {recoveryUsesOpponentRoster ? (
                  <PlayerGrid
                    roster={roster}
                    label={`Stopped by (${progName})`}
                    onSelect={(pl) => tagRole("recovery_tackler", pl)}
                    selectedId={tagged.find(t => t.role === "recovery_tackler")?.player_id ?? null}
                    search={recoveryTacklerSearch}
                    onSearch={setRecoveryTacklerSearch}
                    accentColor={progAccent}
                  />
                ) : (
                  <OpponentPlayerGrid
                    players={localOppPlayers}
                    label={`Stopped by (${oppName})`}
                    onSelect={(pl) => tagRoleOpp("recovery_tackler", pl)}
                    selectedId={tagged.find(t => t.role === "recovery_tackler")?.id ?? null}
                    search={recoveryTacklerSearch}
                    onSearch={setRecoveryTacklerSearch}
                    onQuickAdd={handleQuickAddOpponent}
                    accentColor={oppAccent}
                  />
                )}
              </div>
            </>
          )}

          {/* ── KICK STEP: Return To Yard Line ── */}
          {currentStep === "kick_return_yards" && (
            <>
              <div>
                <label className="label block mb-2">Returned To (Yard Line)</label>

                {/* Tap the field where he was brought down, or drag the ruler.
                    Every other spot in this modal is picked this way; the
                    return was the one place still asking for a yard line to be
                    stepped to a button at a time. The ghost marker sits on the
                    catch, so the return is visible as a distance. */}
                <div className="mb-3">
                  <FieldVisualizer
                    compact
                    ballOn={returnSpotBallOn}
                    ballPosition={toFieldDisplay(returnSpotBallOn)}
                    firstDownPosition={toFieldDisplay(kickLandingBallOn)}
                    possession={gameState.possession}
                    ourEndZoneSide={ourEndZoneSide}
                    primaryColor={progColor}
                    oppColor={oppColor}
                    progName={progName}
                    oppName={oppName}
                    progAbbr={progTag}
                    oppAbbr={oppTag}
                    progLogoUrl={progLogoUrl}
                    oppLogoUrl={oppLogoUrl}
                    onPickSpot={(displayPosition) => {
                      if (isTD) setIsTD(false);
                      setReturnSpotFromBallOn(toFieldDisplay(displayPosition));
                    }}
                  />
                  <div className="text-[10px] text-slate-600 text-center mt-1">
                    {isTD
                      ? "Returned for a score - tap the field if he was stopped short"
                      : `Tap the field where he was brought down - caught at ${landingLabel}`}
                  </div>
                </div>

                <YardReel
                  value={returnSpotBallOn}
                  onChange={(ballOn) => {
                    if (isTD) setIsTD(false);
                    setReturnSpotFromBallOn(ballOn);
                  }}
                  offenseDirection={offenseDirection}
                  accentColor={defenseAccent}
                  formatSpot={(ballOn) => formatFieldSpot(ballOn, gameState.possession)}
                />

                <div className="h-3" />

                {/* Side selector */}
                <div className="flex gap-1.5 mb-3">
                  {fieldSideOrder.map((side) => (
                    <button
                      key={side}
                      onClick={() => setReturnToTeam(side)}
                      className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                        returnToTeam === side
                            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                            : "border-surface-border bg-surface-bg text-slate-500"
                      }`}
                    >
                      {fieldTeamLabel(side)}
                    </button>
                  ))}
                </div>

                {/* Yard line stepper */}
                <div className="flex items-center gap-1.5">
                  {[-10, -5, -1].map(n => (
                    <button key={n} onClick={() => adjustFieldTeamYardLine(returnToYardLine, n, returnToTeam, setReturnToYardLine, setReturnToTeam)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">{n}</button>
                  ))}
                  <div className="w-16 h-10 shrink-0 rounded-lg bg-surface-bg flex items-center justify-center text-lg font-black tabular-nums text-emerald-400">
                    {returnToYardLine}
                  </div>
                  {[1, 5, 10].map(n => (
                    <button key={n} onClick={() => adjustFieldTeamYardLine(returnToYardLine, n, returnToTeam, setReturnToYardLine, setReturnToTeam)}
                      className="btn-ghost flex-1 h-10 text-sm font-bold">+{n}</button>
                  ))}
                </div>
                {/* Same idea as the kick spot: enter the yard line you saw, or
                    the return yardage — whichever you're sure of. */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Returned to (yd line)</span>
                    <input
                      type="number" inputMode="numeric" min={1} max={50}
                      placeholder="e.g. 30"
                      value={returnToRaw}
                      onChange={e => {
                        setReturnToRaw(e.target.value);
                        setReturnYardsRaw("");
                        const n = parseInt(e.target.value, 10);
                        if (!isNaN(n)) setReturnToYardLine(Math.max(1, Math.min(50, n)));
                      }}
                      className="input w-full text-center text-sm font-black"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Or return yards</span>
                    <input
                      type="number" inputMode="numeric" min={0} max={100}
                      placeholder="e.g. 18"
                      value={returnYardsRaw}
                      onChange={e => {
                        setReturnYardsRaw(e.target.value);
                        setReturnToRaw("");
                        const n = parseInt(e.target.value, 10);
                        if (!isNaN(n)) setReturnSpotFromYards(Math.max(0, Math.min(100, n)));
                      }}
                      className="input w-full text-center text-sm font-black"
                    />
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-3">
                  {(() => {
                    const sideLabel = fieldTeamTag(returnToTeam);
                    const isReceiverSide = returnToTeam === receivingFieldSide;
                    const receiverYard = isReceiverSide ? returnToYardLine : 100 - returnToYardLine;
                    const retYds = receiverYard - kickedToYard;
                    return (
                      <>Caught at {landingLabel} → returned to <span className="font-bold text-slate-300">{sideLabel} {returnToYardLine}</span> ({retYds > 0 ? "+" : ""}{retYds} yds)</>
                    );
                  })()}
                </div>
              </div>

              {/* TD toggle for return TD */}
              <button onClick={() => setIsTD(t => !t)}
                className={`w-full py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                  isTD ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-slate-500"
                }`}>Return TD</button>

              {/* A kick play could not carry a flag at all: the penalty picker
                  lives on the yards step, and the kick flow skips that step
                  entirely - kicker, location, returner, return, review. So a
                  block in the back on a thirty-yard return had nowhere to go.

                  It belongs here rather than on its own step because the
                  return is where the foul happened, and because the yardage
                  does not have to be worked out now: recording any flag pops
                  the Adjust Next Situation sheet after the play, which is
                  where a spot foul gets marked off. Record the return as it
                  happened, name the foul, then put the ball where the
                  officials put it. */}
              <button onClick={openPenaltyStep}
                className={`w-full py-2 rounded-xl text-xs font-bold border transition-all duration-200 ${
                  penalty ? "border-orange-500/50 bg-orange-500/10 text-orange-400" : "border-surface-border bg-surface-bg text-slate-500"
                }`}>
                <Flag className="w-3 h-3 inline mr-1" />
                {penalty ? `${penalty} · ${flagYards} yds` : "Add Penalty"}
              </button>
              {penalty && (
                <div className="text-[10px] text-slate-600 text-center">
                  You'll place the ball after the play - a spot foul is marked
                  from where it happened, not from the end of the return.
                </div>
              )}
            </>
          )}

          {/* ── KICK STEP: Tacklers (optional) ── */}

          {/* ── STEP: Yards / Result ── */}
          {currentStep === "yards" && (
            <>
              {/* Down and distance while the yardage is being chosen. Picking
                  yards is the one step where what's NEEDED matters as much as
                  what happened, and the operator was having to remember it
                  from the screen before. Goal-to-go says "Goal" rather than a
                  distance, same as the scoreboard. */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-surface-border bg-black/20">
                <span className="text-sm font-display font-black text-amber-400 tabular-nums">
                  {ordinalDown(gameState.down)}
                  {" & "}
                  {gameState.ballOn + gameState.distance >= 100 ? "Goal" : gameState.distance}
                </span>
                <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                  Ball on {yardLabel(gameState.ballOn)}
                  {gameState.ballOn + gameState.distance < 100 && (
                    <> · 1st at {yardLabel(gameState.ballOn + gameState.distance)}</>
                  )}
                </span>
              </div>

              {playType.id === "blocked_kick" && (
                <div>
                  <label className="label block mb-1.5">Blocked Kick Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {BLOCKED_KICK_TYPES.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setBlockedKickType(option.value)}
                        className={`py-2 rounded-xl text-xs font-bold border-2 transition-all duration-200 ${
                          blockedKickType === option.value
                            ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary"
                            : "border-surface-border bg-surface-bg text-slate-500"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {needsYards && (
                <div>
                  {isInterception ? (
                    <div className="space-y-4">
                      <div>
                        <label className="label block mb-2">Intercepted At</label>
                        <div className="flex gap-1.5 mb-3">
                          {fieldSideOrder.map((side) => (
                            <button
                              key={side}
                              onClick={() => setIntCaughtTeam(side)}
                              className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                                intCaughtTeam === side
                                  ? "border-red-500 bg-red-500/20 text-red-400"
                                  : "border-surface-border bg-surface-bg text-slate-500"
                              }`}
                            >
                              {fieldTeamLabel(side)}
                            </button>
                          ))}
                        </div>
                        <YardReel
                          value={toOffensePerspectiveBallOn(intCaughtTeam, intCaughtYardLine)}
                          onChange={(ballOn) => {
                            const spot = toFieldSpot(ballOn);
                            setIntCaughtTeam(spot.side);
                            setIntCaughtYardLine(spot.yardLine);
                          }}
                          offenseDirection={offenseDirection}
                          accentColor={defenseAccent}
                          formatSpot={(ballOn) => formatFieldSpot(ballOn, gameState.possession)}
                        />
                      </div>

                      <div>
                        <label className="label block mb-2">Returned To</label>
                        {!isTD && (
                          <div className="flex gap-1.5 mb-3">
                            {fieldSideOrder.map((side) => (
                              <button
                                key={side}
                                onClick={() => setIntReturnTeam(side)}
                                className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer ${
                                  intReturnTeam === side
                                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                                    : "border-surface-border bg-surface-bg text-slate-500"
                                }`}
                              >
                                {fieldTeamLabel(side)}
                              </button>
                            ))}
                          </div>
                        )}
                        {isTD ? (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-300">
                            {fieldTeamTag(gameState.possession === "us" ? "program" : "opponent")} EZ
                          </div>
                        ) : (
                          <YardReel
                            value={toOffensePerspectiveBallOn(intReturnTeam, intReturnYardLine)}
                            onChange={(ballOn) => {
                              const spot = toFieldSpot(ballOn);
                              setIntReturnTeam(spot.side);
                              setIntReturnYardLine(spot.yardLine);
                            }}
                            offenseDirection={offenseDirection}
                            accentColor={defenseAccent}
                            formatSpot={(ballOn) => formatFieldSpot(ballOn, gameState.possession)}
                          />
                        )}
                      </div>

                      <div className="text-xs text-slate-500 space-y-1">
                        <div>
                          INT at <span className="font-bold text-slate-300">{fieldTeamTag(intCaughtTeam)} {intCaughtYardLine}</span>
                        </div>
                        <div>
                          Return to <span className="font-bold text-slate-300">{interceptionReturnLabel}</span>
                          {" "}(<span className={interceptionReturnYards > 0 ? "text-emerald-400" : interceptionReturnYards < 0 ? "text-red-400" : ""}>
                            {interceptionReturnYards > 0 ? "+" : ""}{interceptionReturnYards} yds
                          </span>)
                        </div>
                        <div>
                          Net from LOS: <span className={interceptionNetYards > 0 ? "text-emerald-400 font-bold" : interceptionNetYards < 0 ? "text-red-400 font-bold" : "font-bold text-slate-300"}>
                            {interceptionNetYards > 0 ? "+" : ""}
                            {interceptionNetYards} yds
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label className="label block mb-2">Ball Spotted At</label>

                      {/* Tap the field to drop the ball where you saw it. The
                          orientation matches the main screen so the mental map
                          carries over; the LOS ghost shows where it started. */}
                      <div className="mb-3">
                        <FieldVisualizer
                          compact
                          ballOn={resultBallOn}
                          ballPosition={toFieldDisplay(resultBallOn)}
                          firstDownPosition={toFieldDisplay(
                            Math.min(gameState.ballOn + gameState.distance, 100),
                          )}
                          possession={gameState.possession}
                          ourEndZoneSide={ourEndZoneSide}
                          primaryColor={progColor}
                          oppColor={oppColor}
                          progName={progName}
                          oppName={oppName}
                          progAbbr={progTag}
                          oppAbbr={oppTag}
                          progLogoUrl={progLogoUrl}
                          oppLogoUrl={oppLogoUrl}
                          onPickSpot={(displayPosition) => {
                            // Tapping a spot means it wasn't a score after all.
                            // Without this the field is inert while TD is on and
                            // reads as broken.
                            if (isTD) setIsTD(false);
                            handleFieldPick(displayPosition);
                          }}
                        />
                        <div className="text-[10px] text-slate-600 text-center mt-1">
                          {isTD
                            ? <>Scored · tap the field if it was stopped short</>
                            : <>Tap the field to set the spot · started at {yardLabel(gameState.ballOn)}</>}
                        </div>
                      </div>

                      {/* A touchdown has no spot to pick — the ball is in the end
                          zone, and submit already scores it as 100 - ballOn (or
                          -ballOn on a turnover return). Leaving the picker live
                          showed a yard line that contradicted the TD toggle and
                          invited the operator to "fix" a number that was never
                          used. Same treatment the interception return already
                          gets. */}
                      {isTD ? (
                        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 flex items-center justify-between">
                          <span className="text-sm font-black text-amber-300">
                            {fieldTeamTag(
                              ["int", "fumble"].includes(playType.id)
                                ? (gameState.possession === "us" ? "opponent" : "program")
                                : (gameState.possession === "us" ? "opponent" : "program"),
                            )} EZ
                          </span>
                          <span className="text-[11px] font-bold text-amber-400/80 tabular-nums">
                            {["int", "fumble"].includes(playType.id)
                              ? -gameState.ballOn
                              : 100 - gameState.ballOn} yds · touchdown
                          </span>
                        </div>
                      ) : (
                      <>
                      <div className="flex gap-1.5 mb-3">
                        {spotSideOrder.map(side => (
                        <button
                          key={side}
                          onClick={() => setResultSide(side)}
                            className="flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all duration-200 cursor-pointer border-surface-border bg-surface-bg text-slate-500"
                            style={resultSide === side
                              ? {
                                  borderColor: offenseAccent,
                                  backgroundColor: `${offenseAccent}33`,
                                  color: offenseAccent,
                                }
                              : undefined}
                        >
                            {perspectiveSideLabel(side)}
                          </button>
                        ))}
                      </div>

                      <YardReel
                        value={resultBallOn}
                        onChange={applySpotBallOn}
                        offenseDirection={offenseDirection}
                        accentColor={offenseAccent}
                        formatSpot={(ballOn) => formatFieldSpot(ballOn, gameState.possession)}
                        /* Only where the offense keeps the ball and the chains
                           are the question. A pick or a lost fumble ends the
                           series, so a first-down call on it is noise. */
                        firstDownBallOn={
                          ["int", "blocked_kick"].includes(playType.id)
                            || (isFumblePlay && !fumbleRecoveredByUs)
                            ? null
                            : gameState.ballOn + gameState.distance
                        }
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-slate-500">Or type:</span>
                        <input
                          type="number" inputMode="numeric" min={1} max={50}
                          placeholder="e.g. 35"
                          value={resultYardRaw}
                          onChange={e => {
                            setResultYardRaw(e.target.value);
                            const n = parseInt(e.target.value, 10);
                            if (!isNaN(n)) setResultYardLine(Math.max(1, Math.min(50, n)));
                          }}
                          className="input w-20 text-center text-sm font-black"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {/* On a blocked kick the number that matters is what
                            the recoverer did with it, so say so rather than
                            leaving a bare "Yards" to be guessed at. */}
                        <span className="text-[10px] text-slate-500">
                          {playType.id === "blocked_kick" ? "Return yards:" : "Yards:"}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="+7 or -2"
                          value={totalYardsRaw}
                          onChange={e => {
                            const nextValue = e.target.value;
                            setTotalYardsRaw(nextValue);
                            const parsed = parseInt(nextValue, 10);
                            if (!isNaN(parsed)) {
                              setResultFromTotalYards(parsed);
                            }
                          }}
                          onBlur={() => setTotalYardsRaw(String(yards))}
                          className="input w-24 text-center text-sm font-black"
                        />
                      </div>

                      <div className="text-xs text-slate-500 mt-3">
                        {yardLabel(gameState.ballOn)} → <span className="font-bold text-slate-300">{perspectiveSideTag(resultSide)} {resultYardLine}</span>
                        {" "}(<span className={yards > 0 ? "text-emerald-400" : yards < 0 ? "text-red-400" : ""}>{yards > 0 ? "+" : ""}{yards} yds</span>)
                      </div>
                      </>
                      )}
                    </>
                  )}
                </div>
              )}

              {needsResult && (
                <div>
                  <label className="label block mb-1.5">Result</label>
                  <div className="flex gap-2">
                    {(["pat", "two_pt"].includes(playType.id)
                      ? (["Good", "No Good", "Returned"] as const)
                      : (["Good", "No Good"] as const)
                    ).map(r => (
                      <button key={r} onClick={() => setResult(prev => prev === r ? "" : r)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                          result === r
                            ? r === "Good" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                              : r === "Returned" ? "border-orange-500 bg-orange-500/20 text-orange-400"
                              : "border-red-500 bg-red-500/20 text-red-400"
                            : "border-surface-border bg-surface-bg text-slate-500"
                        }`}>{r}</button>
                    ))}
                  </div>
                  {/* A block is discovered after you've already committed to
                      the kick, so it has to be reachable from here rather than
                      only as its own play type on the ST tab. This switches the
                      flow outright — the play must BE a blocked_kick by the
                      time it's written, or next_situation_source computes a
                      possession and spot the engine can't know. */}
                  {["fg", "pat"].includes(playType.id) && (
                    <button
                      onClick={() => {
                        const blocked = PLAY_TYPES.find(pt => pt.id === "blocked_kick");
                        if (!blocked) return;
                        setBlockedKickType(playType.id === "pat" ? "extra_point" : "field_goal");
                        setResult("");
                        setPlayTypeOverride(blocked);
                        // Roles change (kicker, blocker, recoverer), so restart
                        // the flow. The kicker already tagged keeps his tag.
                        setCurrentRoleIdx(0);
                        setStepIdx(0);
                      }}
                      className="mt-2 w-full py-2.5 rounded-xl text-sm font-black border-2 border-dashed border-red-500/50 bg-red-500/10 text-red-400"
                    >
                      Blocked
                    </button>
                  )}
                </div>
              )}

              {/* TD / First Down toggles. Not on a play where the ball hit
                  the ground - an incompletion scores nothing and moves no
                  chains, and offering the toggles invites a mis-tap that the
                  engine would then have to be argued out of. */}
              {!needsResult && !isDeadBall && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setIsTD(t => !t)}
                    className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                      isTD ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-surface-border bg-surface-bg text-slate-500"
                    }`}>TD</button>
                  <button onClick={() => setIsFirstDown(f => !f)}
                    className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all duration-200 cursor-pointer ${
                      isFirstDown ? "border-blue-500 bg-blue-500/20 text-blue-400" : "border-surface-border bg-surface-bg text-slate-500"
                    }`}>1st Down</button>
                </div>
              )}

              {/* Fumble recovery — drives possession */}
              {isFumblePlay && (
                <div>
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Recovered by</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setFumbleRecoveredByUs(false)}
                      className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all cursor-pointer ${
                        !fumbleRecoveredByUs ? "border-red-500 bg-red-500/20 text-red-400" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>
                      {gameState.possession === "us" ? oppName : progName} (turnover)
                    </button>
                    <button onClick={() => setFumbleRecoveredByUs(true)}
                      className={`py-2.5 rounded-xl text-sm font-black border-2 transition-all cursor-pointer ${
                        fumbleRecoveredByUs ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>
                      {gameState.possession === "us" ? progName : oppName} (kept)
                    </button>
                  </div>
                  {/* How far the recoverer carried it. Separate from the play's
                      own yardage: a sack is -7 to the QB whether or not the
                      recovery was returned 20 yards afterwards. */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-slate-500">Return yards:</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={fumbleReturnRaw}
                      onChange={e => setFumbleReturnRaw(e.target.value)}
                      className="input w-24 text-center text-sm font-black"
                    />
                    <span className="text-[10px] text-slate-600">by the recoverer</span>
                  </div>
                </div>
              )}

              {/* Penalty */}
              <button onClick={openPenaltyStep}
                className={`w-full py-2 rounded-xl text-xs font-bold border transition-all duration-200 ${
                  penalty ? "border-orange-500/50 bg-orange-500/10 text-orange-400" : "border-surface-border bg-surface-bg text-slate-500"
                }`}>
                <Flag className="w-3 h-3 inline mr-1" />
                {penalty ? `${penalty} · ${flagYards} yds` : "Add Penalty"}
              </button>

            </>
          )}

          {/* ── STEP: Penalty (penalty-only plays — this IS the play) ── */}
          {currentStep === "penalty" && (
            <>
              <div className="text-sm font-bold text-slate-300">
                What was the flag?
              </div>
              {/* The step serves two jobs now: a dead-ball flag, which IS the
                  play, and a live-ball flag on a play that also happened. The
                  line says which one you are on. */}
              <div className="text-[11px] text-slate-600 -mt-1">
                {isPenaltyOnly
                  ? "No snap counted, so there's nothing to tag or chart — just the flag."
                  : "The play is recorded as it happened; this is the flag on top of it."}
              </div>
              {penaltyPicker}

              {/* Backing out. A flag added by mistake would otherwise be stuck
                  in the flow, since the step only exists while there is one. */}
              {!isPenaltyOnly && (
                <button
                  onClick={() => { clearPenalty(); setShowPenalties(false); setStepIdx(i => Math.max(0, i - 1)); }}
                  className="w-full py-2 rounded-xl text-xs font-bold border border-surface-border bg-surface-bg text-slate-500"
                >
                  No flag after all — remove it
                </button>
              )}

              {/* ── Resulting spot ── */}
              {penalty && penaltyProjection && (
                <div className="card p-3 space-y-3 border border-surface-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Ball spotted at</span>
                    <span className="text-xs text-slate-600">
                      was {formatFieldSpot(gameState.ballOn, gameState.possession)}
                    </span>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-black tabular-nums text-emerald-400">
                      {formatFieldSpot(
                        overrideSpot ? overrideBallOn : penaltyProjection.ballOn,
                        gameState.possession,
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-400 mt-0.5">
                      {overrideSpot ? spotDown : penaltyProjection.down}
                      {" & "}
                      {overrideSpot ? spotDistance : penaltyProjection.distance}
                      {penaltyProjection.possession !== gameState.possession && (
                        <span className="text-orange-400"> · possession changes</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">
                      {overrideSpot ? "Your spot — overrides the computed enforcement" : "Computed from the penalty"}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const next = !overrideSpot;
                      if (next) {
                        // Seed from the computed result so a small correction
                        // is a nudge, not a re-entry.
                        seedSpotFromBallOn(penaltyProjection.ballOn);
                        setSpotDown(penaltyProjection.down);
                        setSpotDistance(penaltyProjection.distance);
                      }
                      setOverrideSpot(next);
                    }}
                    className={`w-full py-2 rounded-xl text-xs font-bold border-2 transition-all duration-200 ${
                      overrideSpot
                        ? "border-amber-500 bg-amber-500/15 text-amber-400"
                        : "border-surface-border bg-surface-bg text-slate-500"
                    }`}
                  >
                    {overrideSpot ? "Using my spot" : "Set the spot myself"}
                  </button>

                  {overrideSpot && (
                    <div className="space-y-3 pt-1">
                      <div>
                        <span className="text-xs text-slate-500 block mb-1">Ball on</span>
                        <div className="flex items-center gap-2">
                          {(["our", "opp"] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => setSpotSide(s)}
                              className={`px-3 py-2.5 rounded-xl text-xs font-black border-2 transition-all duration-200 ${
                                spotSide === s
                                  ? "border-amber-500 bg-amber-500/15 text-amber-400"
                                  : "border-surface-border bg-surface-bg text-slate-500"
                              }`}
                            >
                              {perspectiveSideTag(s)}
                            </button>
                          ))}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={50}
                            value={spotYardRaw}
                            onChange={e => {
                              const raw = e.target.value;
                              setSpotYardRaw(raw);
                              if (raw === "") return;
                              const n = Number(raw);
                              if (!Number.isNaN(n)) setSpotYardLine(Math.max(1, Math.min(50, n)));
                            }}
                            onBlur={() => setSpotYardRaw(String(spotYardLine))}
                            className="input flex-1 text-center text-sm font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-xs text-slate-500 block mb-1">Down</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map(d => (
                              <button
                                key={d}
                                onClick={() => setSpotDown(d)}
                                className={`flex-1 py-2 rounded-lg text-xs font-black border-2 transition-all duration-200 ${
                                  spotDown === d
                                    ? "border-amber-500 bg-amber-500/15 text-amber-400"
                                    : "border-surface-border bg-surface-bg text-slate-500"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 block mb-1">To go</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={99}
                            value={spotDistance}
                            onChange={e => setSpotDistance(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                            className="input w-full text-center text-sm font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── STEP: Formations ── */}
          {currentStep === "formations" && (
            <>
              <div>
                <label className="label block mb-1.5">Hash Mark</label>
                <div className="flex gap-2">
                  {(["left", "middle", "right"] as const).map(h => (
                    <button key={h} onClick={() => setHashMark(prev => prev === h ? null : h)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 capitalize transition-all duration-200 ${
                        hashMark === h ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>{h}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Play Direction</label>
                <div className="flex gap-2">
                  {(["left", "right"] as const).map(d => (
                    <button key={d} onClick={() => setPlayDirection(prev => prev === d ? null : d)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 capitalize transition-all duration-200 ${
                        playDirection === d ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary" : "border-surface-border bg-surface-bg text-slate-500"
                      }`}>{d}</button>
                  ))}
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  Offense left and right, the way the play was called.
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Wristband Call</label>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  placeholder="e.g. R42"
                  value={wristbandCall}
                  onChange={e => setWristbandCall(e.target.value.toUpperCase())}
                  className="input w-full text-center text-base font-black tracking-widest"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Offensive Formation</label>
                <div className="flex flex-wrap gap-1.5">
                  {OFFENSIVE_FORMATIONS.map(f => (
                    <button key={f} onClick={() => setOffFormation(prev => prev === f ? null : f)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                        offFormation === f ? "border-blue-500 bg-blue-500/15 text-blue-400" : "border-surface-border text-slate-500"
                      }`}>{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Defensive Formation</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFENSIVE_FORMATIONS.map(f => (
                    <button key={f} onClick={() => setDefFormation(prev => prev === f ? null : f)}
                      className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                        defFormation === f ? "border-red-500 bg-red-500/15 text-red-400" : "border-surface-border text-slate-500"
                      }`}>{f}</button>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-slate-600 text-center">
                Formations are optional — skip if not tracking.
              </div>
            </>
          )}

          {/* ── STEP: Defense (tacklers) ── */}
          {currentStep === "defense" && (
            <>
              <div className="text-xs text-slate-400 mb-1">
                Select up to 3 {playType.id === "sack" ? "sackers" : "tacklers"} from {tacklersAreOurs ? progName : oppName}.
                {" "}1 player = {playType.id === "sack" ? "full sack (1.0)" : "solo (1.0)"}, 2+ = {playType.id === "sack" ? "split (0.5 each)" : "assist (0.5 each)"}.
              </div>
              {/* Three outcomes, all one tap: name them, owe it to TEAM, or say
                  no tackle happened. Only the last two are here — naming is the
                  grid below. */}
              {tacklersAreOurs && tacklers.length === 0 && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setTacklers([{ ...makeTeamTag(defensiveCreditRole), credit: 1 }]); setSkipWarning(null); }}
                    className="flex-1 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-bold uppercase tracking-wide"
                  >
                    {playType.id === "sack" ? "Sack by TEAM" : "Tackle by TEAM"}
                  </button>
                  {/* A sack always had somebody get there — "no tackle" is only
                      an answer for a runner who went out of bounds, scored, or
                      fell down. */}
                  {playType.id !== "sack" && (
                    <button
                      onClick={() => { setNoTackle(true); setSkipWarning(null); goNext(); }}
                      className="flex-1 py-2 rounded-xl border border-surface-border bg-surface-bg text-slate-400 text-xs font-bold uppercase tracking-wide"
                    >
                      No tackle
                    </button>
                  )}
                </div>
              )}
              {tacklers.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {tacklers.map(t => (
                    <span key={t.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
                      t.isTeam
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                        : t.isOpponent ? "bg-orange-900/30 text-orange-400" : "bg-red-900/30 text-red-400"
                    }`}>
                      {t.isOpponent && <span className="text-[9px]">{oppTag}</span>}
                      {/* A TEAM tag has no jersey and no surname — the generic
                          chip would render "#null undefined". */}
                      {t.isTeam
                        ? "TEAM"
                        : `#${t.jersey_number ?? "?"} ${t.name.split(" ")[1] ?? t.name}`}
                      <span className="text-[10px] opacity-60">({t.credit})</span>
                      <button onClick={() => setTacklers(prev => {
                        const next = prev.filter(x => x.id !== t.id);
                        if (next.length === 1) return next.map(x => ({ ...x, credit: 1 }));
                        return next;
                      })} className="ml-0.5 opacity-60"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {tacklersAreOurs ? (
                <PlayerGrid
                  roster={roster}
                  label={`Select ${playType.id === "sack" ? "sacker" : "tackler"}(s) from ${progName}`}
                  onSelect={p => handleAddTackler(p)}
                  selectedId={null}
                  search={tacklerSearch}
                  onSearch={setTacklerSearch}
                  addedIds={new Set(tacklers.map(t => t.player_id))}
                />
              ) : (
                <OpponentPlayerGrid
                  players={localOppPlayers}
                  label={`Select ${oppName} tackler(s)`}
                  onSelect={p => handleAddOpponentTackler(p)}
                  selectedId={null}
                  search={tacklerSearch}
                  onSearch={setTacklerSearch}
                  onQuickAdd={handleQuickAddOpponent}
                  addedIds={new Set(tacklers.map(t => t.id))}
                />
              )}
              <div className="text-[10px] text-slate-600 text-center mt-2">
                Optional — skip if not tracking tacklers on this play.
              </div>
            </>
          )}

          {/* ── STEP: Review ── */}
          {currentStep === "review" && (
            <div className="space-y-3">
              <div className="text-sm font-bold text-slate-300">
                {isEditing ? "Review Changes" : "Review Play"}
              </div>

              {/* Scoreboard time at the snap. Pre-filled from the running
                  clock, so entering a play live costs nothing; correcting one
                  charted from film no longer means leaving the play. */}
              <div className="card p-3">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Clock at snap
                </div>
                <ClockInput
                  seconds={clockSecs}
                  onChange={setClockSecs}
                  maxSeconds={gameConfig.quarter_length_secs}
                />
              </div>
              <div className="card p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="font-bold">{playType.label}</span>
                </div>
                {tagged.map(t => (
                  <div key={t.role} className="flex justify-between">
                    <span className="text-slate-500 capitalize">{t.role}</span>
                    <span className="font-bold">
                      {t.isOpponent && <span className="text-red-400 text-[10px] mr-1">{oppTag}</span>}
                      {/* A TEAM tag has no jersey and no name of its own; the
                          generic line rendered it as "#null TEAM". */}
                      {t.isTeam || t.player_id === OPP_TEAM_PLAYER.id
                        ? "TEAM"
                        : `#${t.jersey_number ?? "?"} ${t.name}`}
                    </span>
                  </div>
                ))}
                {/* What is about to be filled in for us, before it happens
                    rather than in the play log afterwards. */}
                {teamDefaultRoles.map(role => (
                  <div key={`team-${role}`} className="flex justify-between">
                    <span className="text-slate-500 capitalize">{role}</span>
                    <span className="font-bold text-amber-400/80">
                      <span className="text-red-400 text-[10px] mr-1">{oppTag}</span>TEAM
                    </span>
                  </div>
                ))}
                {needsYards && (
                  <>
                    {isInterception ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Intercepted At</span>
                          <span className="font-bold">{fieldTeamTag(intCaughtTeam)} {intCaughtYardLine}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Returned To</span>
                          <span className="font-bold">{interceptionReturnLabel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Return Yards</span>
                          <span className={`font-bold ${interceptionReturnYards > 0 ? "text-emerald-400" : interceptionReturnYards < 0 ? "text-red-400" : ""}`}>
                            {interceptionReturnYards > 0 ? `+${interceptionReturnYards}` : interceptionReturnYards}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Net Yards</span>
                          <span className={`font-bold ${interceptionNetYards > 0 ? "text-emerald-400" : interceptionNetYards < 0 ? "text-red-400" : ""}`}>
                            {interceptionNetYards > 0 ? `+${interceptionNetYards}` : interceptionNetYards}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        {!isTD && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Spotted At</span>
                            <span className="font-bold">{perspectiveSideTag(resultSide)} {resultYardLine}</span>
                          </div>
                        )}
                        {(() => {
                          const displayYards = isTD
                            ? (["int", "fumble"].includes(playType.id) ? -gameState.ballOn : 100 - gameState.ballOn)
                            : yards;
                          return (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Yards</span>
                              <span className={`font-bold ${displayYards > 0 ? "text-emerald-400" : displayYards < 0 ? "text-red-400" : ""}`}>
                                {displayYards > 0 ? `+${displayYards}` : displayYards}
                              </span>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </>
                )}
                {isKickPlay && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kick Distance</span>
                      <span className="font-bold text-purple-400">{kickDistance} yds</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Landed At</span>
                      <span className="font-bold">{isTouchback ? "Touchback" : landingLabel}</span>
                    </div>
                    {!isTouchback && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Outcome</span>
                        <span className="font-bold text-purple-400">
                          {KICK_OUTCOMES.find(o => o.value === kickOutcome)?.label}
                        </span>
                      </div>
                    )}
                    {wasReturned && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Returned To</span>
                        <span className="font-bold text-emerald-400">
                          {(() => {
                            const sideLabel = fieldTeamTag(returnToTeam);
                            const isReceiverSide = returnToTeam === receivingFieldSide;
                            const receiverYard = isReceiverSide ? returnToYardLine : 100 - returnToYardLine;
                            const retYds = receiverYard - kickedToYard;
                            return `${sideLabel} ${returnToYardLine} (${retYds > 0 ? "+" : ""}${retYds} yds)`;
                          })()}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {needsResult && result && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Result</span>
                    <span className={`font-bold ${result === "Good" ? "text-emerald-400" : "text-red-400"}`}>{result}</span>
                  </div>
                )}
                {(isTD || isFirstDown) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Flags</span>
                    <span className="font-bold">
                      {[isTD && "TD", isFirstDown && "1st Down"].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {penalty && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Penalty</span>
                      <span className="font-bold text-orange-400">
                        {penalty}
                        {penaltyEnforcement === "accepted" ? ` (${flagYards} yds)` : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Flag On</span>
                      <span className={`font-bold capitalize ${penaltyCategory ? "text-orange-400" : "text-red-400"}`}>
                        {penaltyCategory ?? "Pick offense or defense"}
                      </span>
                    </div>
                    {penaltyEnforcement !== "accepted" && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Enforcement</span>
                        <span className="font-bold capitalize text-slate-300">{penaltyEnforcement}</span>
                      </div>
                    )}
                    {foulSpotBallOn != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Spot of Foul</span>
                        <span className="font-bold text-orange-400">
                          {formatFieldSpot(foulSpotBallOn, gameState.possession)}
                          {isSpotFoul(penalty) && (
                            <span className="text-[10px] text-amber-400/80"> · spot foul</span>
                          )}
                        </span>
                      </div>
                    )}
                    {penaltyProjection && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          Next Spot{overrideSpot ? " (yours)" : ""}
                        </span>
                        <span className={`font-bold ${overrideSpot ? "text-amber-400" : "text-emerald-400"}`}>
                          {formatFieldSpot(
                            overrideSpot ? overrideBallOn : penaltyProjection.ballOn,
                            gameState.possession,
                          )}
                          {" · "}
                          {overrideSpot ? spotDown : penaltyProjection.down}
                          {" & "}
                          {overrideSpot ? spotDistance : penaltyProjection.distance}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {offFormation && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">OFF</span>
                    <span className="font-bold">{offFormation}</span>
                  </div>
                )}
                {defFormation && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">DEF</span>
                    <span className="font-bold">{defFormation}</span>
                  </div>
                )}
                {tacklers.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tacklers</span>
                    <span className="font-bold">
                      {/* A TEAM tackle has no jersey and no name of its own,
                          and a tag rebuilt from the database may have no
                          number either. Bare interpolation printed "#null"
                          for both - which is what an edited play showed for
                          every tackler on it. */}
                      {tacklers.map(t => (
                        t.isTeam || t.player_id === OPP_TEAM_PLAYER.id
                          ? "TEAM"
                          : t.jersey_number != null
                            ? `#${t.jersey_number}`
                            : (t.name?.trim().split(/s+/).slice(-1)[0] || "?")
                      )).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="p-4 pt-2 border-t border-surface-border shrink-0">
          {/* Amber, because this is the same "not a confirmed pick" idea the
              rest of the modal uses — the play is about to be recorded with a
              role nobody filled in. One more tap on Next goes through. */}
          {skipWarning && (
            <div className="mb-2 px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-400/90 flex items-center justify-between gap-2">
              <span>
                No <span className="font-bold uppercase">{skipWarning.join(", ")}</span> tagged.
                {currentStep === "defense"
                  ? " TEAM if someone made it and you couldn't see who; None if he ran out of bounds or scored."
                  : " TEAM to credit the team and fix it in film review, or Next again to record it blank."}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={assignSkippedToTeam}
                  className="px-2.5 py-1 rounded-lg border border-amber-400/60 bg-amber-500/15 text-amber-300 font-black text-[11px] uppercase tracking-wide"
                >
                  TEAM
                </button>
                {currentStep === "defense" && playType.id !== "sack" && (
                  <button
                    onClick={() => { setNoTackle(true); setSkipWarning(null); goNext(); }}
                    className="px-2.5 py-1 rounded-lg border border-surface-border bg-surface-bg text-slate-400 font-bold text-[11px] uppercase tracking-wide"
                  >
                    None
                  </button>
                )}
                <button
                  onClick={() => {
                    setSkipWarning(null);
                    if (currentStep !== "defense") setCurrentRoleIdx(roles.indexOf(skipWarning[0]));
                  }}
                  className="text-amber-400 font-bold underline"
                >
                  Fill it
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
          {currentStep !== "review" ? (
            <>
              <button onClick={goBackFromButton} disabled={stepIdx === 0 && currentRoleIdx === 0} className="btn-ghost flex-1 py-2.5 text-sm font-bold disabled:opacity-30">
                <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
              </button>
              <button onClick={goNextFromButton} disabled={!canGoNext()} className="btn-primary flex-1 py-2.5 text-sm font-bold disabled:opacity-50">
                Next <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </>
          ) : (
            <>
              {isEditing && onDelete && (
                <button
                  onClick={() => {
                    if (window.confirm("Delete this play? Everything after it re-chains.")) onDelete();
                  }}
                  className="px-4 py-3 rounded-xl border-2 border-red-500/50 bg-red-500/10 text-red-400 text-sm font-black shrink-0"
                  title="Delete play"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={handleSubmit} disabled={!canGoNext()} className="btn-primary flex-1 py-3 text-sm font-black disabled:opacity-50">
                {isEditing ? "Save Changes" : "Record Play"}
              </button>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
