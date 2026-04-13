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

  return (
    <div className="rounded-2xl border border-surface-border p-2 overflow-hidden" style={{ background: "linear-gradient(180deg, #111820, #0d1117)" }}>
      <div className="relative w-full h-16 rounded-lg overflow-hidden flex" style={{ background: "linear-gradient(180deg, #1a472a, #154023)" }}>
        {/* Our end zone */}
        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...ourEndZoneStyle, backgroundColor: primaryColor }}
        >
          <span className={`text-[9px] font-display font-extrabold text-white/80 uppercase tracking-tight whitespace-nowrap select-none ${ourLabelRotation}`}>
            {progAbbr}
          </span>
        </div>

        {/* Their end zone */}
        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...theirEndZoneStyle, backgroundColor: oppColor }}
        >
          <span className={`text-[9px] font-display font-extrabold text-white/80 uppercase tracking-tight whitespace-nowrap select-none ${theirLabelRotation}`}>
            {oppAbbr}
          </span>
        </div>

        {/* Yard lines */}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
          <div key={yd} className="absolute top-0 bottom-0 w-px bg-white/15" style={{ left: `${yd}%` }} />
        ))}

        {/* Yard numbers */}
        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((num, i) => (
          <span
            key={i}
            className="absolute bottom-0.5 text-[7px] text-white/25 font-display font-bold -translate-x-1/2"
            style={{ left: `${(i + 1) * 10}%` }}
          >
            {num}
          </span>
        ))}

        {/* Hash marks */}
        {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map(pct => (
          <div key={pct} className="absolute w-px h-1 bg-white/10" style={{ left: `${pct}%`, top: "30%" }} />
        ))}

        {/* First down marker */}
        {firstDownPosition <= 100 && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10" style={{ left: `${firstDownPosition}%`, boxShadow: "0 0 6px rgba(245, 158, 11, 0.4)" }} />
        )}

        {/* Ball */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full border-2 border-white/90 flex items-center justify-center text-[10px] font-display font-extrabold text-white"
          style={{
            left: `${ballPosition}%`,
            backgroundColor: possession === "us" ? primaryColor : oppColor,
            boxShadow: `0 0 12px ${possession === "us" ? `${primaryColor}80` : `${oppColor}80`}`,
          }}
        >
          {ballOn > 50 ? 100 - ballOn : ballOn}
        </div>
      </div>
    </div>
  );
}
