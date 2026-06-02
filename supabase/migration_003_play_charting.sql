-- ============================================================================
-- DRAGON STATS — Film Charting Layer (Phase 3 Migration)
-- ============================================================================
-- Run ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--
-- This is ADDITIVE ONLY. It never touches `plays`, `play_players`, or `games`,
-- and the live GameScreen workflow is completely unaffected. Each row is an
-- OPTIONAL bundle of film-review detail for one play, keyed by play_id, filled
-- in after the game during film charting.
--
-- Safe to re-run: IF NOT EXISTS everywhere + a guarded policy create.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- NEW TABLE: play_charting  (one optional film-review row per play)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS play_charting (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id             UUID NOT NULL UNIQUE REFERENCES plays(id) ON DELETE CASCADE,
  game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  -- Film-room detail (all optional — added during review, never required)
  hash_mark           TEXT,        -- left / middle / right
  personnel           TEXT,        -- offensive personnel grouping, e.g. "11", "21"
  offensive_formation TEXT,        -- film-verified offensive formation
  defensive_formation TEXT,        -- defensive front / look
  motion              TEXT,        -- shift / trade / motion notes
  play_call           TEXT,        -- the called play, e.g. "Power Right"
  passer              TEXT,        -- free-text passer label, e.g. "#7 QB"
  receiver            TEXT,        -- free-text target / receiver label
  tags                TEXT[],      -- film tags
  notes               TEXT,        -- free-form coaching notes
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_play_charting_game ON play_charting(game_id);
CREATE INDEX IF NOT EXISTS idx_play_charting_play ON play_charting(play_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — mirror the rest of the schema
-- ---------------------------------------------------------------------------
ALTER TABLE play_charting ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'play_charting'
      AND policyname = 'Authenticated users full access'
  ) THEN
    CREATE POLICY "Authenticated users full access" ON play_charting
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses update_updated_at() from schema.sql)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS play_charting_updated_at ON play_charting;
CREATE TRIGGER play_charting_updated_at BEFORE UPDATE ON play_charting
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
