# Graph Report - dragonstats  (2026-09-05)

## Corpus Check
- 129 files · ~240,820 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1272 nodes · 2849 edges · 75 communities (57 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `38ccf3e8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- playTransformer.ts
- liveGameSession.ts
- Database Schema
- gameService.ts
- design_system.py
- PostGameReview.tsx
- package.json
- dangerZone.ts
- PlayLog.tsx
- GameScreen.tsx
- splitTackleCredit
- GameSummaryScreen.tsx
- ui-ux-pro-max
- generate-favicon.cjs
- SettingsScreen.tsx
- rosterImport.ts
- PlayEntryModal.tsx
- RosterScreen.tsx
- App.tsx
- badSnap.spec.ts
- gameReport.ts
- useProgramContext.tsx
- types.ts
- compilerOptions
- GameReportScreen.tsx
- 20250101000000_initial_schema.sql
- schema.sql
- Design System Master File
- FlowPreview.tsx
- PlayRecord
- penaltyEnforcement.ts
- BoxScoreScreen.tsx
- football-stats-engine/package.json
- PlayEntryModal
- DashboardScreen.tsx
- 20260901000000_program_membership_rls.sql
- SeasonStatsScreen.tsx
- QuickActions.tsx
- playEntrySeed.ts
- scoringLedger.ts
- FastPlayEntry.tsx
- Sending auth email through Resend
- Dragon Stats
- looseTags.test.ts
- penaltyStep.test.ts
- badSnap.test.ts
- Auth email templates
- vite-env.d.ts
- AGENTS.md
- driveResults.ts
- programService.ts
- statsService.ts
- liveVsPostgame.spec.ts
- ScheduleScreen.tsx
- useProgramContext
- resolveKickSpots
- 20260901010000_program_invite_codes.sql
- play_charting
- play_charting
- migration_001_fsa_merge.sql
- play_players
- season_rosters
- games
- players
- plays
- programs
- programs

## God Nodes (most connected - your core abstractions)
1. `GameScreen()` - 65 edges
2. `react` - 38 edges
3. `isOfflineSupported()` - 34 edges
4. `getDb()` - 29 edges
5. `useProgramContext()` - 27 edges
6. `supabase` - 27 edges
7. `PostGameReview()` - 27 edges
8. `lucide-react` - 26 edges
9. `PlayEntryModal()` - 25 edges
10. `advanceSituationAfterPlay()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `SyncCoordinator()` --calls--> `setupAutoDrain()`  [EXTRACTED]
  src/App.tsx → src/services/syncWorker.ts
- `Props` --references--> `PlayRecord`  [EXTRACTED]
  src/components/game/PlayLog.tsx → src/components/game/types.ts
- `PostGameReview()` --indirect_call--> `isRosterTag()`  [INFERRED]
  src/screens/PostGameReview.tsx → src/components/game/types.ts
- `summarise()` --calls--> `transformPlays()`  [EXTRACTED]
  src/services/badSnap.spec.ts → src/services/playTransformer.ts
- `advanceLiveQuarterState()` --calls--> `moveToQuarter()`  [EXTRACTED]
  src/services/liveGameSession.ts → src/services/gameFlow.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Database Entities** — database_schema, programs_table, seasons_table, players_table, season_rosters_table, opponents_table, games_table, plays_table, play_players_table, game_stats_cache_table [EXTRACTED 1.00]
- **Technology Stack** — dragon_stats_app, react_19, typescript, vite, tailwind_css, supabase, football_stats_engine, pwa [EXTRACTED 1.00]

## Communities (75 total, 10 thin omitted)

### Community 0 - "playTransformer.ts"
Cohesion: 0.21
Nodes (20): getPenaltyEngineCode(), grantsAutoFirstDown(), postgameSummary(), allTagsForRole(), buildContext(), buildFumble(), buildPenalties(), clampDown() (+12 more)

### Community 1 - "liveGameSession.ts"
Cohesion: 0.21
Nodes (18): advanceLiveQuarterState(), buildFumble(), buildPenalties(), buildPlayContext(), createEngine(), firstTaggedPlayer(), genericPlayerId(), getCustomRules() (+10 more)

### Community 2 - "Database Schema"
Cohesion: 0.10
Nodes (23): Database Schema, Dragon Stats, football-stats-engine, game_stats_cache table, games table, High School Football Play-by-Play Tracking App, NFHS Rules, opponents table (+15 more)

### Community 3 - "gameService.ts"
Cohesion: 0.05
Nodes (89): RFC-4122, Props, SyncBadge(), calcTimeOfPossession(), clockToSeconds(), clockToSecs(), CurrentGameStateUpdate, deletePlay() (+81 more)

### Community 4 - "design_system.py"
Cohesion: 0.05
Nodes (45): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+37 more)

### Community 5 - "PostGameReview.tsx"
Cohesion: 0.07
Nodes (49): lucide-react, react-router-dom, ClockInput(), formatClockValue(), parseClockDigits(), Props, GameHomeLink(), TimeoutEdit (+41 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (41): dependencies, football-stats-engine, idb, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js (+33 more)

### Community 7 - "dangerZone.ts"
Cohesion: 0.33
Nodes (15): DangerZone(), countSeasonData(), deleteGame(), deleteSeason(), deleteUnrosteredPlayers(), fail(), getSeasonGameIds(), ok() (+7 more)

### Community 8 - "PlayLog.tsx"
Cohesion: 0.19
Nodes (12): FILTERS, KICKING_TYPES, LogFilter, ourTacklers(), PLAY_ICON_COLORS, PLAY_ICONS, PlayLog(), Props (+4 more)

### Community 9 - "GameScreen.tsx"
Cohesion: 0.05
Nodes (93): PregameSetupSheet(), Props, teamLabel(), downLabel(), Scoreboard(), isKickoffDue(), fmtClock(), isPenaltyOnOffense() (+85 more)

### Community 10 - "splitTackleCredit"
Cohesion: 0.28
Nodes (5): CreditTag, splitTackleCredit(), TackleCredit, splitTackles(), Tag

### Community 11 - "GameSummaryScreen.tsx"
Cohesion: 0.05
Nodes (48): RFC-4180, football-stats-engine, DrivesList(), formatFieldPosition(), Props, RESULT_LABEL, DefenseTab(), LiveStatsPanel() (+40 more)

### Community 12 - "ui-ux-pro-max"
Cohesion: 0.07
Nodes (29): Accessibility, Available Domains, Available Stacks, Common Rules for Professional UI, Example Workflow, How to Use This Workflow, Icons & Visual Elements, Interaction (+21 more)

### Community 13 - "generate-favicon.cjs"
Cohesion: 0.10
Nodes (28): AXIS, AXIS_FAR, AXIS_ORIGIN, BAR_STOPS, BARS, BG_FOCAL, BG_STOPS, clamp01() (+20 more)

### Community 14 - "SettingsScreen.tsx"
Cohesion: 0.12
Nodes (19): SettingsScreen, expiryLabel(), InviteCode, Props, TeamAccess(), Props, SettingsScreen(), buildSeasonName() (+11 more)

### Community 15 - "rosterImport.ts"
Cohesion: 0.29
Nodes (13): ImportModal(), OpponentRosterSection(), GRADE_OFFSETS, gradeToClassification(), isHeightValue(), isWeightValue(), normalizeGradeKey(), parseCSVRoster() (+5 more)

### Community 16 - "PlayEntryModal.tsx"
Cohesion: 0.12
Nodes (17): FAST_PLAY_IDS, toggleFastTackler(), DIGITS, Keypad(), Props, DEFENSIVE_ROLES, FieldTeam, KICK_OUTCOMES (+9 more)

### Community 17 - "RosterScreen.tsx"
Cohesion: 0.14
Nodes (22): RosterScreen, MergeCandidate, Mode, PendingCard(), PendingPlayersSheet(), playerLabel(), Props, CLASSIFICATIONS (+14 more)

### Community 18 - "App.tsx"
Cohesion: 0.12
Nodes (17): react, @supabase/supabase-js, App(), GameScreen, GameSummaryScreen, PlayerScreen, PostGameReview, ProtectedRoute() (+9 more)

### Community 19 - "badSnap.spec.ts"
Cohesion: 0.33
Nodes (3): TEAM_PLAYER_ID, BAD_SNAP, summarise()

### Community 20 - "gameReport.ts"
Cohesion: 0.14
Nodes (22): avg(), buildGameReport(), BuildReportInput, conversionText(), dash(), DefensiveRow, KickoffRow, labelFor() (+14 more)

### Community 21 - "useProgramContext.tsx"
Cohesion: 0.22
Nodes (12): Props, Branding, DEFAULT_BRANDING, deriveBranding(), keepIfEqual(), ProgramContext, ProgramContextValue, ProgramProvider() (+4 more)

### Community 22 - "types.ts"
Cohesion: 0.11
Nodes (16): BLOCKED_KICK_TYPES, buildDescription(), isPendingId(), isSpotFoul(), NFHS_QUARTER_SECS, OFFENSE_PENALTIES, PENALTIES, PENALTY_DEFAULT_YARDS (+8 more)

### Community 23 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 24 - "GameReportScreen.tsx"
Cohesion: 0.14
Nodes (12): GameReportScreen, Col, Crest(), formatKickoff(), GameInfo, GameReportScreen(), n(), Page() (+4 more)

### Community 25 - "20250101000000_initial_schema.sql"
Cohesion: 0.21
Nodes (18): coaches, game_schedule, game_stats_cache, games, games_updated_at, opponent_players, opponents, play_players (+10 more)

### Community 26 - "schema.sql"
Cohesion: 0.21
Nodes (18): coaches, game_schedule, game_stats_cache, games, games_updated_at, opponent_players, opponents, play_players (+10 more)

### Community 27 - "Design System Master File"
Cohesion: 0.12
Nodes (16): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Color Palette, Component Specs, Design System Master File, Global Rules (+8 more)

### Community 28 - "FlowPreview.tsx"
Cohesion: 0.19
Nodes (16): Props, PlaySubmitData, Props, Props, Props, GameState, OpponentPlayerRef, PlayTypeDef (+8 more)

### Community 29 - "PlayRecord"
Cohesion: 0.67
Nodes (4): PlayRecord, PendingClockCapture, LiveSituation, LiveSessionPlayResult

### Community 30 - "penaltyEnforcement.ts"
Cohesion: 0.20
Nodes (11): basicSpot(), clamp(), Enforcement, EnforcementInput, enforcePenalty(), isBehind(), markOff(), PlayKind (+3 more)

### Community 31 - "BoxScoreScreen.tsx"
Cohesion: 0.14
Nodes (14): BoxScoreScreen, Props, SIZES, TeamCrest(), BoxScoreScreen(), fmt(), GameInfo, ourLines() (+6 more)

### Community 32 - "football-stats-engine/package.json"
Cohesion: 0.12
Nodes (15): _comment, description, devDependencies, tsx, typescript, files, typescript, keywords (+7 more)

### Community 33 - "PlayEntryModal"
Cohesion: 0.20
Nodes (12): defaultBlockedKickType(), ordinalDown(), otherSide(), PlayEntryModal(), roleUsesOpponentRoster(), teamTag(), getPenaltyDefaultSide(), flagSideDefault() (+4 more)

### Community 34 - "DashboardScreen.tsx"
Cohesion: 0.20
Nodes (12): DashboardScreen, CompletedGame, DashboardScreen(), GAME_VIEWS, LiveGame, QuickStats, STATS_CHIP, TabBar() (+4 more)

### Community 35 - "20260901000000_program_membership_rls.sql"
Cohesion: 0.15
Nodes (17): public.enrol_program_owner, program_members, programs_enrol_owner, public.is_game_member(), public.is_opponent_member(), public.is_play_member(), public.is_player_member(), public.is_program_member() (+9 more)

### Community 36 - "SeasonStatsScreen.tsx"
Cohesion: 0.16
Nodes (12): SeasonStatsScreen, AggDefense, AggKicking, AggPassing, AggPunting, AggReceiving, AggReturns, AggRushing (+4 more)

### Community 37 - "QuickActions.tsx"
Cohesion: 0.09
Nodes (24): endZoneLabel(), FieldVisualizer(), FIVE_YARD_LINES, fromWidgetPercent(), Props, toWidgetPercent(), YARD_NUMBERS, CATEGORY_ACCENT (+16 more)

### Community 38 - "playEntrySeed.ts"
Cohesion: 0.18
Nodes (13): buildEditSeed(), EditSeed, FieldTeam, FUMBLE_MODIFIER_TYPES, KickOutcome, num(), PenaltyEnforcement, TACKLE_ROLES (+5 more)

### Community 39 - "scoringLedger.ts"
Cohesion: 0.22
Nodes (11): applyScoreDelta(), isReturnTouchdown(), other(), ScorablePlay, Score, scoreByQuarter(), ScoringEvent, scoringEvents() (+3 more)

### Community 40 - "FastPlayEntry.tsx"
Cohesion: 0.25
Nodes (9): FastPlayEntry(), labels, name(), DEFENSIVE_FORMATIONS, OFFENSIVE_FORMATIONS, clampSpot(), Props, yardNumber() (+1 more)

### Community 41 - "Sending auth email through Resend"
Cohesion: 0.29
Nodes (6): 1. Verify the domain in Resend, 2. Create an API key, 3. Point Supabase at it, 4. Raise the rate limit, 5. Test before you need it, Sending auth email through Resend

### Community 42 - "Dragon Stats"
Cohesion: 0.33
Nodes (5): Architecture notes that aren't obvious, Conventions, Dragon Stats, Gotchas — these have each cost real time, Verify loop

### Community 43 - "looseTags.test.ts"
Cohesion: 0.33
Nodes (3): Join, Loose, Play

### Community 44 - "penaltyStep.test.ts"
Cohesion: 0.47
Nodes (4): assertLandsOnPenalty(), buildSteps(), Step, targetIndex()

### Community 46 - "Auth email templates"
Cohesion: 0.40
Nodes (4): Auth email templates, Notes, The from address is a separate problem, Where they go

### Community 52 - "driveResults.ts"
Cohesion: 0.18
Nodes (13): AFTERMATH, classify(), DriveResult, DriveResultPlay, DriveResultValue, LocalDriveResult, possessionRuns(), PUNT_TYPES (+5 more)

### Community 53 - "programService.ts"
Cohesion: 0.11
Nodes (18): vitest, PreviousPlay, Situation, previous, situation, PENALTY_RULES, penaltyDefaultYards(), before (+10 more)

### Community 54 - "statsService.ts"
Cohesion: 0.22
Nodes (13): calcDefenseStats(), collectOpponentPlayerIds(), TransformContext, collectPlaceholderPlayers(), computeGameStatsBundle(), GameRecord, initDefStats(), loadGame() (+5 more)

### Community 55 - "liveVsPostgame.spec.ts"
Cohesion: 0.14
Nodes (10): DECLINED_APP, DECLINED_DB, livesummary(), PUNT_APP, PUNT_DB, SHARED_TACKLE_APP, SHARED_TACKLE_DB, Tag (+2 more)

### Community 56 - "ScheduleScreen.tsx"
Cohesion: 0.16
Nodes (13): ScheduleScreen, isAuthRequest(), supabase, timeoutFetch(), formatKickoff(), GameRow, ScheduleScreen(), Site (+5 more)

### Community 57 - "useProgramContext"
Cohesion: 0.32
Nodes (5): AppRoutes(), GameSettingsScreen, useProgramContext(), GameSettingsScreen(), getGameConfig()

### Community 62 - "resolveKickSpots"
Cohesion: 0.33
Nodes (7): isInsideTwenty(), kickInfoFromDescription(), KickSpots, netKickYards(), num(), resolveKickSpots(), supplementPuntsInside20()

### Community 64 - "20260901010000_program_invite_codes.sql"
Cohesion: 0.29
Nodes (3): program_invite_codes, auth.users, programs

### Community 65 - "play_charting"
Cohesion: 0.33
Nodes (5): play_charting, play_charting_updated_at, games, plays, update_updated_at

### Community 66 - "play_charting"
Cohesion: 0.33
Nodes (5): play_charting, play_charting_updated_at, games, plays, update_updated_at

### Community 67 - "migration_001_fsa_merge.sql"
Cohesion: 0.40
Nodes (4): coaches, opponent_players, opponents, seasons

## Knowledge Gaps
- **336 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+331 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 502 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `gameService.ts`, `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `PlayLog.tsx`, `GameScreen.tsx`, `GameSummaryScreen.tsx`, `SettingsScreen.tsx`, `PlayEntryModal.tsx`, `RosterScreen.tsx`, `useProgramContext.tsx`, `GameReportScreen.tsx`, `FlowPreview.tsx`, `BoxScoreScreen.tsx`, `DashboardScreen.tsx`, `SeasonStatsScreen.tsx`, `QuickActions.tsx`, `FastPlayEntry.tsx`, `ScheduleScreen.tsx`, `useProgramContext`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `PostGameReview.tsx` to `DashboardScreen.tsx`, `gameService.ts`, `SeasonStatsScreen.tsx`, `QuickActions.tsx`, `package.json`, `dangerZone.ts`, `FastPlayEntry.tsx`, `PlayLog.tsx`, `GameScreen.tsx`, `GameSummaryScreen.tsx`, `SettingsScreen.tsx`, `PlayEntryModal.tsx`, `RosterScreen.tsx`, `GameReportScreen.tsx`, `useProgramContext`, `ScheduleScreen.tsx`, `BoxScoreScreen.tsx`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `football-stats-engine` connect `GameSummaryScreen.tsx` to `playTransformer.ts`, `liveGameSession.ts`, `SeasonStatsScreen.tsx`, `package.json`, `badSnap.spec.ts`, `driveResults.ts`, `gameReport.ts`, `statsService.ts`, `liveVsPostgame.spec.ts`, `BoxScoreScreen.tsx`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameScreen()` (e.g. with `isRosterTag()` and `readKeepAwake()`) actually correct?**
  _`GameScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _336 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.09881422924901186 - nodes in this community are weakly interconnected._
- **Should `gameService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051111111111111114 - nodes in this community are weakly interconnected._