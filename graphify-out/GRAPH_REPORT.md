# Graph Report - D:/APPS/dragonstats  (2026-04-12)

## Corpus Check
- 53 files · ~97,333 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 226 nodes · 297 edges · 26 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Program Administration|Program Administration]]
- [[_COMMUNITY_Game Flow Engine|Game Flow Engine]]
- [[_COMMUNITY_Product And Schema|Product And Schema]]
- [[_COMMUNITY_Stats And Summaries|Stats And Summaries]]
- [[_COMMUNITY_Play Persistence|Play Persistence]]
- [[_COMMUNITY_Play Transformation|Play Transformation]]
- [[_COMMUNITY_Play Entry Modal|Play Entry Modal]]
- [[_COMMUNITY_Play Edit Modal|Play Edit Modal]]
- [[_COMMUNITY_Roster CSV Import|Roster CSV Import]]
- [[_COMMUNITY_Play Type Helpers|Play Type Helpers]]
- [[_COMMUNITY_Live Game Screen|Live Game Screen]]
- [[_COMMUNITY_Player Stat Views|Player Stat Views]]
- [[_COMMUNITY_Schedule Management|Schedule Management]]
- [[_COMMUNITY_Pregame Setup|Pregame Setup]]
- [[_COMMUNITY_Route Protection|Route Protection]]
- [[_COMMUNITY_App Loading State|App Loading State]]
- [[_COMMUNITY_Play Log|Play Log]]
- [[_COMMUNITY_Login Flow|Login Flow]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_App Bootstrap|App Bootstrap]]
- [[_COMMUNITY_Vite Types|Vite Types]]
- [[_COMMUNITY_Field Visualization|Field Visualization]]
- [[_COMMUNITY_Quick Actions|Quick Actions]]
- [[_COMMUNITY_Scoreboard UI|Scoreboard UI]]
- [[_COMMUNITY_Supabase Client|Supabase Client]]

## God Nodes (most connected - your core abstractions)
1. `Supabase` - 22 edges
2. `Database Schema` - 10 edges
3. `Dragon Stats README` - 9 edges
4. `parseMaxPrepsRoster()` - 8 edges
5. `convertPlay()` - 7 edges
6. `football-stats-engine` - 7 edges
7. `oppositeTeam()` - 6 edges
8. `normalizePregameConfig()` - 6 edges
9. `getPregameConfig()` - 6 edges
10. `sumField()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Dragon Stats README` --references--> `Supabase`  [EXTRACTED]
  README.md → README.md  _Bridges community 2 → community 0_
- `Dragon Stats README` --references--> `football-stats-engine`  [EXTRACTED]
  README.md → README.md  _Bridges community 2 → community 3_

## Hyperedges (group relationships)
- **Technology Stack** — dragon_stats_app, react_19, typescript, vite, tailwind_css, supabase, football_stats_engine, pwa [EXTRACTED 1.00]
- **Database Entities** — database_schema, programs_table, seasons_table, players_table, season_rosters_table, opponents_table, games_table, plays_table, play_players_table, game_stats_cache_table [EXTRACTED 1.00]

## Communities

### Community 0 - "Program Administration"
Cohesion: 0.06
Nodes (8): handleDelete(), buildSeasonName(), formatLevel(), formatSeasonName(), Supabase, deriveBranding(), ProgramProvider(), useProgramContext()

### Community 1 - "Game Flow Engine"
Cohesion: 0.16
Nodes (25): advanceSituationAfterPlay(), asRecord(), clampBallOn(), createInitialSituation(), createKickoffSituation(), createSecondHalfSituation(), deriveOpeningKickoffReceiver(), getOffenseDriveDirection() (+17 more)

### Community 2 - "Product And Schema"
Cohesion: 0.11
Nodes (20): Database Schema, Dragon Stats, game_stats_cache table, games table, High School Football Play-by-Play Tracking App, opponents table, play_players table, players table (+12 more)

### Community 3 - "Stats And Summaries"
Cohesion: 0.13
Nodes (8): football-stats-engine, NFHS Rules, computeGameStats(), computePlayerSeasonStats(), initDefStats(), loadGame(), loadRoster(), supplementDefenseStats()

### Community 4 - "Play Persistence"
Cohesion: 0.18
Nodes (5): calcTimeOfPossession(), clockToSeconds(), clockToSecs(), deriveGameState(), fmtSecs()

### Community 5 - "Play Transformation"
Cohesion: 0.3
Nodes (12): buildContext(), buildFumble(), buildPenalties(), clampDown(), clampQuarter(), convertPlay(), firstPlayerByRole(), getOppPlayerId() (+4 more)

### Community 6 - "Play Entry Modal"
Cohesion: 0.21
Nodes (5): canGoNext(), goNext(), handleOpponentSelect(), handlePlayerSelect(), handleQuickAddOpponent()

### Community 7 - "Play Edit Modal"
Cohesion: 0.18
Nodes (2): canGoNext(), goNext()

### Community 8 - "Roster CSV Import"
Cohesion: 0.44
Nodes (9): gradeToClassification(), isHeightValue(), isWeightValue(), normalizeGradeKey(), parseCSVRoster(), parseHeightInches(), parseMaxPrepsRoster(), parseWeight() (+1 more)

### Community 9 - "Play Type Helpers"
Cohesion: 0.25
Nodes (2): getPenaltyDefaultSide(), isPenaltyOnOffense()

### Community 10 - "Live Game Screen"
Cohesion: 0.22
Nodes (0): 

### Community 11 - "Player Stat Views"
Cohesion: 0.33
Nodes (5): DefenseSection(), PassingSection(), ReceivingSection(), RushingSection(), sumField()

### Community 12 - "Schedule Management"
Cohesion: 0.25
Nodes (0): 

### Community 13 - "Pregame Setup"
Cohesion: 0.5
Nodes (0): 

### Community 14 - "Route Protection"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "App Loading State"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Play Log"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Login Flow"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "PostCSS Config"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "App Bootstrap"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Vite Types"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Field Visualization"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Quick Actions"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Scoreboard UI"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Supabase Client"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **12 isolated node(s):** `High School Football Play-by-Play Tracking App`, `PressBox Stats`, `TurboStats`, `React 19`, `TypeScript` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Route Protection`** (2 nodes): `ProtectedRoute()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Loading State`** (2 nodes): `LoadingFallback()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Play Log`** (2 nodes): `quarterLabel()`, `PlayLog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Login Flow`** (2 nodes): `handleSubmit()`, `LoginScreen.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Config`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Bootstrap`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Types`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Field Visualization`** (1 nodes): `FieldVisualizer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Quick Actions`** (1 nodes): `QuickActions.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scoreboard UI`** (1 nodes): `Scoreboard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Supabase Client`** (1 nodes): `supabase.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Supabase` connect `Program Administration` to `Product And Schema`, `Stats And Summaries`, `Play Persistence`, `Live Game Screen`, `Player Stat Views`, `Schedule Management`?**
  _High betweenness centrality (0.276) - this node is a cross-community bridge._
- **Why does `Dragon Stats README` connect `Product And Schema` to `Program Administration`, `Stats And Summaries`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `football-stats-engine` connect `Stats And Summaries` to `Product And Schema`, `Player Stat Views`, `Play Transformation`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **What connects `High School Football Play-by-Play Tracking App`, `PressBox Stats`, `TurboStats` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Program Administration` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Product And Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Stats And Summaries` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._