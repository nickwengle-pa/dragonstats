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
    <div className="card p-2 overflow-hidden">
      <div className="relative w-full h-16 rounded-lg overflow-hidden bg-emerald-900 flex">
        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...ourEndZoneStyle, backgroundColor: primaryColor }}
        >
          <span className={`text-[9px] font-black text-white/80 uppercase tracking-tight whitespace-nowrap select-none ${ourLabelRotation}`}>
            {progAbbr}
          </span>
        </div>

        <div
          className="absolute top-0 bottom-0 w-[10%] flex items-center justify-center z-10 overflow-hidden"
          style={{ ...theirEndZoneStyle, backgroundColor: oppColor }}
        >
          <span className={`text-[9px] font-black text-white/80 uppercase tracking-tight whitespace-nowrap select-none ${theirLabelRotation}`}>
            {oppAbbr}
          </span>
        </div>

        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
          <div key={yd} className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: `${yd}%` }} />
        ))}

        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((num, i) => (
          <span
            key={i}
            className="absolute bottom-0.5 text-[8px] text-white/30 font-mono -translate-x-1/2"
            style={{ left: `${(i + 1) * 10}%` }}
          >
            {num}
          </span>
        ))}

        {firstDownPosition <= 100 && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10" style={{ left: `${firstDownPosition}%` }} />
        )}

        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white font-mono shadow-lg"
          style={{
            left: `${ballPosition}%`,
            backgroundColor: possession === "us" ? primaryColor : oppColor,
            boxShadow: `0 0 10px ${possession === "us" ? `${primaryColor}66` : `${oppColor}66`}`,
          }}
        >
          {ballOn > 50 ? 100 - ballOn : ballOn}
        </div>
      </div>
    </div>
  );
}
