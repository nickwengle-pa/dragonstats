import { Play, DefensiveStats, EngineConfig } from "../types";
export declare class DefensiveCalculator {
    private config;
    private resolveName;
    private stats;
    constructor(config: EngineConfig, resolveName: (id: string) => string);
    process(play: Play): void;
    private processTackles;
    private processPassDefense;
    private processRushDefense;
    private processFumble;
    finalize(): Map<string, DefensiveStats>;
    private getOrCreate;
    getStats(): Map<string, DefensiveStats>;
}
//# sourceMappingURL=defense.d.ts.map