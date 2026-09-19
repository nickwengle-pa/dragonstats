# Graph Report - dragonstats  (2026-09-19)

## Corpus Check
- 184 files · ~293,591 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 39 file(s) not represented in the graph (top: .csv 24, .css 6, (none) 5)

## Summary
- 1561 nodes · 3740 edges · 101 communities (79 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b586fdf9`
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
- penaltyEnforcement.ts
- GameScreen.tsx
- GameSummaryScreen.tsx
- PlayerScreen.tsx
- ui-ux-pro-max
- generate-favicon.cjs
- SettingsScreen.tsx
- driveResults.ts
- PlayEntryModal.tsx
- 20250101000000_initial_schema.sql
- react
- PregameSetupSheet.tsx
- gameReport.ts
- useProgramContext.tsx
- types.ts
- compilerOptions
- BroadcastIcons.tsx
- HomeBroadcast.tsx
- schema.sql
- Design System Master File
- gameService.ts
- 20260901000000_program_membership_rls.sql
- FlowPreview.tsx
- playEntrySeed.ts
- football-stats-engine/package.json
- csvExport.ts
- RosterScreen.tsx
- core.py
- SeasonStatsScreen.tsx
- ref_node_assert
- UiPreview
- gameFlow.ts
- TaggedPlayer
- Sending auth email through Resend
- football-stats-engine
- seasonReport.ts
- design_system.py
- play_charting
- Auth email templates
- vite-env.d.ts
- AGENTS.md
- play_charting
- GameReportScreen.tsx
- programService.ts
- BoxScoreScreen.tsx
- ScheduleScreen.tsx
- 20260901010000_program_invite_codes.sql
- statsService.ts
- LiveStatsPanel.tsx
- liveVsPostgame.spec.ts
- migration_001_fsa_merge.sql
- vitest
- quarterChange.spec.ts
- HomePreview.tsx
- BM25
- PlayLog.tsx
- Dragon Stats
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
- splitTackleCredit
- gameCompletion.ts
- PlayRecord
- DriveDetails.tsx
- useTheme.ts
- DrivesList.tsx
- looseTags.test.ts
- penaltyStep.test.ts
- YardReel.tsx
- TeamAccess.tsx
- badSnap.test.ts
- kickoffOutOfBounds.ts
- rebuildChain.spec.ts
- PlayerScreen
- manualAudit.spec.ts

## God Nodes (most connected - your core abstractions)
1. `GameScreen()` - 70 edges
2. `react` - 57 edges
3. `isOfflineSupported()` - 36 edges
4. `useProgramContext()` - 31 edges
5. `getDb()` - 31 edges
6. `vitest` - 30 edges
7. `lucide-react` - 29 edges
8. `PlayEntryModal()` - 28 edges
9. `PlayRecord` - 28 edges
10. `supabase` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Architecture notes that aren't obvious` --references--> `rebuildPlaySituations()`  [INFERRED]
  CLAUDE.md → src/services/gameFlow.ts
- `Architecture notes that aren't obvious` --references--> `replayLiveGame()`  [INFERRED]
  CLAUDE.md → src/services/liveGameSession.ts
- `Conventions` --references--> `roleUsesOpponentRoster()`  [INFERRED]
  CLAUDE.md → src/components/game/PlayEntryModal.tsx
- `Architecture notes that aren't obvious` --references--> `isRosterTag()`  [INFERRED]
  CLAUDE.md → src/components/game/types.ts
- `Architecture notes that aren't obvious` --references--> `insertPlay()`  [INFERRED]
  CLAUDE.md → src/services/gameService.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Database Entities** — database_schema, programs_table, seasons_table, players_table, season_rosters_table, opponents_table, games_table, plays_table, play_players_table, game_stats_cache_table [EXTRACTED 1.00]
- **Technology Stack** — dragon_stats_app, react_19, typescript, vite, tailwind_css, supabase, football_stats_engine, pwa [EXTRACTED 1.00]

## Communities (101 total, 22 thin omitted)

### Community 0 - "playTransformer.ts"
Cohesion: 0.21
Nodes (20): getPenaltyEngineCode(), grantsAutoFirstDown(), isOutOfBoundsKickoff(), allTagsForRole(), buildContext(), buildFumble(), buildPenalties(), clampDown() (+12 more)

### Community 1 - "liveGameSession.ts"
Cohesion: 0.17
Nodes (25): createInitialSituation(), getRecordedNextSituation(), normalizeQuarter(), deriveGameState(), buildFumble(), buildPenalties(), buildPlayContext(), createEngine() (+17 more)

### Community 2 - "Database Schema"
Cohesion: 0.10
Nodes (23): Database Schema, Dragon Stats, football-stats-engine, game_stats_cache table, games table, High School Football Play-by-Play Tracking App, NFHS Rules, opponents table (+15 more)

### Community 3 - "offlineDb.ts"
Cohesion: 0.07
Nodes (75): Props, SyncBadge(), SyncDetails(), savePlayAtomic(), updatePlay(), updatePlaySituation(), cachePlay(), cachePlays() (+67 more)

### Community 4 - "DesignSystemGenerator"
Cohesion: 0.16
Nodes (9): DesignSystemGenerator, Select best matching result based on priority keywords., Extract results list from search result dict., Generate complete design system recommendation., Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Execute searches across multiple domains., Find matching reasoning rule for a category. (+1 more)

### Community 5 - "PostGameReview.tsx"
Cohesion: 0.07
Nodes (47): ClockInput(), formatClockValue(), parseClockDigits(), Props, TimeoutEdit, TimeoutEditModal(), findPlayTypeDef(), OpponentPlayerRef (+39 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (40): dependencies, football-stats-engine, idb, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js (+32 more)

### Community 7 - "dangerZone.ts"
Cohesion: 0.33
Nodes (15): DangerZone(), countSeasonData(), deleteGame(), deleteSeason(), deleteUnrosteredPlayers(), fail(), getSeasonGameIds(), ok() (+7 more)

### Community 8 - "penaltyEnforcement.ts"
Cohesion: 0.20
Nodes (12): basicSpot(), clamp(), Enforcement, EnforcementInput, enforcePenalty(), isBehind(), markOff(), PlayKind (+4 more)

### Community 9 - "GameScreen.tsx"
Cohesion: 0.12
Nodes (34): normalizeOppTagId(), readKeepAwake(), useWakeLock(), WakeLockSentinelLike, writeKeepAwake(), applyScoreDelta(), CLOCK_STOPPING_PLAY_TYPES, fieldFlipKey() (+26 more)

### Community 10 - "GameSummaryScreen.tsx"
Cohesion: 0.15
Nodes (11): GameSummaryScreen, Props, SIZES, TeamCrest(), computeFormationStats(), fmt(), FormationBreakdown, GameInfo (+3 more)

### Community 11 - "PlayerScreen.tsx"
Cohesion: 0.19
Nodes (17): PlayerScreen, CareerRow, careerRowFromLines(), CareerSection(), Column, DefenseSection(), fmt(), fmtDate() (+9 more)

### Community 12 - "ui-ux-pro-max"
Cohesion: 0.07
Nodes (29): Accessibility, Available Domains, Available Stacks, Common Rules for Professional UI, Example Workflow, How to Use This Workflow, Icons & Visual Elements, Interaction (+21 more)

### Community 13 - "generate-favicon.cjs"
Cohesion: 0.09
Nodes (31): ref_fs, ref_path, ref_zlib, AXIS, AXIS_FAR, AXIS_ORIGIN, BAR_STOPS, BARS (+23 more)

### Community 14 - "SettingsScreen.tsx"
Cohesion: 0.11
Nodes (21): SettingsScreen, Props, ProgramContext, PROGRAM, SCREENS, SEASON, Props, SettingsScreen() (+13 more)

### Community 15 - "driveResults.ts"
Cohesion: 0.19
Nodes (13): AFTERMATH, classify(), DriveResult, DriveResultPlay, DriveResultValue, LocalDriveResult, possessionRuns(), PUNT_TYPES (+5 more)

### Community 16 - "PlayEntryModal.tsx"
Cohesion: 0.09
Nodes (28): Conventions, FAST_PLAY_IDS, toggleFastTackler(), DIGITS, Keypad(), Props, defaultBlockedKickType(), DEFENSIVE_ROLES (+20 more)

### Community 17 - "20250101000000_initial_schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 18 - "react"
Cohesion: 0.10
Nodes (23): react, react-router-dom, App(), AppRoutes(), GameReportScreen, GameScreen, GameSettingsScreen, JoinTeamScreen (+15 more)

### Community 19 - "PregameSetupSheet.tsx"
Cohesion: 0.15
Nodes (22): src_components_game_pregamesetup, PregameSetupSheet(), Props, Choice(), Layout, palette(), PregameSetupView(), Props (+14 more)

### Community 20 - "gameReport.ts"
Cohesion: 0.13
Nodes (22): avg(), buildGameReport(), conversionText(), dash(), DefensiveRow, GameReport, KickoffRow, labelFor() (+14 more)

### Community 21 - "useProgramContext.tsx"
Cohesion: 0.14
Nodes (25): @supabase/supabase-js, DashboardScreen, SeasonReportScreen, AuthState, Branding, DEFAULT_BRANDING, deriveBranding(), keepIfEqual() (+17 more)

### Community 22 - "types.ts"
Cohesion: 0.10
Nodes (23): BLOCKED_KICK_TYPES, buildDescription(), getPenaltyDefaultSide(), isPenaltyOnOffense(), isSpotFoul(), NFHS_QUARTER_SECS, OFFENSE_PENALTIES, PENALTIES (+15 more)

### Community 23 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 24 - "BroadcastIcons.tsx"
Cohesion: 0.09
Nodes (20): ChevronIcon, ClockIcon, ExternalIcon, EyeIcon, FilmIcon, FlagIcon, GridIcon, IconProps (+12 more)

### Community 25 - "HomeBroadcast.tsx"
Cohesion: 0.18
Nodes (15): abbrOf(), ballSpot(), CHIP, countdown(), Crest(), D6_RANKINGS_URL, daysUntil(), fmtDate() (+7 more)

### Community 26 - "schema.sql"
Cohesion: 0.10
Nodes (39): coaches, game_schedule, game_stats_cache, games, games_updated_at, idx_coaches_season, idx_game_stats_cache_game, idx_game_stats_cache_player (+31 more)

### Community 27 - "Design System Master File"
Cohesion: 0.12
Nodes (16): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Color Palette, Component Specs, Design System Master File, Global Rules (+8 more)

### Community 28 - "gameService.ts"
Cohesion: 0.09
Nodes (32): Architecture notes that aren't obvious, RFC-4122, isRosterTag(), asRecord(), calcTimeOfPossession(), clockToSeconds(), clockToSecs(), CurrentGameStateUpdate (+24 more)

### Community 29 - "20260901000000_program_membership_rls.sql"
Cohesion: 0.15
Nodes (18): public.enrol_program_owner, idx_program_members_user, program_members, programs_enrol_owner, public.is_game_member(), public.is_opponent_member(), public.is_play_member(), public.is_player_member() (+10 more)

### Community 30 - "FlowPreview.tsx"
Cohesion: 0.07
Nodes (35): endZoneLabel(), FieldVisualizer(), FIVE_YARD_LINES, fromWidgetPercent(), Props, toWidgetPercent(), YARD_NUMBERS, FAST_PATH_COLS (+27 more)

### Community 31 - "playEntrySeed.ts"
Cohesion: 0.15
Nodes (11): buildEditSeed(), EditSeed, FieldTeam, FUMBLE_MODIFIER_TYPES, KickOutcome, num(), PenaltyEnforcement, TACKLE_ROLES (+3 more)

### Community 32 - "football-stats-engine/package.json"
Cohesion: 0.12
Nodes (15): _comment, description, devDependencies, tsx, typescript, files, typescript, keywords (+7 more)

### Community 33 - "csvExport.ts"
Cohesion: 0.36
Nodes (8): RFC-4180, csvEscape(), downloadCsv(), ExportGameOptions, exportGameSummaryCsv(), exportPlayerSeasonCsv(), ExportSeasonOptions, rowsToCsv()

### Community 34 - "RosterScreen.tsx"
Cohesion: 0.13
Nodes (23): RosterScreen, PlusIcon, UploadIcon, PendingPlayersSheet(), CLASSIFICATIONS, ImportModal(), POSITIONS, RosterPlayer (+15 more)

### Community 35 - "core.py"
Cohesion: 0.15
Nodes (16): collections, csv, detect_domain(), _load_csv(), Load CSV and return list of dicts, Core search function using BM25, Auto-detect the most relevant domain from query, Main search function with auto-domain detection (+8 more)

### Community 36 - "SeasonStatsScreen.tsx"
Cohesion: 0.12
Nodes (15): SeasonStatsScreen, BroadcastHeader(), Props, BackIcon, src_screens_dashboardscreen_tabbar, AggDefense, AggKicking, AggPassing (+7 more)

### Community 38 - "UiPreview"
Cohesion: 0.33
Nodes (4): clamp(), empty(), UiPreview(), save()

### Community 39 - "gameFlow.ts"
Cohesion: 0.18
Nodes (19): PenaltySide, AdvanceablePlay, advanceSituationAfterPlay(), asRecord(), buildPregameGameUpdate(), clampBallOn(), createKickoffSituation(), DEFAULT_PREGAME (+11 more)

### Community 40 - "TaggedPlayer"
Cohesion: 0.17
Nodes (23): FastPlayEntry(), labels, Props, KneelEntry(), src_components_game_liveentry, PassDefenderPicker(), PlaySubmitData, Props (+15 more)

### Community 41 - "Sending auth email through Resend"
Cohesion: 0.29
Nodes (6): 1. Verify the domain in Resend, 2. Create an API key, 3. Point Supabase at it, 4. Raise the rate limit, 5. Test before you need it, Sending auth email through Resend

### Community 42 - "football-stats-engine"
Cohesion: 0.16
Nodes (11): football-stats-engine, TEAM_PLAYER_ID, BAD_SNAP, summarise(), summary(), kick(), report(), postgameSummary() (+3 more)

### Community 43 - "seasonReport.ts"
Cohesion: 0.23
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

### Community 52 - "GameReportScreen.tsx"
Cohesion: 0.07
Nodes (34): lucide-react, GameHomeLink(), isPendingId(), pendingJerseyFromId(), atTop(), PullToRefresh(), MergeCandidate, Mode (+26 more)

### Community 53 - "programService.ts"
Cohesion: 0.20
Nodes (10): isKickoffDue(), PreviousPlay, Situation, previous, situation, before, play, DEFAULT_GAME_CONFIG (+2 more)

### Community 54 - "BoxScoreScreen.tsx"
Cohesion: 0.11
Nodes (22): BoxScoreScreen, BoxScoreScreen(), fmt(), GameInfo, ourLines(), playerLabel(), QUARTER_COLS, RosterEntry (+14 more)

### Community 55 - "ScheduleScreen.tsx"
Cohesion: 0.18
Nodes (10): ScheduleScreen, ShieldIcon, formatKickoff(), GameRow, ScheduleScreen(), Site, Opponent, OpponentPlayer (+2 more)

### Community 56 - "20260901010000_program_invite_codes.sql"
Cohesion: 0.29
Nodes (4): idx_invite_codes_program, program_invite_codes, auth.users, programs

### Community 57 - "statsService.ts"
Cohesion: 0.15
Nodes (19): calcDefenseStats(), isInsideTwenty(), kickInfoFromDescription(), KickSpots, netKickYards(), num(), resolveKickSpots(), collectOpponentPlayerIds() (+11 more)

### Community 58 - "LiveStatsPanel.tsx"
Cohesion: 0.15
Nodes (10): DefenseTab(), LiveStatsPanel(), noneYet(), OffenseTab(), Props, SpecialTeamsTab(), Tab, TabContainer() (+2 more)

### Community 59 - "liveVsPostgame.spec.ts"
Cohesion: 0.14
Nodes (10): DECLINED_APP, DECLINED_DB, livesummary(), PUNT_APP, PUNT_DB, SHARED_TACKLE_APP, SHARED_TACKLE_DB, Tag (+2 more)

### Community 60 - "migration_001_fsa_merge.sql"
Cohesion: 0.38
Nodes (6): coaches, idx_coaches_season, idx_opponent_players_opponent, opponent_players, opponents, seasons

### Community 61 - "vitest"
Cohesion: 0.17
Nodes (8): ref_node_path, vitest, empty, member, mocks, user, CONFIG, score()

### Community 62 - "quarterChange.spec.ts"
Cohesion: 0.26
Nodes (10): DriveDetails(), quarterLabel(), moveToQuarter(), rebuildPlaySituations(), advanceLiveQuarterState(), createQuarterChange(), quarterChangeBefore(), before (+2 more)

### Community 63 - "HomePreview.tsx"
Cohesion: 0.17
Nodes (9): src_assets_pl_dragon, HomeData, HomeGame, BASE, HomePreview(), LIVE, OPP, PLAYED (+1 more)

### Community 64 - "BM25"
Cohesion: 0.28
Nodes (5): BM25, Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, BM25 ranking algorithm for text search

### Community 65 - "PlayLog.tsx"
Cohesion: 0.24
Nodes (10): FILTERS, KICKING_TYPES, LogFilter, PLAY_ICON_COLORS, PLAY_ICONS, PlayLog(), unitOf(), QuarterChangeRow() (+2 more)

### Community 66 - "Dragon Stats"
Cohesion: 0.50
Nodes (3): Dragon Stats, Gotchas — these have each cost real time, Verify loop

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

### Community 86 - "splitTackleCredit"
Cohesion: 0.28
Nodes (5): CreditTag, splitTackleCredit(), TackleCredit, splitTackles(), Tag

### Community 87 - "gameCompletion.ts"
Cohesion: 0.46
Nodes (5): StatsChip(), isMarkedStatsFinal(), STATS_FINAL_TAG, statsState, statsStateLabel()

### Community 88 - "PlayRecord"
Cohesion: 0.27
Nodes (6): Props, PlayRecord, PendingClockCapture, LiveDriveRow, liveDriveRows(), LiveSessionPlayResult

### Community 89 - "DriveDetails.tsx"
Cohesion: 0.52
Nodes (4): react-dom, OffensivePlayBadge(), PlayTacklers(), RowPlay

### Community 90 - "useTheme.ts"
Cohesion: 0.57
Nodes (6): applyTheme(), ensureTheme(), initialTheme(), useScreenTheme(), useTheme(), FlowPreview()

### Community 91 - "DrivesList.tsx"
Cohesion: 0.40
Nodes (4): DrivesList(), formatFieldPosition(), Props, RESULT_LABEL

### Community 92 - "looseTags.test.ts"
Cohesion: 0.33
Nodes (3): Join, Loose, Play

### Community 93 - "penaltyStep.test.ts"
Cohesion: 0.47
Nodes (4): assertLandsOnPenalty(), buildSteps(), Step, targetIndex()

### Community 94 - "YardReel.tsx"
Cohesion: 0.60
Nodes (4): clampSpot(), Props, yardNumber(), YardReel()

### Community 95 - "TeamAccess.tsx"
Cohesion: 0.50
Nodes (4): expiryLabel(), InviteCode, Props, TeamAccess()

### Community 97 - "kickoffOutOfBounds.ts"
Cohesion: 0.50
Nodes (3): LiveSituation, KICKOFF_OUT_OF_BOUNDS, KickoffOutOfBoundsChoice

### Community 98 - "rebuildChain.spec.ts"
Cohesion: 0.67
Nodes (3): chain(), play(), rebuild()

### Community 99 - "PlayerScreen"
Cohesion: 1.00
Nodes (3): PlayerScreen(), computePlayerCareerStats(), computePlayerSeasonStats()

## Knowledge Gaps
- **366 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+361 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 562 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `GameSummaryScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `PlayEntryModal.tsx`, `PregameSetupSheet.tsx`, `useProgramContext.tsx`, `BroadcastIcons.tsx`, `HomeBroadcast.tsx`, `FlowPreview.tsx`, `RosterScreen.tsx`, `SeasonStatsScreen.tsx`, `TaggedPlayer`, `GameReportScreen.tsx`, `BoxScoreScreen.tsx`, `ScheduleScreen.tsx`, `LiveStatsPanel.tsx`, `HomePreview.tsx`, `PlayLog.tsx`, `TabBar.tsx`, `DriveDetails.tsx`, `useTheme.ts`, `YardReel.tsx`, `TeamAccess.tsx`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `GameReportScreen.tsx` to `offlineDb.ts`, `PostGameReview.tsx`, `package.json`, `dangerZone.ts`, `GameScreen.tsx`, `GameSummaryScreen.tsx`, `PlayerScreen.tsx`, `SettingsScreen.tsx`, `PlayEntryModal.tsx`, `react`, `PregameSetupSheet.tsx`, `FlowPreview.tsx`, `RosterScreen.tsx`, `SeasonStatsScreen.tsx`, `TaggedPlayer`, `BoxScoreScreen.tsx`, `ScheduleScreen.tsx`, `LiveStatsPanel.tsx`, `PlayLog.tsx`, `DriveDetails.tsx`, `TeamAccess.tsx`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `football-stats-engine` connect `football-stats-engine` to `playTransformer.ts`, `csvExport.ts`, `liveGameSession.ts`, `SeasonStatsScreen.tsx`, `manualAudit.spec.ts`, `package.json`, `liveVsPostgame.spec.ts`, `GameSummaryScreen.tsx`, `PlayerScreen.tsx`, `seasonReport.ts`, `driveResults.ts`, `gameReport.ts`, `BoxScoreScreen.tsx`, `PlayRecord`, `statsService.ts`, `LiveStatsPanel.tsx`, `DrivesList.tsx`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameScreen()` (e.g. with `isRosterTag()` and `readKeepAwake()`) actually correct?**
  _`GameScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _366 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.09881422924901186 - nodes in this community are weakly interconnected._
- **Should `offlineDb.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06730506155950752 - nodes in this community are weakly interconnected._