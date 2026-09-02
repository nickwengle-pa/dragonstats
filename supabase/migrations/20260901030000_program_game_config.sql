-- ============================================================================
-- programs.game_config — the column the app has been writing to all along
-- ============================================================================
-- Game Settings writes `programs.game_config`, and no schema file or migration
-- ever created the column. The write failed every time, its error was
-- discarded, and the screen said "Saved!" regardless — so quarter length,
-- kickoff spot, touchback line, PAT distance and the rest silently fell back
-- to the defaults on every read.
--
-- JSONB rather than columns because these are rules that vary by level and by
-- season, and the app already treats them as one object with defaults merged
-- underneath (getGameConfig). NOT NULL with a default so a program row that
-- predates this reads as "no overrides" rather than as null.
--
-- IF NOT EXISTS: production may have had this added by hand at some point, and
-- this has to be safe either way.
-- ============================================================================

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS game_config JSONB NOT NULL DEFAULT '{}'::jsonb;

/* Guard against a value that is not an object. Anything the app merges over
   DEFAULT_GAME_CONFIG has to be key/value, and an array or a bare string would
   spread into nonsense rather than failing loudly. */
ALTER TABLE programs
  DROP CONSTRAINT IF EXISTS programs_game_config_is_object;

ALTER TABLE programs
  ADD CONSTRAINT programs_game_config_is_object
  CHECK (jsonb_typeof(game_config) = 'object');

COMMENT ON COLUMN programs.game_config IS
  'Rule overrides merged over DEFAULT_GAME_CONFIG in programService.getGameConfig. Empty object means "all defaults".';
