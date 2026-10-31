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
 *
 * A return fumble (caught, run with, then fumbled) and a muff his own team
 * fell on keep their returner, and the engine's return line already counts
 * the fumble off the play's fumble event. What it cannot do is the lost one:
 * the team charge and the kicking player who fell on it, which are added here
 * the same way as a lost muff.
 */
import {
  PlayType,
  SpecialTeamsResult,
  type DefensiveStats,
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

export function initDefStats(playerId: string, playerName: string): DefensiveStats {
  return {
    playerId,
    playerName,
    totalTackles: 0,
    soloTackles: 0,
    assistedTackles: 0,
    tacklesForLoss: 0,
    sacks: 0,
    halfSacks: 0,
    sackYards: 0,
    qbHits: 0,
    pressures: 0,
    interceptions: 0,
    interceptionYards: 0,
    interceptionTouchdowns: 0,
    passesDefended: 0,
    forcedFumbles: 0,
    fumbleRecoveries: 0,
    fumbleRecoveryYards: 0,
    fumbleRecoveryTouchdowns: 0,
    safeties: 0,
    stuffs: 0,
    missedTackles: 0,
    targetedInCoverage: 0,
    completionsAllowed: 0,
    yardsAllowedInCoverage: 0,
    touchdownsAllowedInCoverage: 0,
  };
}

/** The fumble a transformer attaches to a muff the kickers recovered. */
export function lostMuffFumble(
  mufferId: string | undefined,
  kickingTeamId: string,
  recoveredBy?: string,
): FumbleEvent | undefined {
  return mufferId ? { fumbledBy: mufferId, recoveryTeam: kickingTeamId, ...(recoveredBy ? { recoveredBy } : {}) } : undefined;
}

/**
 * The fumble a transformer attaches to a return fumble, or to a muff the
 * receivers kept (every muff is his fumble; see kickReceiptOf). The recoverer rides
 * only when the kickers fell on it: the engine credits a recovery to anyone
 * on the team that did not kick, so naming a receiving teammate who fell on
 * his own man's fumble would hand him a defensive fumble recovery.
 */
export function returnFumbleEvent(
  returnerId: string | undefined,
  kickingTeamId: string,
  receivingTeamId: string,
  lost: boolean,
  recoveredBy?: string,
): FumbleEvent | undefined {
  if (!returnerId) return undefined;
  return lost
    ? { fumbledBy: returnerId, recoveryTeam: kickingTeamId, ...(recoveredBy ? { recoveredBy } : {}) }
    : { fumbledBy: returnerId, recoveryTeam: receivingTeamId };
}

/** A muffed or fumbled kick the kicking team fell on. */
function isLostLooseKick(play: Play): play is Play & { fumble: FumbleEvent; result?: string } {
  const p = play as Play & { fumble?: FumbleEvent };
  return (play.type === PlayType.Punt || play.type === PlayType.Kickoff)
    && p.fumble != null
    && p.fumble.recoveryTeam === play.context.possessionTeam;
}

/**
 * Charge each lost muff to the receiver (a return fumble) and to his team
 * (a fumble lost and a turnover), and a lost return fumble to his team. The
 * kicking player named as the recoverer gets the fumble recovery. Mutates
 * the summary, like the other supplements.
 */
export function applyLostMuffs(
  summary: GameSummary,
  plays: readonly Play[],
  names?: ReadonlyMap<string, string>,
): void {
  for (const play of plays) {
    if (!isLostLooseKick(play)) continue;
    // A return fumble keeps its returner, so the engine's return line has
    // already counted it. A muff has no returner and no return line.
    if (play.result === SpecialTeamsResult.Muff) {
      const muffer = play.fumble.fumbledBy;
      const ret = summary.returns[muffer]
        ?? (summary.returns[muffer] = blankReturnStats(muffer, names?.get(muffer) ?? muffer));
      if (play.type === PlayType.Punt) ret.puntReturnFumbles += 1;
      else ret.kickReturnFumbles += 1;
    }

    const recoverer = play.fumble.recoveredBy;
    if (recoverer) {
      const d = summary.defense[recoverer]
        ?? (summary.defense[recoverer] = initDefStats(recoverer, names?.get(recoverer) ?? recoverer));
      d.fumbleRecoveries += 1;
    }

    const kicking = play.context.possessionTeam;
    const receiving = kicking === summary.homeTeam.id ? summary.awayTeamStats : summary.homeTeamStats;
    receiving.fumblesLost += 1;
    receiving.turnovers += 1;
  }
}
