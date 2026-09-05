import { ArrowLeftRight } from "lucide-react";
import { Fragment, useMemo } from "react";
import { readableAccent } from "@/utils/teamColor";

interface Props {
  ballOn: number;
  ballPosition: number;
  firstDownPosition: number;
  possession: "us" | "them";
  ourEndZoneSide: "left" | "right";
  primaryColor: string;
  progName: string;
  oppName: string;
  progAbbr: string;
  oppAbbr: string;
  progLogoUrl?: string | null;
  oppLogoUrl?: string | null;
  oppColor: string;
  onFlipDirection?: () => void;
  /** When set, the playing surface becomes tappable and reports the display
   *  position (0–100, left→right on screen) that was tapped. */
  onPickSpot?: (displayPosition: number) => void;
  /** Shorter field, for use inside the play-entry sheet. */
  compact?: boolean;
}

/** Inverse of toWidgetPercent — widget-relative click → 0–100 field position. */
function fromWidgetPercent(widgetPercent: number) {
  const raw = ((widgetPercent - PLAYING_FIELD_START_PCT) * 100) / PLAYING_FIELD_WIDTH_PCT;
  return Math.max(0, Math.min(100, raw));
}

const YARD_NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];
const PLAYING_FIELD_START_PCT = 10;
const PLAYING_FIELD_WIDTH_PCT = 80;
const FIVE_YARD_LINES = Array.from({ length: 17 }, (_, index) => index * 5);

function toWidgetPercent(displayPercent: number) {
  const clamped = Math.max(0, Math.min(100, displayPercent));
  return PLAYING_FIELD_START_PCT + (clamped * PLAYING_FIELD_WIDTH_PCT) / 100;
}

function endZoneLabel(name: string, abbr: string) {
  return name.trim().length > 0 ? name.toUpperCase() : abbr;
}

/** Endzone watermark.
 *
 *  An `<img>` is a replaced element, so an absolutely-positioned one with
 *  `width/height: auto` takes its INTRINSIC size and ignores the opposing
 *  `right`/`bottom` — `inset-2` alone left a square logo hanging off the
 *  right edge of a 60px endzone, clipped by `overflow-hidden` down to a
 *  sliver. Explicit `w-full h-full` makes the box actually fill the endzone
 *  so `object-contain` has something to fit into. `mix-blend-screen` is also
 *  gone: a dark logo screened onto a dark team color renders as nothing. */
function EndZoneLogo({ url, name }: { url: string; name: string }) {
  return (
    <img
      src={url}
      alt={name}
      // A broken/expired storage URL should leave a clean endzone, not a
      // browser's broken-image glyph over the team name.
      onError={e => { e.currentTarget.style.display = "none"; }}
      className="absolute inset-0 w-full h-full object-contain p-1.5 opacity-50 pointer-events-none"
    />
  );
}

export default function FieldVisualizer({
  ballOn,
  ballPosition,
  firstDownPosition,
  possession,
  ourEndZoneSide,
  primaryColor,
  progName,
  oppName,
  progAbbr,
  oppAbbr,
  progLogoUrl,
  oppLogoUrl,
  oppColor,
  onFlipDirection,
  onPickSpot,
  compact = false,
}: Props) {
  const theirEndZoneSide = ourEndZoneSide === "left" ? "right" : "left";
  /* Whoever has the ball owns midfield, which makes the logo a possession cue
     as well as a landmark - one mark doing two jobs rather than another badge
     to read. Null when that team has no logo, and the field simply carries no
     midfield mark, as plenty of real ones do not. */
  const midfieldLogoUrl = (possession === "us" ? progLogoUrl : oppLogoUrl) ?? null;
  /* The 50 wears the same team's colour as the logo painted on it, so the two
     read as one landmark rather than two things happening at midfield.
     readableAccent because the turf is dark: a team that wears black would
     otherwise paint an invisible line on a dark green field, which is the
     opposite of the point. */
  const midfieldColor = readableAccent(possession === "us" ? primaryColor : oppColor);

  const ourEndZoneStyle = ourEndZoneSide === "left" ? { left: 0 } : { right: 0 };
  const theirEndZoneStyle = theirEndZoneSide === "left" ? { left: 0 } : { right: 0 };
  const ourLabelRotation = ourEndZoneSide === "left" ? "rotate-[-90deg]" : "rotate-90";
  const theirLabelRotation = theirEndZoneSide === "left" ? "rotate-[-90deg]" : "rotate-90";

  const yardTicks = useMemo(
    () => Array.from({ length: 99 }, (_, index) => index + 1).filter((yard) => yard % 5 !== 0),
    [],
  );

  const programEndZoneLabel = endZoneLabel(progName, progAbbr);
  const opponentEndZoneLabel = endZoneLabel(oppName, oppAbbr);

  return (
    <div
      className="rounded-2xl border border-surface-border p-2 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #111820, #0d1117)" }}
    >
      <div
        // Short field below lg: the pinned block has to give the play buttons
        // room on a phone, and 32 units of field is the cheapest 32 to find.
        className={`relative w-full ${compact ? "h-24" : "h-24 lg:h-32"} rounded-xl overflow-hidden`}
        style={{
          background: "linear-gradient(180deg, rgba(34, 94, 45, 0.98), rgba(19, 78, 36, 1))",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-white/65 z-[4]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/65 z-[4]" />

        {Array.from({ length: 20 }, (_, index) => {
          const left = index * 5;
          if (index % 2 !== 0) return null;

          return (
            <div
              key={`stripe-${index}`}
              className="absolute top-0 bottom-0 bg-white/[0.035]"
              style={{ left: `${toWidgetPercent(left)}%`, width: `${PLAYING_FIELD_WIDTH_PCT / 20}%` }}
            />
          );
        })}

        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...ourEndZoneStyle, background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
        >
          {progLogoUrl && <EndZoneLogo url={progLogoUrl} name={progName} />}
          <span
            className={`relative text-[9px] font-display font-extrabold text-white/88 uppercase tracking-[0.14em] whitespace-nowrap select-none ${ourLabelRotation}`}
          >
            {programEndZoneLabel}
          </span>
        </div>

        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...theirEndZoneStyle, background: `linear-gradient(135deg, ${oppColor}, ${oppColor}cc)` }}
        >
          {oppLogoUrl && <EndZoneLogo url={oppLogoUrl} name={oppName} />}
          <span
            className={`relative text-[9px] font-display font-extrabold text-white/88 uppercase tracking-[0.14em] whitespace-nowrap select-none ${theirLabelRotation}`}
          >
            {opponentEndZoneLabel}
          </span>
        </div>

        {/* Midfield logo, the way a real field carries one — and the reason
            the 50 is now findable at a glance rather than by counting tens.
            It belongs to whoever has the ball, so it doubles as a possession
            cue without adding another marker to read.

            Sized in PERCENTAGES of the field, so it scales with the widget
            from a phone's short field to a tablet's tall one without a
            breakpoint. Height is capped well inside the yard numbers, which
            sit at 14% from each edge, and width is capped so a wide wordmark
            cannot creep out over the 40s. Painted under the yard lines at
            z-[2], like paint under chalk, and low enough in opacity that the
            ball, the chains and the numbers all still read over it. */}
        {midfieldLogoUrl && (
          <img
            src={midfieldLogoUrl}
            alt=""
            aria-hidden
            onError={e => { e.currentTarget.style.display = "none"; }}
            className="absolute -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none select-none z-[2]"
            style={{
              left: `${toWidgetPercent(50)}%`,
              top: "50%",
              height: "46%",
              maxWidth: "12%",
              opacity: 0.32,
            }}
          />
        )}

        <div
          className="absolute top-0 bottom-0 z-[5]"
          style={{ left: `${PLAYING_FIELD_START_PCT}%`, width: 2, backgroundColor: "rgba(255,255,255,0.75)" }}
        />
        <div
          className="absolute top-0 bottom-0 z-[5]"
          style={{ left: `${PLAYING_FIELD_START_PCT + PLAYING_FIELD_WIDTH_PCT}%`, width: 2, backgroundColor: "rgba(255,255,255,0.75)" }}
        />

        {FIVE_YARD_LINES.map((yard) => {
          const left = toWidgetPercent(yard);
          const isGoalLine = yard === 0 || yard === 100;
          const isTenMultiple = yard % 10 === 0;
          /* Midfield was drawn exactly like the 40s and the 30s, so finding it
             meant counting. On a real field it is the one line you can always
             pick out; here it gets the width and the brightness to match. */
          const isFifty = yard === 50;

          return (
            <div
              key={`major-${yard}`}
              className="absolute top-0 bottom-0 z-[3]"
              style={{
                left: `${left}%`,
                width: isGoalLine ? 2 : isFifty ? 2.5 : isTenMultiple ? 1.5 : 1,
                backgroundColor: isGoalLine
                  ? "rgba(255,255,255,0.72)"
                  : isTenMultiple && !isFifty
                    ? "rgba(255,255,255,0.34)"
                    : isFifty
                      ? undefined
                      : "rgba(255,255,255,0.2)",
                ...(isFifty ? { background: midfieldColor, opacity: 0.9 } : {}),
              }}
            />
          );
        })}

        {yardTicks.map((yard) => {
          const left = toWidgetPercent(yard);

          return (
            <Fragment key={`tick-${yard}`}>
              <div className="absolute w-px bg-white/35 z-[4]" style={{ left: `${left}%`, top: 0, height: 7 }} />
              <div className="absolute w-px bg-white/35 z-[4]" style={{ left: `${left}%`, bottom: 0, height: 7 }} />
              <div className="absolute w-px bg-white/22 z-[4]" style={{ left: `${left}%`, top: "32%", height: 6 }} />
              <div className="absolute w-px bg-white/22 z-[4]" style={{ left: `${left}%`, bottom: "32%", height: 6 }} />
            </Fragment>
          );
        })}

        {FIVE_YARD_LINES.filter((yard) => yard !== 0 && yard !== 100).map((yard) => {
          const left = toWidgetPercent(yard);

          return (
            <Fragment key={`hash-${yard}`}>
              <div className="absolute w-px bg-white/30 z-[5]" style={{ left: `${left}%`, top: "32%", height: 6 }} />
              <div className="absolute w-px bg-white/30 z-[5]" style={{ left: `${left}%`, bottom: "32%", height: 6 }} />
            </Fragment>
          );
        })}

        {YARD_NUMBERS.map((num, index) => {
          const left = toWidgetPercent((index + 1) * 10);
          return (
            <Fragment key={`yard-number-${index}`}>
              <span
                className="absolute text-[8px] text-white/28 font-display font-bold -translate-x-1/2 select-none"
                style={{ left: `${left}%`, top: "14%" }}
              >
                {num}
              </span>
              <span
                className="absolute text-[8px] text-white/28 font-display font-bold -translate-x-1/2 rotate-180 select-none"
                style={{ left: `${left}%`, bottom: "14%" }}
              >
                {num}
              </span>
            </Fragment>
          );
        })}

        {firstDownPosition <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20"
            style={{
              left: `${toWidgetPercent(firstDownPosition)}%`,
              boxShadow: "0 0 7px rgba(245, 158, 11, 0.5)",
            }}
          />
        )}

        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full border-2 border-white/90 flex items-center justify-center text-[10px] font-display font-extrabold text-white"
          style={{
            left: `${toWidgetPercent(ballPosition)}%`,
            backgroundColor: possession === "us" ? primaryColor : oppColor,
            boxShadow: `0 0 16px ${possession === "us" ? `${primaryColor}88` : `${oppColor}88`}, 0 0 5px rgba(255,255,255,0.25)`,
          }}
        >
          {ballOn > 50 ? 100 - ballOn : ballOn}
        </div>

        {/* Tap-to-spot overlay. Sits above the field art but below the ball
            marker and the flip button so neither gets swallowed. Covers only
            the playing surface — the end zones aren't valid spots. */}
        {onPickSpot && (
          <div
            className="absolute top-0 bottom-0 z-[25] cursor-crosshair"
            style={{
              left: `${PLAYING_FIELD_START_PCT}%`,
              width: `${PLAYING_FIELD_WIDTH_PCT}%`,
            }}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width === 0) return;
              const localPct = ((event.clientX - rect.left) / rect.width) * 100;
              // localPct is already relative to the playing surface, so map it
              // back through the widget frame fromWidgetPercent expects.
              const widgetPct =
                PLAYING_FIELD_START_PCT + (localPct * PLAYING_FIELD_WIDTH_PCT) / 100;
              onPickSpot(Math.round(fromWidgetPercent(widgetPct)));
            }}
          />
        )}

        {onFlipDirection && (
          <button
            onClick={onFlipDirection}
            className="absolute bottom-1 right-[11%] z-30 p-1 rounded bg-black/45 text-white/60 active:text-white active:bg-black/65 transition-colors cursor-pointer"
            title="Swap field sides"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
