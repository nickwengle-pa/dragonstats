# Graph Report - dragonstats  (2026-09-18)

## Corpus Check
- 171 files · ~288,746 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 39 file(s) not represented in the graph (top: .csv 24, .css 6, (none) 5)

## Summary
- 1521 nodes · 3580 edges · 89 communities (70 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4e016d19`
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
- driveResults.ts
- GameScreen.tsx
- gameService.ts
- PlayerScreen.tsx
- ui-ux-pro-max
- generate-favicon.cjs
- SettingsScreen.tsx
- GameSummaryScreen.tsx
- PlayEntryModal.tsx
- 20250101000000_initial_schema.sql
- react
- gameFlow.ts
- gameReport.ts
- useProgramContext.tsx
- types.ts
- compilerOptions
- GameReportScreen.tsx
- BroadcastIcons.tsx
- schema.sql
- Design System Master File
- lucide-react
- 20260901000000_program_membership_rls.sql
- penaltyEnforcement.ts
- statsService.ts
- football-stats-engine/package.json
- UiPreview.tsx
- RosterScreen.tsx
- core.py
- SeasonStatsScreen.tsx
- QuickActions.tsx
- playEntrySeed.ts
- BoxScoreScreen.tsx
- FlowPreview.tsx
- Sending auth email through Resend
- Dragon Stats
- quarterChange.spec.ts
- design_system.py
- play_charting
- Auth email templates
- vite-env.d.ts
- AGENTS.md
- play_charting
- LiveStatsPanel.tsx
- programService.ts
- ref_node_assert
- ScheduleScreen.tsx
- 20260901010000_program_invite_codes.sql
- gameCompletion.ts
- csvExport.ts
- advanceSituationAfterPlay
- migration_001_fsa_merge.sql
- HomePreview.tsx
- liveVsPostgame.spec.ts
- pendingPlayerService.ts
- BM25
- DrivesList.tsx
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
- DashboardScreen.tsx
- supabase.ts

## God Nodes (most connected - your core abstractions)
1. `GameScreen()` - 68 edges
2. `react` - 54 edges
3. `isOfflineSupported()` - 34 edges
4. `useProgramContext()` - 31 edges
5. `getDb()` - 29 edges
6. `PlayEntryModal()` - 28 edges
7. `supabase` - 28 edges
8. `advanceSituationAfterPlay()` - 28 edges
9. `PostGameReview()` - 27 edges
10. `lucide-react` - 26 edges

## Surprising Connections (you probably didn't know these)
- `Architecture notes that aren't obvious` --references--> `isRosterTag()`  [INFERRED]
  CLAUDE.md → src/components/game/types.ts
- `Architecture notes that aren't obvious` --references--> `rebuildPlaySituations()`  [INFERRED]
  CLAUDE.md → src/services/gameFlow.ts
- `Architecture notes that aren't obvious` --references--> `deletePlay()`  [INFERRED]
  CLAUDE.md → src/services/gameService.ts
- `Architecture notes that aren't obvious` --references--> `updatePlayFull()`  [INFERRED]
  CLAUDE.md → src/services/gameService.ts
- `Architecture notes that aren't obvious` --references--> `replayLiveGame()`  [INFERRED]
  CLAUDE.md → src/services/liveGameSession.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Database Entities** — database_schema, programs_table, seasons_table, players_table, season_rosters_table, opponents_table, games_table, plays_table, play_players_table, game_stats_cache_table [EXTRACTED 1.00]
- **Technology Stack** — dragon_stats_app, react_19, typescript, vite, tailwind_css, supabase, football_stats_engine, pwa [EXTRACTED 1.00]

## Communities (89 total, 19 thin omitted)

### Community 0 - "playTransformer.ts"
Cohesion: 0.14
Nodes (24): getPenaltyEngineCode(), allTagsForRole(), buildContext(), buildFumble(), buildPenalties(), clampDown(), clampQuarter(), convertPlay() (+16 more)

### Community 1 - "liveGameSession.ts"
Cohesion: 0.18
Nodes (23): grantsAutoFirstDown(), normalizeQuarter(), buildFumble(), buildPenalties(), buildPlayContext(), createEngine(), createInitialGameState(), firstTaggedPlayer() (+15 more)

### Community 2 - "Database Schema"
Cohesion: 0.10
Nodes (23): Database Schema, Dragon Stats, football-stats-engine, game_stats_cache table, games table, High School Football Play-by-Play Tracking App, NFHS Rules, opponents table (+15 more)

### Community 3 - "offlineDb.ts"
Cohesion: 0.08
Nodes (65): SyncCoordinator(), PlayInsert, PlayRow, saveGamePatch(), savePlayAtomic(), updatePlay(), updatePlayFull(), updatePlaySituation() (+57 more)

### Community 4 - "DesignSystemGenerator"
Cohesion: 0.16
Nodes (9): DesignSystemGenerator, Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation., Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Execute searches across multiple domains., Find matching reasoning rule for a category. (+1 more)

### Community 5 - "PostGameReview.tsx"
Cohesion: 0.07
Nodes (46): ClockInput(), formatClockValue(), parseClockDigits(), Props, TimeoutEdit, TimeoutEditModal(), DEFENSIVE_FORMATIONS, findPlayTypeDef() (+38 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (40): dependencies, football-stats-engine, idb, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js (+32 more)

### Community 7 - "dangerZone.ts"
Cohesion: 0.33
Nodes (15): DangerZone(), countSeasonData(), deleteGame(), deleteSeason(), deleteUnrosteredPlayers(), fail(), getSeasonGameIds(), ok() (+7 more)

### Community 8 - "driveResults.ts"
Cohesion: 0.18
Nodes (14): AFTERMATH, classify(), DriveResult, DriveResultPlay, DriveResultValue, LocalDriveResult, possessionRuns(), PUNT_TYPES (+6 more)

### Community 9 - "GameScreen.tsx"
Cohesion: 0.07
Nodes (54): Props, SyncBadge(), isRosterTag(), makePendingId(), makeTeamTag(), normalizeOppTagId(), pendingDisplayName(), pendingJerseyFromId() (+46 more)

### Community 10 - "gameService.ts"
Cohesion: 0.13
Nodes (21): Architecture notes that aren't obvious, RFC-4122, createInitialSituation(), getRecordedNextSituation(), calcTimeOfPossession(), clockToSeconds(), clockToSecs(), CurrentGameStateUpdate (+13 more)

### Community 11 - "PlayerScreen.tsx"
Cohesion: 0.20
Nodes (17): CareerRow, careerRowFromLines(), CareerSection(), Column, DefenseSection(), fmt(), fmtDate(), GameLog() (+9 more)

### Community 12 - "ui-ux-pro-max"
Cohesion: 0.07
Nodes (29): Accessibility, Available Domains, Available Stacks, Common Rules for Professional UI, Example Workflow, How to Use This Workflow, Icons & Visual Elements, Interaction (+21 more)

### Community 13 - "generate-favicon.cjs"
Cohesion: 0.09
Nodes (31): ref_fs, ref_path, ref_zlib, AXIS, AXIS_FAR, AXIS_ORIGIN, BAR_STOPS, BARS (+23 more)

### Community 14 - "SettingsScreen.tsx"
Cohesion: 0.13
Nodes (17): SettingsScreen, JoinWithCode(), SeasonReportScreen(), Props, SettingsScreen(), buildSeasonName(), Coach, coachService (+9 more)

### Community 15 - "GameSummaryScreen.tsx"
Cohesion: 0.16
Nodes (10): GameSummaryScreen, Props, SIZES, TeamCrest(), computeFormationStats(), fmt(), FormationBreakdown, GameInfo (+2 more)

### Community 16 - "PlayEntryModal.tsx"
Cohesion: 0.08
Nodes (31): Conventions, FAST_PLAY_IDS, toggleFastTackler(), DIGITS, Keypad(), Props, defaultBlockedKickType(), DEFENSIVE_ROLES (+23 more)

### Community 17 - "20250101000000_initial_schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 18 - "react"
Cohesion: 0.09
Nodes (26): react, react-dom, react-router-dom, App(), AppRoutes(), GameScreen, GameSettingsScreen, JoinTeamScreen (+18 more)

### Community 19 - "gameFlow.ts"
Cohesion: 0.13
Nodes (31): src_components_game_pregamesetup, PregameSetupSheet(), Props, Choice(), Layout, palette(), PregameSetupView(), Props (+23 more)

### Community 20 - "gameReport.ts"
Cohesion: 0.13
Nodes (25): avg(), buildGameReport(), BuildReportInput, conversionText(), dash(), DefensiveRow, KickoffRow, labelFor() (+17 more)

### Community 21 - "useProgramContext.tsx"
Cohesion: 0.12
Nodes (21): Props, Branding, DEFAULT_BRANDING, deriveBranding(), keepIfEqual(), ProgramContext, ProgramContextValue, ProgramProvider() (+13 more)

### Community 22 - "types.ts"
Cohesion: 0.09
Nodes (23): BLOCKED_KICK_TYPES, buildDescription(), isPendingId(), isSpotFoul(), NFHS_QUARTER_SECS, OFFENSE_PENALTIES, OpponentPlayerRef, PENALTIES (+15 more)

### Community 23 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 24 - "GameReportScreen.tsx"
Cohesion: 0.14
Nodes (12): GameReportScreen, Col, Crest(), formatKickoff(), GameInfo, GameReportScreen(), n(), Page() (+4 more)

### Community 25 - "BroadcastIcons.tsx"
Cohesion: 0.10
Nodes (18): ChevronIcon, ClockIcon, ExternalIcon, EyeIcon, FilmIcon, FlagIcon, GridIcon, IconProps (+10 more)

### Community 26 - "schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 27 - "Design System Master File"
Cohesion: 0.12
Nodes (16): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Color Palette, Component Specs, Design System Master File, Global Rules (+8 more)

### Community 28 - "lucide-react"
Cohesion: 0.19
Nodes (21): lucide-react, FastPlayEntry(), labels, Props, KneelEntry(), src_components_game_liveentry, PassDefenderPicker(), PlaySubmitData (+13 more)

### Community 29 - "20260901000000_program_membership_rls.sql"
Cohesion: 0.15
Nodes (18): public.enrol_program_owner, idx_program_members_user, program_members, programs_enrol_owner, public.is_game_member(), public.is_opponent_member(), public.is_play_member(), public.is_player_member() (+10 more)

### Community 30 - "penaltyEnforcement.ts"
Cohesion: 0.18
Nodes (14): PenaltySide, AdvanceablePlay, basicSpot(), clamp(), Enforcement, EnforcementInput, enforcePenalty(), isBehind() (+6 more)

### Community 31 - "statsService.ts"
Cohesion: 0.15
Nodes (19): calcDefenseStats(), isInsideTwenty(), kickInfoFromDescription(), KickSpots, netKickYards(), num(), resolveKickSpots(), collectOpponentPlayerIds() (+11 more)

### Community 32 - "football-stats-engine/package.json"
Cohesion: 0.12
Nodes (15): _comment, description, devDependencies, tsx, typescript, files, typescript, keywords (+7 more)

### Community 33 - "UiPreview.tsx"
Cohesion: 0.10
Nodes (24): FILTERS, KICKING_TYPES, LogFilter, PLAY_ICON_COLORS, PLAY_ICONS, PlayLog(), Props, unitOf() (+16 more)

### Community 34 - "RosterScreen.tsx"
Cohesion: 0.11
Nodes (26): RosterScreen, BroadcastHeader(), Props, BackIcon, PlusIcon, UploadIcon, PendingPlayersSheet(), CLASSIFICATIONS (+18 more)

### Community 35 - "core.py"
Cohesion: 0.15
Nodes (16): collections, csv, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+8 more)

### Community 36 - "SeasonStatsScreen.tsx"
Cohesion: 0.15
Nodes (13): SeasonStatsScreen, src_screens_dashboardscreen_tabbar, AggDefense, AggKicking, AggPassing, AggPunting, AggReceiving, AggReturns (+5 more)

### Community 37 - "QuickActions.tsx"
Cohesion: 0.11
Nodes (17): FAST_PATH_COLS, fastPathIds(), ordinalDown(), PHASE_TABS, PhaseFilter, Props, QuickActions(), downLabel() (+9 more)

### Community 38 - "playEntrySeed.ts"
Cohesion: 0.14
Nodes (12): buildEditSeed(), EditSeed, FieldTeam, FUMBLE_MODIFIER_TYPES, KickOutcome, num(), PenaltyEnforcement, TACKLE_ROLES (+4 more)

### Community 39 - "BoxScoreScreen.tsx"
Cohesion: 0.10
Nodes (23): BoxScoreScreen, GameHomeLink(), BoxScoreScreen(), fmt(), GameInfo, ourLines(), playerLabel(), QUARTER_COLS (+15 more)

### Community 40 - "FlowPreview.tsx"
Cohesion: 0.14
Nodes (15): endZoneLabel(), FieldVisualizer(), FIVE_YARD_LINES, fromWidgetPercent(), Props, toWidgetPercent(), YARD_NUMBERS, OffensivePlayBadge() (+7 more)

### Community 41 - "Sending auth email through Resend"
Cohesion: 0.29
Nodes (6): 1. Verify the domain in Resend, 2. Create an API key, 3. Point Supabase at it, 4. Raise the rate limit, 5. Test before you need it, Sending auth email through Resend

### Community 42 - "Dragon Stats"
Cohesion: 0.50
Nodes (3): Dragon Stats, Gotchas — these have each cost real time, Verify loop

### Community 43 - "quarterChange.spec.ts"
Cohesion: 0.23
Nodes (11): quarterLabel(), moveToQuarter(), rebuildPlaySituations(), advanceLiveQuarterState(), LiveSessionConfig, createQuarterChange(), quarterChangeBefore(), before (+3 more)

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
Nodes (18): ref_node_path, vitest, isKickoffDue(), PreviousPlay, Situation, previous, situation, before (+10 more)

### Community 54 - "ref_node_assert"
Cohesion: 0.09
Nodes (10): ref_node_assert, Tag, Join, Loose, Play, mergeQueuedPlays(), assertLandsOnPenalty(), buildSteps() (+2 more)

### Community 55 - "ScheduleScreen.tsx"
Cohesion: 0.18
Nodes (10): ScheduleScreen, ShieldIcon, formatKickoff(), GameRow, ScheduleScreen(), Site, Opponent, OpponentPlayer (+2 more)

### Community 56 - "20260901010000_program_invite_codes.sql"
Cohesion: 0.29
Nodes (4): idx_invite_codes_program, program_invite_codes, auth.users, programs

### Community 57 - "gameCompletion.ts"
Cohesion: 0.46
Nodes (5): StatsChip(), isMarkedStatsFinal(), STATS_FINAL_TAG, statsState, statsStateLabel()

### Community 58 - "csvExport.ts"
Cohesion: 0.31
Nodes (9): RFC-4180, csvEscape(), downloadCsv(), ExportGameOptions, exportGameSummaryCsv(), exportPlayerSeasonCsv(), ExportSeasonOptions, rowsToCsv() (+1 more)

### Community 59 - "advanceSituationAfterPlay"
Cohesion: 0.32
Nodes (8): getPenaltyDefaultSide(), isPenaltyOnOffense(), FlowPreview(), advanceSituationAfterPlay(), clampBallOn(), flipFieldPosition(), toDisplayFieldPosition(), kickoffOutOfBoundsSituation()

### Community 60 - "migration_001_fsa_merge.sql"
Cohesion: 0.38
Nodes (6): coaches, idx_coaches_season, idx_opponent_players_opponent, opponent_players, opponents, seasons

### Community 61 - "HomePreview.tsx"
Cohesion: 0.17
Nodes (9): src_assets_pl_dragon, HomeData, HomeGame, BASE, HomePreview(), LIVE, OPP, PLAYED (+1 more)

### Community 62 - "liveVsPostgame.spec.ts"
Cohesion: 0.09
Nodes (21): football-stats-engine, TEAM_PLAYER_ID, BAD_SNAP, summarise(), PlayWithPlayers, summary(), DECLINED_APP, DECLINED_DB (+13 more)

### Community 63 - "pendingPlayerService.ts"
Cohesion: 0.24
Nodes (15): MergeCandidate, Mode, PendingCard(), playerLabel(), Props, discardPending(), loadSeasonPendingPlays(), mergePendingIntoPlayer() (+7 more)

### Community 64 - "BM25"
Cohesion: 0.28
Nodes (5): BM25, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, BM25 ranking algorithm for text search

### Community 65 - "DrivesList.tsx"
Cohesion: 0.40
Nodes (4): DrivesList(), formatFieldPosition(), Props, RESULT_LABEL

### Community 66 - "HomeBroadcast.tsx"
Cohesion: 0.15
Nodes (17): abbrOf(), ballSpot(), CHIP, countdown(), Crest(), D6_RANKINGS_URL, daysUntil(), fmtDate() (+9 more)

### Community 67 - "search.py"
Cohesion: 0.25
Nodes (7): argparse, format_output(), UI/UX Pro Max Search - BM25 search engine for UI/UX style guides Usage: python…, Format results for Claude consumption (token-optimized), io, json, sys

### Community 68 - "generate_design_system"
Cohesion: 0.29
Nodes (6): format_ascii_box(), format_markdown(), generate_design_system(), Format design system as ASCII box with emojis (MCP-style)., Format design system as markdown., Main entry point for design system generation. Args: query: Search query (e.g.,…

### Community 69 - "TabBar.tsx"
Cohesion: 0.22
Nodes (8): CalendarIcon, GoalpostIcon, HeadsetIcon, JerseyIcon, StatsIcon, TabBar(), TABS, src_screens_homebroadcast

### Community 70 - "Home screen redesign mockup (2026-09-16)"
Cohesion: 0.33
Nodes (5): Home screen redesign mockup (2026-09-16), Home Â· Game Day, Live game · Broadcast (2026-09-17), Other directions, Theme explorations (2026-09-17)

### Community 86 - "useTheme.ts"
Cohesion: 0.73
Nodes (5): applyTheme(), ensureTheme(), initialTheme(), useScreenTheme(), useTheme()

### Community 87 - "DashboardScreen.tsx"
Cohesion: 0.40
Nodes (8): DashboardScreen, DashboardScreen(), GameRow, toHomeGame(), readSeasonGames(), readSeasonReviewCounts(), readSeasonRoster(), warmGamedayCache()

### Community 91 - "supabase.ts"
Cohesion: 0.24
Nodes (9): @supabase/supabase-js, expiryLabel(), InviteCode, Props, TeamAccess(), AuthState, isAuthRequest(), supabase (+1 more)

## Knowledge Gaps
- **363 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+358 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 556 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `GameSummaryScreen.tsx`, `PlayEntryModal.tsx`, `gameFlow.ts`, `useProgramContext.tsx`, `GameReportScreen.tsx`, `BroadcastIcons.tsx`, `lucide-react`, `UiPreview.tsx`, `RosterScreen.tsx`, `SeasonStatsScreen.tsx`, `QuickActions.tsx`, `BoxScoreScreen.tsx`, `FlowPreview.tsx`, `LiveStatsPanel.tsx`, `ScheduleScreen.tsx`, `HomePreview.tsx`, `pendingPlayerService.ts`, `HomeBroadcast.tsx`, `TabBar.tsx`, `useTheme.ts`, `DashboardScreen.tsx`, `supabase.ts`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `lucide-react` to `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `GameSummaryScreen.tsx`, `PlayEntryModal.tsx`, `react`, `gameFlow.ts`, `GameReportScreen.tsx`, `UiPreview.tsx`, `RosterScreen.tsx`, `SeasonStatsScreen.tsx`, `QuickActions.tsx`, `BoxScoreScreen.tsx`, `FlowPreview.tsx`, `LiveStatsPanel.tsx`, `ScheduleScreen.tsx`, `pendingPlayerService.ts`, `supabase.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `football-stats-engine` connect `liveVsPostgame.spec.ts` to `playTransformer.ts`, `DrivesList.tsx`, `liveGameSession.ts`, `SeasonStatsScreen.tsx`, `package.json`, `BoxScoreScreen.tsx`, `driveResults.ts`, `PlayerScreen.tsx`, `GameSummaryScreen.tsx`, `LiveStatsPanel.tsx`, `gameReport.ts`, `programService.ts`, `csvExport.ts`, `statsService.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameScreen()` (e.g. with `isRosterTag()` and `readKeepAwake()`) actually correct?**
  _`GameScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _363 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `playTransformer.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.135632183908046 - nodes in this community are weakly interconnected._
- **Should `Database Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.09881422924901186 - nodes in this community are weakly interconnected._