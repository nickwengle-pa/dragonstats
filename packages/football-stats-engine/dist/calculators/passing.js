// ============================================================================
// PASSING STATS CALCULATOR
// ============================================================================
import { PassResult, } from "../types";
import { initPassingStats, isPassPlay, isRedZone, isThirdDown, isFirstDown, calculatePasserRating, calculateAdjustedYPA, safeDivide, round, } from "../utils";
export class PassingCalculator {
    constructor(config, resolveName) {
        this.config = config;
        this.resolveName = resolveName;
        this.stats = new Map();
        this.timeToThrowAccum = new Map();
    }
    process(play) {
        if (!isPassPlay(play))
            return;
        const p = play;
        const passerId = p.passer;
        if (!passerId)
            return;
        const stat = this.getOrCreate(passerId);
        // --- Sacks (not counted as attempts in NFL) ---
        if (p.result === PassResult.Sack) {
            stat.sacks++;
            stat.sackYardsLost += Math.abs(p.yardsGained);
            if (p.fumble) {
                // Sack fumbles handled by the fumble tracker
            }
            return;
        }
        // --- Scrambles ---
        if (p.result === PassResult.Scramble) {
            stat.scrambles++;
            stat.scrambleYards += p.yardsGained;
            return;
        }
        // --- Throw Aways & Batted Balls ---
        if (p.result === PassResult.ThrowAway) {
            stat.attempts++;
            stat.throwAways++;
            this.trackSituational(stat, play, false, false);
            return;
        }
        if (p.result === PassResult.BattedDown) {
            stat.attempts++;
            stat.battedBalls++;
            this.trackSituational(stat, play, false, false);
            return;
        }
        if (p.result === PassResult.SpikeBall) {
            stat.attempts++;
            return;
        }
        // --- Standard pass attempts ---
        stat.attempts++;
        const isComplete = p.result === PassResult.Complete;
        const isInt = p.result === PassResult.Interception;
        if (isComplete) {
            stat.completions++;
            stat.yards += p.yardsGained;
            stat.longPass = Math.max(stat.longPass, p.yardsGained);
            if (p.isTouchdown)
                stat.touchdowns++;
            if (p.yardsGained >= 20)
                stat.twentyPlusYardCompletions++;
            if (p.yardsGained >= 40)
                stat.fortyPlusYardCompletions++;
            if (isFirstDown(play))
                stat.firstDowns++;
            // Advanced
            if (this.config.trackAdvancedMetrics) {
                if (p.airYards != null)
                    stat.airYards += p.airYards;
                if (p.yardsAfterCatch != null)
                    stat.yardsAfterCatch += p.yardsAfterCatch;
            }
            // Play action
            if (p.isPlayAction) {
                stat.playActionCompletions++;
                stat.playActionYards += p.yardsGained;
            }
            // Screen
            if (p.isScreenPass) {
                stat.screenPassCompletions++;
                stat.screenPassYards += p.yardsGained;
            }
            // Pressure
            if (p.isUnderPressure) {
                stat.completionsUnderPressure++;
            }
        }
        if (isInt) {
            stat.interceptions++;
        }
        // Pressure tracking
        if (p.isUnderPressure) {
            stat.timesUnderPressure++;
            stat.attemptsUnderPressure++;
        }
        // Play action attempt
        if (p.isPlayAction)
            stat.playActionAttempts++;
        // Screen attempt
        if (p.isScreenPass)
            stat.screenPassAttempts++;
        // Time to throw
        if (this.config.trackAdvancedMetrics && p.timeToThrow != null) {
            const acc = this.timeToThrowAccum.get(passerId) ?? { total: 0, count: 0 };
            acc.total += p.timeToThrow;
            acc.count++;
            this.timeToThrowAccum.set(passerId, acc);
        }
        // Situational
        this.trackSituational(stat, play, isComplete, isInt);
        // Fumble on reception (counts against passer stats loosely — tracked for reference)
        if (isComplete && p.fumble) {
            // Fumble is attributed to the receiver in rushing/receiving calc
        }
    }
    trackSituational(stat, play, isComplete, isInt) {
        if (!this.config.trackSituationalSplits)
            return;
        const p = play;
        if (isRedZone(play)) {
            stat.redZoneAttempts++;
            if (isComplete)
                stat.redZoneCompletions++;
            if (p.isTouchdown)
                stat.redZoneTouchdowns++;
            if (isInt)
                stat.redZoneInterceptions++;
        }
        if (isThirdDown(play)) {
            stat.thirdDownAttempts++;
            if (isComplete)
                stat.thirdDownCompletions++;
            if (isComplete && isFirstDown(play))
                stat.thirdDownConversions++;
        }
    }
    /** Finalize computed fields (call once after all plays processed) */
    finalize() {
        for (const [id, stat] of this.stats) {
            stat.completionPercentage = safeDivide(stat.completions * 100, stat.attempts);
            stat.yardsPerAttempt = safeDivide(stat.yards, stat.attempts);
            stat.yardsPerCompletion = safeDivide(stat.yards, stat.completions);
            stat.adjustedYardsPerAttempt = calculateAdjustedYPA(stat.yards, stat.touchdowns, stat.interceptions, stat.attempts);
            if (this.config.computePasserRating !== false) {
                stat.passerRating = calculatePasserRating(stat.completions, stat.attempts, stat.yards, stat.touchdowns, stat.interceptions);
            }
            // Time to throw
            const ttt = this.timeToThrowAccum.get(id);
            if (ttt && ttt.count > 0) {
                stat.avgTimeToThrow = round(ttt.total / ttt.count, 2);
            }
        }
        return this.stats;
    }
    getOrCreate(playerId) {
        let s = this.stats.get(playerId);
        if (!s) {
            s = initPassingStats(playerId, this.resolveName(playerId));
            this.stats.set(playerId, s);
        }
        return s;
    }
    getStats() {
        return this.stats;
    }
}
//# sourceMappingURL=passing.js.map