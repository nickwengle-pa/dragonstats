/**
 * The official copy of a finished game, and what has changed since.
 *
 * Marking a game final used to write two numbers and a status, and nothing
 * else. Every later edit silently overwrote them - and because the game screen
 * re-derives the whole game from its plays, a bug in that derivation could
 * rewrite a final nobody touched. Three finished games came back with the
 * wrong score that way before anyone noticed.
 *
 * This is the record taken when a game goes final: the score, every player's
 * line, the team totals, and a fingerprint of each play. Later changes are
 * compared against it, so an edit to a finished game says what it changes
 * before it saves, and a change that went in some other way - the film chart,
 * another device, a play added the next morning - shows up when the game is
 * opened instead of hiding in the totals.
 *
 * Computed with exactly the pipeline the game screen scores with
 * (rebuildPlaySituations, then replayLiveGame) and nothing else. The report
 * screens build their numbers another way; comparing one against the other
 * would report differences that are only the two pipelines disagreeing.
 */
import { TEAM_PLAYER_ID, type PlayRecord } from "@/components/game/types";
import type { GameSummary } from "football-stats-engine";
import { markHandSetStarts, rebuildPlaySituations } from "./gameFlow";
import { replayLiveGame, type LiveSessionConfig } from "./liveGameSession";
import type { PlayWithPlayers } from "./gameService";
import { playRecordFromRow, type RosterLookups } from "./playRecordFromRow";

export type Side = "us" | "them";

/** Enough of a play to list it in a warning without the play itself. */
export interface PlayMark {
  /** Sequence - the play's number in the log. */
  n: number;
  q: number;
  /** Clock at the snap, seconds left in the quarter. */
  c: number;
  d: string;
  /** Fingerprint of everything about the play that can move a stat. */
  f: string;
}

export interface FinalRecord {
  v: 1;
  score: { us: number; them: number };
  /** Non-zero stats only; a missing key is a zero. See statKey. */
  stats: Record<string, number>;
  players: Record<string, { name: string; side: Side }>;
  plays: Record<string, PlayMark>;
}

export type FinalSource =
  /** Taken at End Game. */
  | "finalized"
  /** Taken when post-game review marked the stats final - the locked copy. */
  | "stats_final"
  /** Taken for a game that went final before official copies existed. */
  | "recorded"
  /** A change to the finished game, confirmed before it saved. */
  | "change"
  /** Changes found on opening the game, accepted as the new official final. */
  | "accepted";

export interface FinalSnapshot extends FinalRecord {
  at: string;
  source: FinalSource;
}

export interface StatChange {
  key: string;
  label: string;
  before: number;
  after: number;
}

export interface FinalDiff {
  score: { before: { us: number; them: number }; after: { us: number; them: number } } | null;
  stats: StatChange[];
  added: PlayMark[];
  removed: PlayMark[];
  edited: PlayMark[];
}

export interface FinalHistoryEntry {
  at: string;
  source: FinalSource;
  score: { us: number; them: number };
  scoreBefore?: { us: number; them: number };
  stats?: StatChange[];
  added?: PlayMark[];
  removed?: PlayMark[];
  edited?: PlayMark[];
}

/* ── Fingerprints ─────────────────────────────────────────────────────────── */

/** FNV-1a, 32-bit. Not security - just "did this play change". */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Everything recorded about a play that can change a stat or the score.
 *
 * Not the spots the replay derives - those follow from the plays before, and
 * an edit upstream legitimately moves them. A hand-set spot is in, because the
 * operator typed it and it is part of this play. The clock and the formation
 * are out: correcting them changes no number on a box score.
 */
export function playFingerprint(play: PlayRecord): string {
  const pd = play.playData ?? {};
  const handNext = pd.next_situation_source === "manual_override" || pd.next_situation_source === "penalty_enforced"
    ? [play.nextPossession, play.nextDown, play.nextDistance, play.nextBallOn].join(",")
    : "";
  const handStart = pd.start_override === true
    ? [play.possession, play.down, play.distance, play.ballOn].join(",")
    : "";
  const tags = [...(play.tagged ?? [])]
    .map((t) => `${t.role}:${t.player_id}:${t.credit ?? ""}`)
    .sort()
    .join("|");
  return hash([
    play.type, play.quarter, play.yards, play.isTouchdown ? 1 : 0, play.turnover ? 1 : 0,
    play.result ?? "", play.firstDown ? 1 : 0, play.isTouchback ? 1 : 0,
    play.penalty ?? "", play.penaltyCategory ?? "", play.penaltyEnforcement ?? "", play.flagYards ?? 0,
    play.blockedKickType ?? "", play.fumbleRecoveredAt ?? "", play.fumbleReturnYards ?? "",
    pd.score_delta_team ?? "", pd.score_delta ?? "", handNext, handStart, tags,
    // The penalty ruling: whether the play stands, what the down does, and
    // where it is walked off from. Each can move a stat on its own.
    pd.penalty_play_counts ?? "", pd.penalty_down_outcome ?? "", pd.penalty_enforcement_from ?? "",
    pd.foul_spot_ball_on ?? "",
  ].join("~"));
}

function markFor(play: PlayRecord): PlayMark {
  return {
    n: play.sequence ?? 0,
    q: play.quarter,
    c: play.clock,
    d: play.description ?? "",
    f: playFingerprint(play),
  };
}

/* ── Stats ────────────────────────────────────────────────────────────────── */

/* Which numbers make the official copy. The lines on a box score, not every
   split the engine keeps: a third-down-completion count moving is not
   something a coach needs to confirm. */
const PLAYER_STATS: Array<[keyof GameSummary, string, string]> = [
  ["passing", "completions", "Completions"],
  ["passing", "attempts", "Pass attempts"],
  ["passing", "yards", "Passing yards"],
  ["passing", "touchdowns", "Passing TD"],
  ["passing", "interceptions", "Interceptions thrown"],
  ["rushing", "carries", "Carries"],
  ["rushing", "yards", "Rushing yards"],
  ["rushing", "touchdowns", "Rushing TD"],
  ["receiving", "receptions", "Receptions"],
  ["receiving", "yards", "Receiving yards"],
  ["receiving", "touchdowns", "Receiving TD"],
  ["defense", "soloTackles", "Solo tackles"],
  ["defense", "assistedTackles", "Assisted tackles"],
  ["defense", "tacklesForLoss", "Tackles for loss"],
  ["defense", "sacks", "Sacks"],
  ["defense", "interceptions", "Interceptions"],
  ["defense", "passesDefended", "Pass breakups"],
  ["defense", "forcedFumbles", "Forced fumbles"],
  ["defense", "fumbleRecoveries", "Fumble recoveries"],
  ["kicking", "fieldGoalMade", "Field goals made"],
  ["kicking", "fieldGoalAttempts", "Field goal attempts"],
  ["kicking", "extraPointMade", "Extra points made"],
  ["kicking", "extraPointAttempts", "Extra point attempts"],
  ["punting", "punts", "Punts"],
  ["punting", "puntYards", "Punt yards"],
  ["returns", "kickReturns", "Kick returns"],
  ["returns", "kickReturnYards", "Kick return yards"],
  ["returns", "puntReturns", "Punt returns"],
  ["returns", "puntReturnYards", "Punt return yards"],
];

const TEAM_STATS: Array<[string, string]> = [
  ["firstDowns", "First downs"],
  ["totalYards", "Total yards"],
  ["rushAttempts", "Rushes"],
  ["rushingYards", "Rushing yards"],
  ["passCompletions", "Completions"],
  ["passAttempts", "Pass attempts"],
  ["passingYards", "Passing yards"],
  ["turnovers", "Turnovers"],
  ["penalties", "Penalties"],
  ["penaltyYards", "Penalty yards"],
  ["thirdDownConversions", "Third downs converted"],
  ["thirdDownAttempts", "Third downs"],
];

const PLAYER_LABELS = new Map(PLAYER_STATS.map(([cat, field, label]) => [`${cat}.${field}`, label]));
const TEAM_LABELS = new Map(TEAM_STATS);

/** Who each tagged id plays for, and what to call them. */
function collectPlayers(plays: PlayRecord[]): Record<string, { name: string; side: Side }> {
  const players: Record<string, { name: string; side: Side }> = {};
  for (const play of plays) {
    for (const tag of play.tagged ?? []) {
      if (!tag.player_id || players[tag.player_id]) continue;
      const name = tag.isTeam ? "TEAM"
        : tag.jersey_number != null ? `#${tag.jersey_number} ${tag.name ?? ""}`.trim()
        : (tag.name || "Unknown");
      players[tag.player_id] = { name, side: tag.isOpponent ? "them" : "us" };
    }
  }
  return players;
}

/**
 * A stat holder nobody tagged. The transformer credits an untagged play to a
 * placeholder - "our_team" (TEAM_PLAYER_ID) for ours, "opp_unknown" or an
 * opp_ id for theirs - and those ids are not names a coach should read, nor
 * all on our side.
 */
function placeholderPlayer(playerId: string, engineName: unknown): { name: string; side: Side } {
  const side: Side = playerId.startsWith("opp") ? "them" : "us";
  if (playerId === TEAM_PLAYER_ID || playerId.endsWith("_team")) return { name: "TEAM", side };
  if (playerId === "opp_unknown") return { name: "Unidentified player", side };
  const name = typeof engineName === "string" && engineName.trim() && engineName !== playerId ? engineName : "Unidentified player";
  return { name, side };
}

function flattenStats(
  summary: GameSummary | null,
  config: LiveSessionConfig,
  players: Record<string, { name: string; side: Side }>,
): Record<string, number> {
  const stats: Record<string, number> = {};
  const put = (key: string, value: unknown) => {
    const n = Number(value);
    if (Number.isFinite(n) && n !== 0) stats[key] = Math.round(n * 10) / 10;
  };
  if (!summary) return stats;

  const ourTeam = summary.homeTeamStats?.teamId === config.programTeamId ? summary.homeTeamStats : summary.awayTeamStats;
  const theirTeam = ourTeam === summary.homeTeamStats ? summary.awayTeamStats : summary.homeTeamStats;
  for (const [side, team] of [["us", ourTeam], ["them", theirTeam]] as const) {
    if (!team) continue;
    for (const [field] of TEAM_STATS) put(`t:${side}:${field}`, (team as unknown as Record<string, unknown>)[field]);
  }

  for (const [category, field] of PLAYER_STATS) {
    const byPlayer = summary[category] as unknown as Record<string, Record<string, unknown>> | undefined;
    for (const [playerId, line] of Object.entries(byPlayer ?? {})) {
      if (!players[playerId]) players[playerId] = placeholderPlayer(playerId, line.playerName);
      put(`p:${playerId}:${category}.${field}`, line[field]);
    }
  }
  return stats;
}

/**
 * The record of a game as these plays stand, scored the way the game screen
 * scores it. Pass the plays the game screen holds (or would hold after an
 * edit) - not yet re-chained is fine, this re-chains them.
 */
export function buildFinalRecord(plays: PlayRecord[], config: LiveSessionConfig): FinalRecord {
  const rebuilt = rebuildPlaySituations(plays, config.pregame, config.gameConfig).plays;
  const replay = replayLiveGame(rebuilt, config);
  const players = collectPlayers(rebuilt);
  const stats = flattenStats(replay.summary, config, players);
  const marks: Record<string, PlayMark> = {};
  for (const play of rebuilt) {
    // A timeout or a quarter change moves no number; listing one as "added"
    // would bury the plays that did.
    if (play.type === "timeout" || play.type === "quarter_change") continue;
    marks[play.id] = markFor(play);
  }
  // Only players who have a number to show; a tag with no stat is noise.
  const used: Record<string, { name: string; side: Side }> = {};
  for (const key of Object.keys(stats)) {
    const id = key.startsWith("p:") ? key.slice(2, key.lastIndexOf(":")) : null;
    if (id && players[id]) used[id] = players[id];
  }
  return { v: 1, score: { us: replay.score.us, them: replay.score.them }, stats, players: used, plays: marks };
}

/**
 * The record of a game from its stored rows - the film chart's starting
 * point. Read the way the game screen loads a game (hand-set starts flagged
 * before the replay), or the two screens would disagree about the same plays.
 */
export function buildFinalRecordFromRows(
  rows: PlayWithPlayers[],
  config: LiveSessionConfig,
  roster: RosterLookups = {},
): FinalRecord {
  const records = rows.map((row) => playRecordFromRow(row, roster));
  return buildFinalRecord(markHandSetStarts(records, config.pregame, config.gameConfig), config);
}

/** A team's short tag for labels: its abbreviation, else initials. Same rule
 *  as the game screen's, so both screens name a team the same way. */
export function teamTag(name: string | null | undefined, abbreviation?: string | null): string {
  if (typeof abbreviation === "string" && abbreviation.trim()) return abbreviation.trim().toUpperCase();
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TEAM";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

/* ── Policy ───────────────────────────────────────────────────────────────── */

/**
 * Whether a change to a finished game has to be confirmed before it saves.
 *
 * Two stages. Between End Game and "Mark stats final" the stats are still
 * being cleaned up on purpose - spots confirmed, jerseys matched to players -
 * so only a change to the final SCORE stops to ask. Once the stats are marked
 * final, any number a coach would see moving asks first.
 */
export function needsConfirmation(diff: FinalDiff, statsLocked: boolean): boolean {
  return statsLocked ? changesNumbers(diff) : !!diff.score;
}

export interface OpenCheck {
  title: string;
  detail: string;
  diff: FinalDiff | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function describeDiff(diff: FinalDiff): string {
  const parts = [
    diff.score ? `final score ${diff.score.before.us}-${diff.score.before.them} to ${diff.score.after.us}-${diff.score.after.them}` : "",
    diff.stats.length ? plural(diff.stats.length, "stat") : "",
    diff.added.length ? `${plural(diff.added.length, "play")} added` : "",
    diff.removed.length ? `${plural(diff.removed.length, "play")} removed` : "",
    diff.edited.length ? `${plural(diff.edited.length, "play")} edited` : "",
  ].filter(Boolean);
  return parts.length ? `Not yet confirmed: ${parts.join(", ")}.` : "The plays changed after the official final was saved.";
}

/**
 * What to tell someone opening a finished game.
 *
 * "record": no official copy yet, and the plays still add up to the saved
 * final - take one now. A game that already drifted gets a warning instead,
 * because a copy of it would make the drift official.
 * A warning: the plays no longer match the official final - before the stats
 * are marked final only the score counts, after it any change does.
 * null: nothing to say.
 */
export function checkFinal(o: {
  statsLocked: boolean;
  official: FinalSnapshot | null;
  current: FinalRecord;
  saved: { us: number; them: number };
  names: { us: string; them: string };
}): OpenCheck | "record" | null {
  const { statsLocked, official, current, saved, names } = o;
  const addsUp = current.score.us === saved.us && current.score.them === saved.them;
  if (!official) {
    if (addsUp) return "record";
    return {
      title: "The plays don't add up to the final score",
      detail: `Saved final is ${names.us} ${saved.us} - ${names.them} ${saved.them}; the plays add up to ${current.score.us} - ${current.score.them}.`,
      diff: { score: { before: saved, after: current.score }, stats: [], added: [], removed: [], edited: [] },
    };
  }
  const diff = diffFinalRecords(official, current, names);
  const warn = statsLocked ? !isEmptyDiff(diff) : (!!diff.score || !addsUp);
  if (!warn) return null;
  return {
    title: statsLocked ? "Changed since the stats were marked final" : "The final score no longer matches the plays",
    detail: describeDiff(diff),
    diff,
  };
}

/** The two columns to write for a new official copy. History grows only for
 *  a change worth recording; a silent refresh just keeps the copy current. */
export function finalFields(
  game: { final_history?: unknown },
  record: FinalRecord,
  source: FinalSource,
  diff: FinalDiff | null,
  inHistory: boolean,
): { final_snapshot: FinalSnapshot; final_history: FinalHistoryEntry[] } {
  const at = new Date().toISOString();
  const history = readHistory(game.final_history);
  return {
    final_snapshot: snapshotOf(record, source, at),
    final_history: inHistory ? [...history, historyEntry(source, record, diff, at)] : history,
  };
}

/* ── Comparing ────────────────────────────────────────────────────────────── */

export function statLabel(
  key: string,
  players: Record<string, { name: string; side: Side }>,
  names: { us: string; them: string },
): string {
  if (key.startsWith("t:")) {
    const [, side, field] = key.split(":");
    return `${names[side as Side] ?? side} ${TEAM_LABELS.get(field) ?? field}`;
  }
  const cut = key.lastIndexOf(":");
  const id = key.slice(2, cut);
  const player = players[id];
  const team = player ? names[player.side] : "";
  return `${team} ${player?.name ?? "Unknown"} - ${PLAYER_LABELS.get(key.slice(cut + 1)) ?? key.slice(cut + 1)}`.trim();
}

const byPlay = (a: PlayMark, b: PlayMark) => a.n - b.n;

export function diffFinalRecords(
  before: FinalRecord,
  after: FinalRecord,
  names: { us: string; them: string },
): FinalDiff {
  const score = before.score.us !== after.score.us || before.score.them !== after.score.them
    ? { before: before.score, after: after.score }
    : null;

  const players = { ...before.players, ...after.players };
  const keys = new Set([...Object.keys(before.stats), ...Object.keys(after.stats)]);
  const stats: StatChange[] = [];
  for (const key of keys) {
    const a = before.stats[key] ?? 0;
    const b = after.stats[key] ?? 0;
    if (a !== b) stats.push({ key, label: statLabel(key, players, names), before: a, after: b });
  }
  // Team lines first, then players, each in label order.
  stats.sort((x, y) => (x.key[0] === y.key[0] ? x.label.localeCompare(y.label) : x.key[0] === "t" ? -1 : 1));

  const added: PlayMark[] = [];
  const edited: PlayMark[] = [];
  for (const [id, mark] of Object.entries(after.plays)) {
    const was = before.plays[id];
    if (!was) added.push(mark);
    else if (was.f !== mark.f) edited.push(mark);
  }
  const removed = Object.entries(before.plays)
    .filter(([id]) => !after.plays[id])
    .map(([, mark]) => mark);

  return { score, stats, added: added.sort(byPlay), removed: removed.sort(byPlay), edited: edited.sort(byPlay) };
}

export function isEmptyDiff(diff: FinalDiff): boolean {
  return !diff.score && diff.stats.length === 0
    && diff.added.length === 0 && diff.removed.length === 0 && diff.edited.length === 0;
}

/** True when the diff moves a number a coach would see. A clock fix does not. */
export function changesNumbers(diff: FinalDiff): boolean {
  return !!diff.score || diff.stats.length > 0;
}

export function snapshotOf(record: FinalRecord, source: FinalSource, at = new Date().toISOString()): FinalSnapshot {
  return { ...record, at, source };
}

export function historyEntry(
  source: FinalSource,
  record: FinalRecord,
  diff: FinalDiff | null,
  at = new Date().toISOString(),
): FinalHistoryEntry {
  const entry: FinalHistoryEntry = { at, source, score: record.score };
  if (diff?.score) entry.scoreBefore = diff.score.before;
  if (diff?.stats.length) entry.stats = diff.stats;
  if (diff?.added.length) entry.added = diff.added;
  if (diff?.removed.length) entry.removed = diff.removed;
  if (diff?.edited.length) entry.edited = diff.edited;
  return entry;
}

/** A stored snapshot, or null if what is stored is not one. */
export function readSnapshot(value: unknown): FinalSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<FinalSnapshot>;
  if (s.v !== 1 || !s.score || !s.stats || !s.plays) return null;
  return s as FinalSnapshot;
}

export function readHistory(value: unknown): FinalHistoryEntry[] {
  return Array.isArray(value) ? (value as FinalHistoryEntry[]) : [];
}

export function formatPlayMark(mark: PlayMark): string {
  const clock = `${Math.floor(mark.c / 60)}:${String(mark.c % 60).padStart(2, "0")}`;
  return `#${mark.n} Q${mark.q} ${clock} - ${mark.d || "(no description)"}`;
}
