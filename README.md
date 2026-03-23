# 🐉 DRAGON STATS

High school football play-by-play tracking and statistics app. Built to replace PressBox Stats and TurboStats with a single tool that does everything — live game entry, real-time stat computation, season/career tracking, and coach-ready reports.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Realtime)
- **Stats Engine**: [football-stats-engine](https://github.com/nickwengle-pa/football-stats-engine) — custom TypeScript library with NFHS rules
- **Target**: PWA (iPad, Surface Pro, phone — any device in the press box)

## Setup

### 1. Clone & install

```bash
git clone https://github.com/nickwengle-pa/dragon-stats.git
cd dragon-stats
npm install
```

### 2. Link the stats engine

Make sure the `football-stats-engine` repo is cloned as a sibling directory and built:

```bash
cd ../football-stats-engine
npm install && npm run build
cd ../dragon-stats
```

The engine is referenced as a `file:` dependency in `package.json`.

### 3. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/schema.sql` to create all tables
3. Go to **Settings → API** and copy your project URL and anon key
4. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

### 4. Enable Auth

In your Supabase dashboard → **Authentication → Providers**, make sure Email is enabled.

### 5. Run it

```bash
npm run dev
```

Open http://localhost:5173

## Project Structure

```
dragon-stats/
├── src/
│   ├── App.tsx               # Routes + auth guard
│   ├── main.tsx              # Entry point
│   ├── index.css             # Tailwind + component classes
│   ├── hooks/
│   │   └── useAuth.ts        # Auth session hook
│   ├── lib/
│   │   └── supabase.ts       # Supabase client
│   ├── services/
│   │   ├── programService.ts # Programs CRUD
│   │   ├── seasonService.ts  # Seasons, players, rosters
│   │   └── gameService.ts    # Games, plays, opponents, play_players
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── DashboardScreen.tsx
│       ├── ScheduleScreen.tsx
│       ├── RosterScreen.tsx
│       ├── GameScreen.tsx      # ← PBP entry (coming next)
│       ├── GameSummaryScreen.tsx
│       ├── PlayerScreen.tsx
│       └── SettingsScreen.tsx
├── supabase/
│   └── schema.sql            # Full database schema
├── public/
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── tsconfig.json
```

## Database Schema

9 tables: `programs`, `seasons`, `players`, `season_rosters`, `opponents`, `games`, `plays`, `play_players`, `game_stats_cache`

Key design decisions:
- **Players persist across seasons** (via `program_id`), linked to each season through `season_rosters`
- **Plays store engine-compatible JSON** in `play_data` (JSONB) for full replay/recomputation
- **Multi-player attribution** via `play_players` junction table (passer + receiver + tackler on one play)
- **Denormalized quick-access fields** on plays (`yards_gained`, `is_touchdown`, etc.) for fast queries without parsing JSON

## Roadmap

- [x] Project scaffold + auth + routing
- [x] Supabase schema (9 tables + indexes + RLS + views)
- [x] Service layer (programs, seasons, players, rosters, games, plays)
- [ ] Game-day PBP entry screen (field viz + tap-to-record + player tagging)
- [ ] Engine integration (real-time stat computation from plays)
- [ ] Game summary with full stat sheet
- [ ] Season stats dashboard
- [ ] Player career stats
- [ ] Excel/PDF export
- [ ] Coach/parent sharing (read-only links)
- [ ] Offline support (service worker + IndexedDB)
- [ ] MaxPreps CSV roster import
