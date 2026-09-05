/**
 * What the review screen is allowed to claim about where the ball ends up.
 *
 * There are three ways a next spot can be arrived at, and they are not equally
 * trustworthy, so they are kept apart and labelled:
 *
 *   operator  - the recorder typed it. Always wins. It is a statement about
 *               what the officials actually did, which outranks any rule the
 *               app knows.
 *   computed  - a DEAD-ball flag, marked off from the previous spot by
 *               gameFlow's enforcement. Nothing happened, so the previous spot
 *               is the right spot and this is simple arithmetic.
 *   enforced  - a LIVE-ball flag, resolved by services/penaltyEnforcement from
 *               the foul spot, the basic spot and which team fouled.
 *
 * The distinction that matters is the last one. gameFlow's enforcement is
 * handed the PRE-SNAP situation with yards: 0, because at review time the play
 * has not been submitted, and it marks off from there regardless of what the
 * play did. For a dead-ball flag that is correct. For a live-ball flag it is
 * reliably wrong in a way that looks plausible: on a kickoff from the 40 every
 * ten-yard foul enforced to the 50 and printed "50 - 1 & 10" no matter what
 * the return did, so a 32-yard return and a clipping foul spotted at the
 * receiver's 26 both vanished.
 *
 * That was reported twice. The first fix silenced the guess and showed nothing
 * for live-ball flags, which was honest but left arithmetic to the operator
 * that the app had all the inputs for. penaltyEnforcement now does it properly,
 * and this module's job is just to pick the right source and label it, so the
 * screen never presents an enforced spot and a mechanical one as if they were
 * the same kind of claim.
 */

import { getPenaltyDefaultSide, type PenaltySide } from "../components/game/types.ts";

export interface Situation {
  ballOn: number;
  down: number;
  distance: number;
}

export interface ReviewSpot extends Situation {
  source: "operator" | "computed" | "enforced";
  /** Where it was marked off from, for the enforced case. Empty otherwise. */
  from: string;
}

export function reviewNextSpot(o: {
  /** The flag itself. No flag, nothing to say. */
  penalty: string | null;
  /** True only for the stand-alone penalty play type, where no snap happened. */
  isDeadBall: boolean;
  /** A spot the operator set by hand, which outranks everything. */
  override: Situation | null;
  /** gameFlow's enforcement. Trustworthy for dead-ball flags only. */
  projection: Situation | null;
  /** penaltyEnforcement's answer for a live-ball flag. */
  enforced: (Situation & { from: string }) | null;
}): ReviewSpot | null {
  if (!o.penalty) return null;
  if (o.override) return { ...o.override, source: "operator", from: "" };
  if (o.isDeadBall) {
    return o.projection ? { ...o.projection, source: "computed", from: "" } : null;
  }
  return o.enforced ? { ...o.enforced, source: "enforced" } : null;
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
