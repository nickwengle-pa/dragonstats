/**
 * What the review screen is allowed to claim about where the ball ends up.
 *
 * A dead-ball flag is arithmetic: nothing happened, so marking the penalty off
 * from the previous spot IS the answer, and the modal runs the same
 * enforcement the recorder would get after submitting so the preview cannot
 * drift from the result.
 *
 * A LIVE-ball flag is not arithmetic, and this is the bug this module exists
 * to stop coming back. That same projection is handed `yards: 0` and the
 * PRE-SNAP situation, because at the point it runs the play has not been
 * submitted. On a scrimmage down that is merely optimistic. On a kickoff it is
 * reliably wrong in a way that looks plausible: kicking from the 40, any
 * ten-yard flag enforces to the 50 and prints "50 - 1 & 10" no matter what the
 * return did. A thirty-two yard return and a spot foul at the receiver's 26
 * both vanish, and the operator gets a confident number that is out by most of
 * the field.
 *
 * Real enforcement needs the foul spot, which team fouled, whether the foul is
 * a spot foul, and the NFHS basic-spot rules for fouls during a kick - none of
 * which the projection is given. So the honest answer for a live-ball flag is
 * to claim nothing and let the operator place the ball, by hand here or on the
 * Adjust Next Situation sheet the flag already pops. A blank is recoverable;
 * a wrong spot that reads as computed gets trusted and saved.
 */

import { getPenaltyDefaultSide, type PenaltySide } from "../components/game/types.ts";

export interface Situation {
  ballOn: number;
  down: number;
  distance: number;
}

export interface ReviewSpot extends Situation {
  /** "operator" when a human typed it, "computed" when enforcement produced it. */
  source: "operator" | "computed";
}

export function reviewNextSpot(o: {
  /** The flag itself. No flag, nothing to say. */
  penalty: string | null;
  /** True only for the stand-alone penalty play type, where no snap happened. */
  isDeadBall: boolean;
  /** A spot the operator set by hand, which outranks everything. */
  override: Situation | null;
  /** The engine's enforcement, trustworthy for dead-ball flags only. */
  projection: Situation | null;
}): ReviewSpot | null {
  if (!o.penalty) return null;
  if (o.override) return { ...o.override, source: "operator" };
  if (o.isDeadBall && o.projection) return { ...o.projection, source: "computed" };
  return null;
}


/**
 * Which team a flag lands on before anyone touches it.
 *
 * Four fouls carry no `defaultSide` in the rules table, because either team
 * can commit them: facemask, unsportsmanlike conduct, block in the back and
 * clipping. That was harmless while the operator picked a side from two
 * buttons, and is not harmless now the control prefills and offers a swap - a
 * null side would name a team on screen while storing nothing, and Record Play
 * would refuse with no visible reason.
 *
 * So those four get a contextual guess, and the UI says it is guessing.
 *
 * The blocking fouls are the two worth getting right, since they are the
 * common return fouls: on a kick the blocking is done by the RECEIVING team,
 * which is "defense" here because possession sits with the kicking team; on a
 * scrimmage down it is the offense doing the blocking. Facemask and
 * unsportsmanlike genuinely have no lean, and default to the defense.
 */
export function flagSideDefault(label: string, isKickPlay: boolean): PenaltySide {
  const fromRules = getPenaltyDefaultSide(label);
  if (fromRules) return fromRules;
  if (label === "Block in Back" || label === "Clipping") {
    return isKickPlay ? "defense" : "offense";
  }
  return "defense";
}
