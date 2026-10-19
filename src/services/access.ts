/**
 * Who may do what in a program.
 *
 * The rules are enforced by the database (supabase/migrations/
 * 20261016000000_program_roles.sql); this is the app's copy of them, so a
 * screen can hide what the server would refuse instead of letting a coach
 * record twenty plays the server then turns away. When the two disagree the
 * server wins, so keep them in step.
 *
 *   admin       everything, including people and the Danger Zone
 *   head_coach  all football data, finals included; invites and manages
 *               assistants and staff
 *   assistant   records games and edits plays until the game is final;
 *               roster adds and edits; film charting on any game
 *   staff       view only
 */

export type ProgramRole = "admin" | "head_coach" | "assistant" | "staff";

export const ROLES: readonly ProgramRole[] = ["admin", "head_coach", "assistant", "staff"];

export const ROLE_LABEL: Record<ProgramRole, string> = {
  admin: "Admin",
  head_coach: "Head Coach",
  assistant: "Assistant Coach",
  staff: "Staff",
};

export const ROLE_BLURB: Record<ProgramRole, string> = {
  admin: "Everything, including people and the Danger Zone.",
  head_coach: "All stats and games, finals included. Schedule, roster, settings. Invites assistants and staff.",
  assistant: "Records games and fixes plays until a game is final. Adds and edits players.",
  staff: "Sees every game, report and stat. Can't change anything.",
};

/**
 * A role as stored, to a role the app knows. The legacy names come from rows
 * written before the roles migration ran (a build can reach the iPad before
 * the SQL is applied): 'owner' was the admin, 'member' could record games.
 * Anything else is unknown and gets the least access.
 */
export function normalizeRole(raw: unknown): ProgramRole | null {
  switch (raw) {
    case "admin":
    case "owner":
      return "admin";
    case "head_coach":
      return "head_coach";
    case "assistant":
    case "member":
      return "assistant";
    case "staff":
      return "staff";
    case null:
    case undefined:
      return null;
    default:
      return "staff";
  }
}

export interface Permissions {
  role: ProgramRole | null;
  /** Record a live game: plays, clock, score, End Game. */
  recordGames: boolean;
  /** Change a game after it is final, or confirm its official copy. Also
   *  matching unrostered jerseys to players, which rewrites plays in every
   *  game of the season, finals included. */
  editFinalGames: boolean;
  /** Add and edit players and the season roster. */
  editRoster: boolean;
  /** Add, move, cancel and delete games and opponents. */
  editSchedule: boolean;
  /** Program name, colors, logos, seasons, the coaches list, game rules. */
  editProgram: boolean;
  /** See people, invite, change roles, remove. */
  managePeople: boolean;
  /** Settings' Danger Zone: deleting seasons and bulk purges. */
  dangerZone: boolean;
  /** The Change Log: who started, ended and changed each game. */
  seeChangeLog: boolean;
  /** Film Chart charting fields (formation, personnel, notes). */
  chartFilm: boolean;
  /** Roles this person may hand out or take away. */
  assignableRoles: readonly ProgramRole[];
}

/* One literal object per role, so a screen that lists permissions as an effect
   dependency gets the same reference on every render. */
const ADMIN: Permissions = {
  role: "admin", recordGames: true, editFinalGames: true, editRoster: true,
  editSchedule: true, editProgram: true, managePeople: true, dangerZone: true, seeChangeLog: true, chartFilm: true,
  assignableRoles: ["admin", "head_coach", "assistant", "staff"],
};
const HEAD_COACH: Permissions = {
  role: "head_coach", recordGames: true, editFinalGames: true, editRoster: true,
  editSchedule: true, editProgram: true, managePeople: true, dangerZone: false, seeChangeLog: true, chartFilm: true,
  assignableRoles: ["assistant", "staff"],
};
const ASSISTANT: Permissions = {
  role: "assistant", recordGames: true, editFinalGames: false, editRoster: true,
  editSchedule: false, editProgram: false, managePeople: false, dangerZone: false, seeChangeLog: false, chartFilm: true,
  assignableRoles: [],
};
const STAFF: Permissions = {
  role: "staff", recordGames: false, editFinalGames: false, editRoster: false,
  editSchedule: false, editProgram: false, managePeople: false, dangerZone: false, seeChangeLog: false, chartFilm: false,
  assignableRoles: [],
};
/* Role not known: offline on the first launch of this build, before the role
   was ever cached. Recording stays open - the server still checks every play
   when it syncs, and locking a scorekeeper out of a live game over a missing
   cache entry costs the game. Nothing that needs the server is offered. */
const UNKNOWN: Permissions = { ...ASSISTANT, role: null };

const BY_ROLE: Record<ProgramRole, Permissions> = {
  admin: ADMIN,
  head_coach: HEAD_COACH,
  assistant: ASSISTANT,
  staff: STAFF,
};

export function permissionsFor(role: ProgramRole | null | undefined): Permissions {
  return role ? BY_ROLE[role] : UNKNOWN;
}

const ROLE_PLURAL: Record<ProgramRole, string> = {
  admin: "admins",
  head_coach: "head coaches",
  assistant: "assistants",
  staff: "staff",
};

/** One line of the role chart an admin sees on the People card. A cell is
 *  true (yes), false (no) or a few words for a partial yes. */
export interface RoleAccessRow {
  label: string;
  cell: (perms: Permissions) => boolean | string;
}

/* Read off the permission objects above rather than written out, so the chart
   cannot say a role may do something the screens then hide from it. */
export const ROLE_ACCESS: readonly RoleAccessRow[] = [
  { label: "See all games, reports and stats", cell: () => true },
  { label: "Record games and fix plays", cell: (p) => p.editFinalGames || (p.recordGames && "Until final") },
  { label: "Change a game once it's final", cell: (p) => p.editFinalGames },
  { label: "Film charting", cell: (p) => p.chartFilm },
  { label: "Add and edit players", cell: (p) => p.editRoster },
  { label: "Schedule, seasons and program settings", cell: (p) => p.editSchedule && p.editProgram },
  {
    label: "Invite, change and remove people",
    cell: (p) => {
      if (!p.managePeople) return false;
      if (p.assignableRoles.length === ROLES.length) return true;
      const who = p.assignableRoles.map((r) => ROLE_PLURAL[r]).join(" and ");
      return who.charAt(0).toUpperCase() + who.slice(1);
    },
  },
  { label: "See who changed what (Change Log)", cell: (p) => p.seeChangeLog },
  { label: "Danger Zone: delete seasons and data", cell: (p) => p.dangerZone },
];

/**
 * May this person change this game's plays, clock and score? The final lock:
 * an assistant can until the game is final ('completed'), a head coach or
 * admin always, staff never. A cancelled game is shut to assistants as well,
 * since the first play recorded on it would set it live again.
 */
export function canEditGameStats(perms: Permissions, status: string | null | undefined): boolean {
  if (perms.editFinalGames) return true;
  if (!perms.recordGames) return false;
  return status !== "completed" && status !== "cancelled";
}

/** Why a game is view-only for this person, in a coach's words. */
export function readOnlyReason(perms: Permissions, status: string | null | undefined): string | null {
  if (canEditGameStats(perms, status)) return null;
  if (!perms.recordGames) return "View only. Your role can see games but not change them.";
  if (status === "cancelled") return "This game was cancelled. Only a head coach or admin can reopen it.";
  return "This game is final. Only a head coach or admin can change it.";
}
