# Graph Report - dragonstats  (2026-09-05)

## Corpus Check
- 130 files · ~242,814 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1285 nodes · 2886 edges · 70 communities (51 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `32741ba6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- statsService.ts
- gameService.ts
- Database Schema
- offlineDb.ts
- design_system.py
- PostGameReview.tsx
- package.json
- ScheduleScreen.tsx
- PlayLog.tsx
- GameScreen.tsx
- gameFlow.ts
- PlayerScreen.tsx
- ui-ux-pro-max
- generate-favicon.cjs
- SettingsScreen.tsx
- GameSummaryScreen.tsx
- PlayEntryModal.tsx
- pendingPlayerService.ts
- App.tsx
- PregameSetupSheet.tsx
- gameReport.ts
- useProgramContext.tsx
- types.ts
- compilerOptions
- GameReportScreen.tsx
- 20250101000000_initial_schema.sql
- schema.sql
- Design System Master File
- FlowPreview.tsx
- advanceSituationAfterPlay
- penaltyEnforcement.ts
- QuickActions.tsx
- football-stats-engine/package.json
- mergeQueuedPlays.test.ts
- DashboardScreen.tsx
- 20260901000000_program_membership_rls.sql
- SeasonStatsScreen.tsx
- UiPreview.tsx
- playEntrySeed.ts
- FastPlayEntry.tsx
- Sending auth email through Resend
- Dragon Stats
- looseTags.test.ts
- penaltyStep.test.ts
- badSnap.test.ts
- Auth email templates
- vite-env.d.ts
- AGENTS.md
- liveGameSession.ts
- supabase.ts
- useProgramContext
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
2. `react` - 39 edges
3. `isOfflineSupported()` - 34 edges
4. `getDb()` - 29 edges
5. `useProgramContext()` - 27 edges
6. `supabase` - 27 edges
7. `PostGameReview()` - 27 edges
8. `lucide-react` - 26 edges
9. `PlayEntryModal()` - 26 edges
10. `advanceSituationAfterPlay()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `PlayRecord`  [EXTRACTED]
  src/components/game/PlayLog.tsx → src/components/game/types.ts
- `Props` --references--> `PlayTypeDef`  [EXTRACTED]
  src/components/game/QuickActions.tsx → src/components/game/types.ts
- `Props` --references--> `GameState`  [EXTRACTED]
  src/components/game/Scoreboard.tsx → src/components/game/types.ts
- `PostGameReview()` --indirect_call--> `isRosterTag()`  [INFERRED]
  src/screens/PostGameReview.tsx → src/components/game/types.ts
- `AdvanceablePlay` --references--> `PenaltySide`  [EXTRACTED]
  src/services/gameFlow.ts → src/components/game/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Database Entities** — database_schema, programs_table, seasons_table, players_table, season_rosters_table, opponents_table, games_table, plays_table, play_players_table, game_stats_cache_table [EXTRACTED 1.00]
- **Technology Stack** — dragon_stats_app, react_19, typescript, vite, tailwind_css, supabase, football_stats_engine, pwa [EXTRACTED 1.00]

## Communities (70 total, 11 thin omitted)

### Community 0 - "statsService.ts"
Cohesion: 0.05
Nodes (60): getPenaltyEngineCode(), grantsAutoFirstDown(), TEAM_PLAYER_ID, BAD_SNAP, summarise(), AFTERMATH, classify(), DriveResult (+52 more)

### Community 1 - "gameService.ts"
Cohesion: 0.11
Nodes (28): RFC-4122, asRecord(), calcTimeOfPossession(), clockToSecs(), CurrentGameStateUpdate, deletePlay(), fmtSecs(), genUuid() (+20 more)

### Community 2 - "Database Schema"
Cohesion: 0.10
Nodes (23): Database Schema, Dragon Stats, football-stats-engine, game_stats_cache table, games table, High School Football Play-by-Play Tracking App, NFHS Rules, opponents table (+15 more)

### Community 3 - "offlineDb.ts"
Cohesion: 0.08
Nodes (66): SyncCoordinator(), Props, SyncBadge(), PlayInsert, PlayRow, PlayWithPlayers, cachedRead, cachePlay() (+58 more)

### Community 4 - "design_system.py"
Cohesion: 0.05
Nodes (45): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+37 more)

### Community 5 - "PostGameReview.tsx"
Cohesion: 0.06
Nodes (49): ClockInput(), formatClockValue(), parseClockDigits(), Props, TimeoutEdit, TimeoutEditModal(), findPlayTypeDef(), yardLabel() (+41 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (41): dependencies, football-stats-engine, idb, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js (+33 more)

### Community 7 - "ScheduleScreen.tsx"
Cohesion: 0.10
Nodes (38): ScheduleScreen, DangerZone(), ImportModal(), formatKickoff(), GameRow, OpponentRosterSection(), ScheduleScreen(), Site (+30 more)

### Community 8 - "PlayLog.tsx"
Cohesion: 0.19
Nodes (12): FILTERS, KICKING_TYPES, LogFilter, ourTacklers(), PLAY_ICON_COLORS, PLAY_ICONS, PlayLog(), Props (+4 more)

### Community 9 - "GameScreen.tsx"
Cohesion: 0.11
Nodes (33): isRosterTag(), makePendingId(), makeTeamTag(), normalizeOppTagId(), pendingDisplayName(), pendingJerseyFromId(), readKeepAwake(), useWakeLock() (+25 more)

### Community 10 - "gameFlow.ts"
Cohesion: 0.20
Nodes (18): AdvanceablePlay, asRecord(), buildPregameGameUpdate(), DEFAULT_PREGAME, GameRulesCarrier, getChartingPrefs(), getOffenseDriveDirection(), getOurDriveDirectionForQuarter() (+10 more)

### Community 11 - "PlayerScreen.tsx"
Cohesion: 0.06
Nodes (42): RFC-4180, football-stats-engine, DrivesList(), formatFieldPosition(), Props, RESULT_LABEL, DefenseTab(), LiveStatsPanel() (+34 more)

### Community 12 - "ui-ux-pro-max"
Cohesion: 0.07
Nodes (29): Accessibility, Available Domains, Available Stacks, Common Rules for Professional UI, Example Workflow, How to Use This Workflow, Icons & Visual Elements, Interaction (+21 more)

### Community 13 - "generate-favicon.cjs"
Cohesion: 0.10
Nodes (28): AXIS, AXIS_FAR, AXIS_ORIGIN, BAR_STOPS, BARS, BG_FOCAL, BG_STOPS, clamp01() (+20 more)

### Community 14 - "SettingsScreen.tsx"
Cohesion: 0.15
Nodes (15): SettingsScreen, Props, SettingsScreen(), buildSeasonName(), Coach, coachService, CreateSeasonInput, formatLevel() (+7 more)

### Community 15 - "GameSummaryScreen.tsx"
Cohesion: 0.17
Nodes (11): lucide-react, GameSummaryScreen, GameHomeLink(), computeFormationStats(), fmt(), FormationBreakdown, GameInfo, GameSummaryScreen() (+3 more)

### Community 16 - "PlayEntryModal.tsx"
Cohesion: 0.10
Nodes (23): FAST_PLAY_IDS, toggleFastTackler(), DIGITS, Keypad(), Props, defaultBlockedKickType(), DEFENSIVE_ROLES, FieldTeam (+15 more)

### Community 17 - "pendingPlayerService.ts"
Cohesion: 0.24
Nodes (15): MergeCandidate, Mode, PendingCard(), playerLabel(), Props, discardPending(), loadSeasonPendingPlays(), mergePendingIntoPlayer() (+7 more)

### Community 18 - "App.tsx"
Cohesion: 0.14
Nodes (15): react, react-router-dom, @supabase/supabase-js, App(), GameScreen, PlayerScreen, PostGameReview, ProtectedRoute() (+7 more)

### Community 19 - "PregameSetupSheet.tsx"
Cohesion: 0.19
Nodes (14): PregameSetupSheet(), Props, teamLabel(), ChartingPrefs, createDefaultPregameConfig(), createSecondHalfSituation(), DEFAULT_CHARTING, deriveOpeningKickoffReceiver() (+6 more)

### Community 20 - "gameReport.ts"
Cohesion: 0.06
Nodes (47): BoxScoreScreen, Props, SIZES, TeamCrest(), BoxScoreScreen(), fmt(), GameInfo, ourLines() (+39 more)

### Community 21 - "useProgramContext.tsx"
Cohesion: 0.25
Nodes (10): Props, Branding, DEFAULT_BRANDING, deriveBranding(), keepIfEqual(), ProgramContext, ProgramContextValue, ProgramProvider() (+2 more)

### Community 22 - "types.ts"
Cohesion: 0.09
Nodes (24): BLOCKED_KICK_TYPES, buildDescription(), getPenaltyDefaultSide(), isPenaltyOnOffense(), isPendingId(), isSpotFoul(), NFHS_QUARTER_SECS, OFFENSE_PENALTIES (+16 more)

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
Cohesion: 0.22
Nodes (15): Props, PlaySubmitData, Props, isKickoffDue(), GameState, PlayTypeDef, RosterPlayer, TaggedPlayer (+7 more)

### Community 29 - "advanceSituationAfterPlay"
Cohesion: 0.20
Nodes (15): maxTimeoutsForQuarter(), timeoutHalfForQuarter(), advanceSituationAfterPlay(), clampBallOn(), createInitialSituation(), createKickoffSituation(), flipFieldPosition(), getRecordedNextSituation() (+7 more)

### Community 30 - "penaltyEnforcement.ts"
Cohesion: 0.19
Nodes (12): PenaltySide, basicSpot(), clamp(), Enforcement, EnforcementInput, enforcePenalty(), isBehind(), markOff() (+4 more)

### Community 31 - "QuickActions.tsx"
Cohesion: 0.18
Nodes (13): CATEGORY_ACCENT, CATEGORY_LABELS, FAST_PATH_COLS, fastPathIds(), hueStyle(), ordinalDown(), PHASE_TABS, PhaseFilter (+5 more)

### Community 32 - "football-stats-engine/package.json"
Cohesion: 0.12
Nodes (15): _comment, description, devDependencies, tsx, typescript, files, typescript, keywords (+7 more)

### Community 34 - "DashboardScreen.tsx"
Cohesion: 0.11
Nodes (19): DashboardScreen, RosterScreen, PendingPlayersSheet(), CompletedGame, DashboardScreen(), GAME_VIEWS, LiveGame, QuickStats (+11 more)

### Community 35 - "20260901000000_program_membership_rls.sql"
Cohesion: 0.15
Nodes (17): public.enrol_program_owner, program_members, programs_enrol_owner, public.is_game_member(), public.is_opponent_member(), public.is_play_member(), public.is_player_member(), public.is_program_member() (+9 more)

### Community 36 - "SeasonStatsScreen.tsx"
Cohesion: 0.17
Nodes (11): SeasonStatsScreen, AggDefense, AggKicking, AggPassing, AggPunting, AggReceiving, AggReturns, AggRushing (+3 more)

### Community 37 - "UiPreview.tsx"
Cohesion: 0.08
Nodes (26): endZoneLabel(), FieldVisualizer(), FIVE_YARD_LINES, fromWidgetPercent(), Props, toWidgetPercent(), YARD_NUMBERS, downLabel() (+18 more)

### Community 38 - "playEntrySeed.ts"
Cohesion: 0.21
Nodes (11): buildEditSeed(), EditSeed, FieldTeam, FUMBLE_MODIFIER_TYPES, KickOutcome, num(), PenaltyEnforcement, TACKLE_ROLES (+3 more)

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

### Community 53 - "liveGameSession.ts"
Cohesion: 0.06
Nodes (52): vitest, PreviousPlay, Situation, previous, situation, PENALTY_RULES, penaltyDefaultYards(), PlayRecord (+44 more)

### Community 56 - "supabase.ts"
Cohesion: 0.31
Nodes (7): expiryLabel(), InviteCode, Props, TeamAccess(), isAuthRequest(), supabase, timeoutFetch()

### Community 57 - "useProgramContext"
Cohesion: 0.32
Nodes (5): AppRoutes(), GameSettingsScreen, useProgramContext(), GameSettingsScreen(), getGameConfig()

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
- **341 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+336 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 510 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `ScheduleScreen.tsx`, `PlayLog.tsx`, `GameScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `GameSummaryScreen.tsx`, `PlayEntryModal.tsx`, `pendingPlayerService.ts`, `PregameSetupSheet.tsx`, `gameReport.ts`, `useProgramContext.tsx`, `GameReportScreen.tsx`, `FlowPreview.tsx`, `QuickActions.tsx`, `DashboardScreen.tsx`, `SeasonStatsScreen.tsx`, `UiPreview.tsx`, `FastPlayEntry.tsx`, `supabase.ts`, `useProgramContext`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `GameSummaryScreen.tsx` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `ScheduleScreen.tsx`, `PlayLog.tsx`, `GameScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `PlayEntryModal.tsx`, `pendingPlayerService.ts`, `PregameSetupSheet.tsx`, `gameReport.ts`, `GameReportScreen.tsx`, `DashboardScreen.tsx`, `SeasonStatsScreen.tsx`, `UiPreview.tsx`, `FastPlayEntry.tsx`, `supabase.ts`, `useProgramContext`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `football-stats-engine` connect `PlayerScreen.tsx` to `statsService.ts`, `SeasonStatsScreen.tsx`, `package.json`, `GameSummaryScreen.tsx`, `gameReport.ts`, `liveGameSession.ts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameScreen()` (e.g. with `isRosterTag()` and `readKeepAwake()`) actually correct?**
  _`GameScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _341 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `statsService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05017543859649123 - nodes in this community are weakly interconnected._
- **Should `gameService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10591133004926108 - nodes in this community are weakly interconnected._