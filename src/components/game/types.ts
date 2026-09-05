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
/** Jersey the TEAM placeholder wears on a stat sheet. 100 is the convention
 *  the printed reports coaches already read use for a team-credited stop, so
 *  a "#100 TEAM" line needs no explaining. */
export const TEAM_JERSEY = 100;

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
  /** Yards carried after a fumble recovery. Feeds FumbleEvent.recoveryYards. */
  fumbleReturnYards?: number | null;
  /** Offense-relative spot where the fumble was recovered. */
  fumbleRecoveredAt?: number | null;
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

/* What kind of play it is, independent of which side had the ball.

   Four groups, matching how a press-box operator actually thinks about a
   snap: it was a run, it was a pass, the kicking unit was on, or nothing was
   snapped at all. The old six split hairs the operator does not - an
   interception IS a pass play and a fumble IS a run play, which is why every
   consumer of this type had to special-case them back together again. */
export type PlayCategory = "run" | "pass" | "special" | "penalty";

export interface PlayTypeDef {
  id: string;
  label: string;
  color: string;
  category: PlayCategory;
  roles: string[];
}

/* ── Play type definitions (FSA-style quick action grid) ── */

export const PLAY_TYPES: PlayTypeDef[] = [
  // ── Run ──────────────────────────────────────────────────────────────
  { id: "rush", label: "Run", color: "emerald", category: "run", roles: ["rusher"] },
  { id: "scramble", label: "Scramble", color: "emerald", category: "run", roles: ["passer"] },
  { id: "kneel", label: "Kneel", color: "neutral", category: "run", roles: ["rusher"] },
  /* A snap nobody had. The yardage is real and has to go somewhere, but it is
     not a carry anybody chose to make - charging the loss to the quarterback
     makes a bad centre exchange look like a bad night from the back. It is
     charged to TEAM instead, which is why this carries no roles: the rusher is
     filled in at submit and there is nobody to pick. */
  { id: "bad_snap", label: "Bad Snap", color: "orange", category: "run", roles: [] },
  /* A fumble files under the play it happened ON, which for a standalone
     fumble is the run. (Most fumbles never reach this button at all - they
     ride the "+ Fumble" modifier on rush/scramble/pass_comp/sack/kneel.) */
  { id: "fumble", label: "Fumble", color: "orange", category: "run", roles: ["rusher", "forced_fumble", "fumble_recovery"] },
  // A safety is a tackle in the end zone, so it sits with the scrimmage plays
  // rather than with the scoring ones.
  { id: "safety", label: "Safety", color: "red", category: "run", roles: ["tackler"] },

  // ── Pass ─────────────────────────────────────────────────────────────
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
  // An interception is a pass play. It was filed under "turnover", which is
  // why every consumer had to add it back to the passes by hand.
  { id: "int", label: "INT", color: "red", category: "pass", roles: ["passer", "interceptor"] },
  // A spike is a deliberate incompletion, not a category of its own.
  { id: "spike", label: "Spike", color: "neutral", category: "pass", roles: ["passer"] },

  // ── Special teams ────────────────────────────────────────────────────
  // Scoring and kicking merged: the kicking unit is on the field for all of
  // it, which is the question an operator is actually answering. The lone
  // exception is a 2PT, a scrimmage snap that lives here because it sits
  // beside the PAT in every operator's head — noted in PostGameReview.unitFor.
  { id: "pat", label: "PAT Kick", color: "amber", category: "special", roles: ["kicker"] },
  { id: "two_pt", label: "2PT", color: "amber", category: "special", roles: ["passer", "receiver"] },
  { id: "fg", label: "Field Goal", color: "amber", category: "special", roles: ["kicker"] },
  { id: "kickoff", label: "Kickoff", color: "purple", category: "special", roles: ["kicker", "returner"] },
  { id: "onside_kick", label: "Onside", color: "purple", category: "special", roles: ["kicker", "recoverer"] },
  { id: "punt", label: "Punt", color: "purple", category: "special", roles: ["punter", "returner"] },
  { id: "fair_catch", label: "Fair Catch", color: "purple", category: "special", roles: ["punter", "returner"] },
  /* Kicker first (it was still his attempt), then who blocked it, then who
     fell on it. Either team can recover a blocked kick, so `recoverer` is
     resolved against a recovered-by toggle rather than a fixed side. */
  { id: "blocked_kick", label: "Blocked", color: "red", category: "special", roles: ["kicker", "blocker", "recoverer"] },

  // ── Penalty / pre-snap ───────────────────────────────────────────────
  // Nothing was snapped. The last two are one-tap and bypass the PlayEntry
  // modal entirely (see GameScreen.handlePreSnapPenalty).
  { id: "penalty_only", label: "Penalty", color: "yellow", category: "penalty", roles: [] },
  { id: "false_start", label: "False Start", color: "yellow", category: "penalty", roles: [] },
  { id: "encroachment", label: "Encroachment", color: "yellow", category: "penalty", roles: [] },
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

/**
 * Fouls enforced from where they happened rather than from the snap.
 *
 * Almost every foul is marked off from the previous spot, which is why the
 * foul-spot field prefills to the line of scrimmage and needs no thought. These
 * are the ones where the spot IS the enforcement - a block in the back on a
 * thirty-yard return brings the ball back to the block, not to the end of the
 * return - so they prefill to where the play ended and ask to be checked.
 *
 * Deliberately short. NFHS marks off pass interference from the previous spot,
 * unlike the college and professional rules, so it is not here.
 */
export const SPOT_FOULS = new Set(["Block in Back", "Clipping"]);

/** Is this foul enforced from where it happened? */
export function isSpotFoul(penalty: string | null | undefined): boolean {
  return !!penalty && SPOT_FOULS.has(penalty);
}

export const BLOCKED_KICK_TYPES: Array<{ value: BlockedKickType; label: string }> = [
  { value: "field_goal", label: "Field Goal" },
  { value: "extra_point", label: "PAT / XP" },
  { value: "punt", label: "Punt" },
  { value: "kickoff", label: "Kickoff" },
];

/**
 * What each foul costs and does, in one table.
 *
 * This used to be split across a metadata map that knew only the engine code
 * and the side, a hardcoded Set of two fouls that granted a first down, and a
 * flat default of 5 yards in the entry modal — so every flag started at 5
 * whether it was a false start or a personal foul, and the operator retyped
 * the real number every time.
 *
 * `yards` is the standard NFHS distance and is only a DEFAULT: the operator
 * still sets the actual number, because a foul can be enforced from a spot
 * that changes it, and half-distance situations are common.
 */
export interface PenaltyRule {
  engineCode: string;
  defaultSide?: PenaltySide;
  /** Standard NFHS distance. Pre-fills the modal; always overridable. */
  yards: number;
  /** Grants a first down regardless of the distance gained. See the note on
   *  AUTO_FIRST_DOWN below — NFHS is not NCAA here. */
  autoFirstDown?: boolean;
}

export const PENALTY_RULES: Record<string, PenaltyRule> = {
  Offsides: { engineCode: "offsides", defaultSide: "defense", yards: 5 },
  "False Start": { engineCode: "false_start", defaultSide: "offense", yards: 5 },
  "Holding-OFF": { engineCode: "holding_offense", defaultSide: "offense", yards: 10 },
  "Holding-DEF": { engineCode: "holding_defense", defaultSide: "defense", yards: 5 },
  "PI-OFF": { engineCode: "offensive_pass_interference", defaultSide: "offense", yards: 15 },
  "PI-DEF": { engineCode: "defensive_pass_interference", defaultSide: "defense", yards: 15 },
  Facemask: { engineCode: "face_mask", yards: 15 },
  Unsportsmanlike: { engineCode: "unsportsmanlike_conduct", yards: 15 },
  "Delay of Game": { engineCode: "delay_of_game", defaultSide: "offense", yards: 5 },
  "Illegal Formation": { engineCode: "illegal_formation", defaultSide: "offense", yards: 5 },
  "Block in Back": { engineCode: "illegal_block_in_back", yards: 10 },
  Clipping: { engineCode: "clipping", yards: 15 },
  Encroachment: { engineCode: "encroachment", defaultSide: "defense", yards: 5 },
  "Illegal Shift": { engineCode: "illegal_shift", defaultSide: "offense", yards: 5 },
  "Illegal Motion": { engineCode: "illegal_motion", defaultSide: "offense", yards: 5 },
};

/** The standard distance for a foul, for pre-filling the entry modal. */
export function penaltyDefaultYards(label: string | null | undefined): number {
  if (!label) return 5;
  return PENALTY_RULES[label]?.yards ?? 5;
}

const PENALTY_METADATA = PENALTY_RULES;

export const OFFENSE_PENALTIES = new Set([
  "False Start", "Holding-OFF", "PI-OFF", "Illegal Formation",
  "Delay of Game", "Illegal Shift", "Illegal Motion", "Clipping",
]);

/** Derived from PENALTY_RULES so the distances cannot drift from the table.
 *  This was a second hand-maintained copy of the same numbers. */
export const PENALTY_DEFAULT_YARDS: Record<string, number> = Object.fromEntries(
  Object.entries(PENALTY_RULES).map(([label, rule]) => [label, rule.yards]),
);

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
 * Automatic first downs, which under NFHS do not exist.
 *
 * This granted one for defensive holding and defensive pass interference,
 * which is the NCAA and NFL rule, not the NFHS one. NFHS enforces the distance
 * and replays the down; the offence gets a new series only if the yardage
 * itself reaches the line to gain. Confirmed with the coach who uses this app
 * before changing it, because it decides fourth downs: a 4th-and-20 defensive
 * pass interference used to hand over a first down and now correctly leaves
 * 4th-and-5 after the 15-yard walk-off.
 *
 * The flag lives on the rule table rather than in a Set, so a ruleset that DOES
 * award them is a data change and not a code change.
 */
export function grantsAutoFirstDown(
  label: string | null | undefined,
  side: PenaltySide | null,
): boolean {
  if (!label || side !== "defense") return false;
  return PENALTY_RULES[label]?.autoFirstDown === true;
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
    case "bad_snap": {
      // No name: the whole point is that the yardage is the team's, not a
      // player's, and printing TEAM here would read as a player called TEAM.
      parts.push(`Bad snap ${yards > 0 ? "+" : ""}${yards}`);
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
