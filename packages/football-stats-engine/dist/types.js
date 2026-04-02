// ============================================================================
// FOOTBALL STATS ENGINE — TYPE DEFINITIONS
// ============================================================================
// ---------------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------------
export var PlayType;
(function (PlayType) {
    PlayType["Pass"] = "pass";
    PlayType["Rush"] = "rush";
    PlayType["Punt"] = "punt";
    PlayType["Kickoff"] = "kickoff";
    PlayType["FieldGoal"] = "field_goal";
    PlayType["ExtraPoint"] = "extra_point";
    PlayType["TwoPointConversion"] = "two_point_conversion";
    PlayType["Kneel"] = "kneel";
    PlayType["Spike"] = "spike";
    PlayType["Penalty"] = "penalty";
    PlayType["Timeout"] = "timeout";
    PlayType["FreeKick"] = "free_kick";
    PlayType["FairCatch"] = "fair_catch";
    PlayType["NoPlay"] = "no_play";
})(PlayType || (PlayType = {}));
export var PassResult;
(function (PassResult) {
    PassResult["Complete"] = "complete";
    PassResult["Incomplete"] = "incomplete";
    PassResult["Interception"] = "interception";
    PassResult["Sack"] = "sack";
    PassResult["Scramble"] = "scramble";
    PassResult["ThrowAway"] = "throw_away";
    PassResult["BattedDown"] = "batted_down";
    PassResult["SpikeBall"] = "spike";
})(PassResult || (PassResult = {}));
export var RushResult;
(function (RushResult) {
    RushResult["Normal"] = "normal";
    RushResult["Fumble"] = "fumble";
    RushResult["Touchdown"] = "touchdown";
    RushResult["Kneel"] = "kneel";
})(RushResult || (RushResult = {}));
export var SpecialTeamsResult;
(function (SpecialTeamsResult) {
    SpecialTeamsResult["Normal"] = "normal";
    SpecialTeamsResult["Touchback"] = "touchback";
    SpecialTeamsResult["FairCatch"] = "fair_catch";
    SpecialTeamsResult["Muff"] = "muff";
    SpecialTeamsResult["Block"] = "block";
    SpecialTeamsResult["OutOfBounds"] = "out_of_bounds";
    SpecialTeamsResult["ReturnTouchdown"] = "return_touchdown";
})(SpecialTeamsResult || (SpecialTeamsResult = {}));
export var KickResult;
(function (KickResult) {
    KickResult["Good"] = "good";
    KickResult["NoGood"] = "no_good";
    KickResult["Blocked"] = "blocked";
})(KickResult || (KickResult = {}));
export var PenaltyEnforcement;
(function (PenaltyEnforcement) {
    PenaltyEnforcement["Accepted"] = "accepted";
    PenaltyEnforcement["Declined"] = "declined";
    PenaltyEnforcement["Offset"] = "offset";
})(PenaltyEnforcement || (PenaltyEnforcement = {}));
export var Down;
(function (Down) {
    Down[Down["First"] = 1] = "First";
    Down[Down["Second"] = 2] = "Second";
    Down[Down["Third"] = 3] = "Third";
    Down[Down["Fourth"] = 4] = "Fourth";
})(Down || (Down = {}));
export var Quarter;
(function (Quarter) {
    Quarter[Quarter["First"] = 1] = "First";
    Quarter[Quarter["Second"] = 2] = "Second";
    Quarter[Quarter["Third"] = 3] = "Third";
    Quarter[Quarter["Fourth"] = 4] = "Fourth";
    Quarter[Quarter["OT1"] = 5] = "OT1";
    Quarter[Quarter["OT2"] = 6] = "OT2";
    Quarter[Quarter["OT3"] = 7] = "OT3";
})(Quarter || (Quarter = {}));
export var Direction;
(function (Direction) {
    Direction["Left"] = "left";
    Direction["LeftTackle"] = "left_tackle";
    Direction["LeftGuard"] = "left_guard";
    Direction["Middle"] = "middle";
    Direction["RightGuard"] = "right_guard";
    Direction["RightTackle"] = "right_tackle";
    Direction["Right"] = "right";
})(Direction || (Direction = {}));
export var PassDepth;
(function (PassDepth) {
    PassDepth["BehindLOS"] = "behind_los";
    PassDepth["Short"] = "short";
    PassDepth["Medium"] = "medium";
    PassDepth["Deep"] = "deep";
})(PassDepth || (PassDepth = {}));
export var PassLocation;
(function (PassLocation) {
    PassLocation["Left"] = "left";
    PassLocation["Middle"] = "middle";
    PassLocation["Right"] = "right";
})(PassLocation || (PassLocation = {}));
export var Formation;
(function (Formation) {
    Formation["Shotgun"] = "shotgun";
    Formation["UnderCenter"] = "under_center";
    Formation["Pistol"] = "pistol";
    Formation["Singleback"] = "singleback";
    Formation["IFormation"] = "i_formation";
    Formation["EmptyBackfield"] = "empty";
    Formation["Wildcat"] = "wildcat";
    Formation["Goal"] = "goal_line";
    Formation["Jumbo"] = "jumbo";
})(Formation || (Formation = {}));
export var CoverageScheme;
(function (CoverageScheme) {
    CoverageScheme["Cover0"] = "cover_0";
    CoverageScheme["Cover1"] = "cover_1";
    CoverageScheme["Cover2"] = "cover_2";
    CoverageScheme["Cover2Man"] = "cover_2_man";
    CoverageScheme["Cover3"] = "cover_3";
    CoverageScheme["Cover4"] = "cover_4";
    CoverageScheme["Cover6"] = "cover_6";
    CoverageScheme["ManToMan"] = "man";
    CoverageScheme["Zone"] = "zone";
    CoverageScheme["PreventDefense"] = "prevent";
})(CoverageScheme || (CoverageScheme = {}));
export var DriveResult;
(function (DriveResult) {
    DriveResult["Touchdown"] = "touchdown";
    DriveResult["FieldGoal"] = "field_goal";
    DriveResult["Punt"] = "punt";
    DriveResult["Turnover"] = "turnover";
    DriveResult["TurnoverOnDowns"] = "turnover_on_downs";
    DriveResult["EndOfHalf"] = "end_of_half";
    DriveResult["EndOfGame"] = "end_of_game";
    DriveResult["Safety"] = "safety";
    DriveResult["MissedFieldGoal"] = "missed_field_goal";
})(DriveResult || (DriveResult = {}));
//# sourceMappingURL=types.js.map