/* Shared, deliberately small play model for the entry-concept prototypes.
 *
 * These prototypes exist to compare *how a play is entered*, not to score
 * it. So the rules here are the minimum that makes a recorded play read back
 * believably (gain, first down, touchdown, a change of possession on a kick);
 * none of this touches the stats engine or Supabase. A concept that wins gets
 * rebuilt on the real PlayEntryModal plumbing, not promoted from this file. */

export type Side = "us" | "them";

export interface P {
  id: string;
  jersey: number;
  name: string;
  pos: string;
  side: Side;
}

export type Kind = "run" | "pass" | "inc" | "sack" | "punt" | "fg" | "kneel" | "pen";

export const KIND_LABEL: Record<Kind, string> = {
  run: "Run", pass: "Catch", inc: "Incomplete", sack: "Sack",
  punt: "Punt", fg: "Field goal", kneel: "Kneel", pen: "Penalty",
};

export type PuntEnd = "fair" | "downed" | "return" | "touchback" | "oob";

export interface Draft {
  kind?: Kind;
  /** Ball carrier, receiver, punter or kicker: the player the play is "about". */
  who?: P;
  /** Passer on a pass, incomplete or sack. */
  qb?: P;
  /** Yards gained from the line of scrimmage (punt: kick distance). */
  gain?: number;
  tacklers: P[];
  /** Punt only. */
  puntEnd?: PuntEnd;
  returner?: P;
  returnYards?: number;
  /** Field goal only. */
  good?: boolean;
  /** Penalty only. */
  flag?: { name: string; yards: number; on: Side };
}

export const emptyDraft = (): Draft => ({ tacklers: [] });

export interface Situation {
  quarter: number;
  clock: string;
  down: number;
  distance: number;
  /** Yards from the offense's own goal line, 1..99. */
  ballOn: number;
  possession: Side;
  us: number;
  them: number;
}

export const START: Situation = { quarter: 2, clock: "7:42", down: 1, distance: 10, ballOn: 35, possession: "us", us: 14, them: 7 };

const mk = (side: Side) => ([j, name, pos]: [number, string, string]): P => ({ id: `${side}-${j}`, jersey: j, name, pos, side });

/* Ordered roughly by how often they touch the ball, which is the order the
 * concepts that rank by usage would show them in mid-game. */
export const OUR_OFFENSE: P[] = ([
  [22, "Jordan Reed", "RB"], [7, "Alex Miller", "QB"], [3, "Casey Hill", "WR"],
  [24, "Chris Bell", "RB"], [11, "Taylor King", "WR"], [80, "Drew Lane", "TE"],
  [5, "Nate Ruiz", "WR"], [12, "Sam Davis", "QB"], [18, "Ryan Shaw", "K/P"],
] as [number, string, string][]).map(mk("us"));

export const OUR_DEFENSE: P[] = ([
  [44, "Morgan Stone", "LB"], [52, "Jamie Brooks", "LB"], [9, "Parker Cole", "DB"],
  [55, "Riley West", "DL"], [21, "Avery Fox", "DB"], [33, "Eli Grant", "LB"],
  [90, "Owen Pike", "DL"], [2, "Luke Ortiz", "DB"],
] as [number, string, string][]).map(mk("us"));

export const THEIR_OFFENSE: P[] = ([
  [4, "#4", "RB"], [10, "#10", "QB"], [1, "#1", "WR"], [88, "#88", "TE"], [15, "#15", "WR"], [26, "#26", "RB"], [17, "#17", "K/P"],
] as [number, string, string][]).map(mk("them"));

export const THEIR_DEFENSE: P[] = ([
  [40, "#40", "LB"], [51, "#51", "LB"], [8, "#8", "DB"], [32, "#32", "LB"], [20, "#20", "DB"], [99, "#99", "DL"], [6, "#6", "DB"],
] as [number, string, string][]).map(mk("them"));

export const offenseFor = (s: Situation) => (s.possession === "us" ? OUR_OFFENSE : THEIR_OFFENSE);
export const defenseFor = (s: Situation) => (s.possession === "us" ? THEIR_DEFENSE : OUR_DEFENSE);
export const findJersey = (list: P[], j: number) => list.find(p => p.jersey === j);
export const isKicker = (p: P) => /K|P/.test(p.pos) && !/QB/.test(p.pos);

export const ABBR: Record<Side, string> = { us: "DRG", them: "VIS" };

/** "DRG 40" for a ball spot given in the offense's frame. */
export function spotLabel(s: Situation, ballOn: number): string {
  const own = s.possession;
  const other: Side = own === "us" ? "them" : "us";
  if (ballOn >= 100) return `${ABBR[other]} end zone`;
  if (ballOn <= 0) return `${ABBR[own]} end zone`;
  if (ballOn === 50) return "50";
  return ballOn < 50 ? `${ABBR[own]} ${ballOn}` : `${ABBR[other]} ${100 - ballOn}`;
}

export const ordinal = (n: number) => ["", "1st", "2nd", "3rd", "4th"][n] ?? `${n}th`;
export const downLine = (s: Situation) =>
  `${ordinal(s.down)} & ${s.ballOn + s.distance >= 100 ? "Goal" : s.distance}`;

const tag = (p?: P) => (p ? `#${p.jersey}${p.side === "us" ? ` ${p.name.split(" ")[1] ?? ""}`.trimEnd() : ""}` : "?");
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** What must still be filled before Save is allowed. Empty = ready. */
export function missing(d: Draft): string[] {
  const out: string[] = [];
  if (!d.kind) return ["play"];
  if (d.kind === "pen") return d.flag ? [] : ["flag"];
  if (d.kind === "kneel") return [];
  if (!d.who && d.kind !== "sack" && d.kind !== "inc") out.push(d.kind === "punt" ? "punter" : d.kind === "fg" ? "kicker" : d.kind === "pass" ? "receiver" : "runner");
  if ((d.kind === "pass" || d.kind === "inc" || d.kind === "sack") && !d.qb) out.push("QB");
  if (d.kind === "fg" && d.good === undefined) out.push("good / no good");
  if (d.kind !== "inc" && d.kind !== "fg" && d.gain === undefined) out.push(d.kind === "punt" ? "punt distance" : "yards");
  if (d.kind === "punt" && !d.puntEnd) out.push("how it ended");
  return out;
}

export function nextSituation(s: Situation, d: Draft): Situation {
  const flip = (ballOn: number): Situation => ({
    ...s, possession: s.possession === "us" ? "them" : "us", down: 1, distance: 10,
    ballOn: Math.max(1, Math.min(99, 100 - ballOn)),
  });
  const score = (pts: number) => (s.possession === "us" ? { us: s.us + pts } : { them: s.them + pts });
  switch (d.kind) {
    case "punt": {
      const land = s.ballOn + (d.gain ?? 0);
      if (d.puntEnd === "touchback" || land >= 100) return flip(80);
      return flip(Math.min(99, land - (d.puntEnd === "return" ? d.returnYards ?? 0 : 0)));
    }
    case "fg":
      return d.good ? { ...s, ...score(3), possession: s.possession === "us" ? "them" : "us", down: 1, distance: 10, ballOn: 35 }
        : flip(Math.max(20, s.ballOn - 7));
    case "pen": {
      if (!d.flag) return s;
      const yds = d.flag.on === s.possession ? -d.flag.yards : d.flag.yards;
      const ballOn = Math.max(1, Math.min(99, s.ballOn + yds));
      const togo = s.distance - (ballOn - s.ballOn);
      return togo <= 0 ? { ...s, ballOn, down: 1, distance: Math.min(10, 100 - ballOn) } : { ...s, ballOn, distance: togo };
    }
    default: {
      const gain = d.kind === "inc" ? 0 : d.gain ?? 0;
      const ballOn = s.ballOn + gain;
      if (ballOn >= 100) return { ...s, ...score(6), ...flip(65), down: 1, distance: 10, us: s.possession === "us" ? s.us + 6 : s.us, them: s.possession === "them" ? s.them + 6 : s.them };
      const togo = s.distance - gain;
      if (togo <= 0) return { ...s, ballOn, down: 1, distance: Math.min(10, 100 - ballOn) };
      if (s.down === 4) return flip(ballOn);
      return { ...s, ballOn: Math.max(1, ballOn), down: s.down + 1, distance: togo };
    }
  }
}

/** The play read back as one line, the same idea as today's run/pass footer. */
export function sentence(s: Situation, d: Draft): string {
  if (!d.kind) return "Pick what happened";
  const parts: string[] = [];
  const end = s.ballOn + (d.gain ?? 0);
  switch (d.kind) {
    case "run": parts.push(`${tag(d.who)} run`); break;
    case "pass": parts.push(`${tag(d.qb)} pass to ${tag(d.who)}`); break;
    case "inc": parts.push(`${tag(d.qb)} pass incomplete${d.who ? ` to ${tag(d.who)}` : ""}`); break;
    case "sack": parts.push(`${tag(d.qb)} sacked`); break;
    case "kneel": parts.push(`${tag(d.who ?? d.qb)} kneel`); break;
    case "punt": parts.push(`${tag(d.who)} punt${d.gain !== undefined ? ` ${d.gain} yds` : ""}`); break;
    case "fg": parts.push(`${tag(d.who)} ${100 - s.ballOn + 17}-yd FG${d.good === undefined ? "" : d.good ? " GOOD" : " no good"}`); break;
    case "pen": parts.push(d.flag ? `Flag: ${d.flag.name} on ${ABBR[d.flag.on]}, ${d.flag.yards} yds` : "Flag"); break;
  }
  if (["run", "pass", "sack", "kneel"].includes(d.kind) && d.gain !== undefined) {
    parts.push(end >= 100 ? "TOUCHDOWN" : `${signed(d.gain)} to ${spotLabel(s, end)}`);
  }
  if (d.kind === "punt" && d.puntEnd) {
    const ret = d.returner ? tag(d.returner) : "returner";
    parts.push(d.puntEnd === "fair" ? `fair catch ${ret}` : d.puntEnd === "downed" ? "downed" : d.puntEnd === "touchback" ? "touchback" : d.puntEnd === "oob" ? "out of bounds" : `${ret} return ${d.returnYards ?? 0}`);
  }
  if (d.tacklers.length) parts.push(`tackled by ${d.tacklers.map(t => `#${t.jersey}`).join(", ")}`);
  if (!missing(d).length) {
    const n = nextSituation(s, d);
    parts.push(n.possession !== s.possession ? `Next: ${ABBR[n.possession]} ball at ${spotLabel(n, n.ballOn)}` : `Next: ${downLine(n)}`);
  }
  return parts.join(" · ");
}

export const PENALTIES: Array<{ name: string; yards: number; on: "o" | "d" }> = [
  { name: "False start", yards: 5, on: "o" }, { name: "Offside", yards: 5, on: "d" },
  { name: "Holding", yards: 10, on: "o" }, { name: "Pass interference", yards: 15, on: "d" },
  { name: "Delay of game", yards: 5, on: "o" }, { name: "Facemask", yards: 15, on: "d" },
];
