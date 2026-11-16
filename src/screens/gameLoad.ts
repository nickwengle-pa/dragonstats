/* How the game screen turns what it loaded into the game it shows: the replay
 * config, the roster lookups for tags, pending game edits laid over the
 * server's copy, and where the live situation resumes. Pulled out of
 * GameScreen's loadData so each decision can be tested on its own. Moved
 * unchanged, except that the session config was written out twice (once for
 * the screen and once inside loadData) and is now built in one place. */
import type { SyncQueueItem } from "@/services/offlineDb";
import type { LiveSessionConfig } from "@/services/liveGameSession";
import type { PregameConfig } from "@/services/gameFlow";
import { hasManagedLiveState } from "@/services/gameService";
import type { GameConfig } from "@/services/programService";
import { ROLE_REFUSAL_MESSAGE } from "@/services/syncWorker";
import { parseClockText, toTeamTag } from "./gameScreenRules";

interface ProgramLike { id: string; name: string; abbreviation?: string | null }
interface GameLike {
  is_home?: boolean | null;
  rules_config?: unknown;
  opponent?: { id?: string | null; name?: string | null; abbreviation?: string | null } | null;
  current_quarter?: unknown;
  current_clock?: unknown;
  current_possession?: unknown;
  current_down?: unknown;
  current_distance?: unknown;
  current_yard_line?: unknown;
}

/** The replay engine's view of this game. Null until both the program and
 *  the opponent are known, because the engine keys every stat to their ids. */
export function liveSessionConfigFor(
  gameId: string,
  program: ProgramLike | null | undefined,
  game: GameLike | null | undefined,
  gameConfig: GameConfig,
  pregame: PregameConfig | null,
): LiveSessionConfig | null {
  if (!program || !game?.opponent?.id) return null;
  return {
    gameId,
    programTeamId: program.id,
    programName: program.name,
    programAbbreviation: toTeamTag(program.name, program.abbreviation),
    opponentTeamId: game.opponent.id,
    opponentName: game.opponent.name ?? "Opponent",
    opponentAbbreviation: toTeamTag(game.opponent.name ?? "Opponent", game.opponent.abbreviation),
    isHome: Boolean(game.is_home),
    gameConfig,
    rulesConfig: game.rules_config as Record<string, unknown> | null,
    pregame,
  };
}

/** The same config with placeholder names, for the empty starting state when
 *  the program or opponent hasn't loaded and there is nothing to replay. */
export function placeholderSessionConfig(
  gameId: string,
  program: ProgramLike | null | undefined,
  game: GameLike | null | undefined,
  gameConfig: GameConfig,
  pregame: PregameConfig | null,
): LiveSessionConfig {
  return {
    gameId,
    programTeamId: program?.id ?? "program",
    programName: program?.name ?? "Team",
    programAbbreviation: toTeamTag(program?.name ?? "Team", program?.abbreviation),
    opponentTeamId: game?.opponent?.id ?? "opponent",
    opponentName: game?.opponent?.name ?? "Opponent",
    opponentAbbreviation: toTeamTag(game?.opponent?.name ?? "Opponent", game?.opponent?.abbreviation),
    isHome: Boolean(game?.is_home),
    gameConfig,
    rulesConfig: game?.rules_config as Record<string, unknown> | null,
    pregame,
  };
}

/** Names and jersey numbers by player id, from the season roster.
 *
 *  A play still sitting in the sync queue is read back from the local cache,
 *  where its play_players rows were written without the joined `player`
 *  record (that join is the server's), so without a fallback every tag on an
 *  unsynced play renders as "?". Jersey numbers live on season_rosters, not on
 *  the play_players join, so a tag rebuilt from the database has always come
 *  back numberless; attaching them once here saves every consumer doing it. */
export function rosterLookups(entries: unknown[]): { names: Map<string, string>; jerseys: Map<string, number | null> } {
  const names = new Map<string, string>();
  const jerseys = new Map<string, number | null>();
  for (const entry of entries as Array<{ player_id?: string; jersey_number?: number | null; player?: { first_name: string; last_name: string } | null }>) {
    const player = entry?.player;
    if (entry?.player_id && player) {
      names.set(entry.player_id, `${player.first_name} ${player.last_name}`);
      jerseys.set(entry.player_id, entry.jersey_number ?? null);
    }
  }
  return { names, jerseys };
}

/** The game edits still waiting to sync, oldest first, that should be laid
 *  over the server's copy - a locally finalized game can still be waiting.
 *
 *  Not a patch the server refused on role grounds, though: laying an
 *  assistant's refused "live" score patch over a game the head coach has since
 *  made final would reopen it on this device, and every play then recorded
 *  could never sync. */
export function pendingGamePatches(queue: SyncQueueItem[]): SyncQueueItem[] {
  return queue
    .filter((item) => item.op === "game")
    .filter((item) => !(item.status === "failed" && item.lastError === ROLE_REFUSAL_MESSAGE))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function withPendingPatches<T extends object>(game: T | null, patches: SyncQueueItem[]): T | null {
  return game && patches.reduce((value, item) => ({ ...value, ...item.payload?.patch }), game);
}

export interface ResumedSituation {
  quarter: number;
  clock: number;
  possession: "us" | "them";
  down: number;
  distance: number;
  ballOn: number;
  goalToGo: boolean | undefined;
  /** What the games row already holds, so the first save after a load skips
   *  writing it straight back. Null when the row carries no live state. */
  persistedKey: string | null;
}

/** Where the live situation resumes on load. A game whose row carries managed
 *  live state resumes from it, field by field where a field is valid; any
 *  other game resumes from the replay of its plays. */
export function resumeSituation(
  game: GameLike | null | undefined,
  derived: { quarter: number; clock: number; possession: "us" | "them"; down: number; distance: number; ballOn: number; goalToGo?: boolean },
): ResumedSituation {
  const rules = game?.rules_config as Record<string, unknown> | null | undefined;
  const stored = hasManagedLiveState(rules ?? null);
  const quarter = stored ? Number(game?.current_quarter ?? derived.quarter) : derived.quarter;
  const clock = stored ? parseClockText(game?.current_clock, derived.clock) : derived.clock;
  const possession = stored && (game?.current_possession === "us" || game?.current_possession === "them")
    ? game.current_possession
    : derived.possession;
  const down = stored && typeof game?.current_down === "number" ? game.current_down : derived.down;
  const distance = stored && typeof game?.current_distance === "number" ? game.current_distance : derived.distance;
  const ballOn = stored && typeof game?.current_yard_line === "number" ? game.current_yard_line : derived.ballOn;
  const goalToGo = stored && typeof rules?.current_goal_to_go === "boolean"
    ? rules.current_goal_to_go as boolean
    : derived.goalToGo;
  return {
    quarter, clock, possession, down, distance, ballOn, goalToGo,
    persistedKey: stored ? [quarter, clock, possession, down, distance, ballOn].join("|") : null,
  };
}
