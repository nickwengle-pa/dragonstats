# Graph Report - dragonstats  (2026-09-19)

## Corpus Check
- 179 files · ~291,575 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 39 file(s) not represented in the graph (top: .csv 24, .css 6, (none) 5)

## Summary
- 1545 nodes · 3656 edges · 95 communities (76 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aa6f7e66`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- playTransformer.ts
- liveGameSession.ts
- Database Schema
- offlineDb.ts
- DesignSystemGenerator
- PostGameReview.tsx
- package.json
- dangerZone.ts
- ref_node_assert
- GameScreen.tsx
- driveResults.ts
- PlayerScreen.tsx
- ui-ux-pro-max
- generate-favicon.cjs
- SettingsScreen.tsx
- GameSummaryScreen.tsx
- PlayEntryModal.tsx
- 20250101000000_initial_schema.sql
- App.tsx
- PregameSetupSheet.tsx
- gameReport.ts
- useProgramContext.tsx
- types.ts
- compilerOptions
- GameReportScreen.tsx
- BroadcastIcons.tsx
- schema.sql
- Design System Master File
- gameService.ts
- 20260901000000_program_membership_rls.sql
- FlowPreview.tsx
- statsService.ts
- football-stats-engine/package.json
- liveVsPostgame.spec.ts
- RosterScreen.tsx
- core.py
- SeasonStatsScreen.tsx
- QuickActions.tsx
- playEntrySeed.ts
- BoxScoreScreen.tsx
- react
- Sending auth email through Resend
- UiPreview.tsx
- quarterChange.spec.ts
- design_system.py
- play_charting
- Auth email templates
- vite-env.d.ts
- AGENTS.md
- play_charting
- LiveStatsPanel.tsx
- programService.ts
- scoringLedger.ts
- ScheduleScreen.tsx
- 20260901010000_program_invite_codes.sql
- gameCompletion.ts
- resolveKickSpots
- lucide-react
- migration_001_fsa_merge.sql
- HomePreview.tsx
- vitest
- pendingPlayerService.ts
- BM25
- PullToRefresh.tsx
- HomeBroadcast.tsx
- search.py
- generate_design_system
- TabBar.tsx
- Home screen redesign mockup (2026-09-16)
- migration_002_active_season.sql
- public.require_signup_invite
- Invited staff only
- play_players
- season_rosters
- games
- players
- plays
- programs
- programs
- useTheme.ts
- csvExport.ts
- PlayRecord
- main.tsx
- SeasonReportScreen.tsx
- YardReel.tsx
- gameFlow.ts
- splitTackleCredit
- completeProgramJoin.spec.ts

## God Nodes (most connected - your core abstractions)
1. `GameScreen()` - 70 edges
2. `react` - 56 edges
3. `isOfflineSupported()` - 35 edges
4. `useProgramContext()` - 31 edges
5. `getDb()` - 30 edges
6. `lucide-react` - 28 edges
7. `PlayEntryModal()` - 28 edges
8. `supabase` - 28 edges
9. `advanceSituationAfterPlay()` - 28 edges
10. `vitest` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Architecture notes that aren't obvious` --references--> `isRosterTag()`  [INFERRED]
  CLAUDE.md → src/components/game/types.ts
- `Architecture notes that aren't obvious` --references--> `rebuildPlaySituations()`  [INFERRED]
  CLAUDE.md → src/services/gameFlow.ts
- `Architecture notes that aren't obvious` --references--> `replayLiveGame()`  [INFERRED]
  CLAUDE.md → src/services/liveGameSession.ts
- `Conventions` --references--> `roleUsesOpponentRoster()`  [INFERRED]
  CLAUDE.md → src/components/game/PlayEntryModal.tsx
- `Architecture notes that aren't obvious` --references--> `insertPlay()`  [INFERRED]
  CLAUDE.md → src/services/gameService.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Database Entities** — database_schema, programs_table, seasons_table, players_table, season_rosters_table, opponents_table, games_table, plays_table, play_players_table, game_stats_cache_table [EXTRACTED 1.00]
- **Technology Stack** — dragon_stats_app, react_19, typescript, vite, tailwind_css, supabase, football_stats_engine, pwa [EXTRACTED 1.00]

## Communities (95 total, 19 thin omitted)

### Community 0 - "playTransformer.ts"
Cohesion: 0.19
Nodes (21): getPenaltyEngineCode(), grantsAutoFirstDown(), buildPenalties(), allTagsForRole(), buildContext(), buildFumble(), buildPenalties(), clampDown() (+13 more)

### Community 1 - "liveGameSession.ts"
Cohesion: 0.20
Nodes (20): normalizeQuarter(), buildFumble(), buildPlayContext(), createEngine(), firstTaggedPlayer(), genericPlayerId(), getBeforeStateForPlay(), getCustomRules() (+12 more)

### Community 2 - "Database Schema"
Cohesion: 0.10
Nodes (23): Database Schema, Dragon Stats, football-stats-engine, game_stats_cache table, games table, High School Football Play-by-Play Tracking App, NFHS Rules, opponents table (+15 more)

### Community 3 - "offlineDb.ts"
Cohesion: 0.06
Nodes (76): Architecture notes that aren't obvious, Dragon Stats, Gotchas — these have each cost real time, Verify loop, SyncCoordinator(), Props, SyncBadge(), SyncDetails() (+68 more)

### Community 4 - "DesignSystemGenerator"
Cohesion: 0.16
Nodes (9): DesignSystemGenerator, Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation., Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Execute searches across multiple domains., Find matching reasoning rule for a category. (+1 more)

### Community 5 - "PostGameReview.tsx"
Cohesion: 0.07
Nodes (44): ClockInput(), formatClockValue(), parseClockDigits(), Props, TimeoutEdit, TimeoutEditModal(), findPlayTypeDef(), ChartCategoryFilter (+36 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (40): dependencies, football-stats-engine, idb, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js (+32 more)

### Community 7 - "dangerZone.ts"
Cohesion: 0.33
Nodes (15): DangerZone(), countSeasonData(), deleteGame(), deleteSeason(), deleteUnrosteredPlayers(), fail(), getSeasonGameIds(), ok() (+7 more)

### Community 8 - "ref_node_assert"
Cohesion: 0.06
Nodes (22): ref_node_assert, Tag, Join, Loose, Play, mergeQueuedPlays(), basicSpot(), clamp() (+14 more)

### Community 9 - "GameScreen.tsx"
Cohesion: 0.10
Nodes (41): isRosterTag(), makePendingId(), normalizeOppTagId(), pendingDisplayName(), readKeepAwake(), useWakeLock(), WakeLockSentinelLike, writeKeepAwake() (+33 more)

### Community 10 - "driveResults.ts"
Cohesion: 0.18
Nodes (14): AFTERMATH, classify(), DriveResult, DriveResultPlay, DriveResultValue, LocalDriveResult, possessionRuns(), PUNT_TYPES (+6 more)

### Community 11 - "PlayerScreen.tsx"
Cohesion: 0.19
Nodes (18): CareerRow, careerRowFromLines(), CareerSection(), Column, DefenseSection(), fmt(), fmtDate(), GameLog() (+10 more)

### Community 12 - "ui-ux-pro-max"
Cohesion: 0.07
Nodes (29): Accessibility, Available Domains, Available Stacks, Common Rules for Professional UI, Example Workflow, How to Use This Workflow, Icons & Visual Elements, Interaction (+21 more)

### Community 13 - "generate-favicon.cjs"
Cohesion: 0.09
Nodes (31): ref_fs, ref_path, ref_zlib, AXIS, AXIS_FAR, AXIS_ORIGIN, BAR_STOPS, BARS (+23 more)

### Community 14 - "SettingsScreen.tsx"
Cohesion: 0.10
Nodes (23): SettingsScreen, Props, ProgramContext, ProgramContextValue, PROGRAM, SCREENS, SEASON, Props (+15 more)

### Community 15 - "GameSummaryScreen.tsx"
Cohesion: 0.14
Nodes (12): football-stats-engine, GameSummaryScreen, DrivesList(), formatFieldPosition(), Props, RESULT_LABEL, computeFormationStats(), fmt() (+4 more)

### Community 16 - "PlayEntryModal.tsx"
Cohesion: 0.09
Nodes (29): Conventions, FAST_PLAY_IDS, toggleFastTackler(), DIGITS, Keypad(), Props, defaultBlockedKickType(), DEFENSIVE_ROLES (+21 more)

### Community 17 - "20250101000000_initial_schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 18 - "App.tsx"
Cohesion: 0.10
Nodes (21): react-router-dom, AppRoutes(), DashboardScreen, GameScreen, GameSettingsScreen, JoinTeamScreen, PlayerScreen, PostGameReview (+13 more)

### Community 19 - "PregameSetupSheet.tsx"
Cohesion: 0.15
Nodes (22): src_components_game_pregamesetup, PregameSetupSheet(), Props, Choice(), Layout, palette(), PregameSetupView(), Props (+14 more)

### Community 20 - "gameReport.ts"
Cohesion: 0.15
Nodes (20): avg(), buildGameReport(), conversionText(), dash(), DefensiveRow, KickoffRow, labelFor(), num() (+12 more)

### Community 21 - "useProgramContext.tsx"
Cohesion: 0.17
Nodes (21): @supabase/supabase-js, AuthState, Branding, DEFAULT_BRANDING, deriveBranding(), keepIfEqual(), ProgramProvider(), isAuthRequest() (+13 more)

### Community 22 - "types.ts"
Cohesion: 0.12
Nodes (17): BLOCKED_KICK_TYPES, buildDescription(), isSpotFoul(), NFHS_QUARTER_SECS, OFFENSE_PENALTIES, OpponentPlayerRef, PENALTIES, PENALTY_DEFAULT_YARDS (+9 more)

### Community 23 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 24 - "GameReportScreen.tsx"
Cohesion: 0.14
Nodes (12): GameReportScreen, Col, Crest(), formatKickoff(), GameInfo, GameReportScreen(), n(), Page() (+4 more)

### Community 25 - "BroadcastIcons.tsx"
Cohesion: 0.09
Nodes (20): ChevronIcon, ClockIcon, ExternalIcon, EyeIcon, FilmIcon, FlagIcon, GridIcon, IconProps (+12 more)

### Community 26 - "schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 27 - "Design System Master File"
Cohesion: 0.12
Nodes (16): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Color Palette, Component Specs, Design System Master File, Global Rules (+8 more)

### Community 28 - "gameService.ts"
Cohesion: 0.11
Nodes (24): RFC-4122, asRecord(), calcTimeOfPossession(), clockToSeconds(), clockToSecs(), CurrentGameStateUpdate, deriveGameState(), fmtSecs() (+16 more)

### Community 29 - "20260901000000_program_membership_rls.sql"
Cohesion: 0.15
Nodes (18): public.enrol_program_owner, idx_program_members_user, program_members, programs_enrol_owner, public.is_game_member(), public.is_opponent_member(), public.is_play_member(), public.is_player_member() (+10 more)

### Community 30 - "FlowPreview.tsx"
Cohesion: 0.24
Nodes (10): countPlayerUsage(), playerUsageKey(), playerUseCount(), roleGroup(), RosterPlayer, FlowPreview(), initial, opponents (+2 more)

### Community 31 - "statsService.ts"
Cohesion: 0.22
Nodes (15): calcDefenseStats(), loadGamePlays(), isInsideTwenty(), collectOpponentPlayerIds(), collectPlaceholderPlayers(), computeGameStats(), computeGameStatsBundle(), GameRecord (+7 more)

### Community 32 - "football-stats-engine/package.json"
Cohesion: 0.12
Nodes (15): _comment, description, devDependencies, tsx, typescript, files, typescript, keywords (+7 more)

### Community 33 - "liveVsPostgame.spec.ts"
Cohesion: 0.14
Nodes (10): DECLINED_APP, DECLINED_DB, livesummary(), PUNT_APP, PUNT_DB, SHARED_TACKLE_APP, SHARED_TACKLE_DB, Tag (+2 more)

### Community 34 - "RosterScreen.tsx"
Cohesion: 0.14
Nodes (21): RosterScreen, PlusIcon, UploadIcon, PendingPlayersSheet(), CLASSIFICATIONS, ImportModal(), POSITIONS, RosterPlayer (+13 more)

### Community 35 - "core.py"
Cohesion: 0.15
Nodes (16): collections, csv, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+8 more)

### Community 36 - "SeasonStatsScreen.tsx"
Cohesion: 0.11
Nodes (17): SeasonStatsScreen, BroadcastHeader(), Props, BackIcon, SheetIcon, src_screens_dashboardscreen_tabbar, src_screens_homebroadcast, AggDefense (+9 more)

### Community 37 - "QuickActions.tsx"
Cohesion: 0.13
Nodes (17): FAST_PATH_COLS, fastPathIds(), ordinalDown(), PHASE_TABS, PhaseFilter, Props, QuickActions(), downLabel() (+9 more)

### Community 38 - "playEntrySeed.ts"
Cohesion: 0.13
Nodes (14): buildEditSeed(), EditSeed, FieldTeam, FUMBLE_MODIFIER_TYPES, KickOutcome, num(), PenaltyEnforcement, TACKLE_ROLES (+6 more)

### Community 39 - "BoxScoreScreen.tsx"
Cohesion: 0.14
Nodes (14): BoxScoreScreen, Props, SIZES, TeamCrest(), BoxScoreScreen(), fmt(), GameInfo, ourLines() (+6 more)

### Community 40 - "react"
Cohesion: 0.19
Nodes (20): react, FastPlayEntry(), labels, Props, KneelEntry(), src_components_game_liveentry, PassDefenderPicker(), PlaySubmitData (+12 more)

### Community 41 - "Sending auth email through Resend"
Cohesion: 0.29
Nodes (6): 1. Verify the domain in Resend, 2. Create an API key, 3. Point Supabase at it, 4. Raise the rate limit, 5. Test before you need it, Sending auth email through Resend

### Community 42 - "UiPreview.tsx"
Cohesion: 0.12
Nodes (16): endZoneLabel(), FieldVisualizer(), FIVE_YARD_LINES, fromWidgetPercent(), Props, toWidgetPercent(), YARD_NUMBERS, away (+8 more)

### Community 43 - "quarterChange.spec.ts"
Cohesion: 0.29
Nodes (9): quarterLabel(), moveToQuarter(), rebuildPlaySituations(), advanceLiveQuarterState(), createQuarterChange(), quarterChangeBefore(), before, session (+1 more)

### Community 44 - "design_system.py"
Cohesion: 0.19
Nodes (13): datetime, _detect_page_type(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), persist_design_system(), Detect page type from context and search results., Design System Generator - Aggregates search results and applies reasoning to… (+5 more)

### Community 45 - "play_charting"
Cohesion: 0.32
Nodes (7): idx_play_charting_game, idx_play_charting_play, play_charting, play_charting_updated_at, games, plays, update_updated_at

### Community 46 - "Auth email templates"
Cohesion: 0.40
Nodes (4): Auth email templates, Notes, The from address is a separate problem, Where they go

### Community 51 - "play_charting"
Cohesion: 0.32
Nodes (7): idx_play_charting_game, idx_play_charting_play, play_charting, play_charting_updated_at, games, plays, update_updated_at

### Community 52 - "LiveStatsPanel.tsx"
Cohesion: 0.15
Nodes (10): DefenseTab(), LiveStatsPanel(), noneYet(), OffenseTab(), Props, SpecialTeamsTab(), Tab, TabContainer() (+2 more)

### Community 53 - "programService.ts"
Cohesion: 0.12
Nodes (16): isKickoffDue(), PreviousPlay, Situation, previous, situation, PENALTY_RULES, before, play (+8 more)

### Community 54 - "scoringLedger.ts"
Cohesion: 0.22
Nodes (11): applyScoreDelta(), isReturnTouchdown(), other(), ScorablePlay, Score, scoreByQuarter(), ScoringEvent, scoringEvents() (+3 more)

### Community 55 - "ScheduleScreen.tsx"
Cohesion: 0.20
Nodes (9): ScheduleScreen, formatKickoff(), GameRow, ScheduleScreen(), Site, Opponent, OpponentPlayer, opponentPlayerService (+1 more)

### Community 56 - "20260901010000_program_invite_codes.sql"
Cohesion: 0.29
Nodes (4): idx_invite_codes_program, program_invite_codes, auth.users, programs

### Community 57 - "gameCompletion.ts"
Cohesion: 0.46
Nodes (5): StatsChip(), isMarkedStatsFinal(), STATS_FINAL_TAG, statsState, statsStateLabel()

### Community 58 - "resolveKickSpots"
Cohesion: 0.36
Nodes (5): kickInfoFromDescription(), KickSpots, netKickYards(), num(), resolveKickSpots()

### Community 59 - "lucide-react"
Cohesion: 0.29
Nodes (6): lucide-react, GameHomeLink(), expiryLabel(), InviteCode, Props, TeamAccess()

### Community 60 - "migration_001_fsa_merge.sql"
Cohesion: 0.38
Nodes (6): coaches, idx_coaches_season, idx_opponent_players_opponent, opponent_players, opponents, seasons

### Community 61 - "HomePreview.tsx"
Cohesion: 0.18
Nodes (8): HomeData, HomeGame, BASE, HomePreview(), LIVE, OPP, PLAYED, UPCOMING

### Community 62 - "vitest"
Cohesion: 0.14
Nodes (14): ref_node_path, vitest, TEAM_PLAYER_ID, BAD_SNAP, summarise(), PlayWithPlayers, summary(), postgameSummary() (+6 more)

### Community 63 - "pendingPlayerService.ts"
Cohesion: 0.19
Nodes (18): isPendingId(), pendingJerseyFromId(), MergeCandidate, Mode, PendingCard(), playerLabel(), Props, discardPending() (+10 more)

### Community 64 - "BM25"
Cohesion: 0.28
Nodes (5): BM25, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, BM25 ranking algorithm for text search

### Community 65 - "PullToRefresh.tsx"
Cohesion: 0.38
Nodes (6): atTop(), PullToRefresh(), prepareAppRefresh(), refreshApp(), setup(), Worker

### Community 66 - "HomeBroadcast.tsx"
Cohesion: 0.18
Nodes (15): abbrOf(), ballSpot(), CHIP, countdown(), Crest(), D6_RANKINGS_URL, daysUntil(), fmtDate() (+7 more)

### Community 67 - "search.py"
Cohesion: 0.25
Nodes (7): argparse, format_output(), UI/UX Pro Max Search - BM25 search engine for UI/UX style guides Usage: python…, Format results for Claude consumption (token-optimized), io, json, sys

### Community 68 - "generate_design_system"
Cohesion: 0.29
Nodes (6): format_ascii_box(), format_markdown(), generate_design_system(), Format design system as ASCII box with emojis (MCP-style)., Format design system as markdown., Main entry point for design system generation. Args: query: Search query (e.g.,…

### Community 69 - "TabBar.tsx"
Cohesion: 0.25
Nodes (7): CalendarIcon, GoalpostIcon, HeadsetIcon, JerseyIcon, StatsIcon, TabBar(), TABS

### Community 70 - "Home screen redesign mockup (2026-09-16)"
Cohesion: 0.33
Nodes (5): Home screen redesign mockup (2026-09-16), Home Â· Game Day, Live game · Broadcast (2026-09-17), Other directions, Theme explorations (2026-09-17)

### Community 86 - "useTheme.ts"
Cohesion: 0.73
Nodes (5): applyTheme(), ensureTheme(), initialTheme(), useScreenTheme(), useTheme()

### Community 87 - "csvExport.ts"
Cohesion: 0.31
Nodes (9): RFC-4180, csvEscape(), downloadCsv(), ExportGameOptions, exportGameSummaryCsv(), exportPlayerSeasonCsv(), ExportSeasonOptions, rowsToCsv() (+1 more)

### Community 88 - "PlayRecord"
Cohesion: 0.11
Nodes (20): FILTERS, KICKING_TYPES, LogFilter, PLAY_ICON_COLORS, PLAY_ICONS, PlayLog(), Props, unitOf() (+12 more)

### Community 89 - "main.tsx"
Cohesion: 0.29
Nodes (4): react-dom, App(), ErrorBoundary, src_index

### Community 90 - "SeasonReportScreen.tsx"
Cohesion: 0.25
Nodes (11): SeasonReportScreen, program, sections, SeasonReportDocument(), SeasonReportScreen(), BuildReportInput, buildSeasonReport(), combineSeasonBundles() (+3 more)

### Community 91 - "YardReel.tsx"
Cohesion: 0.60
Nodes (4): clampSpot(), Props, yardNumber(), YardReel()

### Community 92 - "gameFlow.ts"
Cohesion: 0.16
Nodes (22): isPenaltyOnOffense(), advanceSituationAfterPlay(), asRecord(), clampBallOn(), DEFAULT_PREGAME, flipFieldPosition(), GameRulesCarrier, getChartingPrefs() (+14 more)

### Community 93 - "splitTackleCredit"
Cohesion: 0.28
Nodes (5): CreditTag, splitTackleCredit(), TackleCredit, splitTackles(), Tag

### Community 94 - "completeProgramJoin.spec.ts"
Cohesion: 0.40
Nodes (4): empty, member, mocks, user

## Knowledge Gaps
- **364 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+359 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 560 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `GameSummaryScreen.tsx`, `PlayEntryModal.tsx`, `App.tsx`, `PregameSetupSheet.tsx`, `useProgramContext.tsx`, `GameReportScreen.tsx`, `BroadcastIcons.tsx`, `FlowPreview.tsx`, `RosterScreen.tsx`, `SeasonStatsScreen.tsx`, `QuickActions.tsx`, `BoxScoreScreen.tsx`, `UiPreview.tsx`, `LiveStatsPanel.tsx`, `ScheduleScreen.tsx`, `lucide-react`, `HomePreview.tsx`, `pendingPlayerService.ts`, `PullToRefresh.tsx`, `HomeBroadcast.tsx`, `TabBar.tsx`, `useTheme.ts`, `PlayRecord`, `main.tsx`, `SeasonReportScreen.tsx`, `YardReel.tsx`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `football-stats-engine` connect `GameSummaryScreen.tsx` to `playTransformer.ts`, `liveGameSession.ts`, `liveVsPostgame.spec.ts`, `SeasonStatsScreen.tsx`, `package.json`, `BoxScoreScreen.tsx`, `driveResults.ts`, `PlayerScreen.tsx`, `LiveStatsPanel.tsx`, `gameReport.ts`, `csvExport.ts`, `PlayRecord`, `SeasonReportScreen.tsx`, `vitest`, `statsService.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `lucide-react` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `GameSummaryScreen.tsx`, `PlayEntryModal.tsx`, `App.tsx`, `PregameSetupSheet.tsx`, `GameReportScreen.tsx`, `RosterScreen.tsx`, `SeasonStatsScreen.tsx`, `QuickActions.tsx`, `BoxScoreScreen.tsx`, `react`, `UiPreview.tsx`, `LiveStatsPanel.tsx`, `ScheduleScreen.tsx`, `pendingPlayerService.ts`, `PullToRefresh.tsx`, `PlayRecord`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameScreen()` (e.g. with `isRosterTag()` and `readKeepAwake()`) actually correct?**
  _`GameScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _364 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.09881422924901186 - nodes in this community are weakly interconnected._
- **Should `offlineDb.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06414565826330532 - nodes in this community are weakly interconnected._