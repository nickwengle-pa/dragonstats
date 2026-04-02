// ============================================================================
// PENALTY CATALOG — Complete reference for all American football penalties
// ============================================================================
//
// Each penalty definition includes:
//   - Default yardage (may differ by level)
//   - Enforcement spot (previous, spot of foul, end of run, succeeding)
//   - Whether it's an automatic first down
//   - Pre-snap vs live-ball
//   - Offense vs defense
//   - Loss of down
//   - Replay the down
//   - Rule level variations
// ============================================================================
// ---------------------------------------------------------------------------
// ENFORCEMENT SPOT — Where the penalty is walked off from
// ---------------------------------------------------------------------------
export var EnforcementSpot;
(function (EnforcementSpot) {
    /** Walk off from the previous line of scrimmage */
    EnforcementSpot["PreviousSpot"] = "previous_spot";
    /** Walk off from where the foul occurred */
    EnforcementSpot["SpotOfFoul"] = "spot_of_foul";
    /** Walk off from where the ball ended up (end of the run) */
    EnforcementSpot["EndOfRun"] = "end_of_run";
    /** Walk off from the succeeding spot (where the next play would start) */
    EnforcementSpot["SucceedingSpot"] = "succeeding_spot";
    /** Dead ball foul — enforced from the dead ball spot */
    EnforcementSpot["DeadBall"] = "dead_ball";
})(EnforcementSpot || (EnforcementSpot = {}));
// ---------------------------------------------------------------------------
// PENALTY CATEGORY
// ---------------------------------------------------------------------------
export var PenaltyCategory;
(function (PenaltyCategory) {
    PenaltyCategory["PreSnap"] = "pre_snap";
    PenaltyCategory["PassingOffense"] = "passing_offense";
    PenaltyCategory["PassingDefense"] = "passing_defense";
    PenaltyCategory["RunBlocking"] = "run_blocking";
    PenaltyCategory["RunDefense"] = "run_defense";
    PenaltyCategory["SpecialTeams"] = "special_teams";
    PenaltyCategory["UnsportsmanlikeConduct"] = "unsportsmanlike";
    PenaltyCategory["PersonalFoul"] = "personal_foul";
    PenaltyCategory["Administrative"] = "administrative";
})(PenaltyCategory || (PenaltyCategory = {}));
// ---------------------------------------------------------------------------
// THE CATALOG
// ---------------------------------------------------------------------------
export const PENALTY_CATALOG = {
    // =========================================================================
    // PRE-SNAP / DEAD BALL FOULS
    // =========================================================================
    false_start: {
        code: "false_start",
        name: "False Start",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: true, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: true, isPersonalFoul: false,
        replayDown: true,
    },
    offsides: {
        code: "offsides",
        name: "Offsides",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: true, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
        notes: "NFL: offense gets free play if ball is snapped",
    },
    neutral_zone_infraction: {
        code: "neutral_zone_infraction",
        name: "Neutral Zone Infraction",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: true, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    encroachment: {
        code: "encroachment",
        name: "Encroachment",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: true, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
        notes: "Defensive player contacts an offensive player before snap",
    },
    delay_of_game: {
        code: "delay_of_game",
        name: "Delay of Game",
        category: PenaltyCategory.Administrative,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: true, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    too_many_men: {
        code: "too_many_men",
        name: "Too Many Men on the Field",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: true, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: true, isPersonalFoul: false,
        replayDown: true,
    },
    illegal_formation: {
        code: "illegal_formation",
        name: "Illegal Formation",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: true, isPersonalFoul: false,
        replayDown: true,
    },
    illegal_shift: {
        code: "illegal_shift",
        name: "Illegal Shift",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: true, isPersonalFoul: false,
        replayDown: true,
    },
    illegal_motion: {
        code: "illegal_motion",
        name: "Illegal Motion",
        category: PenaltyCategory.PreSnap,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: true, isPersonalFoul: false,
        replayDown: true,
    },
    // =========================================================================
    // OFFENSIVE PENALTIES (LIVE BALL)
    // =========================================================================
    holding_offense: {
        code: "holding_offense",
        name: "Offensive Holding",
        category: PenaltyCategory.RunBlocking,
        yards: { nfl: 10, college: 10, high_school: 10 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: true, isPersonalFoul: false,
        replayDown: true,
        notes: "Enforced from spot of foul when behind LOS in NFL; previous spot is most common",
    },
    illegal_block_above_waist: {
        code: "illegal_block_above_waist",
        name: "Illegal Block Above the Waist",
        category: PenaltyCategory.RunBlocking,
        yards: { nfl: 10, college: 10, high_school: 10 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    illegal_block_in_back: {
        code: "illegal_block_in_back",
        name: "Illegal Block in the Back",
        category: PenaltyCategory.RunBlocking,
        yards: { nfl: 10, college: 10, high_school: 10 },
        enforcementSpot: EnforcementSpot.SpotOfFoul,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    chop_block: {
        code: "chop_block",
        name: "Chop Block",
        category: PenaltyCategory.RunBlocking,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: true,
    },
    intentional_grounding: {
        code: "intentional_grounding",
        name: "Intentional Grounding",
        category: PenaltyCategory.PassingOffense,
        yards: { nfl: 10, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.SpotOfFoul,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: true, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: true, isPersonalFoul: false,
        replayDown: false,
        notes: "NFL: loss of down + spot of foul. If in end zone = safety. College/HS: 5 yards + loss of down from previous spot",
    },
    illegal_forward_pass: {
        code: "illegal_forward_pass",
        name: "Illegal Forward Pass",
        category: PenaltyCategory.PassingOffense,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.SpotOfFoul,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: true, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
        notes: "Thrown from beyond LOS or second forward pass",
    },
    offensive_pass_interference: {
        code: "offensive_pass_interference",
        name: "Offensive Pass Interference",
        category: PenaltyCategory.PassingOffense,
        yards: { nfl: 10, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    ineligible_receiver_downfield: {
        code: "ineligible_receiver_downfield",
        name: "Ineligible Receiver Downfield",
        category: PenaltyCategory.PassingOffense,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    illegal_touching: {
        code: "illegal_touching",
        name: "Illegal Touching of a Pass",
        category: PenaltyCategory.PassingOffense,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: true, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
    },
    // =========================================================================
    // DEFENSIVE PENALTIES (LIVE BALL)
    // =========================================================================
    holding_defense: {
        code: "holding_defense",
        name: "Defensive Holding",
        category: PenaltyCategory.RunDefense,
        yards: { nfl: 5, college: 10, high_school: 10 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
    },
    defensive_pass_interference: {
        code: "defensive_pass_interference",
        name: "Defensive Pass Interference",
        category: PenaltyCategory.PassingDefense,
        yards: { nfl: 0, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.SpotOfFoul,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
        maxYards: { nfl: null, college: 15, high_school: 15 },
        notes: "NFL: spot foul (no max). College/HS: 15-yard penalty from previous spot (not spot foul)",
    },
    illegal_contact: {
        code: "illegal_contact",
        name: "Illegal Contact",
        category: PenaltyCategory.PassingDefense,
        yards: { nfl: 5, college: 0, high_school: 0 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
        notes: "NFL only — contact beyond 5 yards. Does not exist in college/HS rules",
    },
    // =========================================================================
    // PERSONAL FOULS (15 YARDS)
    // =========================================================================
    roughing_the_passer: {
        code: "roughing_the_passer",
        name: "Roughing the Passer",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.EndOfRun,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
        notes: "Enforced from end of play. If incomplete pass, enforced from previous spot",
    },
    roughing_the_kicker: {
        code: "roughing_the_kicker",
        name: "Roughing the Kicker",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
    },
    running_into_the_kicker: {
        code: "running_into_the_kicker",
        name: "Running Into the Kicker",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    unnecessary_roughness: {
        code: "unnecessary_roughness",
        name: "Unnecessary Roughness",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: true, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
    },
    targeting: {
        code: "targeting",
        name: "Targeting",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: true, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
        notes: "College/HS: automatic ejection, subject to review. NFL: uses unnecessary roughness instead",
    },
    face_mask: {
        code: "face_mask",
        name: "Face Mask",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
    },
    horse_collar: {
        code: "horse_collar",
        name: "Horse Collar Tackle",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.SpotOfFoul,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
    },
    late_hit: {
        code: "late_hit",
        name: "Late Hit Out of Bounds",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.DeadBall,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: true, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
    },
    // =========================================================================
    // UNSPORTSMANLIKE CONDUCT
    // =========================================================================
    unsportsmanlike_conduct: {
        code: "unsportsmanlike_conduct",
        name: "Unsportsmanlike Conduct",
        category: PenaltyCategory.UnsportsmanlikeConduct,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.DeadBall,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: true, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
        notes: "Two unsportsmanlike conduct fouls = automatic ejection at all levels",
    },
    taunting: {
        code: "taunting",
        name: "Taunting",
        category: PenaltyCategory.UnsportsmanlikeConduct,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.DeadBall,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: true, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
    },
    // =========================================================================
    // SPECIAL TEAMS PENALTIES
    // =========================================================================
    kick_catch_interference: {
        code: "kick_catch_interference",
        name: "Fair Catch Interference / Kick Catch Interference",
        category: PenaltyCategory.SpecialTeams,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.SpotOfFoul,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
    },
    illegal_kick: {
        code: "illegal_kick",
        name: "Illegal Kick",
        category: PenaltyCategory.SpecialTeams,
        yards: { nfl: 10, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    illegal_return: {
        code: "illegal_return",
        name: "Illegal Touching of a Kick / Illegal Return",
        category: PenaltyCategory.SpecialTeams,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.SpotOfFoul,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    // =========================================================================
    // MISCELLANEOUS
    // =========================================================================
    illegal_substitution: {
        code: "illegal_substitution",
        name: "Illegal Substitution",
        category: PenaltyCategory.Administrative,
        yards: { nfl: 5, college: 5, high_school: 5 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: true, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    tripping: {
        code: "tripping",
        name: "Tripping",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: false,
    },
    illegal_use_of_hands: {
        code: "illegal_use_of_hands",
        name: "Illegal Use of Hands",
        category: PenaltyCategory.RunBlocking,
        yards: { nfl: 10, college: 10, high_school: 10 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: false,
        replayDown: true,
    },
    clipping: {
        code: "clipping",
        name: "Clipping",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: true, college: true, high_school: true },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: null,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: false,
    },
    illegal_crackback: {
        code: "illegal_crackback",
        name: "Illegal Crackback Block",
        category: PenaltyCategory.PersonalFoul,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: true,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: true,
    },
    leverage: {
        code: "leverage",
        name: "Leverage / Leaping",
        category: PenaltyCategory.SpecialTeams,
        yards: { nfl: 15, college: 15, high_school: 15 },
        enforcementSpot: EnforcementSpot.PreviousSpot,
        autoFirstDown: { nfl: false, college: false, high_school: false },
        lossOfDown: false, isPreSnap: false, isOffensivePenalty: false,
        canCauseEjection: false, tenSecondRunoff: false, isPersonalFoul: true,
        replayDown: true,
    },
};
// ---------------------------------------------------------------------------
// LOOKUP HELPER
// ---------------------------------------------------------------------------
/** Look up a penalty definition by code. Returns undefined if not found. */
export function lookupPenalty(code) {
    return PENALTY_CATALOG[code];
}
/** Get the yardage for a penalty at a specific rule level */
export function getPenaltyYards(def, level) {
    return def.yards[level];
}
/** Check if a penalty is an automatic first down at a specific level */
export function isAutoFirstDown(def, level) {
    return def.autoFirstDown[level];
}
/** Get all penalty codes */
export function getAllPenaltyCodes() {
    return Object.keys(PENALTY_CATALOG);
}
/** Get penalties by category */
export function getPenaltiesByCategory(category) {
    return Object.values(PENALTY_CATALOG).filter(p => p.category === category);
}
//# sourceMappingURL=penalty-catalog.js.map