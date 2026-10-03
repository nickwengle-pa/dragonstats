/**
 * A muffed kick the kicking team fell on, charged as a fumble lost.
 *
 * By rule a muff is not a fumble - the receiver never had the ball - but the
 * stat books charge it to him as one, and it is a turnover for his team. The
 * engine cannot do that: it attributes a fumble against the team in
 * possession, and on a kick that is the KICKING team, so it reads "kicking
 * team recovered" as "offense kept it". Its special-teams path ignores
 * fumbles altogether.
 *
 * So the transformers mark the play - result Muff, with a fumble whose
 * recovery team is the kicking team - and this credits it after the engine
 * has run. Both the live panel and the final stats go through here, so they
 * agree.
 */
import {
  PlayType,
  SpecialTeamsResult,
  type FumbleEvent,
  type GameSummary,
  type Play,
  type ReturnStats,
} from "football-stats-engine";

function blankReturnStats(playerId: string, playerName: string): ReturnStats {
  return {
    playerId, playerName,
    kickReturns: 0, kickReturnYards: 0, kickReturnAverage: 0, kickReturnLong: 0,
    kickReturnTouchdowns: 0, kickReturnFumbles: 0,
    puntReturns: 0, puntReturnYards: 0, puntReturnAverage: 0, puntReturnLong: 0,
    puntReturnTouchdowns: 0, puntReturnFumbles: 0, puntReturnFairCatches: 0,
  };
}

/** The fumble a transformer attaches to a muff the kickers recovered. */
export function lostMuffFumble(mufferId: string | undefined, kickingTeamId: string): FumbleEvent | undefined {
  return mufferId ? { fumbledBy: mufferId, recoveryTeam: kickingTeamId } : undefined;
}

function isLostMuff(play: Play): play is Play & { fumble: FumbleEvent } {
  const p = play as Play & { result?: string; fumble?: FumbleEvent };
  return (play.type === PlayType.Punt || play.type === PlayType.Kickoff)
    && p.result === SpecialTeamsResult.Muff
    && p.fumble != null
    && p.fumble.recoveryTeam === play.context.possessionTeam;
}

/**
 * Charge each lost muff to the receiver (a return fumble) and to his team
 * (a fumble lost and a turnover). Mutates the summary, like the other
 * supplements.
 */
export function applyLostMuffs(
  summary: GameSummary,
  plays: readonly Play[],
  names?: ReadonlyMap<string, string>,
): void {
  for (const play of plays) {
    if (!isLostMuff(play)) continue;
    const muffer = play.fumble.fumbledBy;
    const ret = summary.returns[muffer]
      ?? (summary.returns[muffer] = blankReturnStats(muffer, names?.get(muffer) ?? muffer));
    if (play.type === PlayType.Punt) ret.puntReturnFumbles += 1;
    else ret.kickReturnFumbles += 1;

    const kicking = play.context.possessionTeam;
    const receiving = kicking === summary.homeTeam.id ? summary.awayTeamStats : summary.homeTeamStats;
    receiving.fumblesLost += 1;
    receiving.turnovers += 1;
  }
}
