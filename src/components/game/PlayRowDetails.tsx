import { PLAY_TYPES, type PlayRecord } from "./types";

type RowPlay = Pick<PlayRecord, "type" | "possession" | "tagged" | "playData">;

export function OffensivePlayBadge({ play }: { play: RowPlay }) {
  const category = PLAY_TYPES.find(type => type.id === play.type)?.category;
  if (play.possession !== "us" || (category !== "run" && category !== "pass")) return null;
  return <span className="inline-block rounded border border-slate-500/60 px-1 py-px text-[9px] leading-tight font-bold uppercase tracking-wide text-slate-300">{category}</span>;
}

export function PlayTacklers({ play }: { play: RowPlay }) {
  const tacklers = (play.tagged ?? []).filter(tag =>
    (tag.role === "tackler" || tag.role === "sacker") && !tag.isOpponent);
  if (!tacklers.length) return null;
  return <div className="text-[10px] text-slate-300 mt-0.5 font-body whitespace-normal break-words">
    <span className="font-semibold">{play.type === "sack" ? "Sack: " : "Tkl: "}</span>
    {tacklers.map(tag => {
      const surname = tag.name.trim().split(/\s+/).slice(-1)[0] || tag.name;
      const label = tag.isTeam ? (tag.teamCreditConfirmed || play.playData?.team_tackle_confirmed === true ? "Team" : "Identify on film later") : `${tag.jersey_number != null ? `#${tag.jersey_number} ` : ""}${surname}`;
      return `${label}${tag.credit != null && tag.credit !== 1 ? ` (${tag.credit})` : ""}`;
    }).join(", ")}
  </div>;
}
