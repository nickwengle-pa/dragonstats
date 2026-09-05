/**
 * Where the ball goes after a live-ball flag.
 *
 * The app already collects everything this needs - the spot of the foul, which
 * team fouled, the yardage, and where the play ended - so the previous
 * behaviour of refusing to compute anything was leaving the operator to do
 * arithmetic the app could do. What it must NOT do is the thing it was doing
 * before: marking off from the previous spot regardless, which on a kickoff
 * from the 40 produced the 50 for every ten-yard foul no matter what the
 * return did.
 *
 * NFHS enforcement in the form this needs:
 *
 *   Basic spot. A running play (a kick return, a run, any return of a
 *   turnover) has its basic spot at the END of the run. A loose-ball play (a
 *   pass, or a kick before anyone possesses it) has its basic spot at the
 *   PREVIOUS spot. NFHS 10-4.
 *
 *   All-but-one. Everything is marked off from the basic spot, with one
 *   exception: a foul by the team IN POSSESSION, committed BEHIND the basic
 *   spot, is marked off from the spot of the foul. This is the rule that makes
 *   the reported play work - clipping by the returning team at their own 26 on
 *   a return that reached the kicker's 48 is enforced from the 26, not the 48.
 *
 * Coordinates. `ballOn` is measured from the possessing team's own goal line,
 * where "possessing" means possession as it stood BEFORE the snap. On a kick
 * that is the KICKING team, so a returner advances by DECREASING ballOn. The
 * happy consequence is that the direction of a mark-off needs no special
 * cases: a penalty on the pre-snap offense always moves the ball toward
 * ballOn 0, and one on the pre-snap defense always toward ballOn 100, whoever
 * ends up with the ball. That is the same sign convention gameFlow already
 * uses, so this module changes only WHICH SPOT is marked off from.
 *
 * What this deliberately does not decide: whether the penalty was accepted.
 * Declining is the operator's call and is handled before this is reached.
 */

import type { PenaltySide } from "../components/game/types.ts";

/** The kind of play the flag happened during, which fixes the basic spot. */
export type PlayKind =
  /** Anyone was carrying the ball when it ended - a return, a run, a catch. */
  | "running"
  /** Nobody possessed it - an incompletion, or a place kick. */
  | "loose_ball"
  /** No play happened at all. */
  | "dead_ball";

export interface Situation {
  ballOn: number;
  down: number;
  distance: number;
}

export interface EnforcementInput {
  side: PenaltySide;
  flagYards: number;
  /** Pre-snap situation. ballOn is in the pre-snap possession's frame. */
  before: Situation;
  /** Where the operator marked the foul, same frame. Null when not collected. */
  foulSpotBallOn: number | null;
  /** Where the play finished, same frame. Null when there was no play. */
  playEndBallOn: number | null;
  kind: PlayKind;
  /**
   * Who had the ball when the play ENDED, named in pre-snap terms.
   * "defense" on a kick return or after a turnover; "offense" otherwise.
   */
  possessionAtEnd: PenaltySide;
  /** Yards for a fresh series, from game config. */
  firstDownDistance: number;
}

export interface Enforcement extends Situation {
  /** True when the team that did not start the down ends up with the ball. */
  possessionFlips: boolean;
  /** Short phrase for the UI, e.g. "from the foul spot". */
  from: string;
  /** Whether the penalty yardage itself produced a new series. */
  newSeries: boolean;
}

const clamp = (n: number) => Math.max(1, Math.min(99, n));

/**
 * The spot everything is marked off from, before the all-but-one exception.
 * A running play uses where the run ended; anything else uses the snap.
 */
function basicSpot(i: EnforcementInput): number {
  if (i.kind === "running" && i.playEndBallOn != null) return i.playEndBallOn;
  return i.before.ballOn;
}

/**
 * True when the foul happened behind the basic spot, from the point of view of
 * the team that had the ball.
 *
 * Which way "behind" points depends on who is carrying it. The pre-snap
 * offense advances by increasing ballOn, so behind them is a LOWER number. A
 * returner - a kick receiver, or a defense that just took the ball away -
 * advances by decreasing ballOn, so behind them is a HIGHER one.
 */
function isBehind(foulSpot: number, basic: number, carrier: PenaltySide): boolean {
  return carrier === "offense" ? foulSpot < basic : foulSpot > basic;
}

/**
 * Mark off the yardage against the offending team, respecting
 * half-the-distance-to-the-goal.
 *
 * A flag on the pre-snap offense moves the ball toward ballOn 0; one on the
 * pre-snap defense moves it toward 100. Half the distance is measured from the
 * ENFORCEMENT spot, not from the snap - marking off from the foul spot and
 * then halving from somewhere else would put the ball in a third place.
 */
function markOff(spot: number, side: PenaltySide, yards: number): number {
  if (side === "offense") {
    const half = Math.max(1, Math.floor(spot / 2));
    return clamp(spot - Math.min(yards, half));
  }
  const half = Math.max(1, Math.floor((100 - spot) / 2));
  return clamp(spot + Math.min(yards, half));
}

/**
 * The full enforcement, or null when there is not enough to go on.
 *
 * Null is a real answer and the UI must handle it: a running play whose end
 * spot was never recorded cannot be enforced from a basic spot that does not
 * exist, and a made-up number is worse than asking.
 */
export function enforcePenalty(i: EnforcementInput): Enforcement | null {
  if (i.kind !== "dead_ball" && i.playEndBallOn == null) return null;

  const basic = basicSpot(i);

  /* All-but-one. The exception needs a foul spot AND the foul to be on the
     team carrying the ball; a foul by the other team is always marked off from
     the basic spot however far upfield it happened. */
  const useFoulSpot =
    i.foulSpotBallOn != null
    && i.side === i.possessionAtEnd
    && isBehind(i.foulSpotBallOn, basic, i.possessionAtEnd);

  const spot = useFoulSpot ? i.foulSpotBallOn! : basic;
  const ballOn = markOff(spot, i.side, i.flagYards);

  const from = useFoulSpot
    ? "from the foul spot"
    : i.kind !== "running"
      ? "from the snap"
      : "from the end of the run";

  /* A change of possession during the down starts a new series wherever the
     ball ends up, so the down and distance are not carried over. A kick is the
     everyday case; a turnover reaches here the same way. */
  const flips = i.possessionAtEnd === "defense";
  if (flips) {
    return {
      ballOn,
      down: 1,
      distance: Math.min(i.firstDownDistance, Math.max(1, 100 - ballOn)),
      possessionFlips: true,
      from,
      newSeries: true,
    };
  }

  /* Same team keeps the ball, so the down replays unless the yardage itself
     reached the line to gain. NFHS has no automatic first downs - the repo
     changed this deliberately after checking with the coach - so defensive
     holding and DPI get their distance and nothing more. */
  const gained = ballOn - i.before.ballOn;
  const madeIt = i.side === "defense" && gained >= i.before.distance;
  if (madeIt) {
    return {
      ballOn,
      down: 1,
      distance: Math.min(i.firstDownDistance, Math.max(1, 100 - ballOn)),
      possessionFlips: false,
      from,
      newSeries: true,
    };
  }

  return {
    ballOn,
    down: i.before.down,
    distance: Math.max(1, Math.min(99, i.before.distance - gained)),
    possessionFlips: false,
    from,
    newSeries: false,
  };
}
