import { Play, TeamId, EngineConfig, GameSummary } from "./types";
import { GameStateSnapshot, GameEvent, CoinTossChoice, GamePhase, RuleLevel, RuleSet } from "./game-state";
export declare class FootballStatsEngine {
    private config;
    private homeTeam;
    private awayTeam;
    private playerNames;
    private passingCalc;
    private rushingCalc;
    private receivingCalc;
    private defenseCalc;
    private specialTeamsCalc;
    private teamCalc;
    private penaltyCalc;
    /** Game state manager — tracks timeouts, clock, quarters, OT, challenges */
    private gameState;
    private gameStateEnabled;
    private plays;
    private gameId;
    private lastQuarter;
    private lastClock;
    private initialized;
    private finalized;
    constructor(config?: Partial<EngineConfig> & {
        enableGameState?: boolean;
        rules?: RuleLevel;
        customRules?: Partial<RuleSet>;
    });
    /** Register the two teams. Must be called before processing plays. */
    setTeams(home: TeamId, away: TeamId): void;
    /** Optionally register player names upfront (otherwise derived from play data) */
    registerPlayer(playerId: string, name: string): void;
    /** Bulk register players */
    registerPlayers(players: Array<{
        id: string;
        name: string;
    }>): void;
    /** Record the opening coin toss */
    recordCoinToss(winner: string, choice: CoinTossChoice): void;
    /** Record the overtime coin toss */
    recordOvertimeCoinToss(winner: string, choice: CoinTossChoice): void;
    /** Call a timeout for a team. Returns false if no timeouts remaining. */
    callTimeout(teamId: string): boolean;
    /** Record a coach's challenge and its result */
    recordChallenge(teamId: string, result: "upheld" | "overturned" | "stands", playDescription?: string): boolean;
    /** Record a booth review (not charged to either team) */
    recordBoothReview(result: "upheld" | "overturned" | "stands", description?: string): void;
    /** Record an injury timeout */
    recordInjuryTimeout(teamId?: string): void;
    /** Get timeouts remaining for a team */
    getTimeoutsRemaining(teamId: string): number;
    /** Get challenges remaining for a team */
    getChallengesRemaining(teamId: string): number;
    /** Is the game over? */
    isGameOver(): boolean;
    /** Is it halftime? */
    isHalftime(): boolean;
    /** Is it overtime? */
    isOvertime(): boolean;
    /** Get the current game phase */
    getGamePhase(): GamePhase | null;
    /** Get full game state snapshot */
    getGameStateSnapshot(): GameStateSnapshot | null;
    /** Get all game events (timeouts, quarter changes, etc.) */
    getGameEvents(): GameEvent[];
    private initializeCalculators;
    private resolvePlayerName;
    /** Process a single play. Call this in sequence for each play. */
    processPlay(play: Play): {
        events: GameEvent[];
    };
    /** Process an array of plays at once. Returns all game events triggered. */
    processPlays(plays: Play[]): {
        allEvents: GameEvent[];
    };
    /** Get the complete game summary. Can be called at any point (live or final). */
    getGameSummary(): GameSummary;
    /** Get passing stats for a specific player */
    getPassingStats(playerId: string): import("./types").PassingStats | null;
    /** Get rushing stats for a specific player */
    getRushingStats(playerId: string): import("./types").RushingStats | null;
    /** Get receiving stats for a specific player */
    getReceivingStats(playerId: string): import("./types").ReceivingStats | null;
    /** Get defensive stats for a specific player */
    getDefensiveStats(playerId: string): import("./types").DefensiveStats | null;
    /** Get total plays processed */
    getPlayCount(): number;
    /** Get all raw plays (useful for replay / analysis) */
    getRawPlays(): readonly Play[];
    /** Reset the engine for a new game */
    reset(): void;
}
//# sourceMappingURL=engine.d.ts.map