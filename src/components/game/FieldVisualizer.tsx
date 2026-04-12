import { Fragment, useCallback, useRef } from "react";
import { ArrowLeftRight } from "lucide-react";

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
  onFlipDirection?: () => void;
  onFieldTap?: (displayPercent: number) => void;
}

const YARD_NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];
const FIVE_YARD_LINES = [15, 25, 35, 45, 55, 65, 75, 85];
const TEN_YARD_LINES = [20, 30, 40, 50, 60, 70, 80];
const PLAYING_FIELD_START_PCT = 10;
const PLAYING_FIELD_WIDTH_PCT = 80;

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
  onFlipDirection,
  onFieldTap,
}: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const toWidgetPercent = useCallback((displayPercent: number) => (
    PLAYING_FIELD_START_PCT + (Math.max(0, Math.min(100, displayPercent)) * PLAYING_FIELD_WIDTH_PCT / 100)
  ), []);

  const handleFieldPointer = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!onFieldTap || !fieldRef.current) return;
    const rect = fieldRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    // Clamp to playing field (10%-90% of widget = 0-100 display yards)
    const displayPct = Math.max(0, Math.min(100, ((pct - 10) / 80) * 100));
    onFieldTap(displayPct);
  }, [onFieldTap]);
  const theirEndZoneSide = ourEndZoneSide === "left" ? "right" : "left";
  const ourEndZoneStyle = ourEndZoneSide === "left" ? { left: 0 } : { right: 0 };
  const theirEndZoneStyle = theirEndZoneSide === "left" ? { left: 0 } : { right: 0 };
  const ourLabelRotation = ourEndZoneSide === "left" ? "rotate-[-90deg]" : "rotate-90";
  const theirLabelRotation = theirEndZoneSide === "left" ? "rotate-[-90deg]" : "rotate-90";

  // 1-yard ticks: every yard in the playing field that isn't on a 5-yard line
  const yardTicks = Array.from({ length: 79 }, (_, i) => i + 11).filter(
    (yd) => yd % 5 !== 0
  );

  return (
    <div className="card p-2 overflow-hidden">
      <div
        ref={fieldRef}
        className="relative w-full h-28 rounded-lg overflow-hidden bg-emerald-800 cursor-pointer touch-none"
        onClick={handleFieldPointer}
        onTouchStart={handleFieldPointer}
      >
        {/* Sideline borders */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-white/50 z-[5]" />
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/50 z-[5]" />

        {/* Alternating grass stripes every 5 yards */}
        {Array.from({ length: 16 }, (_, i) => {
          const left = 10 + i * 5;
          if (i % 2 !== 0) return null;
          return (
            <div
              key={`grass-${i}`}
              className="absolute top-0 bottom-0 bg-white/[0.03]"
              style={{ left: `${left}%`, width: "5%" }}
            />
          );
        })}

        {/* Our end zone */}
        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...ourEndZoneStyle, backgroundColor: primaryColor }}
        >
          <span
            className={`text-[10px] font-black text-white/80 uppercase tracking-tight whitespace-nowrap select-none ${ourLabelRotation}`}
          >
            {progAbbr}
          </span>
        </div>

        {/* Their end zone */}
        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...theirEndZoneStyle, backgroundColor: oppColor }}
        >
          <span
            className={`text-[10px] font-black text-white/80 uppercase tracking-tight whitespace-nowrap select-none ${theirLabelRotation}`}
          >
            {oppAbbr}
          </span>
        </div>

        {/* Goal lines */}
        <div
          className="absolute top-0 bottom-0 z-[5]"
          style={{ left: "10%", width: 2, backgroundColor: "rgba(255,255,255,0.5)" }}
        />
        <div
          className="absolute top-0 bottom-0 z-[5]"
          style={{ left: "90%", width: 2, backgroundColor: "rgba(255,255,255,0.5)" }}
        />

        {/* 5-yard lines (full width, subtle) */}
        {FIVE_YARD_LINES.map((yd) => (
          <div
            key={`5yd-${yd}`}
            className="absolute top-0 bottom-0 w-px bg-white/15"
            style={{ left: `${yd}%` }}
          />
        ))}

        {/* 10-yard lines (full width, more visible) */}
        {TEN_YARD_LINES.map((yd) => (
          <div
            key={`10yd-${yd}`}
            className="absolute top-0 bottom-0 w-px bg-white/25"
            style={{ left: `${yd}%` }}
          />
        ))}

        {/* 1-yard tick marks at sidelines and hash positions */}
        {yardTicks.map((yd) => (
          <Fragment key={`tick-${yd}`}>
            {/* Top sideline tick */}
            <div
              className="absolute w-px bg-white/30"
              style={{ left: `${yd}%`, top: 0, height: 6 }}
            />
            {/* Bottom sideline tick */}
            <div
              className="absolute w-px bg-white/30"
              style={{ left: `${yd}%`, bottom: 0, height: 6 }}
            />
            {/* Upper hash tick */}
            <div
              className="absolute w-px bg-white/20"
              style={{ left: `${yd}%`, top: "34%", height: 5 }}
            />
            {/* Lower hash tick */}
            <div
              className="absolute w-px bg-white/20"
              style={{ left: `${yd}%`, bottom: "34%", height: 5 }}
            />
          </Fragment>
        ))}

        {/* 5-yard hash ticks (reinforced at hash positions) */}
        {FIVE_YARD_LINES.map((yd) => (
          <Fragment key={`5tick-${yd}`}>
            <div
              className="absolute w-px bg-white/25"
              style={{ left: `${yd}%`, top: "34%", height: 5 }}
            />
            <div
              className="absolute w-px bg-white/25"
              style={{ left: `${yd}%`, bottom: "34%", height: 5 }}
            />
          </Fragment>
        ))}

        {/* Yard numbers – upper row */}
        {YARD_NUMBERS.map((num, i) => (
          <span
            key={`num-t-${i}`}
            className="absolute text-[8px] text-white/25 font-bold -translate-x-1/2 select-none"
            style={{ left: `${(i + 1) * 10}%`, top: "16%" }}
          >
            {num}
          </span>
        ))}

        {/* Yard numbers – lower row (inverted) */}
        {YARD_NUMBERS.map((num, i) => (
          <span
            key={`num-b-${i}`}
            className="absolute text-[8px] text-white/25 font-bold -translate-x-1/2 rotate-180 select-none"
            style={{ left: `${(i + 1) * 10}%`, bottom: "16%" }}
          >
            {num}
          </span>
        ))}

        {/* First down marker */}
        {firstDownPosition <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20"
            style={{ left: `${toWidgetPercent(firstDownPosition)}%` }}
          />
        )}

        {/* Ball marker */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white font-mono"
          style={{
            left: `${toWidgetPercent(ballPosition)}%`,
            backgroundColor: possession === "us" ? primaryColor : oppColor,
            boxShadow: `0 0 16px ${
              possession === "us" ? `${primaryColor}88` : `${oppColor}88`
            }, 0 0 4px rgba(255,255,255,0.3)`,
          }}
        >
          {ballOn > 50 ? 100 - ballOn : ballOn}
        </div>

        {/* Flip direction button */}
        {onFlipDirection && (
          <button
            onClick={onFlipDirection}
            className="absolute bottom-1 right-[11%] z-30 p-1 rounded bg-black/40 text-white/50 active:text-white active:bg-black/60 transition-all duration-200 cursor-pointer hover:bg-black/50 hover:text-white/70"
            title="Flip field direction"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
