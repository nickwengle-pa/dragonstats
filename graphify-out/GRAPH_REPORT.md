# Graph Report - dragonstats  (2026-09-19)

## Corpus Check
- 183 files · ~292,970 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 39 file(s) not represented in the graph (top: .csv 24, .css 6, (none) 5)

## Summary
- 1557 nodes · 3711 edges · 87 communities (68 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `42c10bf9`
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
- GameSummaryScreen.tsx
- PlayerScreen.tsx
- ui-ux-pro-max
- generate-favicon.cjs
- SettingsScreen.tsx
- penaltyEnforcement.ts
- PlayEntryModal.tsx
- 20250101000000_initial_schema.sql
- react
- gameFlow.ts
- gameReport.ts
- useProgramContext.tsx
- types.ts
- compilerOptions
- GameReportScreen.tsx
- HomeBroadcast.tsx
- schema.sql
- Design System Master File
- gameService.ts
- 20260901000000_program_membership_rls.sql
- UiPreview.tsx
- playEntrySeed.ts
- football-stats-engine/package.json
- liveVsPostgame.spec.ts
- RosterScreen.tsx
- core.py
- BroadcastIcons.tsx
- QuickActions.tsx
- advanceSituationAfterPlay
- BoxScoreScreen.tsx
- FlowPreview.tsx
- Sending auth email through Resend
- Scoreboard.tsx
- SeasonReportScreen.tsx
- design_system.py
- play_charting
- Auth email templates
- vite-env.d.ts
- AGENTS.md
- play_charting
- lucide-react
- programService.ts
- scoringLedger.ts
- ScheduleScreen.tsx
- 20260901010000_program_invite_codes.sql
- statsService.ts
- resolveKickSpots
- TeamAccess.tsx
- migration_001_fsa_merge.sql
- completeProgramJoin.spec.ts
- vitest
- BM25
- PullToRefresh.tsx
- Dragon Stats
- search.py
- generate_design_system
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
- PlayRecord
- YardReel.tsx
- splitTackleCredit

## God Nodes (most connected - your core abstractions)
1. `GameScreen()` - 70 edges
2. `react` - 57 edges
3. `isOfflineSupported()` - 36 edges
4. `useProgramContext()` - 31 edges
5. `getDb()` - 31 edges
6. `lucide-react` - 29 edges
7. `vitest` - 29 edges
8. `PlayEntryModal()` - 28 edges
9. `PlayRecord` - 28 edges
10. `supabase` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Conventions` --references--> `roleUsesOpponentRoster()`  [INFERRED]
  CLAUDE.md → src/components/game/PlayEntryModal.tsx
- `Architecture notes that aren't obvious` --references--> `isRosterTag()`  [INFERRED]
  CLAUDE.md → src/components/game/types.ts
- `Architecture notes that aren't obvious` --references--> `insertPlay()`  [INFERRED]
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

## Communities (87 total, 19 thin omitted)

### Community 0 - "playTransformer.ts"
Cohesion: 0.21
Nodes (19): getPenaltyEngineCode(), allTagsForRole(), buildContext(), buildFumble(), buildPenalties(), clampDown(), clampQuarter(), convertPlay() (+11 more)

### Community 1 - "liveGameSession.ts"
Cohesion: 0.16
Nodes (25): moveToQuarter(), normalizeQuarter(), advanceLiveQuarterState(), buildFumble(), buildPenalties(), buildPlayContext(), createEngine(), createInitialGameState() (+17 more)

### Community 2 - "Database Schema"
Cohesion: 0.10
Nodes (23): Database Schema, Dragon Stats, football-stats-engine, game_stats_cache table, games table, High School Football Play-by-Play Tracking App, NFHS Rules, opponents table (+15 more)

### Community 3 - "offlineDb.ts"
Cohesion: 0.07
Nodes (70): Props, SyncBadge(), SyncDetails(), cachePlay(), cachePlays(), cachePlayWithIntent(), clearAllOfflineData(), clearQueueForGame() (+62 more)

### Community 4 - "DesignSystemGenerator"
Cohesion: 0.16
Nodes (9): DesignSystemGenerator, Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation., Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Execute searches across multiple domains., Find matching reasoning rule for a category. (+1 more)

### Community 5 - "PostGameReview.tsx"
Cohesion: 0.07
Nodes (44): ClockInput(), formatClockValue(), parseClockDigits(), Props, findPlayTypeDef(), OpponentPlayerRef, yardLabel(), ChartCategoryFilter (+36 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (40): dependencies, football-stats-engine, idb, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js (+32 more)

### Community 7 - "dangerZone.ts"
Cohesion: 0.33
Nodes (15): DangerZone(), countSeasonData(), deleteGame(), deleteSeason(), deleteUnrosteredPlayers(), fail(), getSeasonGameIds(), ok() (+7 more)

### Community 8 - "ref_node_assert"
Cohesion: 0.06
Nodes (24): ref_node_assert, Tag, AFTERMATH, classify(), DriveResult, DriveResultPlay, DriveResultValue, LocalDriveResult (+16 more)

### Community 9 - "GameScreen.tsx"
Cohesion: 0.09
Nodes (46): DriveDetails(), PlayLog(), isRosterTag(), normalizeOppTagId(), quarterLabel(), readKeepAwake(), useWakeLock(), WakeLockSentinelLike (+38 more)

### Community 10 - "GameSummaryScreen.tsx"
Cohesion: 0.17
Nodes (10): GameSummaryScreen, GameHomeLink(), computeFormationStats(), fmt(), FormationBreakdown, GameInfo, GameSummaryScreen(), topPlayer() (+2 more)

### Community 11 - "PlayerScreen.tsx"
Cohesion: 0.12
Nodes (28): RFC-4180, PlayerScreen, CareerRow, careerRowFromLines(), CareerSection(), Column, DefenseSection(), fmt() (+20 more)

### Community 12 - "ui-ux-pro-max"
Cohesion: 0.07
Nodes (29): Accessibility, Available Domains, Available Stacks, Common Rules for Professional UI, Example Workflow, How to Use This Workflow, Icons & Visual Elements, Interaction (+21 more)

### Community 13 - "generate-favicon.cjs"
Cohesion: 0.09
Nodes (31): ref_fs, ref_path, ref_zlib, AXIS, AXIS_FAR, AXIS_ORIGIN, BAR_STOPS, BARS (+23 more)

### Community 14 - "SettingsScreen.tsx"
Cohesion: 0.11
Nodes (21): SettingsScreen, Props, ProgramContext, PROGRAM, SCREENS, SEASON, Props, SettingsScreen() (+13 more)

### Community 15 - "penaltyEnforcement.ts"
Cohesion: 0.18
Nodes (14): PenaltySide, AdvanceablePlay, basicSpot(), clamp(), Enforcement, EnforcementInput, enforcePenalty(), isBehind() (+6 more)

### Community 16 - "PlayEntryModal.tsx"
Cohesion: 0.08
Nodes (36): FAST_PLAY_IDS, toggleFastTackler(), DIGITS, Keypad(), Props, defaultBlockedKickType(), DEFENSIVE_ROLES, FieldTeam (+28 more)

### Community 17 - "20250101000000_initial_schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 18 - "react"
Cohesion: 0.09
Nodes (24): react, react-router-dom, App(), AppRoutes(), DashboardScreen, GameScreen, GameSettingsScreen, JoinTeamScreen (+16 more)

### Community 19 - "gameFlow.ts"
Cohesion: 0.12
Nodes (33): src_components_game_pregamesetup, PregameSetupSheet(), Props, Choice(), Layout, palette(), PregameSetupView(), Props (+25 more)

### Community 20 - "gameReport.ts"
Cohesion: 0.14
Nodes (21): avg(), buildGameReport(), conversionText(), dash(), DefensiveRow, KickoffRow, labelFor(), num() (+13 more)

### Community 21 - "useProgramContext.tsx"
Cohesion: 0.16
Nodes (23): @supabase/supabase-js, AuthState, Branding, DEFAULT_BRANDING, deriveBranding(), keepIfEqual(), ProgramContextValue, ProgramProvider() (+15 more)

### Community 22 - "types.ts"
Cohesion: 0.10
Nodes (19): BLOCKED_KICK_TYPES, buildDescription(), grantsAutoFirstDown(), isSpotFoul(), NFHS_QUARTER_SECS, OFFENSE_PENALTIES, PENALTIES, PENALTY_DEFAULT_YARDS (+11 more)

### Community 23 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 24 - "GameReportScreen.tsx"
Cohesion: 0.14
Nodes (12): GameReportScreen, Col, Crest(), formatKickoff(), GameInfo, GameReportScreen(), n(), Page() (+4 more)

### Community 25 - "HomeBroadcast.tsx"
Cohesion: 0.06
Nodes (45): abbrOf(), ballSpot(), CHIP, countdown(), Crest(), D6_RANKINGS_URL, daysUntil(), fmtDate() (+37 more)

### Community 26 - "schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 27 - "Design System Master File"
Cohesion: 0.12
Nodes (16): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Color Palette, Component Specs, Design System Master File, Global Rules (+8 more)

### Community 28 - "gameService.ts"
Cohesion: 0.12
Nodes (23): RFC-4122, calcTimeOfPossession(), clockToSecs(), CurrentGameStateUpdate, fmtSecs(), genUuid(), insertPlay(), InsertPlayOptions (+15 more)

### Community 29 - "20260901000000_program_membership_rls.sql"
Cohesion: 0.15
Nodes (18): public.enrol_program_owner, idx_program_members_user, program_members, programs_enrol_owner, public.is_game_member(), public.is_opponent_member(), public.is_play_member(), public.is_player_member() (+10 more)

### Community 30 - "UiPreview.tsx"
Cohesion: 0.17
Nodes (12): endZoneLabel(), FieldVisualizer(), FIVE_YARD_LINES, fromWidgetPercent(), Props, toWidgetPercent(), YARD_NUMBERS, away (+4 more)

### Community 31 - "playEntrySeed.ts"
Cohesion: 0.21
Nodes (11): buildEditSeed(), EditSeed, FieldTeam, FUMBLE_MODIFIER_TYPES, KickOutcome, num(), PenaltyEnforcement, TACKLE_ROLES (+3 more)

### Community 32 - "football-stats-engine/package.json"
Cohesion: 0.12
Nodes (15): _comment, description, devDependencies, tsx, typescript, files, typescript, keywords (+7 more)

### Community 33 - "liveVsPostgame.spec.ts"
Cohesion: 0.14
Nodes (10): DECLINED_APP, DECLINED_DB, livesummary(), PUNT_APP, PUNT_DB, SHARED_TACKLE_APP, SHARED_TACKLE_DB, Tag (+2 more)

### Community 34 - "RosterScreen.tsx"
Cohesion: 0.15
Nodes (19): RosterScreen, src_screens_dashboardscreen_tabbar, CLASSIFICATIONS, ImportModal(), POSITIONS, RosterPlayer, OpponentRosterSection(), GRADE_OFFSETS (+11 more)

### Community 35 - "core.py"
Cohesion: 0.15
Nodes (16): collections, csv, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+8 more)

### Community 36 - "BroadcastIcons.tsx"
Cohesion: 0.07
Nodes (33): SeasonStatsScreen, BroadcastHeader(), Props, BackIcon, CalendarIcon, ExternalIcon, EyeIcon, FlagIcon (+25 more)

### Community 37 - "QuickActions.tsx"
Cohesion: 0.15
Nodes (13): FAST_PATH_COLS, fastPathIds(), ordinalDown(), PHASE_TABS, PhaseFilter, Props, QuickActions(), PlayCategory (+5 more)

### Community 38 - "advanceSituationAfterPlay"
Cohesion: 0.24
Nodes (12): Architecture notes that aren't obvious, advanceSituationAfterPlay(), clampBallOn(), createInitialSituation(), createKickoffSituation(), flipFieldPosition(), getRecordedNextSituation(), rebuildPlaySituations() (+4 more)

### Community 39 - "BoxScoreScreen.tsx"
Cohesion: 0.15
Nodes (13): BoxScoreScreen, Props, SIZES, TeamCrest(), BoxScoreScreen(), fmt(), GameInfo, ourLines() (+5 more)

### Community 40 - "FlowPreview.tsx"
Cohesion: 0.13
Nodes (29): FastPlayEntry(), labels, Props, KneelEntry(), src_components_game_liveentry, PassDefenderPicker(), PlaySubmitData, Props (+21 more)

### Community 41 - "Sending auth email through Resend"
Cohesion: 0.29
Nodes (6): 1. Verify the domain in Resend, 2. Create an API key, 3. Point Supabase at it, 4. Raise the rate limit, 5. Test before you need it, Sending auth email through Resend

### Community 42 - "Scoreboard.tsx"
Cohesion: 0.15
Nodes (10): QuarterChangeRow(), downLabel(), Props, Scoreboard(), fmtClock(), src_screens_livebroadcast, clamp(), empty() (+2 more)

### Community 43 - "SeasonReportScreen.tsx"
Cohesion: 0.28
Nodes (10): program, sections, SeasonReportDocument(), SeasonReportScreen(), BuildReportInput, buildSeasonReport(), combineSeasonBundles(), paginateSeasonSections() (+2 more)

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

### Community 52 - "lucide-react"
Cohesion: 0.06
Nodes (36): lucide-react, DrivesList(), formatFieldPosition(), Props, RESULT_LABEL, DefenseTab(), LiveStatsPanel(), noneYet() (+28 more)

### Community 53 - "programService.ts"
Cohesion: 0.10
Nodes (18): isKickoffDue(), PreviousPlay, Situation, previous, situation, GameSettingsScreen(), before, play (+10 more)

### Community 54 - "scoringLedger.ts"
Cohesion: 0.22
Nodes (11): applyScoreDelta(), isReturnTouchdown(), other(), ScorablePlay, Score, scoreByQuarter(), ScoringEvent, scoringEvents() (+3 more)

### Community 55 - "ScheduleScreen.tsx"
Cohesion: 0.20
Nodes (9): ScheduleScreen, formatKickoff(), GameRow, ScheduleScreen(), Site, Opponent, OpponentPlayer, opponentPlayerService (+1 more)

### Community 56 - "20260901010000_program_invite_codes.sql"
Cohesion: 0.29
Nodes (4): idx_invite_codes_program, program_invite_codes, auth.users, programs

### Community 57 - "statsService.ts"
Cohesion: 0.27
Nodes (11): calcDefenseStats(), collectOpponentPlayerIds(), collectPlaceholderPlayers(), computeGameStatsBundle(), GameRecord, initDefStats(), loadGame(), loadRoster() (+3 more)

### Community 58 - "resolveKickSpots"
Cohesion: 0.31
Nodes (7): isInsideTwenty(), kickInfoFromDescription(), KickSpots, netKickYards(), num(), resolveKickSpots(), supplementPuntsInside20()

### Community 59 - "TeamAccess.tsx"
Cohesion: 0.50
Nodes (4): expiryLabel(), InviteCode, Props, TeamAccess()

### Community 60 - "migration_001_fsa_merge.sql"
Cohesion: 0.38
Nodes (6): coaches, idx_coaches_season, idx_opponent_players_opponent, opponent_players, opponents, seasons

### Community 61 - "completeProgramJoin.spec.ts"
Cohesion: 0.40
Nodes (4): empty, member, mocks, user

### Community 62 - "vitest"
Cohesion: 0.13
Nodes (17): football-stats-engine, ref_node_path, vitest, TEAM_PLAYER_ID, BAD_SNAP, summarise(), PlayWithPlayers, summary() (+9 more)

### Community 64 - "BM25"
Cohesion: 0.28
Nodes (5): BM25, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, BM25 ranking algorithm for text search

### Community 65 - "PullToRefresh.tsx"
Cohesion: 0.38
Nodes (6): atTop(), PullToRefresh(), prepareAppRefresh(), refreshApp(), setup(), Worker

### Community 66 - "Dragon Stats"
Cohesion: 0.40
Nodes (4): Conventions, Dragon Stats, Gotchas — these have each cost real time, Verify loop

### Community 67 - "search.py"
Cohesion: 0.25
Nodes (7): argparse, format_output(), UI/UX Pro Max Search - BM25 search engine for UI/UX style guides Usage: python…, Format results for Claude consumption (token-optimized), io, json, sys

### Community 68 - "generate_design_system"
Cohesion: 0.29
Nodes (6): format_ascii_box(), format_markdown(), generate_design_system(), Format design system as ASCII box with emojis (MCP-style)., Format design system as markdown., Main entry point for design system generation. Args: query: Search query (e.g.,…

### Community 70 - "Home screen redesign mockup (2026-09-16)"
Cohesion: 0.33
Nodes (5): Home screen redesign mockup (2026-09-16), Home Â· Game Day, Live game · Broadcast (2026-09-17), Other directions, Theme explorations (2026-09-17)

### Community 88 - "PlayRecord"
Cohesion: 0.13
Nodes (17): react-dom, FILTERS, KICKING_TYPES, LogFilter, PLAY_ICON_COLORS, PLAY_ICONS, Props, unitOf() (+9 more)

### Community 91 - "YardReel.tsx"
Cohesion: 0.60
Nodes (4): clampSpot(), Props, yardNumber(), YardReel()

### Community 93 - "splitTackleCredit"
Cohesion: 0.28
Nodes (5): CreditTag, splitTackleCredit(), TackleCredit, splitTackles(), Tag

## Knowledge Gaps
- **366 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+361 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 562 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `GameSummaryScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `PlayEntryModal.tsx`, `gameFlow.ts`, `useProgramContext.tsx`, `GameReportScreen.tsx`, `HomeBroadcast.tsx`, `UiPreview.tsx`, `RosterScreen.tsx`, `BroadcastIcons.tsx`, `QuickActions.tsx`, `BoxScoreScreen.tsx`, `FlowPreview.tsx`, `SeasonReportScreen.tsx`, `lucide-react`, `programService.ts`, `ScheduleScreen.tsx`, `TeamAccess.tsx`, `PullToRefresh.tsx`, `PlayRecord`, `YardReel.tsx`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `lucide-react` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `GameSummaryScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `PlayEntryModal.tsx`, `gameFlow.ts`, `GameReportScreen.tsx`, `UiPreview.tsx`, `RosterScreen.tsx`, `BroadcastIcons.tsx`, `BoxScoreScreen.tsx`, `FlowPreview.tsx`, `Scoreboard.tsx`, `programService.ts`, `ScheduleScreen.tsx`, `TeamAccess.tsx`, `PullToRefresh.tsx`, `PlayRecord`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `football-stats-engine` connect `vitest` to `playTransformer.ts`, `liveGameSession.ts`, `liveVsPostgame.spec.ts`, `BroadcastIcons.tsx`, `package.json`, `BoxScoreScreen.tsx`, `ref_node_assert`, `GameSummaryScreen.tsx`, `PlayerScreen.tsx`, `SeasonReportScreen.tsx`, `lucide-react`, `gameReport.ts`, `PlayRecord`, `statsService.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameScreen()` (e.g. with `isRosterTag()` and `readKeepAwake()`) actually correct?**
  _`GameScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _366 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.09881422924901186 - nodes in this community are weakly interconnected._
- **Should `offlineDb.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0728395061728395 - nodes in this community are weakly interconnected._