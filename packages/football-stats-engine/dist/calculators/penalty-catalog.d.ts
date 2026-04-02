import { RuleLevel } from "../game-state";
export declare enum EnforcementSpot {
    /** Walk off from the previous line of scrimmage */
    PreviousSpot = "previous_spot",
    /** Walk off from where the foul occurred */
    SpotOfFoul = "spot_of_foul",
    /** Walk off from where the ball ended up (end of the run) */
    EndOfRun = "end_of_run",
    /** Walk off from the succeeding spot (where the next play would start) */
    SucceedingSpot = "succeeding_spot",
    /** Dead ball foul — enforced from the dead ball spot */
    DeadBall = "dead_ball"
}
export declare enum PenaltyCategory {
    PreSnap = "pre_snap",
    PassingOffense = "passing_offense",
    PassingDefense = "passing_defense",
    RunBlocking = "run_blocking",
    RunDefense = "run_defense",
    SpecialTeams = "special_teams",
    UnsportsmanlikeConduct = "unsportsmanlike",
    PersonalFoul = "personal_foul",
    Administrative = "administrative"
}
export interface PenaltyDefinition {
    /** Unique key for this penalty */
    code: string;
    /** Human-readable name */
    name: string;
    /** Category for grouping */
    category: PenaltyCategory;
    /** Default yardage at each rule level */
    yards: {
        nfl: number;
        college: number;
        high_school: number;
    };
    /** Where the penalty is enforced from */
    enforcementSpot: EnforcementSpot;
    /** Is this an automatic first down for the offense? (defensive penalties) */
    autoFirstDown: {
        nfl: boolean;
        college: boolean;
        high_school: boolean;
    };
    /** Does this penalty cause a loss of down? (offensive penalties) */
    lossOfDown: boolean;
    /** Is this a pre-snap (dead ball) foul? */
    isPreSnap: boolean;
    /** Is this committed by the offense? (false = defense, null = either) */
    isOffensivePenalty: boolean | null;
    /** Can this penalty result in an ejection? */
    canCauseEjection: boolean;
    /** Does this penalty carry a 10-second runoff in the last 2 min? (NFL) */
    tenSecondRunoff: boolean;
    /** Is this penalty a personal foul that accumulates toward ejection? */
    isPersonalFoul: boolean;
    /** Does the play result stand, or is it replayed? */
    replayDown: boolean;
    /** Maximum yardage cap (e.g., spot fouls capped at 15 for DPI in college) */
    maxYards?: {
        nfl: number | null;
        college: number | null;
        high_school: number | null;
    };
    /** Notes about rule differences */
    notes?: string;
}
export declare const PENALTY_CATALOG: Record<string, PenaltyDefinition>;
/** Look up a penalty definition by code. Returns undefined if not found. */
export declare function lookupPenalty(code: string): PenaltyDefinition | undefined;
/** Get the yardage for a penalty at a specific rule level */
export declare function getPenaltyYards(def: PenaltyDefinition, level: RuleLevel): number;
/** Check if a penalty is an automatic first down at a specific level */
export declare function isAutoFirstDown(def: PenaltyDefinition, level: RuleLevel): boolean;
/** Get all penalty codes */
export declare function getAllPenaltyCodes(): string[];
/** Get penalties by category */
export declare function getPenaltiesByCategory(category: PenaltyCategory): PenaltyDefinition[];
//# sourceMappingURL=penalty-catalog.d.ts.map