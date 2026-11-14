/**
 * Team totals the engine counts once too often.
 *
 * Each of these is the engine's own rule read back against the play it was
 * applied to, so the correction comes off exactly when the engine put it on -
 * nothing is recounted from scratch. They live here rather than in the
 * transformer because the transformer can only change what a play looks like,
 * and in both cases the play is described correctly: the engine just reads two
 * things out of one fact.
 */

import {
  PlayType,
  PassResult,
  PenaltyEnforcement,
  isFirstDown,
  isFourthDown,
  isGoalToGo,
  isPlayNullifiedByPenalty,
  isThirdDown,
  type GameSummary,
  type Play,
  type PassPlay,
  type RushPlay,
  type TeamStats,
} from "football-stats-engine";

function teamStats(summary: GameSummary, teamId: string): TeamStats | null {
  if (summary.homeTeamStats.teamId === teamId) return summary.homeTeamStats;
  if (summary.awayTeamStats.teamId === teamId) return summary.awayTeamStats;
  return null;
}

/** A run, a scramble or a completed pass: the plays the engine credits a
 *  first down to for the yards they gained. */
function earnsFirstDownByGain(play: Play): boolean {
  if (play.type === PlayType.Rush) return isFirstDown(play);
  if (play.type !== PlayType.Pass) return false;
  const result = (play as PassPlay).result;
  return (result === PassResult.Complete || result === PassResult.Scramble) && isFirstDown(play);
}

/**
 * A first down is earned once.
 *
 * A run that reaches the sticks with a flag on the defense added to the end
 * of it came out as two first downs, one rushing and one by penalty (Homer
 * Center: Johnston's 4 yards on 4th & 3 with targeting tacked on - the game
 * showed four first downs and had two). The gain earned it; the flag only
 * moved the ball further.
 */
export function dropDoubledFirstDowns(summary: GameSummary, plays: Play[]): void {
  for (const play of plays) {
    if (play.type !== PlayType.Rush && play.type !== PlayType.Pass) continue;
    if (isPlayNullifiedByPenalty(play) || !earnsFirstDownByGain(play)) continue;
    const offense = play.context.possessionTeam;
    const stat = teamStats(summary, offense);
    if (!stat) continue;
    for (const pen of (play as RushPlay | PassPlay).penalties ?? []) {
      if (pen.enforcement !== PenaltyEnforcement.Accepted || pen.team === offense) continue;
      // The engine's own test for a first down by penalty.
      if (!pen.isAutoFirstDown && !(pen.yards >= play.context.distance && !isGoalToGo(play))) continue;
      stat.firstDowns = Math.max(0, stat.firstDowns - 1);
      stat.firstDownsPenalty = Math.max(0, stat.firstDownsPenalty - 1);
    }
  }
}

/**
 * An interception converts nothing.
 *
 * The engine scores a third or fourth down as converted when the play "gained"
 * the distance or ended in a touchdown, and on an interception both of those
 * describe the RETURN: a pick brought back 10 yards on 3rd & 6, or a pick-six,
 * went down as a conversion for the team that threw it (West Shamokin play 37,
 * and two against our opponents).
 */
export function dropInterceptionConversions(summary: GameSummary, plays: Play[]): void {
  for (const play of plays) {
    if (play.type !== PlayType.Pass || (play as PassPlay).result !== PassResult.Interception) continue;
    if (isPlayNullifiedByPenalty(play)) continue;
    if (!isFirstDown(play) && !(play as PassPlay).isTouchdown) continue;
    const stat = teamStats(summary, play.context.possessionTeam);
    if (!stat) continue;
    if (isThirdDown(play)) stat.thirdDownConversions = Math.max(0, stat.thirdDownConversions - 1);
    if (isFourthDown(play)) stat.fourthDownConversions = Math.max(0, stat.fourthDownConversions - 1);
    // The engine's own percentages, kept in step with the counts they come from.
    stat.thirdDownPercentage = stat.thirdDownAttempts ? stat.thirdDownConversions * 100 / stat.thirdDownAttempts : 0;
    stat.fourthDownPercentage = stat.fourthDownAttempts ? stat.fourthDownConversions * 100 / stat.fourthDownAttempts : 0;
  }
}
