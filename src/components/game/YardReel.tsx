import { useRef, useState } from "react";

interface Props {
  /** Current spot, possession-relative (0 = offense's own goal line, 100 = theirs). */
  value: number;
  onChange: (ballOn: number) => void;
  /** Which way the offense drives on screen, so downfield sits on the right side. */
  offenseDirection: "left" | "right";
  /** Full spot label for the centre readout, e.g. "OPP 30". */
  formatSpot: (ballOn: number) => string;
  accentColor: string;
  /** Where the chains are, possession-relative. Draws the marker on the ruler
   *  and says whether the spot under it actually moves them. Omitted on the
   *  plays where a first down is not the question. */
  firstDownBallOn?: number | null;
  /**
   * Who is carrying the ball, which decides which way "downfield" points.
   *
   * The offense advances by INCREASING ballOn; a returner runs the other way
   * and advances by decreasing it. So on a kick return or an interception the
   * arrow and the nudge buttons have to invert, or plus five moves the ball
   * five yards back down the field he just came up.
   *
   * Note this does NOT touch the screen mapping, which stays tied to
   * offenseDirection. The reel sits directly under a picture of the field and
   * the two have to agree: flipping the mapping would mean dragging right
   * moved the ball left on the field above it.
   */
  advancing?: "offense" | "returner";
}

/** Blue - same as the 1st Down toggle and the chain marker on the field. */
const FIRST_DOWN_COLOR = "#3b82f6";

/**
 * Pitch between yard lines, in pixels — and therefore also the drag distance
 * that advances one yard. These MUST be the same number: if the strip slides a
 * different distance than the ticks are spaced, the numbers appear to lag the
 * finger and the whole thing reads as broken.
 */
const YARD_PITCH_PX = 40;
/** Yard lines shown either side of the selection. */
const NEIGHBOURS = 3;

const clampSpot = (n: number) => Math.max(1, Math.min(99, n));

/**
 * The yard number as painted on a real field: counts up to the 50 and back
 * down again. ballOn is measured from the offense's own goal line, so this is
 * just a fold about midfield.
 */
function yardNumber(ballOn: number) {
  return ballOn <= 50 ? ballOn : 100 - ballOn;
}

/**
 * Ruler-style spot picker, tape-measure metaphor: the strip of yard lines
 * follows your finger and the fixed centre marker reads whatever slides under
 * it. Drag right and you pull the tape right, revealing the yard lines that
 * were off to its left — so the spot moves left.
 *
 * The strip is laid out in SCREEN order, and screen position already accounts
 * for which way the offense is driving. So when the offense goes right-to-left,
 * downfield yardage is to the left and the ruler counts up leftward, mirroring
 * the field. An arrow marks the downfield end so this is never a guess.
 *
 * Neighbouring yard lines are tappable, which covers the small corrections the
 * old −1/+1 buttons handled without needing the buttons back.
 */
export default function YardReel({
  value, onChange, offenseDirection, formatSpot, accentColor, firstDownBallOn,
  advancing = "offense",
}: Props) {
  /* +1 means "one yard further for whoever is carrying it". For the offense
     that is ballOn up; for a returner it is ballOn down. */
  const advanceSign = advancing === "returner" ? -1 : 1;
  // Sub-yard drag remainder, purely for smooth motion between snap points.
  const [offsetPx, setOffsetPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startDisplay: number } | null>(null);
  // True once a real drag happened — blocks the stray click the browser fires
  // on release, which would otherwise stomp the dragged value with whatever
  // neighbor tick the finger happened to end on.
  const moved = useRef(false);

  // Screen-space position, 0 = left edge of the field. Its own inverse.
  const toDisplay = (ballOn: number) => (offenseDirection === "right" ? ballOn : 100 - ballOn);
  const displayValue = toDisplay(value);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startDisplay: displayValue };
    moved.current = false;
    setDragging(true);
    setOffsetPx(0);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.startX;
    if (Math.abs(dx) > 8) moved.current = true;
    const yards = Math.round(dx / YARD_PITCH_PX);
    // Tape-measure feel: the RULER follows the finger, so the strip slides with
    // the drag and the marker reads whatever slides under it. Pull the tape
    // right and you reveal the yard lines to its left, so the spot moves left.
    // offset = dx − yards*pitch keeps each tick continuous across snap points.
    setOffsetPx(dx - yards * YARD_PITCH_PX);

    const nextDisplay = clampSpot(drag.current.startDisplay - yards);
    const next = toDisplay(nextDisplay); // involution, back to possession-relative
    if (next !== value) onChange(next);
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
    setOffsetPx(0);
  };

  // Rendered wider than the visible window so ticks slide in already drawn
  // rather than popping in at the edges mid-drag.
  const rendered = NEIGHBOURS + 2;
  const ticks = Array.from({ length: rendered * 2 + 1 }, (_, i) => {
    const step = i - rendered;
    const tickDisplay = displayValue + step;
    return {
      step,
      ballOn: tickDisplay < 1 || tickDisplay > 99 ? null : toDisplay(tickDisplay),
    };
  });

  // Downfield is whichever screen edge the BALL CARRIER is running toward -
  // the offense on a scrimmage play, the returner on a kick or a pick.
  const downfieldOnRight = advancing === "returner"
    ? offenseDirection === "left"
    : offenseDirection === "right";

  /* Stopped a yard short is a different play from converting, and the ruler gave
     no way to see which one was about to be recorded - the distance had to be
     carried across from the readout above. Reaching the marker IS the first
     down, so at-or-past converts. Goal-to-go has no marker short of the end
     zone, so it draws none. */
  const chainsShown = firstDownBallOn != null && firstDownBallOn < 100;
  const chains = firstDownBallOn ?? 0;
  const convertsFirstDown = chainsShown && value >= chains;
  const yardsToGo = chains - value;

  return (
    <div className="select-none">
      <div
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // touch-action:none stops the sheet from scrolling under the drag.
        style={{ touchAction: "none", width: "100%" }}
        className={`relative h-20 rounded-xl bg-surface-bg border border-surface-border overflow-hidden ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* Centre marker — the selection always sits here. */}
        <div
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 rounded-lg pointer-events-none z-10"
          style={{
            width: YARD_PITCH_PX,
            backgroundColor: `${convertsFirstDown ? FIRST_DOWN_COLOR : accentColor}22`,
            border: `2px solid ${convertsFirstDown ? FIRST_DOWN_COLOR : accentColor}`,
          }}
        />

        {/* Which way is downfield. Without this the mirrored yard numbers past
            midfield are genuinely ambiguous. */}
        <div
          className={`absolute top-1 z-20 text-[9px] font-display font-bold uppercase tracking-widest text-slate-500 pointer-events-none ${
            downfieldOnRight ? "right-2" : "left-2"
          }`}
        >
          {downfieldOnRight ? "Downfield →" : "← Downfield"}
        </div>

        <div
          className="absolute inset-0 flex items-center"
          style={{
            // Centre the middle tick, then apply the sub-yard drag remainder.
            left: "50%",
            transform: `translateX(calc(-50% + ${offsetPx}px))`,
            transition: dragging ? "none" : "transform 120ms ease-out",
            width: (rendered * 2 + 1) * YARD_PITCH_PX,
          }}
        >
          {ticks.map(({ step, ballOn }) => {
            const isChains = chainsShown && ballOn != null && ballOn === chains;
            const pastChains = chainsShown && ballOn != null && ballOn >= chains;
            return (
            <div
              key={step}
              onClick={() => { if (ballOn != null && step !== 0 && !moved.current) onChange(ballOn); }}
              className="relative shrink-0 flex flex-col items-center justify-center gap-1"
              style={{ width: YARD_PITCH_PX }}
            >
              {/* The chains themselves - a full-height line through the ruler,
                  reading the same way as the marker on the field above it. */}
              {isChains && (
                <span
                  className="absolute top-0 bottom-0 w-0.5 pointer-events-none opacity-70"
                  style={{ backgroundColor: FIRST_DOWN_COLOR }}
                />
              )}
              {ballOn == null ? (
                <span className="text-lg font-black text-slate-800">·</span>
              ) : (
                <>
                  <span
                    className={`relative font-display font-black tabular-nums leading-none ${
                      step === 0 ? "text-2xl" : Math.abs(step) === 1 ? "text-base text-slate-400" : "text-sm text-slate-600"
                    }`}
                    style={
                      step === 0
                        ? { color: convertsFirstDown ? FIRST_DOWN_COLOR : accentColor }
                        : pastChains
                          ? { color: FIRST_DOWN_COLOR, opacity: Math.abs(step) === 1 ? 0.9 : 0.6 }
                          : undefined
                    }
                  >
                    {yardNumber(ballOn)}
                  </span>
                  <span
                    className={`relative w-px ${step === 0 ? "h-4" : "h-2.5"}`}
                    style={{
                      backgroundColor: step === 0
                        ? (convertsFirstDown ? FIRST_DOWN_COLOR : accentColor)
                        : "rgba(255,255,255,0.25)",
                    }}
                  />
                </>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Quick nudges. Dragging is best for "somewhere around the 30"; these
          are for "exactly 5 more" without hunting for the tick. Yardage here
          is GAIN for whoever has the ball, not screen direction — +1 always
          moves it further downfield for him, whichever way he is running. */}
      <div className="flex items-center gap-1.5 mt-2">
        {[-5, -1].map((delta) => (
          <button
            key={delta}
            onClick={() => onChange(clampSpot(value + delta * advanceSign))}
            className="btn-ghost flex-1 h-11 text-sm font-bold"
          >
            {delta}
          </button>
        ))}
        <span
          className="flex-1 text-center text-sm font-display font-black tabular-nums"
          style={{ color: convertsFirstDown ? FIRST_DOWN_COLOR : accentColor }}
        >
          {formatSpot(value)}
        </span>
        {[1, 5].map((delta) => (
          <button
            key={delta}
            onClick={() => onChange(clampSpot(value + delta * advanceSign))}
            className="btn-ghost flex-1 h-11 text-sm font-bold"
          >
            +{delta}
          </button>
        ))}
      </div>

      {/* Which side of the sticks this spot is on, in words. "Short by 1" is the
          call that has to be right and the one hardest to eyeball from two yard
          numbers while the next play is being signalled in. */}
      {chainsShown && (
        <div
          className={`mt-2 rounded-lg px-2 py-1.5 text-center text-[11px] font-display font-black uppercase tracking-wide ${
            convertsFirstDown
              ? "border border-blue-500/50 bg-blue-500/15 text-blue-400"
              : "border border-surface-border bg-surface-bg text-slate-500"
          }`}
        >
          {convertsFirstDown ? "1st Down" : `Short by ${yardsToGo}`}
        </div>
      )}

      <div className="text-[10px] text-slate-600 text-center mt-1">
        Drag the ruler, tap a yard line, or nudge
      </div>
    </div>
  );
}
