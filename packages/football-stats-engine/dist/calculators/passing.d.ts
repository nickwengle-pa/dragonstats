import { Play, PassingStats, EngineConfig } from "../types";
export declare class PassingCalculator {
    private config;
    private resolveName;
    private stats;
    private timeToThrowAccum;
    constructor(config: EngineConfig, resolveName: (id: string) => string);
    process(play: Play): void;
    private trackSituational;
    /** Finalize computed fields (call once after all plays processed) */
    finalize(): Map<string, PassingStats>;
    private getOrCreate;
    getStats(): Map<string, PassingStats>;
}
//# sourceMappingURL=passing.d.ts.map