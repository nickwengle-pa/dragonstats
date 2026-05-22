/**
 * CSV export helpers for game and season stats.
 * Browser-only: builds a Blob and triggers a download via a hidden anchor.
 */

import type { GameSummary } from "football-stats-engine";
import type { PlayerGameLine } from "./statsService";

/** RFC 4180-ish escape: wrap in quotes if the value contains comma / quote / newline. */
function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ExportGameOptions {
  filename: string;
  programName: string;
  opponentName: string;
  gameDate?: string;
}

/**
 * One CSV file with sections for each stat category. Each section is a header
 * row + per-player rows.
 */
export function exportGameSummaryCsv(summary: GameSummary, opts: ExportGameOptions) {
  const rows: Array<Array<unknown>> = [];
  const meta: Array<Array<unknown>> = [
    ["Game", `${opts.programName} vs ${opts.opponentName}`],
    ["Date", opts.gameDate ?? ""],
    [],
  ];
  rows.push(...meta);

  // Passing
  rows.push(["PASSING"]);
  rows.push(["Player", "CMP", "ATT", "YDS", "TD", "INT", "Sack", "Long", "Rating"]);
  for (const p of Object.values(summary.passing ?? {})) {
    rows.push([
      p.playerName ?? p.playerId,
      p.completions,
      p.attempts,
      p.yards,
      p.touchdowns,
      p.interceptions,
      p.sacks,
      p.longPass,
      p.passerRating?.toFixed(1) ?? "",
    ]);
  }
  rows.push([]);

  // Rushing
  rows.push(["RUSHING"]);
  rows.push(["Player", "CAR", "YDS", "AVG", "TD", "Long", "Fumbles"]);
  for (const r of Object.values(summary.rushing ?? {})) {
    rows.push([
      r.playerName ?? r.playerId,
      r.carries,
      r.yards,
      r.carries > 0 ? (r.yards / r.carries).toFixed(2) : "0.00",
      r.touchdowns,
      r.longRush,
      r.fumbles,
    ]);
  }
  rows.push([]);

  // Receiving
  rows.push(["RECEIVING"]);
  rows.push(["Player", "REC", "TGT", "YDS", "AVG", "TD", "Long", "Drops"]);
  for (const r of Object.values(summary.receiving ?? {})) {
    rows.push([
      r.playerName ?? r.playerId,
      r.receptions,
      r.targets,
      r.yards,
      r.receptions > 0 ? (r.yards / r.receptions).toFixed(2) : "0.00",
      r.touchdowns,
      r.longReception,
      r.drops,
    ]);
  }
  rows.push([]);

  // Defense
  rows.push(["DEFENSE"]);
  rows.push(["Player", "TKL", "Solo", "Asst", "TFL", "Sacks", "QB Hits", "INT", "PBU", "FF", "FR"]);
  for (const d of Object.values(summary.defense ?? {})) {
    rows.push([
      d.playerName ?? d.playerId,
      d.totalTackles,
      d.soloTackles,
      d.assistedTackles,
      d.tacklesForLoss,
      d.sacks,
      d.qbHits,
      d.interceptions,
      d.passesDefended,
      d.forcedFumbles,
      d.fumbleRecoveries,
    ]);
  }
  rows.push([]);

  // Kicking
  rows.push(["KICKING"]);
  rows.push(["Player", "FG Made", "FG Att", "FG %", "PAT Made", "PAT Att", "Long FG"]);
  for (const k of Object.values(summary.kicking ?? {})) {
    rows.push([
      k.playerName ?? k.playerId,
      k.fieldGoalMade,
      k.fieldGoalAttempts,
      k.fieldGoalAttempts > 0 ? `${Math.round((k.fieldGoalMade / k.fieldGoalAttempts) * 100)}%` : "",
      k.extraPointMade,
      k.extraPointAttempts,
      k.fieldGoalLong,
    ]);
  }
  rows.push([]);

  // Punting
  rows.push(["PUNTING"]);
  rows.push(["Player", "Punts", "YDS", "AVG", "Long", "Inside20"]);
  for (const p of Object.values(summary.punting ?? {})) {
    rows.push([
      p.playerName ?? p.playerId,
      p.punts,
      p.puntYards,
      p.puntAverage?.toFixed(2) ?? "0.00",
      p.puntLong,
      p.puntsInside20 ?? "",
    ]);
  }
  rows.push([]);

  // Returns
  rows.push(["RETURNS"]);
  rows.push(["Player", "KR", "KR YDS", "KR TD", "PR", "PR YDS", "PR TD"]);
  for (const r of Object.values(summary.returns ?? {})) {
    rows.push([
      r.playerName ?? r.playerId,
      r.kickReturns,
      r.kickReturnYards,
      r.kickReturnTouchdowns,
      r.puntReturns,
      r.puntReturnYards,
      r.puntReturnTouchdowns,
    ]);
  }

  downloadCsv(opts.filename, rowsToCsv(rows));
}

interface ExportSeasonOptions {
  filename: string;
  playerName: string;
}

/**
 * Per-game season log for one player.
 */
export function exportPlayerSeasonCsv(lines: PlayerGameLine[], opts: ExportSeasonOptions) {
  const rows: Array<Array<unknown>> = [];
  rows.push([opts.playerName, "Season Log"]);
  rows.push([]);
  rows.push([
    "Date", "Opponent",
    "Pass Cmp", "Pass Att", "Pass Yds", "Pass TD", "Pass INT",
    "Rush Car", "Rush Yds", "Rush TD",
    "Rec", "Rec Yds", "Rec TD",
    "Tackles", "Sacks", "INT (Def)", "FF", "FR",
  ]);
  for (const line of lines) {
    rows.push([
      line.gameDate,
      line.opponentName,
      line.passing?.completions ?? "",
      line.passing?.attempts ?? "",
      line.passing?.yards ?? "",
      line.passing?.touchdowns ?? "",
      line.passing?.interceptions ?? "",
      line.rushing?.carries ?? "",
      line.rushing?.yards ?? "",
      line.rushing?.touchdowns ?? "",
      line.receiving?.receptions ?? "",
      line.receiving?.yards ?? "",
      line.receiving?.touchdowns ?? "",
      line.defense?.totalTackles ?? "",
      line.defense?.sacks ?? "",
      line.defense?.interceptions ?? "",
      line.defense?.forcedFumbles ?? "",
      line.defense?.fumbleRecoveries ?? "",
    ]);
  }

  downloadCsv(opts.filename, rowsToCsv(rows));
}
