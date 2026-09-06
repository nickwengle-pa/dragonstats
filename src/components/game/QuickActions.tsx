import { useEffect, useState } from "react";
import { readableAccent } from "@/utils/teamColor";
import { PLAY_TYPES, type PlayCategory, type PlayTypeDef } from "./types";

/* The tabs ARE the four groups now. There used to be a second axis on top of
   the groups - ALL / OFF / ST filtering a stack of six categories - which
   meant two different questions ("which phase?" then "which group?") to reach
   one button, and the ST tab duplicated a group that already existed. One
   axis: pick the group, tap the play. */
type PhaseFilter = PlayCategory;

interface Props {
  onSelect: (pt: PlayTypeDef) => void;
  possession: "us" | "them";
  progName: string;
  oppName: string;
  suggestedPhase?: PhaseFilter;
  kickoffDue?: boolean;
  /** Current down — drives which buttons get the oversized hit target. */
  down?: number;
  /** Yards to go, shown alongside the down in the possession band. */
  distance?: number;
  /** Preformatted spot, e.g. "PM 25". Passed in rather than derived so the
   *  band and the scoreboard can never disagree about where the ball is. */
  spotLabel?: string;
  /** Phone only: opens the correction strip on the scoreboard. Hung off the
   *  spot rather than given its own row, because a row to reveal a row spends
   *  half of what it saves. */
  onToggleAdjust?: () => void;
  adjustOpen?: boolean;
  /** Ball spot (0-100, offense driving toward 100) — lets the fast path swap
   *  to conversion attempts near the goal line. */
  ballOn?: number;
  /** Team colors, so the band and the active phase tab wear the colors of
   *  whoever has the ball. */
  progColor?: string;
  oppColor?: string;
}

/** "2nd", "3rd" — for the down readout in the possession band. */
function ordinalDown(down: number): string {
  if (down === 1) return "1st";
  if (down === 2) return "2nd";
  if (down === 3) return "3rd";
  return `${down}th`;
}

/**
 * The fast path: the handful of plays you're most likely to need right now,
 * lifted OUT of the category groups and pinned to one fixed spot.
 *
 * This used to work by inflating buttons in place (col-span-2, taller) inside
 * whichever group they belonged to. Three problems with that:
 *   - it made the grid ragged, because a grid row sizes to its tallest item
 *     and the normal buttons beside it stretched to match;
 *   - it saved no scanning, since you still had to find the group first;
 *   - on 4th down the primaries were punt/fg, which live in the kicking and
 *     scoring groups — so if you tapped OFF to go for it, nothing was
 *     emphasized at all, on the highest-stakes down of the game.
 *
 * Hoisting them fixes all three: the groups below stay a uniform grid, the
 * fast path never moves, and it can offer plays from different categories
 * side by side (punt, field goal, and going for it).
 */
function fastPathIds(down: number | undefined, ballOn: number | undefined): string[] {
  // Keep common actions in the same place, even on fourth down or at the goal.
  // Special teams remain available in their fixed category tab.
  return ["rush", "pass_comp", "pass_inc", "sack"];
}

/** Column count per fast-path size. Literal class strings — Tailwind cannot
 *  see an interpolated `grid-cols-${n}`. Four wraps to 2x2 rather than
 *  squeezing four tall buttons across. */
const FAST_PATH_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2",
};

/* Fixed order, never reordered by possession. A tab that moves is a tab you
   have to look at; these need to be muscle memory by the second quarter. */
const PHASE_TABS: Array<{ value: PhaseFilter; label: string }> = [
  { value: "run", label: "Run" },
  { value: "pass", label: "Pass" },
  { value: "special", label: "ST" },
  { value: "penalty", label: "Pen" },
];

export default function QuickActions({
  onSelect,
  possession,
  progName,
  oppName,
  suggestedPhase,
  kickoffDue = false,
  down,
  distance,
  spotLabel,
  onToggleAdjust,
  adjustOpen,
  ballOn,
  progColor = "#dc2626",
  oppColor = "#6b7280",
}: Props) {
  const [phase, setPhase] = useState<PhaseFilter>(suggestedPhase ?? "run");
  const [manualOverride, setManualOverride] = useState(false);
  const specialPrompt = kickoffDue ? "kickoff" : down === 4 ? "punt" : null;

  useEffect(() => {
    if (!manualOverride && suggestedPhase) {
      setPhase(suggestedPhase);
    }
  }, [suggestedPhase, manualOverride]);

  // A manual filter choice sticks until possession changes (a genuinely new
  // context). Resetting on every suggestion change wiped the operator's pick
  // after each recorded play.
  useEffect(() => {
    setManualOverride(false);
  }, [possession]);

  // Enter ST once when a new kicking situation arrives, even if the operator
  // previously chose Run or Pass. They can still change tabs afterwards.
  useEffect(() => {
    setManualOverride(false);
    if (specialPrompt) setPhase("special");
  }, [specialPrompt, possession]);

  const grouped = PLAY_TYPES.reduce<Record<string, PlayTypeDef[]>>((acc, pt) => {
    (acc[pt.category] ??= []).push(pt);
    return acc;
  }, {});

  /* One group on screen at a time, in the order it is declared in PLAY_TYPES.
     The possession-based reordering that used to live here is gone with the
     ALL tab it existed for: it only ever changed which of six stacked groups
     came first, and there is no stack to reorder any more. */
  const visible = grouped[phase] ?? [];

  // Resolved to real play defs, in the order fastPathIds returns them, so an
  // id that no longer exists just drops out instead of rendering a blank.
  const fastPath = fastPathIds(down, ballOn)
    .map((id) => PLAY_TYPES.find((pt) => pt.id === id))
    .filter((pt): pt is PlayTypeDef => pt !== undefined && pt.category === phase);
  const spotlight = phase !== "penalty" && (specialPrompt === "punt" || phase === "special")
    ? PLAY_TYPES.find(pt => pt.id === specialPrompt) : undefined;
  const otherPlays = visible.filter(pt => pt.id !== spotlight?.id && !fastPath.some(primary => primary.id === pt.id));

  const offenseName = possession === "us" ? progName : oppName;
  const offenseColor = possession === "us" ? progColor : oppColor;
  /* The band's rule and its label are ink on a dark ground, so a team wearing
     black rendered them invisible. The dot and the active tab below keep the
     raw colour - they are fills, and a fill still reads as a shape. */
  const offenseAccent = readableAccent(offenseColor);

  return (
    <div className="space-y-3">
      {/* Possession band — the single most important fact on this card, and
          previously the least visible (small red text, and only when the
          opponent had the ball). Team-colored, always present, and it carries
          the phase filter so context and filter read as one block. Sticky so
          both stay reachable while the play groups scroll under them. */}
      <div
        className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 rounded-t-xl border-b"
        style={{
          background: `linear-gradient(180deg, ${offenseColor}26, #111820)`,
          borderColor: `${offenseAccent}59`,
        }}
      >
        {/* Tier 1 of the type scale: the situation is the one thing that has
            to be readable at arm's length, so it gets the only display size on
            the card. Everything else here is chrome around it. Whose ball it
            is stays small - the color already says that louder than text can. */}
        <div className="flex items-baseline gap-2 mb-2">
          <span
            className="w-2 h-2 rounded-full shrink-0 self-center"
            style={{ backgroundColor: offenseColor, boxShadow: `0 0 8px ${offenseColor}` }}
          />
          <span
            className="text-[10px] font-display font-bold uppercase tracking-[0.18em] truncate opacity-90 min-w-0"
            style={{ color: offenseAccent }}
          >
            {offenseName}
          </span>
          {down != null && distance != null && (
            <span className="ml-auto text-lg leading-none font-display font-black tabular-nums text-white shrink-0">
              {ordinalDown(down)}
              <span className="opacity-40 mx-0.5">&amp;</span>
              {distance}
            </span>
          )}
          {spotLabel && (
            onToggleAdjust ? (
              <button
                onClick={onToggleAdjust}
                className={`text-[11px] font-display font-bold tabular-nums shrink-0 underline decoration-dotted underline-offset-4 cursor-pointer ${
                  adjustOpen ? "text-amber-400 decoration-amber-400/60" : "text-white/50 decoration-white/25"
                }`}
                title="Correct the down, distance or spot"
              >
                {spotLabel}
              </button>
            ) : (
              <span className="text-[11px] font-display font-bold tabular-nums text-white/50 shrink-0">
                {spotLabel}
              </span>
            )
          )}
        </div>

        <div className="flex gap-1">
          {PHASE_TABS.map((tab) => (
            <button
              key={tab.value}
              aria-pressed={phase === tab.value}
              onClick={() => { setPhase(tab.value); setManualOverride(true); }}
              className={`flex-1 min-h-11 py-2 rounded-lg text-sm font-bold transition-colors border ${
                phase === tab.value
                  ? "text-white"
                  : "bg-surface-bg/60 text-surface-muted border-transparent active:bg-surface-hover"
              }`}
              style={phase === tab.value
                ? { backgroundColor: offenseColor, borderColor: offenseColor }
                : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {spotlight && <div className="space-y-1.5">
        <div className="text-xs font-bold text-slate-300">{specialPrompt === "kickoff" ? "Kickoff due" : "Fourth down · Special teams"}</div>
        <button onClick={() => onSelect(spotlight)} className="w-full min-h-24 rounded-lg border border-dragon-primary bg-dragon-primary/20 text-white text-2xl font-bold active:bg-dragon-primary/30"
          >{spotlight.label}</button>
      </div>}

      {/* Common plays within the selected category only. */}
      {fastPath.length > 0 && (
        <div className={`grid gap-1.5 ${FAST_PATH_COLS[fastPath.length] ?? "grid-cols-2"}`}>
          {fastPath.map((playType) => (
            <button
              key={`fast-${playType.id}`}
              onClick={() => onSelect(playType)}
              className="min-h-16 px-3 py-4 rounded-lg text-sm font-bold border border-surface-border bg-surface-bg text-slate-200 transition-colors hover:bg-surface-hover active:bg-surface-hover"
            >
              {playType.label}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {otherPlays.map((playType) => (
            <button
              key={playType.id}
              onClick={() => onSelect(playType)}
              className="min-h-11 px-3 py-2 rounded-lg text-sm font-bold border border-surface-border bg-surface-bg text-slate-200 transition-colors hover:bg-surface-hover active:bg-surface-hover"
            >
              {playType.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
