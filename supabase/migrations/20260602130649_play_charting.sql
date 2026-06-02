-- ============================================================================
-- Film Charting Layer — play_charting table
-- ============================================================================
-- ADDITIVE ONLY. Never touches plays / play_players / games. Each row is an
-- OPTIONAL bundle of film-review detail for one play, keyed by play_id.
-- Safe to re-run: IF NOT EXISTS everywhere + guarded policy create.
-- (Mirrors supabase/migration_003_play_charting.sql, formatted for `db push`.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS play_charting (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id             UUID NOT NULL UNIQUE REFERENCES plays(id) ON DELETE CASCADE,
  game_id             UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
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

DROP TRIGGER IF EXISTS play_charting_updated_at ON play_charting;
CREATE TRIGGER play_charting_updated_at BEFORE UPDATE ON play_charting
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
