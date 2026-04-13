import { Fragment, useMemo } from "react";

interface Props {
  ballOn: number;
  ballPosition: number;
  firstDownPosition: number;
  possession: "us" | "them";
  ourEndZoneSide: "left" | "right";
  primaryColor: string;
  progAbbr: string;
  oppAbbr: string;
  oppColor: string;
}

const YARD_NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];
const PLAYING_FIELD_START_PCT = 10;
const PLAYING_FIELD_WIDTH_PCT = 80;
const FIVE_YARD_LINES = Array.from({ length: 17 }, (_, index) => index * 5);

function toWidgetPercent(displayPercent: number) {
  const clamped = Math.max(0, Math.min(100, displayPercent));
  return PLAYING_FIELD_START_PCT + (clamped * PLAYING_FIELD_WIDTH_PCT) / 100;
}

export default function FieldVisualizer({
  ballOn,
  ballPosition,
  firstDownPosition,
  possession,
  ourEndZoneSide,
  primaryColor,
  progAbbr,
  oppAbbr,
  oppColor,
}: Props) {
  const theirEndZoneSide = ourEndZoneSide === "left" ? "right" : "left";
  const ourEndZoneStyle = ourEndZoneSide === "left" ? { left: 0 } : { right: 0 };
  const theirEndZoneStyle = theirEndZoneSide === "left" ? { left: 0 } : { right: 0 };
  const ourLabelRotation = ourEndZoneSide === "left" ? "rotate-[-90deg]" : "rotate-90";
  const theirLabelRotation = theirEndZoneSide === "left" ? "rotate-[-90deg]" : "rotate-90";

  const yardTicks = useMemo(
    () =>
      Array.from({ length: 99 }, (_, index) => index + 1).filter(
        (yard) => yard % 5 !== 0,
      ),
    [],
  );

  return (
    <div
      className="rounded-2xl border border-surface-border p-2 overflow-hidden"
      style={{ background: "linear-gradient(180deg, #111820, #0d1117)" }}
    >
      <div
        className="relative w-full h-32 rounded-xl overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(34, 94, 45, 0.98), rgba(19, 78, 36, 1))",
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
          <span
            className={`text-[11px] font-display font-extrabold text-white/85 uppercase tracking-[0.18em] whitespace-nowrap select-none ${ourLabelRotation}`}
          >
            {progAbbr}
          </span>
        </div>

        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...theirEndZoneStyle, background: `linear-gradient(135deg, ${oppColor}, ${oppColor}cc)` }}
        >
          <span
            className={`text-[11px] font-display font-extrabold text-white/85 uppercase tracking-[0.18em] whitespace-nowrap select-none ${theirLabelRotation}`}
          >
            {oppAbbr}
          </span>
        </div>

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

          return (
            <div
              key={`major-${yard}`}
              className="absolute top-0 bottom-0 z-[3]"
              style={{
                left: `${left}%`,
                width: isGoalLine ? 2 : isTenMultiple ? 1.5 : 1,
                backgroundColor: isGoalLine
                  ? "rgba(255,255,255,0.72)"
                  : isTenMultiple
                    ? "rgba(255,255,255,0.34)"
                    : "rgba(255,255,255,0.2)",
              }}
            />
          );
        })}

        {yardTicks.map((yard) => {
          const left = toWidgetPercent(yard);

          return (
            <Fragment key={`tick-${yard}`}>
              <div
                className="absolute w-px bg-white/35 z-[4]"
                style={{ left: `${left}%`, top: 0, height: 7 }}
              />
              <div
                className="absolute w-px bg-white/35 z-[4]"
                style={{ left: `${left}%`, bottom: 0, height: 7 }}
              />
              <div
                className="absolute w-px bg-white/22 z-[4]"
                style={{ left: `${left}%`, top: "32%", height: 6 }}
              />
              <div
                className="absolute w-px bg-white/22 z-[4]"
                style={{ left: `${left}%`, bottom: "32%", height: 6 }}
              />
            </Fragment>
          );
        })}

        {FIVE_YARD_LINES.filter((yard) => yard !== 0 && yard !== 100).map((yard) => {
          const left = toWidgetPercent(yard);

          return (
            <Fragment key={`hash-${yard}`}>
              <div
                className="absolute w-px bg-white/30 z-[5]"
                style={{ left: `${left}%`, top: "32%", height: 6 }}
              />
              <div
                className="absolute w-px bg-white/30 z-[5]"
                style={{ left: `${left}%`, bottom: "32%", height: 6 }}
              />
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
            boxShadow: `0 0 16px ${
              possession === "us" ? `${primaryColor}88` : `${oppColor}88`
            }, 0 0 5px rgba(255,255,255,0.25)`,
          }}
        >
          {ballOn > 50 ? 100 - ballOn : ballOn}
        </div>
      </div>
    </div>
  );
}
