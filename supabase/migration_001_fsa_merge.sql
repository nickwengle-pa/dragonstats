-- ============================================================================
-- FSA → Dragonstats Merger — Phase 1 Migration
-- ============================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds new tables and columns for the FSA feature merge.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- NEW TABLE: coaches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coaches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT DEFAULT 'assistant'
                CHECK (role IN ('head', 'assistant', 'coordinator', 'other')),
  email       TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaches_season ON coaches(season_id);

-- RLS
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON coaches
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- NEW TABLE: opponent_players
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opponent_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opponent_id UUID NOT NULL REFERENCES opponents(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  jersey_number INT,
  position    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opponent_players_opponent ON opponent_players(opponent_id);

-- RLS
ALTER TABLE opponent_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access" ON opponent_players
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- PROGRAMS — add accent_color, wordmark_url
-- (logo_url and secondary_color already exist)
-- ---------------------------------------------------------------------------
ALTER TABLE programs ADD COLUMN IF NOT EXISTS accent_color TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS wordmark_url TEXT;

-- ---------------------------------------------------------------------------
-- OPPONENTS — add notes
-- (secondary_color, logo_url, city, state already exist)
-- ---------------------------------------------------------------------------
ALTER TABLE opponents ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---------------------------------------------------------------------------
-- PLAYERS — add preferred_name
-- ---------------------------------------------------------------------------
ALTER TABLE players ADD COLUMN IF NOT EXISTS preferred_name TEXT;

-- ---------------------------------------------------------------------------
-- SEASON_ROSTERS — add positions array (multi-position support)
-- (height_inches and weight_lbs already exist)
-- ---------------------------------------------------------------------------
ALTER TABLE season_rosters ADD COLUMN IF NOT EXISTS positions TEXT[];

-- ---------------------------------------------------------------------------
-- GAMES — add columns for FSA features
-- (rules_config, notes, is_playoff, playoff_round already exist)
-- ---------------------------------------------------------------------------
ALTER TABLE games ADD COLUMN IF NOT EXISTS kickoff_time TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS site TEXT DEFAULT 'home'
  CHECK (site IN ('home', 'away', 'neutral'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_timeouts INT DEFAULT 3;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_timeouts INT DEFAULT 3;
ALTER TABLE games ADD COLUMN IF NOT EXISTS opening_kickoff_receiver TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_top_seconds INT DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_top_seconds INT DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS home_first_downs INT DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS away_first_downs INT DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS tags TEXT[];

-- ---------------------------------------------------------------------------
-- PLAYS — add end_yard_line, hash_mark, formations, clock times, tags
-- ---------------------------------------------------------------------------
ALTER TABLE plays ADD COLUMN IF NOT EXISTS end_yard_line INT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS hash_mark TEXT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS offensive_formation TEXT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS defensive_formation TEXT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS play_start_time INT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS play_end_time INT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS tags TEXT[];

-- ---------------------------------------------------------------------------
-- PLAY_PLAYERS — add credit for tackle weighting
-- ---------------------------------------------------------------------------
ALTER TABLE play_players ADD COLUMN IF NOT EXISTS credit NUMERIC(3,2);
