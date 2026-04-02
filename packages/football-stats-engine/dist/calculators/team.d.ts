import { Play, TeamStats, DriveStats, EngineConfig, ScoringPlay } from "../types";
export declare class TeamCalculator {
    private config;
    private homeTeamId;
    private awayTeamId;
    private homeTeamName;
    private awayTeamName;
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
    constructor(config: EngineConfig, homeTeamId: string, awayTeamId: string, homeTeamName: string, awayTeamName: string);
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