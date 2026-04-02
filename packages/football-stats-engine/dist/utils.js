// ============================================================================
// FOOTBALL STATS ENGINE — UTILITIES
// ============================================================================
import { PlayType, Down, Direction, } from "./types";
// ---------------------------------------------------------------------------
// PASSER RATING (NFL FORMULA)
// ---------------------------------------------------------------------------
export function calculatePasserRating(completions, attempts, yards, touchdowns, interceptions) {
    if (attempts === 0)
        return 0;
    // Each component is clamped between 0 and 2.375
    const clamp = (val) => Math.min(2.375, Math.max(0, val));
    const a = clamp((completions / attempts - 0.3) * 5);
    const b = clamp((yards / attempts - 3) * 0.25);
    const c = clamp((touchdowns / attempts) * 20);
    const d = clamp(2.375 - (interceptions / attempts) * 25);
    return round(((a + b + c + d) / 6) * 100, 1);
}
// ---------------------------------------------------------------------------
// ADJUSTED YARDS PER ATTEMPT
// ---------------------------------------------------------------------------
export function calculateAdjustedYPA(yards, touchdowns, interceptions, attempts) {
    if (attempts === 0)
        return 0;
    return round((yards + 20 * touchdowns - 45 * interceptions) / attempts, 1);
}
// ---------------------------------------------------------------------------
// CLOCK / TIME UTILITIES
// ---------------------------------------------------------------------------
/** Parse "MM:SS" into total seconds */
export function clockToSeconds(clock) {
    const [m, s] = clock.split(":").map(Number);
    return (m || 0) * 60 + (s || 0);
}
/** Convert total seconds back to "MM:SS" */
export function secondsToClock(totalSeconds) {
    const m = Math.floor(Math.abs(totalSeconds) / 60);
    const s = Math.abs(totalSeconds) % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}
/** Time elapsed between two clock readings in the same quarter (clock counts down) */
export function timeElapsed(startClock, endClock) {
    return clockToSeconds(startClock) - clockToSeconds(endClock);
}
/** Quarter duration in seconds (15 min regulation, 10 min OT) */
export function quarterDuration(quarter) {
    return quarter <= 4 ? 900 : 600;
}
// ---------------------------------------------------------------------------
// ROUNDING
// ---------------------------------------------------------------------------
export function round(value, decimals = 1) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}
export function safeDivide(numerator, denominator, decimals = 1) {
    if (denominator === 0)
        return 0;
    return round(numerator / denominator, decimals);
}
// ---------------------------------------------------------------------------
// STAT INITIALIZERS — Create zero-value stat objects
// ---------------------------------------------------------------------------
export function initPassingStats(playerId, playerName) {
    return {
        playerId, playerName,
        completions: 0, attempts: 0, yards: 0, touchdowns: 0, interceptions: 0,
        sacks: 0, sackYardsLost: 0, completionPercentage: 0,
        yardsPerAttempt: 0, yardsPerCompletion: 0, adjustedYardsPerAttempt: 0,
        passerRating: 0, longPass: 0, airYards: 0, yardsAfterCatch: 0,
        timesUnderPressure: 0, completionsUnderPressure: 0, attemptsUnderPressure: 0,
        avgTimeToThrow: 0, playActionAttempts: 0, playActionCompletions: 0,
        playActionYards: 0, screenPassAttempts: 0, screenPassCompletions: 0,
        screenPassYards: 0, firstDowns: 0, twentyPlusYardCompletions: 0,
        fortyPlusYardCompletions: 0, scrambles: 0, scrambleYards: 0,
        throwAways: 0, battedBalls: 0,
        redZoneAttempts: 0, redZoneCompletions: 0, redZoneTouchdowns: 0,
        redZoneInterceptions: 0, thirdDownAttempts: 0, thirdDownCompletions: 0,
        thirdDownConversions: 0,
    };
}
export function initRushingStats(playerId, playerName) {
    return {
        playerId, playerName,
        carries: 0, yards: 0, touchdowns: 0, yardsPerCarry: 0, longRush: 0,
        fumbles: 0, fumblesLost: 0, firstDowns: 0,
        tenPlusYardRuns: 0, twentyPlusYardRuns: 0,
        yardsAfterContact: 0, brokenTackles: 0, stuffedRuns: 0,
        redZoneCarries: 0, redZoneTouchdowns: 0,
        thirdDownCarries: 0, thirdDownConversions: 0,
        rushLeftYards: 0, rushMiddleYards: 0, rushRightYards: 0,
        rushLeftCarries: 0, rushMiddleCarries: 0, rushRightCarries: 0,
        kneels: 0, scrambles: 0, scrambleYards: 0,
    };
}
export function initReceivingStats(playerId, playerName) {
    return {
        playerId, playerName,
        targets: 0, receptions: 0, yards: 0, touchdowns: 0,
        yardsPerReception: 0, yardsPerTarget: 0, catchPercentage: 0,
        longReception: 0, firstDowns: 0, airYards: 0, yardsAfterCatch: 0,
        twentyPlusYardReceptions: 0, fortyPlusYardReceptions: 0,
        drops: 0, fumbles: 0, fumblesLost: 0,
        redZoneTargets: 0, redZoneReceptions: 0, redZoneTouchdowns: 0,
        thirdDownTargets: 0, thirdDownReceptions: 0, thirdDownConversions: 0,
        yardsBeforeCatch: 0, avgDepthOfTarget: 0,
    };
}
export function initDefensiveStats(playerId, playerName) {
    return {
        playerId, playerName,
        totalTackles: 0, soloTackles: 0, assistedTackles: 0,
        tacklesForLoss: 0, sacks: 0, halfSacks: 0, sackYards: 0,
        qbHits: 0, pressures: 0, interceptions: 0, interceptionYards: 0,
        interceptionTouchdowns: 0, passesDefended: 0,
        forcedFumbles: 0, fumbleRecoveries: 0, fumbleRecoveryYards: 0,
        fumbleRecoveryTouchdowns: 0, safeties: 0, stuffs: 0,
        missedTackles: 0, targetedInCoverage: 0, completionsAllowed: 0,
        yardsAllowedInCoverage: 0, touchdownsAllowedInCoverage: 0,
    };
}
export function initKickingStats(playerId, playerName) {
    return {
        playerId, playerName,
        fieldGoalAttempts: 0, fieldGoalMade: 0, fieldGoalPercentage: 0,
        fieldGoalLong: 0, fieldGoalBlocked: 0,
        extraPointAttempts: 0, extraPointMade: 0, extraPointPercentage: 0,
        extraPointBlocked: 0, totalPoints: 0,
        fg0to19Att: 0, fg0to19Made: 0,
        fg20to29Att: 0, fg20to29Made: 0,
        fg30to39Att: 0, fg30to39Made: 0,
        fg40to49Att: 0, fg40to49Made: 0,
        fg50PlusAtt: 0, fg50PlusMade: 0,
        kickoffs: 0, kickoffTouchbacks: 0, kickoffTouchbackPercentage: 0,
        onsideKickAttempts: 0, onsideKickRecoveries: 0,
        averageKickoffDistance: 0,
    };
}
export function initPuntingStats(playerId, playerName) {
    return {
        playerId, playerName,
        punts: 0, puntYards: 0, puntAverage: 0, puntLong: 0,
        puntsInside20: 0, touchbacks: 0, puntsFairCaught: 0,
        puntsBlocked: 0, puntReturnYardsAgainst: 0,
        netPuntAverage: 0, hangTimeAvg: 0,
    };
}
export function initReturnStats(playerId, playerName) {
    return {
        playerId, playerName,
        kickReturns: 0, kickReturnYards: 0, kickReturnAverage: 0,
        kickReturnLong: 0, kickReturnTouchdowns: 0, kickReturnFumbles: 0,
        puntReturns: 0, puntReturnYards: 0, puntReturnAverage: 0,
        puntReturnLong: 0, puntReturnTouchdowns: 0, puntReturnFumbles: 0,
        puntReturnFairCatches: 0,
    };
}
export function initTeamStats(teamId, teamName) {
    return {
        teamId, teamName,
        totalPlays: 0, totalYards: 0, passingYards: 0, rushingYards: 0,
        firstDowns: 0, firstDownsPassing: 0, firstDownsRushing: 0, firstDownsPenalty: 0,
        thirdDownAttempts: 0, thirdDownConversions: 0, thirdDownPercentage: 0,
        fourthDownAttempts: 0, fourthDownConversions: 0, fourthDownPercentage: 0,
        redZoneTrips: 0, redZoneTouchdowns: 0, redZoneFieldGoals: 0, redZonePercentage: 0,
        turnovers: 0, interceptionsThrown: 0, fumblesLost: 0,
        penalties: 0, penaltyYards: 0,
        timeOfPossession: "0:00", timeOfPossessionSeconds: 0,
        sacks: 0, sackYardsLost: 0,
        pointsScored: 0, totalDrives: 0, puntCount: 0,
        averageStartingFieldPosition: 0, yardsPerPlay: 0,
        passAttempts: 0, passCompletions: 0, rushAttempts: 0,
        averageDriveYards: 0, averageDrivePlays: 0, averageDriveTime: "0:00",
        twoPointConversionAttempts: 0, twoPointConversionsMade: 0,
        goalToGoAttempts: 0, goalToGoTouchdowns: 0,
    };
}
// ---------------------------------------------------------------------------
// PLAY CLASSIFICATION HELPERS
// ---------------------------------------------------------------------------
export function isPassPlay(play) {
    return play.type === PlayType.Pass;
}
export function isRushPlay(play) {
    return play.type === PlayType.Rush;
}
export function isSpecialTeamsPlay(play) {
    return [PlayType.Punt, PlayType.Kickoff, PlayType.FieldGoal, PlayType.ExtraPoint, PlayType.FreeKick].includes(play.type);
}
export function isRedZone(play) {
    return play.context.yardLine >= 80 || play.context.isRedZone === true;
}
export function isThirdDown(play) {
    return play.context.down === Down.Third;
}
export function isFourthDown(play) {
    return play.context.down === Down.Fourth;
}
export function isGoalToGo(play) {
    return play.context.isGoalToGo === true || play.context.yardLine >= (100 - play.context.distance);
}
/** Whether the play resulted in a first down (rough check based on yards gained vs distance) */
export function isFirstDown(play) {
    if (play.type === PlayType.Pass || play.type === PlayType.Rush) {
        const p = play;
        if (p.isTouchdown)
            return true;
        return p.yardsGained >= play.context.distance;
    }
    return false;
}
/** Classify direction as left/middle/right bucket */
export function directionBucket(dir) {
    if (!dir)
        return null;
    switch (dir) {
        case Direction.Left:
        case Direction.LeftTackle:
        case Direction.LeftGuard:
            return "left";
        case Direction.Middle:
            return "middle";
        case Direction.Right:
        case Direction.RightTackle:
        case Direction.RightGuard:
            return "right";
    }
}
//# sourceMappingURL=utils.js.map