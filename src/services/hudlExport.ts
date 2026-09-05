import { findPlayTypeDef, yardLabel, type PlayRecord } from "@/components/game/types";
import type { PlayCharting } from "./chartingService";
import { resolveKickSpots } from "./kickSpots";

// Exact order and spelling from PlaylistData_2026-09-05.xlsx.
export const HUDL_COLUMNS = [
  "PLAY #", "ODK", "DN", "DIST", "HASH", "YARD LN", "PLAY TYPE", "RESULT", "GN/LS",
  "OFF FORM", "OFF PLAY", "OFF STR", "PLAY DIR", "QTR",
  "RUSHER_Jersey", "RUSHER_Name", "TACKLER1_Jersey", "TACKLER1_Name",
  "TACKLER2_Jersey", "TACKLER2_Name", "RETURNER_Jersey", "RETURNER_Name", "RET YARDS",
  "RECEIVER_Jersey", "RECEIVER_Name", "PASSER_Jersey", "PASSER_Name",
  "KICKER_Jersey", "KICKER_Name", "KICK YARDS", "INTERCEPTED BY_Jersey", "INTERCEPTED BY_Name",
  "RECOVERED BY_Jersey", "RECOVERED BY_Name", "PEN YARDS", "EFF", "PENALTY",
] as const;

export function hudlRow(p: PlayRecord, c?: PlayCharting): unknown[] {
  const pd = p.playData ?? {};
  const def = findPlayTypeDef(p.type);
  const kick = ["punt", "kickoff", "onside_kick", "fair_catch"].includes(p.type)
    ? resolveKickSpots({ ballOn: p.ballOn, playData: pd, description: p.description }) : null;
  const players = (roles: string[]) => p.tagged.filter(t => roles.includes(t.role));
  const pair = (roles: string[], index = 0, fallback = "") => {
    const t = players(roles)[index];
    return [t?.jersey_number ?? "", t?.name ?? fallback];
  };
  const result = [p.result, p.isTouchdown ? "TD" : "", p.turnover ? "TURNOVER" : "",
    p.isTouchback ? "TOUCHBACK" : ""].filter(Boolean).join("; ");
  return [
    p.sequence ?? "", def?.category === "special" && p.type !== "two_pt" ? "K" : p.possession === "us" ? "O" : "D",
    p.down || "", p.distance, c?.hash_mark ?? p.hashMark ?? "", yardLabel(p.ballOn),
    def?.label ?? p.type, result, p.yards,
    c?.offensive_formation ?? p.offensiveFormation ?? "", c?.play_call ?? pd.wristband_call ?? "",
    "", pd.play_direction ?? "", p.quarter,
    ...pair(["rusher"]), ...pair(["tackler", "sacker", "assist"]), ...pair(["tackler", "sacker", "assist"], 1),
    ...pair(["returner"]), kick?.returnYards ?? pd.interception_return_yards ?? pd.fumble_return_yards ?? "",
    ...pair(["receiver", "target"], 0, c?.receiver ?? ""), ...pair(["passer"], 0, c?.passer ?? ""),
    ...pair(["kicker", "punter"]), kick?.kickDistance ?? "", ...pair(["interceptor"]),
    ...pair(["recoverer", "fumble_recovery"]), p.penalty ? p.flagYards : "", "",
    p.penalty ? [p.penalty, p.penaltyEnforcement === "declined" ? "Declined" : p.penaltyEnforcement === "offset" ? "Offset" : ""].filter(Boolean).join("; ") : "",
  ];
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Text remains text when opened in Excel; negative numeric yardage stays numeric.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildHudlCsv(plays: PlayRecord[], charting: Record<string, PlayCharting>): string {
  // Preserve recorded numbering and every entry for the coach's manual clip alignment.
  return "\uFEFF" + [HUDL_COLUMNS, ...plays.map(p => hudlRow(p, charting[p.id]))]
    .map(row => row.map(csvCell).join(",")).join("\r\n");
}
