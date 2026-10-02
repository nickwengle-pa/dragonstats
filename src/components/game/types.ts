/**
 * Shared types for game components.
 */
import { lookupPenalty } from "football-stats-engine/dist/calculators/penalty-catalog.js";

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
  /** Explicit team credit, rather than a player to identify during film review. */
  teamCreditConfirmed?: boolean;
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

/** The id a jersey-only opponent is tagged under. See opponentsForPicker. */
export function quickAddOpponentId(jersey: number): string {
  return `opp_UNK_${jersey}`;
}

/** A row quick-add saved: nothing known but the number. */
export function isNumberOnlyOpponent(p: OpponentPlayerRef): boolean {
  return p.position == null && p.jersey_number != null
    && p.name.trim() === `#${p.jersey_number}`;
}

/**
 * Opponent players as the pickers should offer them.
 *
 * Quick-add tags `opp_UNK_{jersey}` at once, with no wait on the network, and
 * saves an opponent_players row ("#7", no position) behind it. That row comes
 * back with a uuid, and from the next play on the picker offered the uuid — so
 * one player's stats landed on two lines: the play they were added on, and
 * every play after it. Offering number-only rows under the quick-add id keeps
 * them one player, and still does after a reload, when only the saved row is left.
 *
 * Rows with a real name or position keep their uuid; plays already recorded
 * are tagged with it. This is only what pickers see — GameScreen keeps the
 * uuid, and its name map resolves both ids, so older tags still label right.
 */
export function opponentsForPicker(players: OpponentPlayerRef[]): OpponentPlayerRef[] {
  const seen = new Set<string>();
  const out: OpponentPlayerRef[] = [];
  for (const p of players) {
    const id = isNumberOnlyOpponent(p) ? quickAddOpponentId(p.jersey_number!) : p.id;
    // Two saved rows for one number (a retried add) would be two tiles with
    // the same key — and the same player.
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id === p.id ? p : { ...p, id });
  }
  return out;
}

/**
 * Was this stored TEAM tag the operator's choice of "Team", rather than
 * "identify on film later"? Read per tag; plays saved before that was stored
 * carried one play-level flag, which only ever covered tackles and sacks.
 */
export function teamTagConfirmed(
  tag: { role?: unknown; confirmed?: unknown },
  playData: Record<string, unknown> | null | undefined,
): boolean {
  if (tag.confirmed === true) return true;
  return playData?.team_tackle_confirmed === true && (tag.role === "tackler" || tag.role === "sacker");
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
  goalToGo?: boolean;
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

// Stored labels remain compatible with existing games; names and rules come
// from the engine's standalone catalog, also usable by plain-node flow tests.
const PENALTY_CODES: Record<string, string> = {
  Offsides: "offsides", "False Start": "false_start",
  "Holding-OFF": "holding_offense", "Holding-DEF": "holding_defense",
  "PI-OFF": "offensive_pass_interference", "PI-DEF": "defensive_pass_interference",
  Facemask: "face_mask", Unsportsmanlike: "unsportsmanlike_conduct",
  "Delay of Game": "delay_of_game", "Illegal Formation": "illegal_formation",
  "Block in Back": "illegal_block_in_back", Clipping: "clipping",
  Encroachment: "encroachment", "Illegal Shift": "illegal_shift", "Illegal Motion": "illegal_motion",
  "Blindside Block": "blindside_block", "Blocking Below the Waist": "blocking_below_waist",
  "Chop Block": "chop_block", "Facemask (Incidental)": "face_mask_incidental",
  "Free Kick Infraction": "free_kick_infraction", "Horse Collar Tackle": "horse_collar",
  Hurdling: "hurdling", "Roughing the Passer": "roughing_the_passer",
  "Roughing the Kicker": "roughing_the_kicker", "Roughing the Holder": "roughing_the_holder",
  "Roughing the Snapper": "roughing_the_snapper", "Running Into the Kicker": "running_into_the_kicker",
  "Intentional Grounding": "intentional_grounding", "Illegal Forward Pass": "illegal_forward_pass",
  "Illegal Forward Handoff": "illegal_forward_handoff", "Illegal Use of Hands": "illegal_use_of_hands",
  "Illegal Substitution": "illegal_substitution", "Illegal Participation": "illegal_participation",
  "Illegal Batting": "illegal_batting", "Illegal Kick": "illegal_kick",
  "Illegal Touching of a Pass": "illegal_touching", "Ineligible Receiver Downfield": "ineligible_receiver_downfield",
  "Unnecessary Roughness": "unnecessary_roughness", "Late Hit": "late_hit",
  Targeting: "targeting", Taunting: "taunting", "Kick Catch Interference": "kick_catch_interference",
  Tripping: "tripping",
  // Stored aliases from the expanded picker retain their labels on existing plays.
  "Illegal Block Below Waist": "blocking_below_waist",
  "Ineligible Downfield": "ineligible_receiver_downfield",
  "Running Into Kicker": "running_into_the_kicker",
  "Horse Collar": "horse_collar", "Personal Foul": "unnecessary_roughness",
};

export const PENALTIES = Object.keys(PENALTY_CODES);

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
  name: string;
  defaultSide?: PenaltySide;
  /** Standard NFHS distance. Pre-fills the modal; always overridable. */
  yards: number;
  /** Grants a first down regardless of the distance gained. Under NFHS only
   *  the roughing fouls do — see grantsAutoFirstDown. */
  autoFirstDown?: boolean;
  /** Offensive foul that also costs the down (NFHS 7-5: intentional grounding,
   *  an illegal forward pass). */
  lossOfDown: boolean;
  /** On a punt, an accepted foul by the receiving team that wipes the kick out:
   *  the kicking team keeps the ball, marked off from the previous spot, and
   *  the punt and its return never happened. See kickVoidedByPenalty. */
  voidsKick?: boolean;
  /** Plays this foul is commonly called on, which the picker lists first.
   *  Absent means it is only ever found under "All penalties". */
  on?: PenaltyContext[];
  replayDown: boolean;
  isPreSnap: boolean;
  enforcementFrom: "auto" | "previous_spot" | "spot_of_foul" | "end_of_play";
}

/** What kind of snap a flag is being added to, for ordering the picker. */
export type PenaltyContext = "pre_snap" | "run" | "pass" | "kick";

const PENALTY_CONTEXTS: Record<string, PenaltyContext[]> = {
  offsides: ["pre_snap", "kick"], false_start: ["pre_snap"],
  holding_offense: ["run", "pass", "kick"], holding_defense: ["run", "pass"],
  offensive_pass_interference: ["pass"], defensive_pass_interference: ["pass"],
  face_mask: ["run", "pass", "kick"], face_mask_incidental: ["run", "pass", "kick"],
  unsportsmanlike_conduct: ["pre_snap", "run", "pass", "kick"],
  delay_of_game: ["pre_snap"], illegal_formation: ["pre_snap", "run", "pass"],
  illegal_block_in_back: ["run", "kick"], clipping: ["run", "kick"],
  encroachment: ["pre_snap"], illegal_shift: ["pre_snap"],
  illegal_motion: ["pre_snap", "run", "pass"], illegal_substitution: ["pre_snap"],
  illegal_use_of_hands: ["run", "pass"], blocking_below_waist: ["run", "kick"],
  blindside_block: ["run", "pass", "kick"], hurdling: ["run"],
  roughing_the_passer: ["pass"], intentional_grounding: ["pass"],
  illegal_forward_pass: ["pass"], illegal_forward_handoff: ["run", "pass"],
  ineligible_receiver_downfield: ["pass"], illegal_touching: ["pass"],
  roughing_the_kicker: ["kick"], roughing_the_holder: ["kick"], roughing_the_snapper: ["kick"],
  running_into_the_kicker: ["kick"], kick_catch_interference: ["kick"],
  free_kick_infraction: ["kick"], illegal_batting: ["kick"], illegal_kick: ["kick"],
  horse_collar: ["run", "pass", "kick"], unnecessary_roughness: ["run", "pass", "kick"],
  late_hit: ["run", "pass", "kick"], taunting: ["pre_snap", "run", "pass", "kick"],
  illegal_participation: ["pre_snap", "run", "pass", "kick"], tripping: ["run", "kick"],
};

export const PENALTY_RULES: Record<string, PenaltyRule> = Object.fromEntries(
  Object.entries(PENALTY_CODES).map(([label, engineCode]) => {
    const def = lookupPenalty(engineCode);
    if (!def) throw new Error(`Penalty missing from engine catalog: ${engineCode}`);
    const spotFoul = ["intentional_grounding", "illegal_forward_pass", "illegal_forward_handoff", "illegal_touching"].includes(engineCode);
    const previousSpot = def.isPreSnap || ["offensive_pass_interference", "defensive_pass_interference", "ineligible_receiver_downfield"].includes(engineCode);
    return [label, {
      engineCode, name: label === "Facemask" ? "Facemask (Excessive)" : def.name,
      yards: def.yards.high_school,
      // App sides are relative to possession at the snap, including kicks and returns.
      defaultSide: engineCode === "kick_catch_interference" ? "offense"
        : engineCode === "horse_collar" || def.isOffensivePenalty === null ? undefined
        : def.isOffensivePenalty ? "offense" : "defense",
      autoFirstDown: def.autoFirstDown.high_school, lossOfDown: def.lossOfDown,
      replayDown: def.replayDown, isPreSnap: def.isPreSnap,
      voidsKick: ["roughing_the_kicker", "roughing_the_holder", "roughing_the_snapper", "running_into_the_kicker"].includes(engineCode),
      on: PENALTY_CONTEXTS[engineCode],
      enforcementFrom: spotFoul ? "spot_of_foul" : previousSpot ? "previous_spot" : engineCode === "late_hit" ? "end_of_play" : "auto",
    } satisfies PenaltyRule];
  }),
);

export const PENALTY_OPTIONS = PENALTIES
  .filter((label, index) => PENALTIES.findIndex(other => PENALTY_CODES[other] === PENALTY_CODES[label]) === index)
  .map(label => ({ label, name: PENALTY_RULES[label].name, yards: PENALTY_RULES[label].yards }));

export function penaltyDisplayName(label: string | null | undefined): string {
  return label ? PENALTY_RULES[label]?.name ?? label : "";
}

/** The picker's "likely on this play" group for a play type. */
export function penaltyContextFor(playTypeId: string, category?: string): PenaltyContext {
  if (category === "penalty" || playTypeId === "penalty_only") return "pre_snap";
  if (["kickoff", "onside_kick", "punt", "fair_catch", "fg", "pat", "blocked_kick"].includes(playTypeId)) return "kick";
  if (["pass_comp", "pass_inc", "sack", "int", "throwaway", "drop", "spike", "two_pt"].includes(playTypeId)) return "pass";
  return "run";
}

/** Penalties split into the ones usually called on this kind of play, then
 *  everything else, each in PENALTIES order. */
export function penaltiesFor(context: PenaltyContext): { likely: string[]; rest: string[] } {
  const likely = PENALTIES.filter(p => PENALTY_RULES[p]?.on?.includes(context));
  return { likely, rest: PENALTIES.filter(p => !likely.includes(p)) };
}

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
 * NFHS first-down defaults come from the engine's high-school definitions.
 * Holding and pass interference do not grant an automatic first down.
 */
export function grantsAutoFirstDown(
  label: string | null | undefined,
  side: PenaltySide | null,
): boolean {
  if (!label || side !== "defense") return false;
  return PENALTY_RULES[label]?.autoFirstDown === true;
}

/** An offensive foul that also costs the down — grounding, an illegal pass. */
export function penaltyCostsDown(
  label: string | null | undefined,
  side: PenaltySide | null,
): boolean {
  if (!label || side !== "offense") return false;
  return PENALTY_RULES[label]?.lossOfDown === true;
}

/** Kicks a foul on the receiving team can wipe out. A field goal is left out
 *  on purpose: taking the flag over a made kick also takes the points away,
 *  and that call is the operator's (decline it to keep the three). */
const VOIDABLE_KICKS = new Set(["punt", "fair_catch"]);

/**
 * True when an accepted flag means the punt never happened.
 *
 * Roughing or running into the kicker is enforced from the previous spot and
 * the kicking team keeps the ball — roughing with a first down on top. The
 * punt is replaced by the walk-off, so its distance, the return and any tackle
 * on it count for nobody. Every consumer that credits a punt has to ask this:
 * the engine transform, the live-stats transform, and the report's own net
 * punting and inside-20 counts.
 */
export function kickVoidedByPenalty(
  playTypeId: string,
  label: string | null | undefined,
  side: PenaltySide | null | undefined,
  enforcement: "accepted" | "declined" | "offset" | null | undefined,
): boolean {
  if (!label || !VOIDABLE_KICKS.has(playTypeId)) return false;
  if ((enforcement ?? "accepted") !== "accepted") return false;
  const resolved = side ?? getPenaltyDefaultSide(label);
  return resolved === "defense" && PENALTY_RULES[label]?.voidsKick === true;
}

/**
 * True when an accepted flag means the play is replaced by the penalty: no
 * stat from the snap counts for anybody, only the flag.
 *
 * `override` is the operator's own call, stored as play_data.penalty_play_counts
 * - false forces the play out, true keeps it in against the rules below. The
 * officials decide this on the field, and the rules here only cover what the
 * app can know; the override is how the press box says what actually happened.
 *
 * Without an override this is the roughing-the-kicker rule. The engine applies
 * its own rule to runs and passes (a foul that replays the down wipes them),
 * which a true override also switches off - see buildPenalties.
 */
export function penaltyWipesPlay(
  playTypeId: string,
  label: string | null | undefined,
  side: PenaltySide | null | undefined,
  enforcement: "accepted" | "declined" | "offset" | null | undefined,
  override?: boolean | null,
): boolean {
  if (!label || (enforcement ?? "accepted") !== "accepted") return false;
  if (override === false) return true;
  if (override === true) return false;
  return kickVoidedByPenalty(playTypeId, label, side, enforcement);
}

/** penaltyWipesPlay for a stored row, reading the same play_data fields the
 *  transformer's penalty builder does. */
export function isWipedByPenaltyRow(row: {
  play_type: string;
  is_penalty?: boolean | null;
  play_data?: unknown;
}): boolean {
  if (row.is_penalty === false) return false;
  const pd = (row.play_data ?? {}) as Record<string, unknown>;
  const label = typeof pd.penalty_type === "string" ? pd.penalty_type : null;
  const side = pd.play_category === "offense" || pd.play_category === "defense" ? pd.play_category : null;
  const enforcement = pd.penalty_enforcement === "declined" || pd.penalty_enforcement === "offset"
    ? pd.penalty_enforcement
    : "accepted";
  const override = typeof pd.penalty_play_counts === "boolean" ? pd.penalty_play_counts : null;
  return penaltyWipesPlay(row.play_type, label, side, enforcement, override);
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
  // A number-only player is *named* "#7"; don't print it twice.
  if (t.name && t.name !== "?" && t.name.trim() !== num) {
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
  /** A fumble on the play. Without it a defensive scoop-and-score read
   *  "#7 sacked -7 · TD", which says the offense scored. */
  fumbleInfo?: {
    recoveredBy?: TaggedPlayer;
    lost: boolean;
    returnYards: number;
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

  if (fumbleInfo) {
    const who = fumbleInfo.recoveredBy
      ? `rec ${playerLabel(fumbleInfo.recoveredBy)}`
      : fumbleInfo.lost ? "lost" : "kept";
    const ret = fumbleInfo.returnYards ? `, ret ${fumbleInfo.returnYards} yds` : "";
    parts.push(pt.id === "fumble" ? `${who}${ret}` : `Fumble ${who}${ret}`);
  }
  if (scored) parts.push("TD");
  if (penalty) parts.push(`PEN: ${penalty}`);
  return parts.join(" · ");
}
