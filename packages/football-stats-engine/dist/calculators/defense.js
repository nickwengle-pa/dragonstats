// ============================================================================
// DEFENSIVE STATS CALCULATOR
// ============================================================================
import { PassResult, } from "../types";
import { initDefensiveStats, isPassPlay, isRushPlay, } from "../utils";
export class DefensiveCalculator {
    constructor(config, resolveName) {
        this.config = config;
        this.resolveName = resolveName;
        this.stats = new Map();
    }
    process(play) {
        // --- TACKLES (available on rush + pass + special teams) ---
        this.processTackles(play);
        // --- PASS-SPECIFIC DEFENSE ---
        if (isPassPlay(play)) {
            this.processPassDefense(play);
        }
        // --- RUSH-SPECIFIC DEFENSE ---
        if (isRushPlay(play)) {
            this.processRushDefense(play);
        }
        // --- FUMBLE TRACKING (any play type) ---
        this.processFumble(play);
    }
    processTackles(play) {
        const p = play;
        // Solo tackles
        if (p.tackledBy && Array.isArray(p.tackledBy)) {
            for (const tackler of p.tackledBy) {
                const stat = this.getOrCreate(tackler);
                if (p.tackledBy.length === 1 && (!p.assistedTackle || p.assistedTackle.length === 0)) {
                    stat.soloTackles++;
                }
                stat.totalTackles++;
                // Tackle for loss
                if (p.yardsGained != null && p.yardsGained <= 0) {
                    stat.tacklesForLoss++;
                    stat.stuffs++;
                }
            }
        }
        // Assisted tackles
        if (p.assistedTackle && Array.isArray(p.assistedTackle)) {
            for (const assister of p.assistedTackle) {
                const stat = this.getOrCreate(assister);
                stat.assistedTackles++;
                stat.totalTackles += 0.5; // half tackle credit for assists
            }
        }
    }
    processPassDefense(p) {
        // --- SACKS ---
        if (p.result === PassResult.Sack && p.tackledBy) {
            const sackCount = p.tackledBy.length;
            for (const defender of p.tackledBy) {
                const stat = this.getOrCreate(defender);
                if (sackCount === 1) {
                    stat.sacks++;
                    stat.sackYards += Math.abs(p.yardsGained);
                }
                else {
                    // Split sack
                    stat.halfSacks++;
                    stat.sacks += 0.5;
                    stat.sackYards += Math.abs(p.yardsGained) / sackCount;
                }
            }
        }
        // --- QB HITS / PRESSURES ---
        if (p.isUnderPressure && p.tackledBy) {
            // If it's a sack, pressured already counted above
            // For non-sack pressures (hurries/hits)
            if (p.result !== PassResult.Sack) {
                for (const defender of p.tackledBy) {
                    const stat = this.getOrCreate(defender);
                    stat.qbHits++;
                    stat.pressures++;
                }
            }
        }
        // --- INTERCEPTIONS ---
        if (p.result === PassResult.Interception && p.interceptedBy) {
            const stat = this.getOrCreate(p.interceptedBy);
            stat.interceptions++;
            stat.passesDefended++;
            if (p.interceptionReturnYards != null) {
                stat.interceptionYards += p.interceptionReturnYards;
            }
            // INT return TD check: if return yards bring past the end zone
            // (This is simplified; real TD detection should come from play data)
        }
        // --- PASSES DEFENDED (incomplete where a defender was near) ---
        if (p.result === PassResult.BattedDown && p.tackledBy) {
            for (const defender of p.tackledBy) {
                const stat = this.getOrCreate(defender);
                stat.passesDefended++;
            }
        }
        // --- COVERAGE STATS ---
        if (this.config.trackAdvancedMetrics && p.target) {
            // If we can attribute coverage to a specific defender, that logic
            // would go here. For now, basic tracking on completion/incompletion.
        }
    }
    processRushDefense(p) {
        // Stuffs already handled in tackles. Additional rush-specific defense
        // metrics could be added here.
    }
    processFumble(play) {
        const p = play;
        const fumble = p.fumble;
        if (!fumble)
            return;
        // Forced fumble
        if (fumble.forcedBy) {
            const stat = this.getOrCreate(fumble.forcedBy);
            stat.forcedFumbles++;
        }
        // Recovery
        if (fumble.recoveredBy && fumble.recoveryTeam !== play.context.possessionTeam) {
            const stat = this.getOrCreate(fumble.recoveredBy);
            stat.fumbleRecoveries++;
            if (fumble.recoveryYards != null) {
                stat.fumbleRecoveryYards += fumble.recoveryYards;
            }
            if (fumble.isTouchdown) {
                stat.fumbleRecoveryTouchdowns++;
            }
        }
    }
    finalize() {
        // Round tackle counts
        for (const stat of this.stats.values()) {
            stat.totalTackles = Math.round(stat.totalTackles * 2) / 2; // round to nearest 0.5
        }
        return this.stats;
    }
    getOrCreate(playerId) {
        let s = this.stats.get(playerId);
        if (!s) {
            s = initDefensiveStats(playerId, this.resolveName(playerId));
            this.stats.set(playerId, s);
        }
        return s;
    }
    getStats() {
        return this.stats;
    }
}
//# sourceMappingURL=defense.js.map