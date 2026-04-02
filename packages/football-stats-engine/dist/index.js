// ============================================================================
// FOOTBALL STATS ENGINE — PUBLIC API
// ============================================================================
//
// Usage:
//
//   import { FootballStatsEngine, PlayType, PassResult, ... } from "./football-stats-engine";
//
//   const engine = new FootballStatsEngine({
//     trackAdvancedMetrics: true,
//     trackSituationalSplits: true,
//   });
//
//   engine.setTeams(
//     { id: "KC", name: "Kansas City Chiefs", abbreviation: "KC" },
//     { id: "SF", name: "San Francisco 49ers", abbreviation: "SF" }
//   );
//
//   engine.registerPlayers([
//     { id: "mahomes", name: "Patrick Mahomes" },
//     { id: "kelce", name: "Travis Kelce" },
//   ]);
//
//   // Feed plays one at a time (or in bulk via processPlays)
//   engine.processPlay({
//     type: PlayType.Pass,
//     passer: "mahomes",
//     target: "kelce",
//     receiver: "kelce",
//     result: PassResult.Complete,
//     yardsGained: 15,
//     airYards: 8,
//     yardsAfterCatch: 7,
//     isTouchdown: false,
//     context: {
//       gameId: "game-001",
//       quarter: Quarter.First,
//       gameClock: "12:30",
//       down: Down.Second,
//       distance: 10,
//       yardLine: 35,
//       possessionTeam: "KC",
//       homeTeam: "KC",
//       awayTeam: "SF",
//       homeScore: 0,
//       awayScore: 0,
//     },
//   });
//
//   // Get stats at any point
//   const summary = engine.getGameSummary();
//   console.log(summary.passing["mahomes"].completions);
//   console.log(summary.homeTeamStats.totalYards);
//
// ============================================================================
// Main engine
export { FootballStatsEngine } from "./engine";
// All types
export { 
// Enums
PlayType, PassResult, RushResult, SpecialTeamsResult, KickResult, PenaltyEnforcement, Down, Quarter, Direction, PassDepth, PassLocation, Formation, CoverageScheme, DriveResult, } from "./types";
// Individual calculators (for advanced/custom usage)
export { PassingCalculator } from "./calculators/passing";
export { RushingCalculator } from "./calculators/rushing";
export { ReceivingCalculator } from "./calculators/receiving";
export { DefensiveCalculator } from "./calculators/defense";
export { SpecialTeamsCalculator } from "./calculators/special-teams";
export { TeamCalculator } from "./calculators/team";
// Penalty system
export { PenaltyCalculator } from "./calculators/penalty";
export { PENALTY_CATALOG, lookupPenalty, getPenaltyYards, isAutoFirstDown, getAllPenaltyCodes, getPenaltiesByCategory, EnforcementSpot, PenaltyCategory, } from "./calculators/penalty-catalog";
// Game state manager
export { GameStateManager, GamePhase, ClockState, StoppageReason, CoinTossChoice, PossessionReason, GameEventType, getRuleSet, NFL_RULES, COLLEGE_RULES, HIGH_SCHOOL_RULES, } from "./game-state";
// Utilities
export { calculatePasserRating, calculateAdjustedYPA, clockToSeconds, secondsToClock, timeElapsed, round, safeDivide, isPassPlay, isRushPlay, isSpecialTeamsPlay, isRedZone, isThirdDown, isFourthDown, isGoalToGo, isFirstDown, directionBucket, } from "./utils";
//# sourceMappingURL=index.js.map