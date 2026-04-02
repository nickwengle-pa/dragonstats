import { Play, ReceivingStats, EngineConfig } from "../types";
export declare class ReceivingCalculator {
    private config;
    private resolveName;
    private stats;
    private airYardsAccum;
    constructor(config: EngineConfig, resolveName: (id: string) => string);
    process(play: Play): void;
    finalize(): Map<string, ReceivingStats>;
    private getOrCreate;
    getStats(): Map<string, ReceivingStats>;
}
//# sourceMappingURL=receiving.d.ts.map