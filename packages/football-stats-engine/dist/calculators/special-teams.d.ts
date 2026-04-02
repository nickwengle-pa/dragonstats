import { Play, KickingStats, PuntingStats, ReturnStats, EngineConfig } from "../types";
export declare class SpecialTeamsCalculator {
    private config;
    private resolveName;
    private kicking;
    private punting;
    private returns;
    private kickoffDistanceAccum;
    private hangTimeAccum;
    constructor(config: EngineConfig, resolveName: (id: string) => string);
    process(play: Play): void;
    private processFieldGoal;
    private processExtraPoint;
    private processPunt;
    private processKickoff;
    finalize(): {
        kicking: Map<string, KickingStats>;
        punting: Map<string, PuntingStats>;
        returns: Map<string, ReturnStats>;
    };
    private getKicking;
    private getPunting;
    private getReturn;
}
//# sourceMappingURL=special-teams.d.ts.map