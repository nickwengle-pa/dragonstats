/**
 * Shared types for game components.
 */

export interface RosterPlayer {
  id: string;
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  positions: string[] | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
  };
}

export interface OpponentPlayerRef {
  id: string;
  name: string;
  jersey_number: number | null;
  position: string | null;
}

export interface TaggedPlayer {
  id: string;
  player_id: string;
  jersey_number: number | null;
  name: string;
  role: string;
  credit?: number;
  isOpponent?: boolean;
  /** Our side, but no roster row — an unrostered jersey seen during live entry.
   *  Stats accrue under the number until a coach resolves it from Roster. */
  isPending?: boolean;
  /** Our side, deliberately unattributed — "somebody on our team did this, I
   *  couldn't see who". A live-entry placeholder resolved during film review,
   *  not a claim about a player. See TEAM_PLAYER_ID below. */
  isTeam?: boolean;
}

/* ─────────────────────────────────────────────
   Pending (unrostered) players
   ─────────────────────────────────────────────
   A jersey number recorded during a game with nobody rostered under it. These
   have no `players` row, so they cannot go in `play_players` (FK) — they ride
   in play_data.pending_tagged, exactly like opponent tags do. Resolution
   (merge / promote / discard) happens on the Roster screen after the game. */

export const PENDING_ID_PREFIX = "pending_";

/** Stable per-jersey id so the same unknown #42 aggregates across plays. */
export function makePendingId(jersey: number): string {
  return `${PENDING_ID_PREFIX}${jersey}`;
}

export function isPendingId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(PENDING_ID_PREFIX);
}

/** Jersey number back out of a pending id, or null if it isn't one. */
export function pendingJerseyFromId(id: string): number | null {
  if (!isPendingId(id)) return null;
  const n = Number(id.slice(PENDING_ID_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

/** Display name for a pending tag — "#42" reads better than a fake name. */
export function pendingDisplayName(jersey: number | null): string {
  return jersey != null ? `#${jersey}` : "#?";
}

/**
 * True only for tags backed by a real `players` row, i.e. the ones that can
 * become play_players rows. Opponent tags and pending tags both fail this.
 *
 * Every play_players write must filter through this — a pending tag reaching
 * that insert would violate the foreign key and fail the whole save.
 */
export function isRosterTag(
  tag: Pick<TaggedPlayer, "isOpponent" | "isPending" | "isTeam">,
): boolean {
  return !tag.isOpponent && !tag.isPending && !tag.isTeam;
}

/* ─────────────────────────────────────────────
   TEAM tags (our side, unidentified)
   ─────────────────────────────────────────────
   A play where our team clearly did something — made the tackle, caught the
   ball — but the jersey wasn't readable in real time. Tagging TEAM records
   that the credit is owed and unassigned, which a blank role does not: blank
   is indistinguishable from "forgot to enter it".

   Like pending and opponent tags this has no `players` row, so it stays out of
   play_players and rides in play_data.team_tagged. Resolution happens in film
   review, where re-picking the role replaces TEAM with the real player(s) —
   including splitting one TEAM tackle into two tacklers. Left alone it stays
   TEAM forever, which is a legitimate end state. */

/**
 * Repair a legacy quick-added opponent id.
 *
 * Quick-add used to mint `quick_{jersey}_{timestamp}`, which broke the
 * `opp_{position}_{jersey}` contract LiveStatsPanel uses to decide which side
 * a stat belongs to — those tags were counted as OURS and labelled with the
 * raw id. Applied on read so games already recorded come out right, with no
 * migration to run and nothing to get wrong offline. Plays rewritten after
 * this are stored in the correct form anyway.
 */
export function normalizeOppTagId(id: string, jersey: number | null): string {
  if (!id.startsWith("quick_")) return id;
  const fromId = Number(id.split("_")[1]);
  const n = jersey ?? (Number.isFinite(fromId) ? fromId : null);
  return `opp_UNK_${n ?? 0}`;
}

export const TEAM_PLAYER_ID = "our_team";

export function isTeamId(id: string | null | undefined): boolean {
  return id === TEAM_PLAYER_ID;
}

/** The TEAM placeholder for a role. `credit` is left to the caller — a TEAM
 *  tackle is still one tackle. */
export function makeTeamTag(role: string): TaggedPlayer {
  return {
    id: TEAM_PLAYER_ID,
    player_id: TEAM_PLAYER_ID,
    jersey_number: null,
    name: "TEAM",
    role,
    isTeam: true,
  };
}

export type PenaltySide = "offense" | "defense";
export type BlockedKickType = "field_goal" | "extra_point" | "punt" | "kickoff";

export interface PlayRecord {
  id: string;
  sequence?: number;
  quarter: number;
  clock: number;
  type: string;
  yards: number;
  result: string;
  penalty: string | null;
  penaltyEnforcement?: "accepted" | "declined" | "offset";
  flagYards: number;
  isTouchdown: boolean;
  firstDown: boolean;
  turnover: boolean;
  tagged: TaggedPlayer[];
  ballOn: number;
  down: number;
  distance: number;
  description: string;
  possession: "us" | "them";
  isTouchback?: boolean;
  penaltyCategory?: PenaltySide | null;
  blockedKickType?: BlockedKickType | null;
  nextPossession?: "us" | "them";
  nextDown?: number;
  nextDistance?: number;
  nextBallOn?: number;
  offensiveFormation?: string | null;
  defensiveFormation?: string | null;
  hashMark?: string | null;
  playData?: Record<string, unknown>;
}

export interface GameState {
  quarter: number;
  clock: number;
  possession: "us" | "them";
  ourScore: number;
  theirScore: number;
  down: number;
  distance: number;
  ballOn: number;
}

export interface PlayTypeDef {
  id: string;
  label: string;
  color: string;
  category: "run" | "pass" | "scoring" | "kicking" | "turnover" | "other";
  roles: string[];
}

/* ── Play type definitions (FSA-style quick action grid) ── */

export const PLAY_TYPES: PlayTypeDef[] = [
  // Run plays
  { id: "rush", label: "Run", color: "emerald", category: "run", roles: ["rusher"] },
  { id: "scramble", label: "Scramble", color: "emerald", category: "run", roles: ["passer"] },
  { id: "kneel", label: "Kneel", color: "neutral", category: "run", roles: ["rusher"] },
  { id: "spike", label: "Spike", color: "neutral", category: "other", roles: ["passer"] },

  // Pass plays
  { id: "pass_comp", label: "Complete", color: "blue", category: "pass", roles: ["passer", "receiver"] },
  { id: "pass_inc", label: "Incomplete", color: "neutral", category: "pass", roles: ["passer", "target"] },
  { id: "throwaway", label: "Throw Away", color: "neutral", category: "pass", roles: ["passer"] },
  { id: "drop", label: "Drop", color: "neutral", category: "pass", roles: ["passer", "target"] },
  /* No "sacker" here on purpose. The defensive credit is taken on the defense
     step instead, which is multi-select with split credit — a sack shared by
     two players is 0.5 each, exactly how the tackler step already works. As a
     single-select role it could only ever hold one name, and it also made the
     operator name the same player twice: sacker, then tackler. */
  { id: "sack", label: "Sack", color: "red", category: "pass", roles: ["passer"] },

  // Scoring
  { id: "pat", label: "PAT Kick", color: "amber", category: "scoring", roles: ["kicker"] },
  { id: "two_pt", label: "2PT", color: "amber", category: "scoring", roles: ["passer", "receiver"] },
  { id: "fg", label: "Field Goal", color: "amber", category: "scoring", roles: ["kicker"] },

  // Kicking
  { id: "kickoff", label: "Kickoff", color: "purple", category: "kicking", roles: ["kicker", "returner"] },
  { id: "onside_kick", label: "Onside", color: "purple", category: "kicking", roles: ["kicker", "recoverer"] },
  { id: "punt", label: "Punt", color: "purple", category: "kicking", roles: ["punter", "returner"] },
  { id: "fair_catch", label: "Fair Catch", color: "purple", category: "kicking", roles: ["punter", "returner"] },
  /* Kicker first (it was still his attempt), then who blocked it, then who
     fell on it. Either team can recover a blocked kick, so `recoverer` is
     resolved against a recovered-by toggle rather than a fixed side. */
  { id: "blocked_kick", label: "Blocked", color: "red", category: "kicking", roles: ["kicker", "blocker", "recoverer"] },

  // Turnovers
  { id: "fumble", label: "Fumble", color: "orange", category: "turnover", roles: ["rusher", "forced_fumble", "fumble_recovery"] },
  { id: "int", label: "INT", color: "red", category: "turnover", roles: ["passer", "interceptor"] },

  // Other
  { id: "safety", label: "Safety", color: "red", category: "other", roles: ["tackler"] },
  { id: "penalty_only", label: "Penalty", color: "yellow", category: "other", roles: [] },
  // Pre-snap quick actions (one-tap; bypass the PlayEntry modal in GameScreen)
  { id: "false_start", label: "False Start", color: "yellow", category: "other", roles: [] },
  { id: "encroachment", label: "Encroachment", color: "yellow", category: "other", roles: [] },
];

export function findPlayTypeDef(typeId: string): PlayTypeDef | undefined {
  return PLAY_TYPES.find(p => p.id === typeId);
}

/**
 * Roles where the same player recurs snap after snap, so the last selection is
 * carried into the next play to save taps during live entry.
 *
 * Deliberately excluded: receiver, tackler, interceptor, forced_fumble,
 * fumble_recovery, sacker, blocker. Those change nearly every snap, and a
 * pre-filled wrong name is worse than an empty one — it mis-credits stats
 * silently, which is exactly what this app exists to get right.
 *
 * Carried-over tags are always shown as such in the entry modal so they read as
 * a suggestion, never as a confirmed pick.
 */
export const STICKY_ROLES = new Set([
  "passer", "rusher", "kicker", "punter", "returner",
]);

export const PENALTIES = [
  "Offsides", "False Start", "Holding-OFF", "Holding-DEF",
  "PI-OFF", "PI-DEF", "Facemask", "Unsportsmanlike",
  "Delay of Game", "Illegal Formation", "Block in Back",
  "Clipping", "Encroachment", "Illegal Shift", "Illegal Motion",
];

export const BLOCKED_KICK_TYPES: Array<{ value: BlockedKickType; label: string }> = [
  { value: "field_goal", label: "Field Goal" },
  { value: "extra_point", label: "PAT / XP" },
  { value: "punt", label: "Punt" },
  { value: "kickoff", label: "Kickoff" },
];

const PENALTY_METADATA: Record<string, { engineCode: string; defaultSide?: PenaltySide }> = {
  Offsides: { engineCode: "offsides", defaultSide: "defense" },
  "False Start": { engineCode: "false_start", defaultSide: "offense" },
  "Holding-OFF": { engineCode: "holding_offense", defaultSide: "offense" },
  "Holding-DEF": { engineCode: "holding_defense", defaultSide: "defense" },
  "PI-OFF": { engineCode: "offensive_pass_interference", defaultSide: "offense" },
  "PI-DEF": { engineCode: "defensive_pass_interference", defaultSide: "defense" },
  Facemask: { engineCode: "face_mask" },
  Unsportsmanlike: { engineCode: "unsportsmanlike_conduct" },
  "Delay of Game": { engineCode: "delay_of_game", defaultSide: "offense" },
  "Illegal Formation": { engineCode: "illegal_formation", defaultSide: "offense" },
  "Block in Back": { engineCode: "illegal_block_in_back" },
  Clipping: { engineCode: "clipping" },
  Encroachment: { engineCode: "encroachment", defaultSide: "defense" },
  "Illegal Shift": { engineCode: "illegal_shift", defaultSide: "offense" },
  "Illegal Motion": { engineCode: "illegal_motion", defaultSide: "offense" },
};

export const OFFENSE_PENALTIES = new Set([
  "False Start", "Holding-OFF", "PI-OFF", "Illegal Formation",
  "Delay of Game", "Illegal Shift", "Illegal Motion", "Clipping",
]);

export const PENALTY_DEFAULT_YARDS: Record<string, number> = {
  "Offsides": 5, "False Start": 5, "Holding-OFF": 10, "Holding-DEF": 5,
  "PI-OFF": 10, "PI-DEF": 15, "Facemask": 15, "Unsportsmanlike": 15,
  "Delay of Game": 5, "Illegal Formation": 5, "Block in Back": 10,
  "Clipping": 15, "Encroachment": 5, "Illegal Shift": 5, "Illegal Motion": 5,
};

export function getPenaltyEngineCode(label: string | null | undefined): string | undefined {
  return label ? PENALTY_METADATA[label]?.engineCode : undefined;
}

export function getPenaltyDefaultSide(label: string | null | undefined): PenaltySide | null {
  return label ? PENALTY_METADATA[label]?.defaultSide ?? null : null;
}

export function isPenaltyOnOffense(
  label: string | null | undefined,
  explicitSide?: PenaltySide | null,
): boolean {
  const resolvedSide = explicitSide ?? getPenaltyDefaultSide(label);
  return resolvedSide === "offense";
}

/**
 * Defensive penalties that grant an automatic first down regardless of yardage.
 * NFHS rules: defensive holding (5 + auto 1st) and defensive pass interference
 * (15 + auto 1st) are the most common; major facemask, roughing the passer, and
 * unsportsmanlike on defense also carry auto-1st. The user's catalog covers the
 * first two cleanly; the rest fall back to "no auto 1st" until explicitly added.
 */
export const AUTO_FIRST_DOWN_DEFENSIVE_PENALTIES = new Set([
  "Holding-DEF",
  "PI-DEF",
]);

export function grantsAutoFirstDown(
  label: string | null | undefined,
  side: PenaltySide | null,
): boolean {
  if (!label || side !== "defense") return false;
  return AUTO_FIRST_DOWN_DEFENSIVE_PENALTIES.has(label);
}

export const OFFENSIVE_FORMATIONS = [
  "I-Form", "Pro-I", "Strong-I", "Shotgun", "Pistol", "Single Back",
  "Spread", "Trips", "Double Tight", "Wildcat", "Goal Line", "Ace",
  "Empty", "Wing-T", "Power-I",
];

export const DEFENSIVE_FORMATIONS = [
  "4-3", "3-4", "4-4", "5-2", "5-3", "Nickel", "Dime", "Quarter",
  "46", "3-3 Stack", "4-2-5", "Goal Line",
];

export const QUARTER_LABELS = ["", "1st", "2nd", "3rd", "4th", "OT", "2OT", "3OT"];
export const NFHS_QUARTER_SECS = 720;

export function quarterLabel(quarter: number) {
  return QUARTER_LABELS[Math.max(1, Math.min(QUARTER_LABELS.length - 1, quarter))] ?? "1st";
}

/* ── Helpers ── */

export function fmtClock(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function yardLabel(yard: number) {
  if (yard === 50) return "50";
  return yard > 50 ? `OPP ${100 - yard}` : `OWN ${yard}`;
}

function playerLabel(t: TaggedPlayer | undefined): string {
  if (!t) return "?";
  const num = t.jersey_number != null ? `#${t.jersey_number}` : "";
  if (t.name && t.name !== "?") {
    const parts = t.name.trim().split(/\s+/);
    const short = parts.length > 1
      ? `${parts[0][0]}.${parts[parts.length - 1]}`
      : parts[0];
    return num ? `${num} ${short}` : short;
  }
  return num || "?";
}

export function buildDescription(
  pt: PlayTypeDef,
  tagged: TaggedPlayer[],
  yards: number,
  scored: boolean,
  penalty: string | null,
  result: string,
  kickInfo?: {
    kickDistance: number;
    kickedToYard: number;
    returnYards: number;
    isTouchback: boolean;
    landingLabel?: string;
  },
  turnoverInfo?: {
    turnoverSpotLabel?: string;
    returnSpotLabel?: string;
    returnYards?: number | null;
  },
): string {
  const parts: string[] = [];
  const byRole = (r: string) => tagged.find(t => t.role === r);

  switch (pt.id) {
    case "rush": {
      const c = byRole("rusher");
      parts.push(`${playerLabel(c)} rush ${yards > 0 ? "+" : ""}${yards}`);
      break;
    }
    case "pass_comp": {
      const p = byRole("passer"), r = byRole("receiver");
      parts.push(`${playerLabel(p)} → ${playerLabel(r)} ${yards > 0 ? "+" : ""}${yards}`);
      break;
    }
    case "pass_inc": {
      const p = byRole("passer"), r = byRole("target");
      parts.push(`${playerLabel(p)} → ${playerLabel(r)} inc`);
      break;
    }
    case "sack": {
      const p = byRole("passer"), s = byRole("sacker");
      parts.push(`${playerLabel(p)} sacked ${yards}${s ? ` by ${playerLabel(s)}` : ""}`);
      break;
    }
    case "int": {
      const p = byRole("passer"), i = byRole("interceptor");
      const returnSummary = turnoverInfo?.returnSpotLabel
        ? `, ret ${turnoverInfo.returnSpotLabel}${typeof turnoverInfo.returnYards === "number" ? ` (${turnoverInfo.returnYards > 0 ? "+" : ""}${turnoverInfo.returnYards} yds)` : ""}`
        : "";
      parts.push(
        `${playerLabel(p)} INT by ${playerLabel(i)}${turnoverInfo?.turnoverSpotLabel ? ` at ${turnoverInfo.turnoverSpotLabel}` : ""}${returnSummary}`,
      );
      break;
    }
    case "fumble": parts.push("Fumble"); break;
    case "safety": parts.push("Safety"); break;
    case "fg": parts.push(`FG ${result}`.trim()); break;
    case "pat": parts.push(`PAT ${result}`.trim()); break;
    case "two_pt": parts.push(`2PT ${result}`.trim()); break;
    case "kickoff": {
      const k = byRole("kicker"), ret = byRole("returner");
      if (kickInfo) {
        const kickLabel = kickInfo.isTouchback
          ? "Touchback"
          : `to ${kickInfo.landingLabel ?? `OPP ${kickInfo.kickedToYard}`}`;
        const retLabel = !kickInfo.isTouchback && ret ? `, ret ${playerLabel(ret)} ${kickInfo.returnYards} yds` : "";
        parts.push(`Kickoff${k ? ` ${playerLabel(k)}` : ""} ${kickInfo.kickDistance} yds ${kickLabel}${retLabel}`);
      } else {
        parts.push(`Kickoff${k ? ` ${playerLabel(k)}` : ""}${ret ? ` ret ${playerLabel(ret)} ${yards}` : ""}`);
      }
      break;
    }
    case "punt": {
      const p = byRole("punter"), ret = byRole("returner");
      if (kickInfo) {
        const kickLabel = kickInfo.isTouchback
          ? "Touchback"
          : `to ${kickInfo.landingLabel ?? `OPP ${kickInfo.kickedToYard}`}`;
        const retLabel = !kickInfo.isTouchback && ret ? `, ret ${playerLabel(ret)} ${kickInfo.returnYards} yds` : "";
        parts.push(`Punt${p ? ` ${playerLabel(p)}` : ""} ${kickInfo.kickDistance} yds ${kickLabel}${retLabel}`);
      } else {
        parts.push(`Punt${p ? ` ${playerLabel(p)}` : ""}${ret ? ` ret ${playerLabel(ret)} ${yards}` : ""}`);
      }
      break;
    }
    default: parts.push(pt.label); break;
  }

  if (scored) parts.push("TD");
  if (penalty) parts.push(`PEN: ${penalty}`);
  return parts.join(" · ");
}
