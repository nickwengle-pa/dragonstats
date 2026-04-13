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
  { id: "kneel", label: "Kneel", color: "neutral", category: "run", roles: ["rusher"] },
  { id: "spike", label: "Spike", color: "neutral", category: "other", roles: ["passer"] },

  // Pass plays
  { id: "pass_comp", label: "Complete", color: "blue", category: "pass", roles: ["passer", "receiver"] },
  { id: "pass_inc", label: "Incomplete", color: "neutral", category: "pass", roles: ["passer", "target"] },
  { id: "sack", label: "Sack", color: "red", category: "pass", roles: ["passer", "sacker"] },

  // Scoring
  { id: "pat", label: "PAT Kick", color: "amber", category: "scoring", roles: ["kicker"] },
  { id: "two_pt", label: "2PT", color: "amber", category: "scoring", roles: ["passer", "receiver"] },
  { id: "fg", label: "Field Goal", color: "amber", category: "scoring", roles: ["kicker"] },

  // Kicking
  { id: "kickoff", label: "Kickoff", color: "purple", category: "kicking", roles: ["kicker", "returner"] },
  { id: "punt", label: "Punt", color: "purple", category: "kicking", roles: ["punter", "returner"] },
  { id: "blocked_kick", label: "Blocked", color: "red", category: "kicking", roles: ["blocker"] },

  // Turnovers
  { id: "fumble", label: "Fumble", color: "orange", category: "turnover", roles: ["rusher", "forced_fumble", "fumble_recovery"] },
  { id: "int", label: "INT", color: "red", category: "turnover", roles: ["passer", "interceptor"] },

  // Other
  { id: "safety", label: "Safety", color: "red", category: "other", roles: ["tackler"] },
  { id: "penalty_only", label: "Penalty", color: "yellow", category: "other", roles: [] },
];

export function findPlayTypeDef(typeId: string): PlayTypeDef | undefined {
  return PLAY_TYPES.find(p => p.id === typeId);
}

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

export const OFFENSIVE_FORMATIONS = [
  "I-Form", "Pro-I", "Strong-I", "Shotgun", "Pistol", "Single Back",
  "Spread", "Trips", "Double Tight", "Wildcat", "Goal Line", "Ace",
  "Empty", "Wing-T", "Power-I",
];

export const DEFENSIVE_FORMATIONS = [
  "4-3", "3-4", "4-4", "5-2", "5-3", "Nickel", "Dime", "Quarter",
  "46", "3-3 Stack", "4-2-5", "Goal Line",
];

export const QUARTER_LABELS = ["", "1st", "2nd", "3rd", "4th", "OT"];
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
