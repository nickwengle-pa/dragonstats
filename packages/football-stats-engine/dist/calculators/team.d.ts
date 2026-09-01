import { Play, TeamStats, DriveStats, EngineConfig, ScoringPlay } from "../types";
export declare class TeamCalculator {
    private config;
    private homeTeamId;
    private awayTeamId;
    private homeTeamName;
    private awayTeamName;
    /** From the active ruleset. Drive timing across a quarter boundary needs
     *  it, and it is NOT 900 everywhere - high school plays 12 minute
     *  quarters, which is three minutes of invented possession per crossed
     *  boundary if you assume the NFL. */
    private quarterLengthSeconds;
    private stats;
    private scoringPlays;
    private drives;
    private currentDrive;
    private currentDriveNumber;
    private topAccum;
    private redZoneTracked;
    private startingPositions;
    private lastHomeScore;
    private lastAwayScore;
    constructor(config: EngineConfig, homeTeamId: string, awayTeamId: string, homeTeamName: string, awayTeamName: string, 
    /** From the active ruleset. Drive timing across a quarter boundary needs
     *  it, and it is NOT 900 everywhere - high school plays 12 minute
     *  quarters, which is three minutes of invented possession per crossed
     *  boundary if you assume the NFL. */
    quarterLengthSeconds?: number);
    process(play: Play): void;
    private trackDrive;
    private finalizeDrive;
    private checkSituational;
    private checkTurnover;
    private checkScoring;
    private addScoringPlay;
    private processPenaltiesOnPlay;
    finalize(): {
        teamStats: Map<string, TeamStats>;
        drives: DriveStats[];
        scoringPlays: ScoringPlay[];
    };
    private getOrCreate;
}
//# sourceMappingURL=team.d.ts.map