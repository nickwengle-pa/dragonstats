/**
 * Every point scored in the game, and who scored it.
 *
 * There were three answers to "what is the score" and they disagreed:
 *
 *   - the live replay's running total (applyScoreDelta), which is what the
 *     operator watches and what gets written to the games row;
 *   - the transformer's scoreForPlay, used to fill each play's context;
 *   - the engine's scoringPlays ledger, which the box score's LINE SCORE is
 *     built from.
 *
 * The engine's is the one that shows. It never scored a two-point conversion
 * or a safety at all — the transformer deliberately keeps conversions away
 * from it, because the engine counts a two-point pass as a passing touchdown —
 * and it credits every score to whoever had the ball at the snap, so a
 * pick-six landed in the wrong team's quarter. The final score came from
 * somewhere else entirely, so the quarters did not add up to it on a box score
 * a coach hands out.
 *
 * This is the one answer. Scoring side is decided in exactly one place, and
 * the quarter totals sum to the final score because they are the same events.
 */

/** The least a play has to be for the ledger to score it. */
export interface ScorablePlay {
  quarter: number;
  /** App play type: "rush", "pat", "two_pt", "fg", "safety", … */
  type: string;
  /** Which side had the ball at the snap. */
  possession: "us" | "them";
  isTouchdown?: boolean;
  /** True when the ball changed hands on this play — see scoringSide.spec. */
  turnover?: boolean;
  /** "Good", "Returned", … for kicks and conversions. */
  result?: string;
  playData?: Record<string, unknown> | null;
  /** Clock at the snap, already formatted. Only used for display. */
  clock?: string;
  description?: string;
}

export type ScoringKind =
  | "touchdown"
  | "return_touchdown"
  | "pat"
  | "two_point"
  | "field_goal"
  | "safety"
  | "conversion_return"
  | "correction";

export interface ScoringEvent {
  quarter: number;
  /** The team the points belong to — NOT necessarily the one that snapped it. */
  side: "us" | "them";
  points: number;
  kind: ScoringKind;
  /** Carried through so the scoring summary can be built from these same
   *  events rather than from a second, disagreeing list. */
  clock?: string;
  description?: string;
}

const other = (side: "us" | "them"): "us" | "them" => (side === "us" ? "them" : "us");

/**
 * Did the ball change hands before this play ended in the end zone?
 *
 * Asking the play TYPE misses the way most fumbles are recorded: a fumble on a
 * run, a sack or a completed pass rides the "+ Fumble" modifier and keeps its
 * own type, so only the standalone Fumble button ever produced type "fumble".
 * `turnover` is set by the modal from whether the offence recovered its own
 * fumble, so it is the honest signal. Kicks are listed because a return there
 * is not a turnover — nobody lost the ball, it was kicked away on purpose.
 */
function isReturnTouchdown(play: ScorablePlay): boolean {
  return (
    play.turnover === true
    || play.type === "kickoff"
    || play.type === "punt"
    || play.type === "blocked_kick"
  );
}

/** Points from one play, in the order they happened. Usually zero or one. */
export function scoringEventsForPlay(play: ScorablePlay): ScoringEvent[] {
  const events: ScoringEvent[] = [];
  const q = play.quarter;
  const shown = { clock: play.clock, description: play.description };

  if (play.isTouchdown) {
    const isReturn = isReturnTouchdown(play);
    events.push({
      quarter: q,
      side: isReturn ? other(play.possession) : play.possession,
      points: 6,
      kind: isReturn ? "return_touchdown" : "touchdown",
      ...shown,
    });
  }

  if (play.type === "pat" && play.result === "Good") {
    events.push({ quarter: q, side: play.possession, points: 1, kind: "pat", ...shown });
  }

  if (play.type === "fg" && play.result === "Good") {
    events.push({ quarter: q, side: play.possession, points: 3, kind: "field_goal", ...shown });
  }

  if (play.type === "two_pt" && play.result === "Good") {
    events.push({ quarter: q, side: play.possession, points: 2, kind: "two_point", ...shown });
  }

  // A safety is recorded against the team that conceded it: possession is the
  // offence that was tackled in its own end zone.
  if (play.type === "safety") {
    events.push({ quarter: q, side: other(play.possession), points: 2, kind: "safety", ...shown });
  }

  // A conversion attempt returned the other way is two points for the defence.
  if ((play.type === "pat" || play.type === "two_pt") && play.result === "Returned") {
    events.push({ quarter: q, side: other(play.possession), points: 2, kind: "conversion_return", ...shown });
  }

  /* Manual corrections are recorded as plays, so they have to be part of the
     ledger too — otherwise any replay silently drops the operator's fix, and
     the quarters stop matching the final score again. */
  if (play.type === "score_correction") {
    const pd = play.playData ?? {};
    const team = pd.score_delta_team;
    const delta = Number(pd.score_delta ?? 0);
    if ((team === "us" || team === "them") && Number.isFinite(delta) && delta !== 0) {
      events.push({ quarter: q, side: team, points: delta, kind: "correction", ...shown });
    }
  }

  return events;
}

export function scoringEvents(plays: ScorablePlay[]): ScoringEvent[] {
  return plays.flatMap(scoringEventsForPlay);
}

export interface Score { us: number; them: number }

export function totalScore(events: ScoringEvent[]): Score {
  return events.reduce<Score>(
    (acc, e) => {
      if (e.side === "us") acc.us += e.points;
      else acc.them += e.points;
      return acc;
    },
    { us: 0, them: 0 },
  );
}

/** Points per quarter per side. Sums to totalScore by construction. */
export function scoreByQuarter(events: ScoringEvent[]): {
  us: Record<number, number>;
  them: Record<number, number>;
} {
  const us: Record<number, number> = {};
  const them: Record<number, number> = {};
  for (const e of events) {
    const bucket = e.side === "us" ? us : them;
    bucket[e.quarter] = (bucket[e.quarter] ?? 0) + e.points;
  }
  return { us, them };
}
