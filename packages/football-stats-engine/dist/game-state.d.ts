import { Play, Quarter, Down, TeamId } from "./types";
export type RuleLevel = "nfl" | "college" | "high_school";
export interface RuleSet {
    level: RuleLevel;
    quarterLengthSeconds: number;
    playClockAfterPlay: number;
    playClockAfterStoppage: number;
    clockStopsOnAllFirstDowns: boolean;
    clockStopsOnFirstDownLastSeconds: number;
    clockStopsOnOOBAlways: boolean;
    clockStopsOnOOBLastSeconds: number;
    clockRestartsOnSnapAfterOOB: boolean;
    clockRestartsOnSnapAfterFirstDown: boolean;
    hasTwoMinuteWarning: boolean;
    timeoutsPerHalf: number;
    timeoutsInOvertime: number;
    timeoutsCarryOver: boolean;
    hasChallenges: boolean;
    challengesPerHalf: number;
    extraChallengeOnTwoWins: boolean;
    hasBoothReview: boolean;
    overtime: OvertimeRules;
    mercyRule: MercyRuleConfig | null;
    kickoffYardLine: number;
    extraPointYardLine: number;
    twoPointYardLine: number;
    safetyFreeKickYardLine: number;
    allowDeferOnCoinToss: boolean;
}
export interface OvertimeRules {
    type: "timed" | "kansas";
    periodLengthSeconds: number;
    guaranteedPossession: boolean;
    canEndInTie: boolean;
    maxPeriodsBeforeTie: number;
    startingYardLine: number;
    forceTwoPointAfterPeriod: number;
    twoPointShootoutAfterPeriod: number;
    hasClock: boolean;
}
export interface MercyRuleConfig {
    pointDifferential: number;
    activatesAfterQuarter: number;
    effect: "running_clock";
    description: string;
}
export declare const NFL_RULES: RuleSet;
export declare const COLLEGE_RULES: RuleSet;
export declare const HIGH_SCHOOL_RULES: RuleSet;
export declare enum GamePhase {
    PreGame = "pre_game",
    CoinToss = "coin_toss",
    Kickoff = "kickoff",
    InProgress = "in_progress",
    TwoMinuteWarning = "two_minute_warning",
    Halftime = "halftime",
    Overtime = "overtime",
    OvertimeCoinToss = "overtime_coin_toss",
    KansasOT = "kansas_ot",
    TwoPointShootout = "two_point_shootout",
    MercyRule = "mercy_rule",
    Final = "final",
    FinalOvertime = "final_overtime"
}
export declare enum ClockState {
    Running = "running",
    Stopped = "stopped",
    MercyRunning = "mercy_running"
}
export declare enum StoppageReason {
    IncompletePass = "incomplete_pass",
    OutOfBounds = "out_of_bounds",
    Penalty = "penalty",
    Timeout = "timeout",
    TwoMinuteWarning = "two_minute_warning",
    Touchdown = "touchdown",
    FieldGoal = "field_goal",
    Turnover = "turnover",
    SafetyScore = "safety",
    FirstDown = "first_down",
    ChangeOfPossession = "change_of_possession",
    EndOfQuarter = "end_of_quarter",
    Halftime = "halftime",
    InjuryTimeout = "injury_timeout",
    OfficialTimeout = "official_timeout",
    ReviewChallenge = "review_challenge",
    EndOfGame = "end_of_game"
}
export declare enum CoinTossChoice {
    Receive = "receive",
    Kick = "kick",
    Defer = "defer"
}
export declare enum PossessionReason {
    Kickoff = "kickoff",
    Punt = "punt",
    Turnover = "turnover",
    TurnoverOnDowns = "turnover_on_downs",
    Safety = "safety",
    Touchdown = "after_score",
    OvertimeRules = "overtime_rules",
    StartOfHalf = "start_of_half",
    MuffedKick = "muffed_kick",
    OnsideKick = "onside_kick"
}
export interface TimeoutState {
    remaining: number;
    usedThisHalf: number;
    totalUsed: number;
    timestamps: TimeoutRecord[];
}
export interface TimeoutRecord {
    quarter: Quarter;
    gameClock: string;
    teamId: string;
    isCharged: boolean;
    reason?: string;
}
export interface ChallengeState {
    remaining: number;
    used: number;
    won: number;
    lost: number;
    history: ChallengeRecord[];
}
export interface ChallengeRecord {
    quarter: Quarter;
    gameClock: string;
    teamId: string;
    result: "upheld" | "overturned" | "stands";
    playDescription?: string;
}
export interface OvertimeState {
    isOvertime: boolean;
    overtimePeriod: number;
    coinTossWinner?: string;
    coinTossChoice?: CoinTossChoice;
    possessions: OvertimePossession[];
    isFirstPossessionComplete: boolean;
    isSuddenDeath: boolean;
    teamsThatHavePossessed: Set<string>;
    periodScores: Array<{
        period: number;
        home: number;
        away: number;
    }>;
    isTwoPointShootout: boolean;
    mustGoForTwo: boolean;
}
export interface OvertimePossession {
    teamId: string;
    result: "touchdown" | "field_goal" | "punt" | "turnover" | "turnover_on_downs" | "safety" | "end_of_period" | "in_progress";
    points: number;
}
export interface GameStateSnapshot {
    phase: GamePhase;
    ruleLevel: RuleLevel;
    quarter: Quarter;
    gameClock: string;
    gameClockSeconds: number;
    playClock: number;
    clockState: ClockState;
    down: Down;
    distance: number;
    yardLine: number;
    possession: string;
    homeTeam: TeamId;
    awayTeam: TeamId;
    homeScore: number;
    awayScore: number;
    homeTimeouts: TimeoutState;
    awayTimeouts: TimeoutState;
    homeChallenges: ChallengeState;
    awayChallenges: ChallengeState;
    lastStoppage?: StoppageReason;
    twoMinuteWarningUsed: {
        q2: boolean;
        q4: boolean;
    };
    overtime: OvertimeState;
    isMercyRule: boolean;
    isFinal: boolean;
    playCount: number;
    driveNumber: number;
}
export interface GameEvent {
    type: GameEventType;
    quarter: Quarter;
    gameClock: string;
    description: string;
    teamId?: string;
    metadata?: Record<string, unknown>;
}
export declare enum GameEventType {
    CoinToss = "coin_toss",
    Kickoff = "kickoff",
    Timeout = "timeout",
    TwoMinuteWarning = "two_minute_warning",
    EndOfQuarter = "end_of_quarter",
    Halftime = "halftime",
    StartOfHalf = "start_of_half",
    OvertimeStart = "overtime_start",
    OvertimeCoinToss = "overtime_coin_toss",
    KansasOTPossession = "kansas_ot_possession",
    TwoPointShootout = "two_point_shootout",
    Challenge = "challenge",
    InjuryTimeout = "injury_timeout",
    OfficialTimeout = "official_timeout",
    MercyRuleActivated = "mercy_rule_activated",
    MercyRuleDeactivated = "mercy_rule_deactivated",
    DelayOfGame = "delay_of_game",
    ChangeOfPossession = "change_of_possession",
    Safety = "safety",
    Touchback = "touchback",
    FairCatch = "fair_catch",
    GameOver = "game_over",
    ReviewUnderway = "review_underway",
    ReviewComplete = "review_complete"
}
export declare function getRuleSet(level: RuleLevel): RuleSet;
export declare class GameStateManager {
    private phase;
    private quarter;
    private gameClockSeconds;
    private playClock;
    private clockState;
    private down;
    private distance;
    private yardLine;
    private possession;
    private homeTeam;
    private awayTeam;
    private homeScore;
    private awayScore;
    private playCount;
    private driveNumber;
    private homeTimeouts;
    private awayTimeouts;
    private homeChallenges;
    private awayChallenges;
    private twoMinuteWarning;
    private overtime;
    private mercyRuleActive;
    private events;
    readonly rules: RuleSet;
    private coinTossWinner;
    private coinTossChoice;
    private deferredTeam;
    constructor(level?: RuleLevel, customRules?: Partial<RuleSet>);
    setTeams(home: TeamId, away: TeamId): void;
    recordCoinToss(winner: string, choice: CoinTossChoice): void;
    processPlay(play: Play): {
        events: GameEvent[];
        shouldProcess: boolean;
        updatedContext: Play["context"];
    };
    processTimeout(teamId: string, isCharged?: boolean, reason?: string): boolean;
    private resetTimeoutsForHalf;
    private resetTimeoutsForOvertime;
    recordChallenge(teamId: string, result: "upheld" | "overturned" | "stands", playDescription?: string): boolean;
    recordBoothReview(result: "upheld" | "overturned" | "stands", description?: string): void;
    recordInjuryTimeout(teamId?: string): void;
    private checkMercyRule;
    private updateClockState;
    private handleEndOfQuarter;
    private enterOvertime;
    recordOvertimeCoinToss(winner: string, choice: CoinTossChoice): void;
    startKansasOTPossession(teamId: string): void;
    endKansasOTPossession(teamId: string, result: OvertimePossession["result"], points: number): void;
    private updateOvertimeState;
    private handleEndOfOvertimePeriod;
    private detectPossessionChange;
    private detectScoring;
    private enrichContext;
    getSnapshot(): GameStateSnapshot;
    getEvents(): GameEvent[];
    getTimeoutsRemaining(teamId: string): number;
    getChallengesRemaining(teamId: string): number;
    isGameOver(): boolean;
    isHalftime(): boolean;
    isOvertime(): boolean;
    isMercyRuleActive(): boolean;
    getClockState(): ClockState;
    getPhase(): GamePhase;
    getRuleLevel(): RuleLevel;
    mustGoForTwoPointConversion(): boolean;
    isTwoPointShootout(): boolean;
    private addEvent;
    private getRecentEvents;
    private createTimeoutState;
    private createChallengeState;
    private createNoChallengeState;
    private createOvertimeState;
}
//# sourceMappingURL=game-state.d.ts.map