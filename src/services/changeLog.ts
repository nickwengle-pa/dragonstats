/**
 * The Change Log: who started, ended and changed each game.
 *
 * The rows are written by the database (supabase/migrations/
 * 20261019000000_game_activity_log.sql), never by the app, so nothing here
 * can slow down or fail a save. This file only turns a row into words: a
 * title, and for a play, the lines that changed between before and after.
 *
 * No app imports, so `node src/services/changeLog.test.ts` can run it.
 */

export type ChangeAction =
  | "game_started"
  | "game_ended"
  | "game_reopened"
  | "stats_final"
  | "stats_unfinal"
  | "final_changed"
  | "play_edited"
  | "play_deleted"
  | "play_added"
  | "game_deleted";

/** A rostered player credited on a play, named as they were at the time. */
export interface ViewCredit {
  role: string;
  player_id?: string;
  credit?: number | null;
  jersey?: number | null;
  name?: string | null;
}

/** A play as the log stores it: activity_play_view in the migration. */
export interface PlayView {
  n?: number;
  q?: number;
  clock?: string;
  type?: string;
  yards?: number;
  td?: boolean;
  turnover?: boolean;
  penalty?: boolean;
  desc?: string;
  /** Where the play started. Compared only when it was set by hand. */
  at?: { poss?: string; down?: number; dist?: number; ball?: number };
  hand_start?: boolean;
  pd?: Record<string, unknown>;
  credits?: ViewCredit[];
}

interface Score { us?: number; them?: number }

interface HistoryEntry {
  source?: string;
  stats?: Array<{ label: string; before: number; after: number }>;
  added?: unknown[];
  removed?: unknown[];
  edited?: unknown[];
}

export interface ChangeRow {
  id: number;
  program_id: string;
  game_id: string | null;
  game_info: { id?: string | null; opponent?: string | null; date?: string | null; is_home?: boolean | null } | null;
  play_id: string | null;
  play_number: number | null;
  action: ChangeAction;
  game_status: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  before: (PlayView & Score & { plays?: number; game_id?: string }) | null;
  after: (PlayView & Score & { entry?: HistoryEntry | null }) | null;
  created_at: string;
}

export interface ChangeLine {
  label: string;
  before: string;
  after: string;
}

/** Who did it, in the words the People card uses. */
export function actorLabel(row: Pick<ChangeRow, "actor_email" | "actor_name" | "actor_id">): string {
  if (row.actor_email) return row.actor_email;
  if (row.actor_name) return row.actor_name;
  // No signed-in account: the Supabase dashboard or a migration.
  return row.actor_id ? "Unknown account" : "Outside the app (database)";
}

/** After the final, as opposed to while the game was being recorded. */
export function isAfterGame(row: Pick<ChangeRow, "action" | "game_status">): boolean {
  if (row.action === "stats_final" || row.action === "stats_unfinal" || row.action === "final_changed") return true;
  if (row.action === "game_ended" || row.action === "game_started") return false;
  return row.game_status === "completed";
}

const words = (raw: string): string => {
  const text = raw.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : raw;
};

const score = (s: Score | null | undefined): string =>
  s && s.us != null && s.them != null ? `${s.us}-${s.them}` : "";

function playRef(view: PlayView | null | undefined, number: number | null): string {
  const n = view?.n ?? number;
  const where = [view?.q ? `Q${view.q}` : "", view?.clock ?? ""].filter(Boolean).join(" ");
  return `${n != null ? `play ${n}` : "a play"}${where ? ` (${where})` : ""}`;
}

/** One line a coach can read for the entry. */
export function changeTitle(row: ChangeRow): string {
  switch (row.action) {
    case "game_started": return "Started scoring the game";
    case "game_ended": return `Pressed End Game${score(row.after) ? `, final ${score(row.after)}` : ""}`;
    case "game_reopened": return "Took the game off final";
    case "stats_final": return "Marked the stats final";
    case "stats_unfinal": return "Took the stats off final";
    case "final_changed": return "Changed the final";
    case "play_edited": return `Changed ${playRef(row.after, row.play_number)}`;
    case "play_deleted": return `Deleted ${playRef(row.before, row.play_number)}`;
    case "play_added": return `Added ${playRef(row.after, row.play_number)} after the game`;
    case "game_deleted": return "Deleted the game from the schedule";
    default: return words(String(row.action));
  }
}

/* ── Players on a play ───────────────────────────────────────────────────── */

const ROLE_LABEL: Record<string, string> = {
  passer: "Passer",
  rusher: "Ball carrier",
  receiver: "Receiver",
  target: "Target",
  tackler: "Tackler",
  assist: "Assisted tackle",
  sacker: "Sack",
  kicker: "Kicker",
  punter: "Punter",
  returner: "Returner",
  forced_fumble: "Forced fumble",
  fumble_recovery: "Fumble recovery",
  interceptor: "Interception",
  defender: "Pass breakup",
  pass_rusher: "Pressure",
  blocker: "Blocked by",
  recoverer: "Recovered by",
  recovery_tackler: "Tackler on the return",
  penalty: "Penalty on",
};

export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? words(role);

function personName(jersey: unknown, name: unknown, suffix = ""): string {
  const number = typeof jersey === "number" || (typeof jersey === "string" && jersey) ? `#${jersey}` : "";
  // A quick-added opponent is stored with its jersey as its name.
  const text = typeof name === "string" && name.trim() !== number ? name.trim() : "";
  const parts = [number, text].filter(Boolean);
  return (parts.join(" ") || "Unknown") + suffix;
}

const shared = (credit: unknown): string =>
  typeof credit === "number" && credit > 0 && credit < 1 ? " (shared)" : "";

/** Everyone credited on a play, by role: rostered, opponent, unrostered, TEAM. */
export function playersByRole(view: PlayView | null | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (role: unknown, label: string) => {
    if (typeof role !== "string" || !role) return;
    out.set(role, [...(out.get(role) ?? []), label]);
  };
  for (const c of view?.credits ?? []) add(c.role, personName(c.jersey, c.name, shared(c.credit)));
  const pd = view?.pd ?? {};
  const list = (key: string) => (Array.isArray(pd[key]) ? (pd[key] as Array<Record<string, unknown>>) : []);
  // The log stores these tags trimmed to role, credit, jersey and name.
  for (const t of list("opp_tagged")) add(t.role, personName(t.jersey ?? t.jersey_number, t.name, ` (opponent)${shared(t.credit)}`));
  for (const t of list("pending_tagged")) add(t.role, personName(t.jersey ?? t.jersey_number, "", ` (not on roster)${shared(t.credit)}`));
  for (const t of list("team_tagged")) add(t.role, `TEAM${shared(t.credit)}`);
  for (const names of out.values()) names.sort();
  return out;
}

/* ── What changed on a play ──────────────────────────────────────────────── */

const yesNo = (v: unknown): string => (v ? "Yes" : "No");

function plain(v: unknown): string {
  if (v == null || v === "") return "-";
  if (typeof v === "boolean") return yesNo(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return words(v);
  return JSON.stringify(v);
}

/* play_data keys in the view, in the order a coach reads a play. Tags are
   listed by role instead, so they are left out here. */
const PD_FIELDS: Array<[string, string]> = [
  ["result", "Result"],
  ["is_first_down", "First down"],
  ["kick_outcome", "Kick result"],
  ["is_touchback", "Touchback"],
  ["penalty_type", "Penalty"],
  ["play_category", "Penalty on"],
  ["penalty_yards", "Penalty yards"],
  ["penalty_enforcement", "Penalty ruling"],
  ["penalty_play_counts", "Play stands"],
  ["penalty_down_outcome", "Down"],
  ["penalty_enforcement_from", "Walked off from"],
  ["foul_spot_ball_on", "Foul spot"],
  ["blocked_kick_type", "Blocked kick"],
  ["blocked_recovered_by_kicking", "Kicking team recovered the block"],
  ["muff_recovered_by_kicking", "Kicking team recovered the muff"],
  ["fumble_recovered_at", "Fumble recovered at"],
  ["fumble_return_yards", "Fumble return yards"],
  ["interception_return_yards", "Interception return yards"],
  ["kicked_to_yard", "Kicked to"],
  ["return_to_ball_on", "Returned to"],
  ["score_delta", "Points"],
  ["score_delta_team", "Points for"],
  ["bad_snap", "Bad snap"],
  ["no_tackle", "No tackle"],
  ["timeout_team", "Timeout"],
];

/* The play type names the play-entry buttons use (PLAY_TYPES in
   components/game/types.ts; this file imports nothing from the app). */
const PLAY_TYPE_LABEL: Record<string, string> = {
  rush: "Run", scramble: "Scramble", kneel: "Kneel", bad_snap: "Bad Snap", fumble: "Fumble",
  safety: "Safety", pass_comp: "Complete", pass_inc: "Incomplete", throwaway: "Throw Away",
  drop: "Drop", sack: "Sack", int: "INT", spike: "Spike", pat: "PAT Kick", two_pt: "2PT",
  fg: "Field Goal", kickoff: "Kickoff", onside_kick: "Onside", punt: "Punt",
  fair_catch: "Fair Catch", blocked_kick: "Blocked", penalty_only: "Penalty",
  false_start: "False Start", encroachment: "Encroachment", timeout: "Timeout",
  quarter_change: "Quarter change", score_correction: "Score correction",
};

export const playTypeLabel = (type: unknown): string =>
  typeof type === "string" && type ? PLAY_TYPE_LABEL[type] ?? words(type) : "-";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/** "1st & 10, our ball on our 30" - ball is yards from the offense's goal. */
function startLabel(at: PlayView["at"]): string {
  if (!at) return "-";
  const down = at.down != null ? `${ORDINAL[at.down] ?? `${at.down}th`} & ${at.dist ?? "?"}` : "";
  const whose = at.poss === "them" ? "their" : "our";
  const other = at.poss === "them" ? "our" : "their";
  const spot = at.ball == null ? ""
    : at.ball === 50 ? "on the 50"
    : at.ball < 50 ? `on ${whose} ${at.ball}` : `on ${other} ${100 - at.ball}`;
  return [down, spot ? `${whose} ball ${spot}` : ""].filter(Boolean).join(", ") || "-";
}

/**
 * The lines that differ between two versions of a play. The description is
 * not a line: it is shown whole above them.
 */
export function playChanges(before: PlayView | null | undefined, after: PlayView | null | undefined): ChangeLine[] {
  const lines: ChangeLine[] = [];
  const push = (label: string, a: string, b: string) => { if (a !== b) lines.push({ label, before: a, after: b }); };
  const b = before ?? {};
  const a = after ?? {};

  push("Play", playTypeLabel(b.type), playTypeLabel(a.type));
  if (a.hand_start) push("Start (set by hand)", startLabel(b.at), startLabel(a.at));
  push("Quarter", b.q != null ? `Q${b.q}` : "-", a.q != null ? `Q${a.q}` : "-");
  push("Yards", plain(b.yards ?? 0), plain(a.yards ?? 0));
  push("Touchdown", yesNo(b.td), yesNo(a.td));
  push("Turnover", yesNo(b.turnover), yesNo(a.turnover));
  push("Flag", yesNo(b.penalty), yesNo(a.penalty));
  for (const [key, label] of PD_FIELDS) push(label, plain(b.pd?.[key]), plain(a.pd?.[key]));

  const was = playersByRole(b);
  const now = playersByRole(a);
  const roles = [...new Set([...was.keys(), ...now.keys()])].sort((x, y) => roleLabel(x).localeCompare(roleLabel(y)));
  for (const role of roles) {
    push(roleLabel(role), (was.get(role) ?? []).join(", ") || "None", (now.get(role) ?? []).join(", ") || "None");
  }
  return lines;
}

/** The lines for a change to a final: score, then the stats that moved. */
export function finalChanges(row: ChangeRow): ChangeLine[] {
  const lines: ChangeLine[] = [];
  const before = score(row.before);
  const after = score(row.after);
  if (before && after && before !== after) lines.push({ label: "Score", before, after });
  for (const stat of row.after?.entry?.stats ?? []) {
    lines.push({ label: stat.label, before: String(stat.before), after: String(stat.after) });
  }
  return lines;
}

/** Who a deleted or added play credited, and what it was. */
function playSummary(view: PlayView | null | undefined, gone: boolean): ChangeLine[] {
  if (!view) return [];
  const line = (label: string, value: string): ChangeLine =>
    gone ? { label, before: value, after: "-" } : { label, before: "-", after: value };
  const lines = [line("Play", playTypeLabel(view.type))];
  if (view.yards) lines.push(line("Yards", String(view.yards)));
  if (view.td) lines.push(line("Touchdown", "Yes"));
  if (view.turnover) lines.push(line("Turnover", "Yes"));
  const people = playersByRole(view);
  for (const role of [...people.keys()].sort((x, y) => roleLabel(x).localeCompare(roleLabel(y)))) {
    lines.push(line(roleLabel(role), (people.get(role) ?? []).join(", ")));
  }
  return lines;
}

/** Lines for any entry; empty when the title says it all. */
export function changeLines(row: ChangeRow): ChangeLine[] {
  if (row.action === "play_edited") return playChanges(row.before, row.after);
  if (row.action === "play_deleted") return playSummary(row.before, true);
  if (row.action === "play_added") return playSummary(row.after, false);
  if (row.action === "final_changed" || row.action === "stats_final") return finalChanges(row);
  return [];
}

/** The game an entry belongs to, also once the game itself is deleted. */
export function gameIdOf(row: Pick<ChangeRow, "game_id" | "game_info" | "before">): string | null {
  return row.game_id ?? row.game_info?.id ?? row.before?.game_id ?? null;
}

/** An edit whose every difference is one the log does not show a coach. */
export function isEmptyEdit(row: ChangeRow): boolean {
  return row.action === "play_edited" && changeLines(row).length === 0
    && (row.before?.desc ?? "") === (row.after?.desc ?? "");
}

/** "vs Rival, Oct 17" from what the log kept about the game. */
export function gameLabel(info: ChangeRow["game_info"]): string {
  if (!info) return "A game";
  const who = info.opponent ? `${info.is_home === false ? "at" : "vs"} ${info.opponent}` : "A game";
  const when = info.date ? new Date(info.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  return when ? `${who}, ${when}` : who;
}
