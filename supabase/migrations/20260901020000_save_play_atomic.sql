-- ============================================================================
-- save_play_with_players — one play and its credits, or neither
-- ============================================================================
-- Writing a play took three separate requests: upsert the play, delete its
-- attributions, insert the new ones. Any of them could be the last one to
-- succeed, which produced a play on the server with no credits, or with a
-- previous edit's credits still attached. Worse, the delete's error was
-- discarded entirely, so a refused delete was followed by an insert that
-- duplicated every tag.
--
-- One function, one transaction. Either the play and its credits are both
-- right or nothing moved.
--
-- SECURITY INVOKER on purpose: the caller's RLS decides what they may write,
-- exactly as it does for the direct table writes this replaces. Making it a
-- definer would hand every caller the ability to write any program's plays.
--
-- Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_play_with_players(
  p_play    JSONB,
  -- NULL means "leave the credits alone" — a situation-only patch such as a
  -- down/spot correction must not wipe who was involved in the play. An array
  -- (including an empty one) means "these are now the credits".
  p_players JSONB DEFAULT NULL
)
RETURNS plays
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  -- v_ prefixes are not decoration: an unprefixed `play_id` shadows
  -- play_players.play_id, and the DELETE below then compares the column to
  -- itself and silently matches every row in the table.
  v_play_id  UUID;
  v_existing plays%ROWTYPE;
  v_merged   plays%ROWTYPE;
  v_saved    plays%ROWTYPE;
BEGIN
  v_play_id := (p_play ->> 'id')::UUID;
  IF v_play_id IS NULL THEN
    RAISE EXCEPTION 'save_play_with_players requires an id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM plays WHERE id = v_play_id;

  /* Merge the payload over whatever is already there. This is what lets one
     function serve both a full insert and a partial patch: keys absent from
     p_play keep their existing values, and on a fresh row they fall back to
     the column defaults. */
  IF FOUND THEN
    v_merged := jsonb_populate_record(v_existing, p_play);
  ELSE
    v_merged := jsonb_populate_record(NULL::plays, p_play);
  END IF;

  INSERT INTO plays (
    id, game_id, sequence, quarter, clock, down, distance, yard_line,
    possession, drive_number, play_type, play_data, yards_gained,
    is_touchdown, is_turnover, is_penalty, primary_player_id, end_yard_line,
    hash_mark, offensive_formation, defensive_formation, play_start_time,
    play_end_time, tags, description
  )
  VALUES (
    v_merged.id, v_merged.game_id, v_merged.sequence, v_merged.quarter, v_merged.clock,
    v_merged.down, v_merged.distance, v_merged.yard_line, v_merged.possession,
    v_merged.drive_number, v_merged.play_type, COALESCE(v_merged.play_data, '{}'::jsonb),
    v_merged.yards_gained, v_merged.is_touchdown, v_merged.is_turnover,
    v_merged.is_penalty, v_merged.primary_player_id, v_merged.end_yard_line,
    v_merged.hash_mark, v_merged.offensive_formation, v_merged.defensive_formation,
    v_merged.play_start_time, v_merged.play_end_time, v_merged.tags, v_merged.description
  )
  ON CONFLICT (id) DO UPDATE SET
    game_id             = EXCLUDED.game_id,
    sequence            = EXCLUDED.sequence,
    quarter             = EXCLUDED.quarter,
    clock               = EXCLUDED.clock,
    down                = EXCLUDED.down,
    distance            = EXCLUDED.distance,
    yard_line           = EXCLUDED.yard_line,
    possession          = EXCLUDED.possession,
    drive_number        = EXCLUDED.drive_number,
    play_type           = EXCLUDED.play_type,
    play_data           = EXCLUDED.play_data,
    yards_gained        = EXCLUDED.yards_gained,
    is_touchdown        = EXCLUDED.is_touchdown,
    is_turnover         = EXCLUDED.is_turnover,
    is_penalty          = EXCLUDED.is_penalty,
    primary_player_id   = EXCLUDED.primary_player_id,
    end_yard_line       = EXCLUDED.end_yard_line,
    hash_mark           = EXCLUDED.hash_mark,
    offensive_formation = EXCLUDED.offensive_formation,
    defensive_formation = EXCLUDED.defensive_formation,
    play_start_time     = EXCLUDED.play_start_time,
    play_end_time       = EXCLUDED.play_end_time,
    tags                = EXCLUDED.tags,
    description         = EXCLUDED.description
  RETURNING * INTO v_saved;

  /* Replace the credits wholesale when a set was supplied. Delete-then-insert
     inside the transaction, so a refused delete aborts the whole thing rather
     than being followed by an insert that duplicates the tags — which is
     precisely what the discarded delete error used to allow. */
  IF p_players IS NOT NULL THEN
    DELETE FROM play_players WHERE play_players.play_id = v_saved.id;

    IF jsonb_array_length(p_players) > 0 THEN
      INSERT INTO play_players (play_id, player_id, role, credit)
      SELECT
        v_saved.id,
        (row_value ->> 'player_id')::UUID,
        row_value ->> 'role',
        (row_value ->> 'credit')::NUMERIC
      FROM jsonb_array_elements(p_players) AS row_value;
    END IF;
  END IF;

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_play_with_players(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_play_with_players(JSONB, JSONB) TO authenticated;
