import { PassingStats, RushingStats, ReceivingStats, DefensiveStats, KickingStats, PuntingStats, ReturnStats, TeamStats, Play, PassPlay, RushPlay, Direction, SpecialTeamsPlay } from "./types";
export declare function calculatePasserRating(completions: number, attempts: number, yards: number, touchdowns: number, interceptions: number): number;
export declare function calculateAdjustedYPA(yards: number, touchdowns: number, interceptions: number, attempts: number): number;
/** Parse "MM:SS" into total seconds */
export declare function clockToSeconds(clock: string): number;
/** Convert total seconds back to "MM:SS" */
export declare function secondsToClock(totalSeconds: number): string;
/** Time elapsed between two clock readings in the same quarter (clock counts down) */
export declare function timeElapsed(startClock: string, endClock: string): number;
/** Quarter duration in seconds (15 min regulation, 10 min OT) */
export declare function quarterDuration(quarter: number): number;
export declare function round(value: number, decimals?: number): number;
export declare function safeDivide(numerator: number, denominator: number, decimals?: number): number;
export declare function initPassingStats(playerId: string, playerName: string): PassingStats;
export declare function initRushingStats(playerId: string, playerName: string): RushingStats;
export declare function initReceivingStats(playerId: string, playerName: string): ReceivingStats;
export declare function initDefensiveStats(playerId: string, playerName: string): DefensiveStats;
export declare function initKickingStats(playerId: string, playerName: string): KickingStats;
export declare function initPuntingStats(playerId: string, playerName: string): PuntingStats;
export declare function initReturnStats(playerId: string, playerName: string): ReturnStats;
export declare function initTeamStats(teamId: string, teamName: string): TeamStats;
export declare function isPassPlay(play: Play): play is PassPlay & {
    context: Play["context"];
};
export declare function isRushPlay(play: Play): play is RushPlay & {
    context: Play["context"];
};
export declare function isSpecialTeamsPlay(play: Play): play is SpecialTeamsPlay & {
    context: Play["context"];
};
export declare function isRedZone(play: Play): boolean;
export declare function isThirdDown(play: Play): boolean;
export declare function isFourthDown(play: Play): boolean;
export declare function isGoalToGo(play: Play): boolean;
/** Whether the play resulted in a first down (rough check based on yards gained vs distance) */
export declare function isFirstDown(play: Play): boolean;
/** Classify direction as left/middle/right bucket */
export declare function directionBucket(dir?: Direction): "left" | "middle" | "right" | null;
//# sourceMappingURL=utils.d.ts.map