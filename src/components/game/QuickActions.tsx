import { useEffect, useState } from "react";
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
  // Inside the opponent's 3, a conversion attempt is far likelier than a snap.
  if (ballOn != null && ballOn >= 97) return ["pat", "two_pt"];
  // 4th: the actual decision is punt / kick it / go for it. "Go for it" isn't
  // a play type, so we surface both ways of going for it.
  if (down === 4) return ["punt", "fg", "rush", "pass_comp"];
  return ["rush", "pass_comp", "pass_inc"];
}

/**
 * Play-button palette: turf, chalk, gold, steel, ember.
 *
 * The old one was Tailwind's defaults - emerald #34d399, blue #60a5fa, purple
 * #c084fc - which is mint, sky and lavender, and reads as generic because it
 * is the palette every framework ships and every dashboard uses. Purple in
 * particular has nothing to do with football.
 *
 * These are drawn from what you are actually looking at on a Friday night:
 * turf, the chalk of the lines, the gold of a scoreboard bulb, the grey steel
 * of the uprights, the rust of an alarm. Hex rather than Tailwind families,
 * because escaping the default families is the whole point.
 *
 * Each entry is {fill, ink, edge}. Fill stays near-black so the buttons remain
 * dark under stadium light; the ink carries the identity.
 */
interface PlayHue { fill: string; ink: string; edge: string; }

const PLAY_HUES: Record<string, PlayHue> = {
  // Turf. Deeper and greyer than mint - a real field is not a highlighter.
  emerald: { fill: "#131a12", ink: "#8fb96a", edge: "#2f4426" },
  // Chalk. The lines on the grass; reads as bright without belonging to a hue.
  blue:    { fill: "#16171a", ink: "#d8d3c6", edge: "#3d3f45" },
  // Ember, for what went wrong.
  red:     { fill: "#1c1210", ink: "#e0714b", edge: "#4d2519" },
  // Scoreboard gold.
  amber:   { fill: "#1b1710", ink: "#e0aa3c", edge: "#4a3a18" },
  // Steel of the uprights. This replaces purple outright.
  purple:  { fill: "#14171a", ink: "#93a7b8", edge: "#33404b" },
  // Rust, a shade off the ember so a turnover is not mistaken for an incompletion.
  orange:  { fill: "#1d1510", ink: "#d4894a", edge: "#4f3320" },
  // Sand.
  yellow:  { fill: "#1a1810", ink: "#c4ad72", edge: "#453d24" },
  neutral: { fill: "#15161a", ink: "#8b8f96", edge: "#2e3138" },
};

function hueStyle(color: string): React.CSSProperties {
  const h = PLAY_HUES[color] ?? PLAY_HUES.neutral;
  return { backgroundColor: h.fill, color: h.ink, borderColor: h.edge };
}

const CATEGORY_LABELS: Record<PlayCategory, string> = {
  run: "Run",
  pass: "Pass",
  special: "ST",
  penalty: "Pen",
};

/** Rail color per group, matched to the play-button color family inside it. */
const CATEGORY_ACCENT: Record<PlayCategory, string> = {
  run: PLAY_HUES.emerald.ink,   // turf
  pass: PLAY_HUES.blue.ink,     // chalk
  special: PLAY_HUES.amber.ink, // scoreboard gold
  penalty: PLAY_HUES.yellow.ink, // sand — the flag on the grass
};

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
    .filter((pt): pt is PlayTypeDef => pt !== undefined);

  const offenseName = possession === "us" ? progName : oppName;
  const offenseColor = possession === "us" ? progColor : oppColor;

  return (
    <div className="space-y-3">
      {/* Possession band — the single most important fact on this card, and
          previously the least visible (small red text, and only when the
          opponent had the ball). Team-colored, always present, and it carries
          the phase filter so context and filter read as one block. Sticky so
          both stay reachable while the play groups scroll under them. */}
      <div
        className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 rounded-t-[4px] border-b"
        style={{
          background: `linear-gradient(180deg, ${offenseColor}26, #111820)`,
          borderColor: `${offenseColor}59`,
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
            style={{ color: offenseColor }}
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
              onClick={() => { setPhase(tab.value); setManualOverride(true); }}
              className={`flex-1 py-2 rounded-[3px] text-[11px] font-display font-black uppercase tracking-wider transition-colors border-2 ${
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

      {/* Fast path — always in the same place, whatever tab or group these
          plays would otherwise live in. On 4th that means punt, field goal,
          AND both ways of going for it, side by side. */}
      {fastPath.length > 0 && (
        <div className={`grid gap-1.5 ${FAST_PATH_COLS[fastPath.length] ?? "grid-cols-2"}`}>
          {fastPath.map((playType) => (
            <button
              key={`fast-${playType.id}`}
              onClick={() => onSelect(playType)}
              /* rounded-[3px], not rounded-xl. A 12px radius on a small dark
                 button is what makes it read as a phone-app pill; near-square
                 corners read as instrumentation, which is what this is. */
              className="py-5 px-1 rounded-[3px] text-sm font-display font-black border-2 transition-all active:scale-95 cursor-pointer uppercase tracking-wide ring-1 ring-inset ring-white/5"
              style={hueStyle(playType.color)}
            >
              {playType.label}
            </button>
          ))}
        </div>
      )}

      {/* No group header here: the active tab already names the group, and a
          heading that repeats the control above it is the kind of thing that
          made this screen feel busy in the first place. The rail keeps the
          group's color. */}
      <div className="border-l-[3px] pl-2.5" style={{ borderColor: CATEGORY_ACCENT[phase] }}>
        <div className="grid grid-cols-4 gap-1.5">
          {visible.map((playType) => (
            <button
              key={playType.id}
              onClick={() => onSelect(playType)}
              // A quarter of a 375px row is ~62px; "ENCROACHMENT" needs
              // the smaller type and tighter padding to sit inside it.
              className="px-0.5 lg:px-1 py-2.5 rounded-[3px] text-[10px] lg:text-[11px] font-display font-bold border transition-all active:scale-95 cursor-pointer uppercase tracking-wide"
              style={hueStyle(playType.color)}
            >
              {playType.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}