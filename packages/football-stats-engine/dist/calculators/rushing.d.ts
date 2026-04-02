import { Play, RushingStats, EngineConfig } from "../types";
export declare class RushingCalculator {
    private config;
    private resolveName;
    private stats;
    constructor(config: EngineConfig, resolveName: (id: string) => string);
    process(play: Play): void;
    private processRush;
    private processScramble;
    finalize(): Map<string, RushingStats>;
    private getOrCreate;
    getStats(): Map<string, RushingStats>;
}
//# sourceMappingURL=rushing.d.ts.map