export declare enum PlayType {
    Pass = "pass",
    Rush = "rush",
    Punt = "punt",
    Kickoff = "kickoff",
    FieldGoal = "field_goal",
    ExtraPoint = "extra_point",
    TwoPointConversion = "two_point_conversion",
    Kneel = "kneel",
    Spike = "spike",
    Penalty = "penalty",
    Timeout = "timeout",
    FreeKick = "free_kick",
    FairCatch = "fair_catch",
    NoPlay = "no_play"
}
export declare enum PassResult {
    Complete = "complete",
    Incomplete = "incomplete",
    Interception = "interception",
    Sack = "sack",
    Scramble = "scramble",
    ThrowAway = "throw_away",
    BattedDown = "batted_down",
    SpikeBall = "spike"
}
export declare enum RushResult {
    Normal = "normal",
    Fumble = "fumble",
    Touchdown = "touchdown",
    Kneel = "kneel"
}
export declare enum SpecialTeamsResult {
    Normal = "normal",
    Touchback = "touchback",
    FairCatch = "fair_catch",
    Muff = "muff",
    Block = "block",
    OutOfBounds = "out_of_bounds",
    ReturnTouchdown = "return_touchdown"
}
export declare enum KickResult {
    Good = "good",
    NoGood = "no_good",
    Blocked = "blocked"
}
export declare enum PenaltyEnforcement {
    Accepted = "accepted",
    Declined = "declined",
    Offset = "offset"
}
export declare enum Down {
    First = 1,
    Second = 2,
    Third = 3,
    Fourth = 4
}
export declare enum Quarter {
    First = 1,
    Second = 2,
    Third = 3,
    Fourth = 4,
    OT1 = 5,
    OT2 = 6,
    OT3 = 7
}
export declare enum Direction {
    Left = "left",
    LeftTackle = "left_tackle",
    LeftGuard = "left_guard",
    Middle = "middle",
    RightGuard = "right_guard",
    RightTackle = "right_tackle",
    Right = "right"
}
export declare enum PassDepth {
    BehindLOS = "behind_los",
    Short = "short",// 0-9 yards
    Medium = "medium",// 10-19 yards
    Deep = "deep"
}
export declare enum PassLocation {
    Left = "left",
    Middle = "middle",
    Right = "right"
}
export declare enum Formation {
    Shotgun = "shotgun",
    UnderCenter = "under_center",
    Pistol = "pistol",
    Singleback = "singleback",
    IFormation = "i_formation",
    EmptyBackfield = "empty",
    Wildcat = "wildcat",
    Goal = "goal_line",
    Jumbo = "jumbo"
}
export declare enum CoverageScheme {
    Cover0 = "cover_0",
    Cover1 = "cover_1",
    Cover2 = "cover_2",
    Cover2Man = "cover_2_man",
    Cover3 = "cover_3",
    Cover4 = "cover_4",
    Cover6 = "cover_6",
    ManToMan = "man",
    Zone = "zone",
    PreventDefense = "prevent"
}
export interface PlayerId {
    id: string;
    name: string;
    number?: number;
    position?: string;
    teamId: string;
}
export interface TeamId {
    id: string;
    name: string;
    abbreviation: string;
}
export interface PlayContext {
    gameId: string;
    quarter: Quarter;
    gameClock: string;
    playClock?: number;
    down: Down;
    distance: number;
    yardLine: number;
    possessionTeam: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    driveNumber?: number;
    playNumberInDrive?: number;
    playNumberInGame?: number;
    isRedZone?: boolean;
    isGoalToGo?: boolean;
    isNoHuddle?: boolean;
    isTwoMinuteWarning?: boolean;
    formation?: Formation;
    personnelOffense?: string;
    personnelDefense?: string;
    coverageScheme?: CoverageScheme;
}
export interface PassPlay {
    type: PlayType.Pass;
    passer: string;
    result: PassResult;
    target?: string;
    receiver?: string;
    yardsGained: number;
    airYards?: number;
    yardsAfterCatch?: number;
    isTouchdown: boolean;
    isTwoPointConversion?: boolean;
    passDepth?: PassDepth;
    passLocation?: PassLocation;
    isUnderPressure?: boolean;
    timeToThrow?: number;
    isPlayAction?: boolean;
    isScreenPass?: boolean;
    isRPO?: boolean;
    interceptedBy?: string;
    interceptionReturnYards?: number;
    fumble?: FumbleEvent;
    penalties?: PenaltyEvent[];
    tackledBy?: string[];
    assistedTackle?: string[];
    forcedOutOfBounds?: boolean;
    description?: string;
}
export interface RushPlay {
    type: PlayType.Rush;
    rusher: string;
    result: RushResult;
    yardsGained: number;
    isTouchdown: boolean;
    isTwoPointConversion?: boolean;
    direction?: Direction;
    yardsAfterContact?: number;
    brokenTackles?: number;
    isKneel?: boolean;
    isQBScramble?: boolean;
    fumble?: FumbleEvent;
    penalties?: PenaltyEvent[];
    tackledBy?: string[];
    assistedTackle?: string[];
    description?: string;
}
export interface SpecialTeamsPlay {
    type: PlayType.Punt | PlayType.Kickoff | PlayType.FieldGoal | PlayType.ExtraPoint | PlayType.FreeKick;
    kicker?: string;
    punter?: string;
    returner?: string;
    result: SpecialTeamsResult | KickResult;
    kickDistance?: number;
    returnYards?: number;
    isTouchback?: boolean;
    isFairCatch?: boolean;
    isBlocked?: boolean;
    blockedBy?: string;
    isOnsideKick?: boolean;
    hangTime?: number;
    isTouchdown?: boolean;
    fieldGoalDistance?: number;
    fumble?: FumbleEvent;
    penalties?: PenaltyEvent[];
    tackledBy?: string[];
    description?: string;
}
export interface PenaltyPlay {
    type: PlayType.Penalty | PlayType.NoPlay;
    penalties: PenaltyEvent[];
    description?: string;
}
export interface TimeoutPlay {
    type: PlayType.Timeout;
    calledBy: string;
    description?: string;
}
export interface FumbleEvent {
    fumbledBy: string;
    forcedBy?: string;
    recoveredBy?: string;
    recoveryTeam?: string;
    recoveryYards?: number;
    isTouchdown?: boolean;
}
export interface PenaltyEvent {
    penaltyType: string;
    team: string;
    player?: string;
    yards: number;
    enforcement: PenaltyEnforcement;
    isPreSnap?: boolean;
    isAutoFirstDown?: boolean;
    description?: string;
}
export type Play = (PassPlay | RushPlay | SpecialTeamsPlay | PenaltyPlay | TimeoutPlay) & {
    context: PlayContext;
};
export interface PassingStats {
    playerId: string;
    playerName: string;
    completions: number;
    attempts: number;
    yards: number;
    touchdowns: number;
    interceptions: number;
    sacks: number;
    sackYardsLost: number;
    completionPercentage: number;
    yardsPerAttempt: number;
    yardsPerCompletion: number;
    adjustedYardsPerAttempt: number;
    passerRating: number;
    longPass: number;
    airYards: number;
    yardsAfterCatch: number;
    timesUnderPressure: number;
    completionsUnderPressure: number;
    attemptsUnderPressure: number;
    avgTimeToThrow: number;
    playActionAttempts: number;
    playActionCompletions: number;
    playActionYards: number;
    screenPassAttempts: number;
    screenPassCompletions: number;
    screenPassYards: number;
    firstDowns: number;
    twentyPlusYardCompletions: number;
    fortyPlusYardCompletions: number;
    scrambles: number;
    scrambleYards: number;
    throwAways: number;
    battedBalls: number;
    redZoneAttempts: number;
    redZoneCompletions: number;
    redZoneTouchdowns: number;
    redZoneInterceptions: number;
    thirdDownAttempts: number;
    thirdDownCompletions: number;
    thirdDownConversions: number;
}
export interface RushingStats {
    playerId: string;
    playerName: string;
    carries: number;
    yards: number;
    touchdowns: number;
    yardsPerCarry: number;
    longRush: number;
    fumbles: number;
    fumblesLost: number;
    firstDowns: number;
    tenPlusYardRuns: number;
    twentyPlusYardRuns: number;
    yardsAfterContact: number;
    brokenTackles: number;
    stuffedRuns: number;
    redZoneCarries: number;
    redZoneTouchdowns: number;
    thirdDownCarries: number;
    thirdDownConversions: number;
    rushLeftYards: number;
    rushMiddleYards: number;
    rushRightYards: number;
    rushLeftCarries: number;
    rushMiddleCarries: number;
    rushRightCarries: number;
    kneels: number;
    scrambles: number;
    scrambleYards: number;
}
export interface ReceivingStats {
    playerId: string;
    playerName: string;
    targets: number;
    receptions: number;
    yards: number;
    touchdowns: number;
    yardsPerReception: number;
    yardsPerTarget: number;
    catchPercentage: number;
    longReception: number;
    firstDowns: number;
    airYards: number;
    yardsAfterCatch: number;
    twentyPlusYardReceptions: number;
    fortyPlusYardReceptions: number;
    drops: number;
    fumbles: number;
    fumblesLost: number;
    redZoneTargets: number;
    redZoneReceptions: number;
    redZoneTouchdowns: number;
    thirdDownTargets: number;
    thirdDownReceptions: number;
    thirdDownConversions: number;
    yardsBeforeCatch: number;
    avgDepthOfTarget: number;
}
export interface DefensiveStats {
    playerId: string;
    playerName: string;
    totalTackles: number;
    soloTackles: number;
    assistedTackles: number;
    tacklesForLoss: number;
    sacks: number;
    halfSacks: number;
    sackYards: number;
    qbHits: number;
    pressures: number;
    interceptions: number;
    interceptionYards: number;
    interceptionTouchdowns: number;
    passesDefended: number;
    forcedFumbles: number;
    fumbleRecoveries: number;
    fumbleRecoveryYards: number;
    fumbleRecoveryTouchdowns: number;
    safeties: number;
    stuffs: number;
    missedTackles: number;
    targetedInCoverage: number;
    completionsAllowed: number;
    yardsAllowedInCoverage: number;
    touchdownsAllowedInCoverage: number;
}
export interface KickingStats {
    playerId: string;
    playerName: string;
    fieldGoalAttempts: number;
    fieldGoalMade: number;
    fieldGoalPercentage: number;
    fieldGoalLong: number;
    fieldGoalBlocked: number;
    extraPointAttempts: number;
    extraPointMade: number;
    extraPointPercentage: number;
    extraPointBlocked: number;
    totalPoints: number;
    fg0to19Att: number;
    fg0to19Made: number;
    fg20to29Att: number;
    fg20to29Made: number;
    fg30to39Att: number;
    fg30to39Made: number;
    fg40to49Att: number;
    fg40to49Made: number;
    fg50PlusAtt: number;
    fg50PlusMade: number;
    kickoffs: number;
    kickoffTouchbacks: number;
    kickoffTouchbackPercentage: number;
    onsideKickAttempts: number;
    onsideKickRecoveries: number;
    averageKickoffDistance: number;
}
export interface PuntingStats {
    playerId: string;
    playerName: string;
    punts: number;
    puntYards: number;
    puntAverage: number;
    puntLong: number;
    puntsInside20: number;
    touchbacks: number;
    puntsFairCaught: number;
    puntsBlocked: number;
    puntReturnYardsAgainst: number;
    netPuntAverage: number;
    hangTimeAvg: number;
}
export interface ReturnStats {
    playerId: string;
    playerName: string;
    kickReturns: number;
    kickReturnYards: number;
    kickReturnAverage: number;
    kickReturnLong: number;
    kickReturnTouchdowns: number;
    kickReturnFumbles: number;
    puntReturns: number;
    puntReturnYards: number;
    puntReturnAverage: number;
    puntReturnLong: number;
    puntReturnTouchdowns: number;
    puntReturnFumbles: number;
    puntReturnFairCatches: number;
}
export interface TeamStats {
    teamId: string;
    teamName: string;
    totalPlays: number;
    totalYards: number;
    passingYards: number;
    rushingYards: number;
    firstDowns: number;
    firstDownsPassing: number;
    firstDownsRushing: number;
    firstDownsPenalty: number;
    thirdDownAttempts: number;
    thirdDownConversions: number;
    thirdDownPercentage: number;
    fourthDownAttempts: number;
    fourthDownConversions: number;
    fourthDownPercentage: number;
    redZoneTrips: number;
    redZoneTouchdowns: number;
    redZoneFieldGoals: number;
    redZonePercentage: number;
    turnovers: number;
    interceptionsThrown: number;
    fumblesLost: number;
    penalties: number;
    penaltyYards: number;
    timeOfPossession: string;
    timeOfPossessionSeconds: number;
    sacks: number;
    sackYardsLost: number;
    pointsScored: number;
    totalDrives: number;
    puntCount: number;
    averageStartingFieldPosition: number;
    yardsPerPlay: number;
    passAttempts: number;
    passCompletions: number;
    rushAttempts: number;
    averageDriveYards: number;
    averageDrivePlays: number;
    averageDriveTime: string;
    twoPointConversionAttempts: number;
    twoPointConversionsMade: number;
    goalToGoAttempts: number;
    goalToGoTouchdowns: number;
}
export interface DriveStats {
    driveNumber: number;
    team: string;
    startQuarter: Quarter;
    startTime: string;
    startYardLine: number;
    endQuarter: Quarter;
    endTime: string;
    endYardLine: number;
    plays: number;
    yards: number;
    timeOfPossession: string;
    timeOfPossessionSeconds: number;
    result: DriveResult;
    firstDowns: number;
    penalties: number;
    penaltyYards: number;
    isRedZoneDrive: boolean;
}
export declare enum DriveResult {
    Touchdown = "touchdown",
    FieldGoal = "field_goal",
    Punt = "punt",
    Turnover = "turnover",
    TurnoverOnDowns = "turnover_on_downs",
    EndOfHalf = "end_of_half",
    EndOfGame = "end_of_game",
    Safety = "safety",
    MissedFieldGoal = "missed_field_goal"
}
export interface PlayerPenaltyStats {
    playerId: string;
    playerName: string;
    totalPenalties: number;
    totalYards: number;
    acceptedPenalties: number;
    declinedPenalties: number;
    offsetPenalties: number;
    preSnapPenalties: number;
    liveballPenalties: number;
    personalFouls: number;
    unsportsmanlikeConducts: number;
    /** Breakdown by penalty type code: { "holding_offense": 3, "false_start": 1 } */
    byType: Record<string, number>;
    thirdDownPenalties: number;
    redZonePenalties: number;
    q1Penalties: number;
    q2Penalties: number;
    q3Penalties: number;
    q4Penalties: number;
    otPenalties: number;
    personalFoulCount: number;
    unsportsmanlikeCount: number;
    wasEjected: boolean;
    ejectionQuarter?: Quarter;
    ejectionClock?: string;
}
export interface TeamPenaltyStats {
    teamId: string;
    teamName: string;
    totalPenalties: number;
    totalYards: number;
    acceptedPenalties: number;
    declinedPenalties: number;
    offsetPenalties: number;
    preSnapPenalties: number;
    liveballPenalties: number;
    offensivePenalties: number;
    defensivePenalties: number;
    specialTeamsPenalties: number;
    personalFouls: number;
    unsportsmanlikeConducts: number;
    thirdDownPenalties: number;
    redZonePenalties: number;
    autoFirstDownsGivenUp: number;
    autoFirstDownsReceived: number;
    q1Penalties: number;
    q2Penalties: number;
    q3Penalties: number;
    q4Penalties: number;
    otPenalties: number;
    byType: Record<string, number>;
    bigPlayNegated: number;
}
export interface GameSummary {
    gameId: string;
    homeTeam: TeamId;
    awayTeam: TeamId;
    homeScore: number;
    awayScore: number;
    quarter: Quarter;
    gameClock: string;
    isFinal: boolean;
    totalPlays: number;
    homeTeamStats: TeamStats;
    awayTeamStats: TeamStats;
    passing: Record<string, PassingStats>;
    rushing: Record<string, RushingStats>;
    receiving: Record<string, ReceivingStats>;
    defense: Record<string, DefensiveStats>;
    kicking: Record<string, KickingStats>;
    punting: Record<string, PuntingStats>;
    returns: Record<string, ReturnStats>;
    playerPenalties: Record<string, PlayerPenaltyStats>;
    teamPenalties: Record<string, TeamPenaltyStats>;
    drives: DriveStats[];
    scoringPlays: ScoringPlay[];
}
export interface ScoringPlay {
    quarter: Quarter;
    gameClock: string;
    team: string;
    description: string;
    pointsScored: number;
    homeScore: number;
    awayScore: number;
    playType: "passing_td" | "rushing_td" | "field_goal" | "extra_point" | "two_point" | "safety" | "return_td" | "defensive_td" | "fumble_recovery_td";
}
export interface EngineConfig {
    /** Whether to track advanced metrics (air yards, YAC, pressure, etc.) */
    trackAdvancedMetrics?: boolean;
    /** Whether to track directional rushing splits */
    trackDirectionalStats?: boolean;
    /** Whether to track situational splits (red zone, third down) */
    trackSituationalSplits?: boolean;
    /** Whether to compute drive summaries */
    trackDrives?: boolean;
    /** Whether to compute passer rating */
    computePasserRating?: boolean;
    /** Custom player name resolver (if you only pass IDs) */
    resolvePlayerName?: (playerId: string) => string;
}
//# sourceMappingURL=types.d.ts.map