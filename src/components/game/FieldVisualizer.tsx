interface Props {
  ballOn: number;
  firstDownMarker: number;
  possession: "us" | "them";
  primaryColor: string;
}

export default function FieldVisualizer({ ballOn, firstDownMarker, possession, primaryColor }: Props) {
  return (
    <div className="card p-2 overflow-hidden">
      <div className="relative w-full h-14 rounded-lg overflow-hidden bg-emerald-900">
        {/* Yard lines */}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(yd => (
          <div key={yd} className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: `${yd}%` }} />
        ))}
        {/* Numbers */}
        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((num, i) => (
          <span key={i} className="absolute bottom-0.5 text-[8px] text-white/30 font-mono -translate-x-1/2"
            style={{ left: `${(i + 1) * 10}%` }}>{num}</span>
        ))}
        {/* First down marker */}
        {firstDownMarker <= 100 && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10" style={{ left: `${firstDownMarker}%` }} />
        )}
        {/* Ball */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white font-mono shadow-lg"
          style={{
            left: `${ballOn}%`,
            backgroundColor: possession === "us" ? primaryColor : "#6b7280",
            boxShadow: `0 0 10px ${possession === "us" ? primaryColor + "66" : "#6b728066"}`,
          }}
        >
          {ballOn > 50 ? 100 - ballOn : ballOn}
        </div>
      </div>
    </div>
  );
}
