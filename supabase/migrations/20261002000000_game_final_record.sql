-- ============================================================================
-- games.final_snapshot / games.final_history — the official copy of a final
-- ============================================================================
-- Marking a game final wrote the score and a status and kept nothing else, so
-- any later edit silently replaced the final, and a bug in how the game screen
-- re-derives a game could rewrite one nobody touched. Three finished games
-- came back with the wrong score on the game screen that way.
--
-- final_snapshot is the official copy (src/services/finalRecord.ts): the
-- score, every player's line, the team totals and a fingerprint of each play,
-- taken at End Game and replaced only when a change to the finished game is
-- confirmed. final_history keeps every version - the original final and each
-- confirmed change, with what it changed.
--
-- On the games row rather than in a table of their own so they ride the same
-- write-ahead queue as the score and status (saveGamePatch). End Game is
-- usually pressed in a press box, and a separate table would need a second
-- offline path to stay as durable as the final itself.
--
-- IF NOT EXISTS so it is safe to run twice.
-- ============================================================================

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS final_snapshot JSONB;

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS final_history JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_final_history_is_array;

ALTER TABLE games
  ADD CONSTRAINT games_final_history_is_array
  CHECK (jsonb_typeof(final_history) = 'array');

COMMENT ON COLUMN games.final_snapshot IS
  'Official copy of a finished game (finalRecord.ts FinalSnapshot). Null until the game goes final.';
COMMENT ON COLUMN games.final_history IS
  'Every version of the official final, oldest first: the original and each confirmed change.';
