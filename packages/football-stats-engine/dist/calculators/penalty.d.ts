import { Play, Down, EngineConfig, PlayerPenaltyStats, TeamPenaltyStats } from "../types";
import { RuleLevel } from "../game-state";
export interface EnforcementResult {
    /** Accepted yardage (after half-the-distance) */
    actualYards: number;
    /** Was half-the-distance-to-the-goal applied? */
    halfTheDistance: boolean;
    /** New yard line after enforcement */
    newYardLine: number;
    /** Is the result a first down? */
    isFirstDown: boolean;
    /** Loss of down? */
    lossOfDown: boolean;
    /** Replay the down? */
    replayDown: boolean;
    /** New down after enforcement */
    newDown: Down;
    /** New distance after enforcement */
    newDistance: number;
    /** Was the penalty a safety? (backed into own end zone) */
    isSafety: boolean;
}
export declare class PenaltyCalculator {
    private config;
    private resolveName;
    private playerStats;
    private teamStats;
    private ruleLevel;
    constructor(config: EngineConfig, resolveName: (id: string) => string, ruleLevel?: RuleLevel);
    process(play: Play): void;
    private extractPenalties;
    private trackPenalty;
    /**
     * Calculate the enforcement result for a penalty.
     * This is a pure function — it doesn't modify state.
     * Use it to determine what happens when a penalty is accepted.
     */
    static enforce(penaltyCode: string, play: Play, ruleLevel: RuleLevel, spotOfFoul?: number, // yard line where foul occurred
    endOfRun?: number): EnforcementResult | null;
    finalize(): {
        playerPenalties: Map<string, PlayerPenaltyStats>;
        teamPenalties: Map<string, TeamPenaltyStats>;
    };
    getPlayerStats(): Map<string, PlayerPenaltyStats>;
    getTeamStats(): Map<string, TeamPenaltyStats>;
    private getOrCreatePlayer;
    private getOrCreateTeam;
    private addQuarterCount;
    private addPlayerQuarterCount;
}
//# sourceMappingURL=penalty.d.ts.map