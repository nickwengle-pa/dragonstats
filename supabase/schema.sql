-- ============================================================================
-- DRAGON STATS — Supabase Schema
-- ============================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- This creates all tables, indexes, and RLS policies.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROGRAMS (your school / organization)
-- ---------------------------------------------------------------------------
CREATE TABLE programs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                    -- "Lincoln High School"
  abbreviation  TEXT NOT NULL,                    -- "LHS"
  mascot        TEXT,                             -- "Dragons"
  primary_color TEXT DEFAULT '#dc2626',
  secondary_color TEXT DEFAULT '#f59e0b',
  accent_color  TEXT,                             -- tertiary accent color
  logo_url      TEXT,
  wordmark_url  TEXT,                             -- team wordmark/logotype image
  city          TEXT,
  state         TEXT DEFAULT 'PA',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  owner_id      UUID REFERENCES auth.users(id)   -- who created this program
);

-- ---------------------------------------------------------------------------
-- 2. SEASONS
-- ---------------------------------------------------------------------------
CREATE TABLE seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  year        INT NOT NULL,                       -- 2025
  name        TEXT,                                -- "2025 Varsity", "2025 JV"
  level       TEXT DEFAULT 'varsity',              -- varsity, jv, freshman
  is_active   BOOLEAN DEFAULT true,
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, year, level)
);

-- ---------------------------------------------------------------------------
-- 3. PLAYERS (persist across seasons via program_id)
-- ---------------------------------------------------------------------------
CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  preferred_name  TEXT,                            -- nickname / goes-by name
  graduation_year INT,                            -- 2026, 2027, etc.
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. SEASON ROSTERS (links players to specific seasons with that year's info)
-- ---------------------------------------------------------------------------
CREATE TABLE season_rosters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  jersey_number INT,
  position      TEXT,                             -- QB, RB, WR, etc.
  classification TEXT,                            -- FR, SO, JR, SR
  is_active     BOOLEAN DEFAULT true,
  height_inches INT,
  weight_lbs    INT,
  positions     TEXT[],                           -- multi-position array ["QB","WR"]
  UNIQUE(season_id, player_id)
);

-- ---------------------------------------------------------------------------
-- 5. OPPONENTS
-- ---------------------------------------------------------------------------
CREATE TABLE opponents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                   -- "Central Tigers"
  abbreviation    TEXT,                            -- "CTI"
  mascot          TEXT,
  primary_color   TEXT DEFAULT '#6b7280',
  secondary_color TEXT,
  logo_url        TEXT,
  city            TEXT,
  state           TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. GAMES
-- ---------------------------------------------------------------------------
CREATE TABLE games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  opponent_id     UUID NOT NULL REFERENCES opponents(id),
  game_date       TIMESTAMPTZ NOT NULL,
  location        TEXT,                            -- "Home", "Away", or venue name
  is_home         BOOLEAN DEFAULT true,
  status          TEXT DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  -- Scores
  our_score       INT DEFAULT 0,
  opponent_score  INT DEFAULT 0,
  -- Game state (for live tracking)
  current_quarter INT DEFAULT 1,
  current_clock   TEXT DEFAULT '12:00',
  current_down    INT DEFAULT 1,
  current_distance INT DEFAULT 10,
  current_yard_line INT DEFAULT 20,
  current_possession TEXT DEFAULT 'us',            -- 'us' or 'them'
  -- Config
  rules_config    JSONB DEFAULT '{"quarterLengthMinutes": 12, "level": "high_school"}'::jsonb,
  -- Extended fields (FSA merge)
  kickoff_time    TEXT,                            -- separate from game_date
  site            TEXT DEFAULT 'home'
                    CHECK (site IN ('home', 'away', 'neutral')),
  direction       TEXT,                            -- left-to-right / right-to-left
  home_timeouts   INT DEFAULT 3,
  away_timeouts   INT DEFAULT 3,
  opening_kickoff_receiver TEXT,
  home_top_seconds INT DEFAULT 0,
  away_top_seconds INT DEFAULT 0,
  home_first_downs INT DEFAULT 0,
  away_first_downs INT DEFAULT 0,
  -- Metadata
  notes           TEXT,
  is_playoff      BOOLEAN DEFAULT false,
  playoff_round   TEXT,
  tags            TEXT[],
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. PLAYS (the core — each row is one play-by-play entry)
-- ---------------------------------------------------------------------------
CREATE TABLE plays (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sequence        INT NOT NULL,                    -- play order within the game
  -- Context (when/where)
  quarter         INT NOT NULL,
  clock           TEXT,                            -- "11:42"
  down            INT,
  distance        INT,
  yard_line       INT,
  possession      TEXT NOT NULL CHECK (possession IN ('us', 'them')),
  drive_number    INT,
  -- Play classification
  play_type       TEXT NOT NULL,                   -- maps to engine PlayType
  -- Full play data (engine-compatible JSON)
  play_data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Quick-access fields (denormalized from play_data for easy queries)
  yards_gained    INT DEFAULT 0,
  is_touchdown    BOOLEAN DEFAULT false,
  is_turnover     BOOLEAN DEFAULT false,
  is_penalty      BOOLEAN DEFAULT false,
  -- Primary player (for quick lookups — full attribution is in play_data)
  primary_player_id UUID REFERENCES players(id),
  -- Extended fields (FSA merge)
  end_yard_line   INT,                            -- where the play ended
  hash_mark       TEXT,                           -- left/middle/right
  offensive_formation TEXT,                        -- I-Form, Shotgun, Pistol, etc.
  defensive_formation TEXT,                        -- 4-3, 3-4, Nickel, etc.
  play_start_time INT,                            -- clock seconds at snap
  play_end_time   INT,                            -- clock seconds at whistle
  tags            TEXT[],
  -- Description (human-readable)
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. PLAY PLAYERS (many-to-many: which players were involved in each play)
-- ---------------------------------------------------------------------------
CREATE TABLE play_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id     UUID NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,                       -- 'passer', 'rusher', 'receiver', 'tackler', 'target', 'kicker', 'punter', 'returner', 'forced_fumble', 'fumble_recovery', 'interceptor', 'sacker', 'penalty'
  credit      NUMERIC(3,2),                       -- tackle weighting: 1.0 solo, 0.5 shared
  UNIQUE(play_id, player_id, role)
);

-- ---------------------------------------------------------------------------
-- 9. COMPUTED GAME STATS (cached after engine runs — optional optimization)
-- ---------------------------------------------------------------------------
CREATE TABLE game_stats_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id   UUID REFERENCES players(id) ON DELETE CASCADE,
  stat_type   TEXT NOT NULL,                       -- 'passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting', 'returns', 'penalties'
  stats       JSONB NOT NULL,                      -- the full stat object from the engine
  is_team     BOOLEAN DEFAULT false,               -- true = team-level stats (player_id is null)
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, player_id, stat_type)
);

-- ---------------------------------------------------------------------------
-- 10. COACHES (per-season coaching staff)
-- ---------------------------------------------------------------------------
CREATE TABLE coaches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT DEFAULT 'assistant'
                CHECK (role IN ('head', 'assistant', 'coordinator', 'other')),
  email       TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 11. OPPONENT PLAYERS (rosters for opponent teams)
-- ---------------------------------------------------------------------------
CREATE TABLE opponent_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opponent_id UUID NOT NULL REFERENCES opponents(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  jersey_number INT,
  position    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX idx_seasons_program ON seasons(program_id);
CREATE INDEX idx_players_program ON players(program_id);
CREATE INDEX idx_season_rosters_season ON season_rosters(season_id);
CREATE INDEX idx_season_rosters_player ON season_rosters(player_id);
CREATE INDEX idx_opponents_program ON opponents(program_id);
CREATE INDEX idx_games_season ON games(season_id);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_plays_game ON plays(game_id);
CREATE INDEX idx_plays_game_seq ON plays(game_id, sequence);
CREATE INDEX idx_plays_primary_player ON plays(primary_player_id);
CREATE INDEX idx_plays_type ON plays(play_type);
CREATE INDEX idx_plays_touchdown ON plays(game_id) WHERE is_touchdown = true;
CREATE INDEX idx_play_players_play ON play_players(play_id);
CREATE INDEX idx_play_players_player ON play_players(player_id);
CREATE INDEX idx_play_players_role ON play_players(role);
CREATE INDEX idx_game_stats_cache_game ON game_stats_cache(game_id);
CREATE INDEX idx_game_stats_cache_player ON game_stats_cache(player_id);
CREATE INDEX idx_coaches_season ON coaches(season_id);
CREATE INDEX idx_opponent_players_opponent ON opponent_players(opponent_id);

-- JSONB index on play_data for querying into the engine payload
CREATE INDEX idx_plays_play_data ON plays USING gin(play_data);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE opponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_stats_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE opponent_players ENABLE ROW LEVEL SECURITY;

-- For now: authenticated users can do everything (tighten later)
CREATE POLICY "Authenticated users full access" ON programs
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON seasons
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON players
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON season_rosters
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON opponents
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON games
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON plays
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON play_players
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON game_stats_cache
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON coaches
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users full access" ON opponent_players
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- HELPER: Update updated_at timestamp
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER programs_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- USEFUL VIEWS
-- ---------------------------------------------------------------------------

-- Season schedule with opponent info
CREATE VIEW game_schedule AS
SELECT
  g.*,
  o.name AS opponent_name,
  o.abbreviation AS opponent_abbrev,
  o.mascot AS opponent_mascot,
  o.primary_color AS opponent_color,
  s.year AS season_year,
  s.level AS season_level
FROM games g
JOIN opponents o ON g.opponent_id = o.id
JOIN seasons s ON g.season_id = s.id
ORDER BY g.game_date;

-- Player season stats (quick aggregation from plays)
CREATE VIEW player_season_summary AS
SELECT
  sr.player_id,
  p.first_name,
  p.last_name,
  sr.jersey_number,
  sr.position,
  s.id AS season_id,
  s.year AS season_year,
  COUNT(DISTINCT pp.play_id) AS total_plays_involved,
  COUNT(DISTINCT pp.play_id) FILTER (WHERE pp.role = 'rusher') AS rush_plays,
  COUNT(DISTINCT pp.play_id) FILTER (WHERE pp.role = 'passer') AS pass_plays,
  COUNT(DISTINCT pp.play_id) FILTER (WHERE pp.role = 'receiver') AS reception_plays,
  COUNT(DISTINCT pp.play_id) FILTER (WHERE pp.role = 'tackler') AS tackle_plays
FROM season_rosters sr
JOIN players p ON sr.player_id = p.id
JOIN seasons s ON sr.season_id = s.id
LEFT JOIN play_players pp ON pp.player_id = sr.player_id
LEFT JOIN plays pl ON pp.play_id = pl.id
LEFT JOIN games g ON pl.game_id = g.id AND g.season_id = s.id
GROUP BY sr.player_id, p.first_name, p.last_name, sr.jersey_number, sr.position, s.id, s.year;
