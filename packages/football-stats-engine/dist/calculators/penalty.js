// ============================================================================
// PENALTY CALCULATOR
// ============================================================================
//
// Handles:
//   - Penalty enforcement (yardage, half-the-distance, spot-of-foul)
//   - Player penalty stats tracking
//   - Team penalty stats tracking
//   - Personal foul / unsportsmanlike accumulation → ejection
//   - Situational penalty tracking (quarter, down, red zone)
//   - Offset/declined penalty handling
// ============================================================================
import { PlayType, PenaltyEnforcement, Quarter, Down, } from "../types";
import { lookupPenalty, PenaltyCategory, EnforcementSpot, isAutoFirstDown as catalogAutoFirstDown, getPenaltyYards, } from "./penalty-catalog";
import { isRedZone, isThirdDown } from "../utils";
// ---------------------------------------------------------------------------
// PENALTY CALCULATOR
// ---------------------------------------------------------------------------
export class PenaltyCalculator {
    constructor(config, resolveName, ruleLevel = "nfl") {
        this.config = config;
        this.resolveName = resolveName;
        this.playerStats = new Map();
        this.teamStats = new Map();
        this.ruleLevel = ruleLevel;
    }
    // ---------------------------------------------------------------------------
    // MAIN PROCESSING
    // ---------------------------------------------------------------------------
    process(play) {
        // Collect penalties from ANY play type (penalties can occur on any play)
        const penalties = this.extractPenalties(play);
        if (penalties.length === 0)
            return;
        for (const pen of penalties) {
            this.trackPenalty(pen, play);
        }
    }
    extractPenalties(play) {
        const p = play;
        // PenaltyPlay has penalties at the top level
        if (play.type === PlayType.Penalty || play.type === PlayType.NoPlay) {
            return p.penalties ?? [];
        }
        // Other play types may have penalties attached
        return p.penalties ?? [];
    }
    // ---------------------------------------------------------------------------
    // PENALTY TRACKING
    // ---------------------------------------------------------------------------
    trackPenalty(pen, play) {
        const def = lookupPenalty(pen.penaltyType);
        const isAccepted = pen.enforcement === PenaltyEnforcement.Accepted;
        const isDeclined = pen.enforcement === PenaltyEnforcement.Declined;
        const isOffset = pen.enforcement === PenaltyEnforcement.Offset;
        const ctx = play.context;
        // ---- TEAM STATS ----
        const teamStat = this.getOrCreateTeam(pen.team, pen.team);
        teamStat.totalPenalties++;
        if (isAccepted) {
            teamStat.acceptedPenalties++;
            teamStat.totalYards += pen.yards;
        }
        if (isDeclined)
            teamStat.declinedPenalties++;
        if (isOffset)
            teamStat.offsetPenalties++;
        // Category tracking
        if (def) {
            if (def.isPreSnap)
                teamStat.preSnapPenalties++;
            else
                teamStat.liveballPenalties++;
            if (def.isOffensivePenalty === true)
                teamStat.offensivePenalties++;
            else if (def.isOffensivePenalty === false)
                teamStat.defensivePenalties++;
            if (def.category === PenaltyCategory.SpecialTeams)
                teamStat.specialTeamsPenalties++;
            if (def.isPersonalFoul)
                teamStat.personalFouls++;
            if (def.category === PenaltyCategory.UnsportsmanlikeConduct)
                teamStat.unsportsmanlikeConducts++;
            // Auto first down tracking
            if (isAccepted && catalogAutoFirstDown(def, this.ruleLevel) && def.isOffensivePenalty === false) {
                teamStat.autoFirstDownsGivenUp++;
                // Credit the other team
                const otherTeam = pen.team === ctx.homeTeam ? ctx.awayTeam : ctx.homeTeam;
                const otherStat = this.getOrCreateTeam(otherTeam, otherTeam);
                otherStat.autoFirstDownsReceived++;
            }
        }
        // By type
        teamStat.byType[pen.penaltyType] = (teamStat.byType[pen.penaltyType] ?? 0) + 1;
        // Situational
        if (isThirdDown(play))
            teamStat.thirdDownPenalties++;
        if (isRedZone(play))
            teamStat.redZonePenalties++;
        // By quarter
        this.addQuarterCount(teamStat, ctx.quarter);
        // Big play negated check
        if (isAccepted && def?.isOffensivePenalty === true) {
            const p = play;
            if (p.yardsGained != null && p.yardsGained >= 10) {
                teamStat.bigPlayNegated++;
            }
        }
        // ---- PLAYER STATS ----
        if (pen.player) {
            const playerStat = this.getOrCreatePlayer(pen.player);
            playerStat.totalPenalties++;
            if (isAccepted) {
                playerStat.acceptedPenalties++;
                playerStat.totalYards += pen.yards;
            }
            if (isDeclined)
                playerStat.declinedPenalties++;
            if (isOffset)
                playerStat.offsetPenalties++;
            if (def) {
                if (def.isPreSnap)
                    playerStat.preSnapPenalties++;
                else
                    playerStat.liveballPenalties++;
                if (def.isPersonalFoul) {
                    playerStat.personalFouls++;
                    playerStat.personalFoulCount++;
                }
                if (def.category === PenaltyCategory.UnsportsmanlikeConduct) {
                    playerStat.unsportsmanlikeConducts++;
                    playerStat.unsportsmanlikeCount++;
                    // 2 unsportsmanlike = ejection
                    if (playerStat.unsportsmanlikeCount >= 2 && !playerStat.wasEjected) {
                        playerStat.wasEjected = true;
                        playerStat.ejectionQuarter = ctx.quarter;
                        playerStat.ejectionClock = ctx.gameClock;
                    }
                }
                // Targeting = automatic ejection (college/HS)
                if (def.code === "targeting" && def.canCauseEjection &&
                    (this.ruleLevel === "college" || this.ruleLevel === "high_school")) {
                    if (!playerStat.wasEjected) {
                        playerStat.wasEjected = true;
                        playerStat.ejectionQuarter = ctx.quarter;
                        playerStat.ejectionClock = ctx.gameClock;
                    }
                }
            }
            playerStat.byType[pen.penaltyType] = (playerStat.byType[pen.penaltyType] ?? 0) + 1;
            if (isThirdDown(play))
                playerStat.thirdDownPenalties++;
            if (isRedZone(play))
                playerStat.redZonePenalties++;
            this.addPlayerQuarterCount(playerStat, ctx.quarter);
        }
    }
    // ---------------------------------------------------------------------------
    // ENFORCEMENT ENGINE — Computes the result of accepting a penalty
    // ---------------------------------------------------------------------------
    /**
     * Calculate the enforcement result for a penalty.
     * This is a pure function — it doesn't modify state.
     * Use it to determine what happens when a penalty is accepted.
     */
    static enforce(penaltyCode, play, ruleLevel, spotOfFoul, // yard line where foul occurred
    endOfRun) {
        const def = lookupPenalty(penaltyCode);
        if (!def)
            return null;
        const ctx = play.context;
        const isOffensive = def.isOffensivePenalty === true;
        const penaltyYards = getPenaltyYards(def, ruleLevel);
        const isAutoFD = catalogAutoFirstDown(def, ruleLevel);
        // --- Determine enforcement spot ---
        let enforcementYardLine;
        switch (def.enforcementSpot) {
            case EnforcementSpot.PreviousSpot:
                enforcementYardLine = ctx.yardLine;
                break;
            case EnforcementSpot.SpotOfFoul:
                enforcementYardLine = spotOfFoul ?? ctx.yardLine;
                break;
            case EnforcementSpot.EndOfRun:
                enforcementYardLine = endOfRun ?? (ctx.yardLine + (play.yardsGained ?? 0));
                break;
            case EnforcementSpot.SucceedingSpot:
            case EnforcementSpot.DeadBall:
                enforcementYardLine = ctx.yardLine + (play.yardsGained ?? 0);
                break;
            default:
                enforcementYardLine = ctx.yardLine;
        }
        // --- Apply yardage ---
        let newYardLine;
        let actualYards = penaltyYards;
        let halfTheDistance = false;
        let isSafety = false;
        // DPI in NFL is a spot foul — yardage is the distance to the spot
        if (penaltyCode === "defensive_pass_interference" && ruleLevel === "nfl") {
            actualYards = Math.max(0, (spotOfFoul ?? ctx.yardLine) - ctx.yardLine);
            newYardLine = spotOfFoul ?? ctx.yardLine;
        }
        else if (isOffensive) {
            // Offensive penalty: move BACKWARD (decrease yard line)
            const maxBackward = enforcementYardLine; // can't go past own 0
            if (penaltyYards > maxBackward) {
                // Half the distance to the goal (own end zone)
                actualYards = Math.floor(maxBackward / 2);
                halfTheDistance = true;
            }
            newYardLine = enforcementYardLine - actualYards;
            // Safety check: if enforced in own end zone
            if (newYardLine <= 0) {
                isSafety = true;
                newYardLine = 0;
            }
        }
        else {
            // Defensive penalty: move FORWARD (increase yard line toward opponent end zone)
            const maxForward = 100 - enforcementYardLine;
            if (penaltyYards > maxForward) {
                // Half the distance to the goal (opponent end zone)
                actualYards = Math.floor(maxForward / 2);
                halfTheDistance = true;
            }
            newYardLine = enforcementYardLine + actualYards;
            // Cap at the 1 (can't award a TD via penalty)
            if (newYardLine > 99)
                newYardLine = 99;
        }
        // --- Max yards cap (e.g., college DPI capped at 15) ---
        const maxCap = def.maxYards?.[ruleLevel];
        if (maxCap != null && actualYards > maxCap) {
            actualYards = maxCap;
            newYardLine = isOffensive
                ? enforcementYardLine - actualYards
                : enforcementYardLine + actualYards;
        }
        // --- Down / distance computation ---
        let newDown = ctx.down;
        let newDistance = ctx.distance - (newYardLine - ctx.yardLine);
        let isFirstDown = false;
        if (isAutoFD && !isOffensive) {
            // Defensive auto first down
            isFirstDown = true;
            newDown = Down.First;
            newDistance = Math.min(10, 100 - newYardLine);
        }
        else if (def.lossOfDown) {
            // Loss of down
            newDown = Math.min(ctx.down + 1, 4);
            newDistance = ctx.distance + actualYards; // pushed back + next down
        }
        else if (def.replayDown) {
            // Replay the down
            newDown = ctx.down;
            if (isOffensive) {
                newDistance = ctx.distance + actualYards;
            }
            else {
                newDistance = ctx.distance - actualYards;
                if (newDistance <= 0) {
                    isFirstDown = true;
                    newDown = Down.First;
                    newDistance = Math.min(10, 100 - newYardLine);
                }
            }
        }
        else {
            // Standard: apply to current down situation
            if (newDistance <= 0) {
                isFirstDown = true;
                newDown = Down.First;
                newDistance = Math.min(10, 100 - newYardLine);
            }
        }
        return {
            actualYards,
            halfTheDistance,
            newYardLine,
            isFirstDown,
            lossOfDown: def.lossOfDown,
            replayDown: def.replayDown && !isFirstDown,
            newDown,
            newDistance: Math.max(1, newDistance),
            isSafety,
        };
    }
    // ---------------------------------------------------------------------------
    // FINALIZE
    // ---------------------------------------------------------------------------
    finalize() {
        return {
            playerPenalties: this.playerStats,
            teamPenalties: this.teamStats,
        };
    }
    getPlayerStats() { return this.playerStats; }
    getTeamStats() { return this.teamStats; }
    // ---------------------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------------------
    getOrCreatePlayer(playerId) {
        let s = this.playerStats.get(playerId);
        if (!s) {
            s = {
                playerId, playerName: this.resolveName(playerId),
                totalPenalties: 0, totalYards: 0,
                acceptedPenalties: 0, declinedPenalties: 0, offsetPenalties: 0,
                preSnapPenalties: 0, liveballPenalties: 0,
                personalFouls: 0, unsportsmanlikeConducts: 0,
                byType: {},
                thirdDownPenalties: 0, redZonePenalties: 0,
                q1Penalties: 0, q2Penalties: 0, q3Penalties: 0, q4Penalties: 0, otPenalties: 0,
                personalFoulCount: 0, unsportsmanlikeCount: 0,
                wasEjected: false,
            };
            this.playerStats.set(playerId, s);
        }
        return s;
    }
    getOrCreateTeam(teamId, teamName) {
        let s = this.teamStats.get(teamId);
        if (!s) {
            s = {
                teamId, teamName,
                totalPenalties: 0, totalYards: 0,
                acceptedPenalties: 0, declinedPenalties: 0, offsetPenalties: 0,
                preSnapPenalties: 0, liveballPenalties: 0,
                offensivePenalties: 0, defensivePenalties: 0, specialTeamsPenalties: 0,
                personalFouls: 0, unsportsmanlikeConducts: 0,
                thirdDownPenalties: 0, redZonePenalties: 0,
                autoFirstDownsGivenUp: 0, autoFirstDownsReceived: 0,
                q1Penalties: 0, q2Penalties: 0, q3Penalties: 0, q4Penalties: 0, otPenalties: 0,
                byType: {},
                bigPlayNegated: 0,
            };
            this.teamStats.set(teamId, s);
        }
        return s;
    }
    addQuarterCount(stat, quarter) {
        if (quarter === Quarter.First)
            stat.q1Penalties++;
        else if (quarter === Quarter.Second)
            stat.q2Penalties++;
        else if (quarter === Quarter.Third)
            stat.q3Penalties++;
        else if (quarter === Quarter.Fourth)
            stat.q4Penalties++;
        else
            stat.otPenalties++;
    }
    addPlayerQuarterCount(stat, quarter) {
        if (quarter === Quarter.First)
            stat.q1Penalties++;
        else if (quarter === Quarter.Second)
            stat.q2Penalties++;
        else if (quarter === Quarter.Third)
            stat.q3Penalties++;
        else if (quarter === Quarter.Fourth)
            stat.q4Penalties++;
        else
            stat.otPenalties++;
    }
}
//# sourceMappingURL=penalty.js.map