-- ============================================================================
-- game_activity - who changed what
-- ============================================================================
-- Once other coaches could record and fix games, an admin had no way to tell
-- who started a game, who pressed End Game, who marked the stats final, or
-- who went back into a finished game and changed a play, the score or a
-- tackle. This is that record, shown to admins and head coaches on the
-- Change Log screen.
--
-- Written by triggers, not by the app, for three reasons:
--   * every path is covered - the game screen, the film chart, post-game
--     review, matching jerseys to players, and whatever a queue replays from
--     an iPad that was offline - without each one having to remember to log;
--   * the app never makes an extra request for it, so recording a live game
--     is exactly as fast as before, and nothing about the log can fail a save
--     (every trigger here swallows its own errors - see the EXCEPTION blocks);
--   * nobody can write, edit or delete log rows from the app. There are no
--     insert, update or delete policies; only these definer triggers write.
--
-- Who: auth.uid() of the request that reached the server. A play recorded
-- offline syncs under whoever is signed in on that iPad when it reconnects,
-- which on a shared iPad may not be the person who tapped it. The email is
-- copied onto the row so a coach who is later removed still has a name.
--
-- What is logged, and what deliberately is not:
--   game_started    status became 'live' (the first play of a game)
--   game_ended      status became 'completed' - End Game
--   game_reopened   a final game went back to not final
--   stats_final     post-game review's "Mark stats final" (the tag)
--   stats_unfinal   that tag taken off again
--   final_changed   the score or official copy of a final game changed;
--                   carries final_history's own list of the stats that moved
--   play_edited     a saved play's result or players changed, before and after
--   play_deleted    a saved play was deleted
--   play_added      a play added to a game that was already final
--   game_deleted    a game was deleted from the schedule
-- Not logged: each new play recorded live (that is the game itself), and the
-- down, distance and spot rewrites the app does to every later play after an
-- edit. Those follow from the play that was edited, which is logged, and
-- listing them would bury it.
--
-- A play edit arrives as up to three statements (the play row, then its
-- player credits deleted and re-inserted - save_play_with_players, or the
-- older separate requests). They are folded into one entry: the first touch
-- in a transaction notes what the play looked like before, and a deferred
-- trigger compares it with how the play stands at commit.
--
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The log
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS game_activity (
  id           BIGSERIAL PRIMARY KEY,
  program_id   UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: deleting a game is itself logged, and that entry
  -- should outlive the game. game_info keeps enough to name it.
  game_id      UUID REFERENCES games(id) ON DELETE SET NULL,
  game_info    JSONB,
  -- No foreign key: a deleted play keeps its entries.
  play_id      UUID,
  play_number  INT,
  action       TEXT NOT NULL CHECK (action IN (
                 'game_started', 'game_ended', 'game_reopened',
                 'stats_final', 'stats_unfinal', 'final_changed',
                 'play_edited', 'play_deleted', 'play_added', 'game_deleted')),
  -- The game's status when it happened: 'completed' means after the final.
  game_status  TEXT,
  actor_id     UUID,
  actor_email  TEXT,
  actor_name   TEXT,
  before       JSONB,
  after        JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_activity_program_time
  ON game_activity (program_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_activity_game_time
  ON game_activity (game_id, created_at DESC);

ALTER TABLE game_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Head coaches read" ON game_activity;
CREATE POLICY "Head coaches read" ON game_activity FOR SELECT
  USING (public.program_rank(program_id) >= 3);

REVOKE ALL ON game_activity FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON game_activity FROM authenticated;
GRANT SELECT ON game_activity TO authenticated;

-- What a play looked like when a transaction first touched it. Rows live for
-- one transaction: the deferred flush below deletes each one at commit, and
-- an aborted transaction takes its rows with it.
CREATE TABLE IF NOT EXISTS game_activity_pending (
  txid         BIGINT NOT NULL,
  play_id      UUID NOT NULL,
  -- NULL: the play was inserted in this transaction.
  before_view  JSONB,
  -- The play row itself was updated, not only its credits.
  play_touched BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (txid, play_id)
);
ALTER TABLE game_activity_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON game_activity_pending FROM anon, authenticated;

-- Credits removed in a request of their own just before the play is deleted
-- (the app deletes a play's credits, then the play, in two requests). Kept so
-- the deleted play's entry can still say who was on it.
CREATE TABLE IF NOT EXISTS game_activity_stash (
  play_id     UUID PRIMARY KEY,
  credits     JSONB NOT NULL,
  stashed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE game_activity_stash ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON game_activity_stash FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Describing a play
-- ----------------------------------------------------------------------------

-- A JSON array in a fixed order, so the same tags in another order compare
-- equal.
CREATE OR REPLACE FUNCTION public.activity_sorted(arr JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN arr IS NULL OR jsonb_typeof(arr) <> 'array' THEN arr
    ELSE (SELECT COALESCE(jsonb_agg(e ORDER BY e::text), '[]'::jsonb) FROM jsonb_array_elements(arr) e)
  END;
$$;

-- Who a play credits, named as they stood at the time. Rostered players come
-- from play_players; opponents, TEAM and unrostered jerseys ride in play_data
-- and are part of the play view instead.
CREATE OR REPLACE FUNCTION public.activity_credits(target_play_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'role', pp.role,
           'player_id', pp.player_id,
           'credit', pp.credit,
           'jersey', sr.jersey_number,
           'name', NULLIF(btrim(concat_ws(' ', COALESCE(NULLIF(p.preferred_name, ''), p.first_name), p.last_name)), '')
         )) ORDER BY pp.role, pp.player_id), '[]'::jsonb)
  FROM play_players pp
  JOIN plays pl ON pl.id = pp.play_id
  JOIN games g ON g.id = pl.game_id
  LEFT JOIN players p ON p.id = pp.player_id
  LEFT JOIN LATERAL (
    SELECT r.jersey_number FROM season_rosters r
    WHERE r.player_id = pp.player_id AND r.season_id = g.season_id
    LIMIT 1
  ) sr ON true
  WHERE pp.play_id = target_play_id;
$$;

-- The parts of a play a coach would call "the play": what happened, for how
-- many yards, the flags and who was credited. Not the situation the app
-- re-derives (down, distance, spot, score caches), which every edit upstream
-- legitimately rewrites. Mirrors playFingerprint in src/services/finalRecord.ts.
CREATE OR REPLACE FUNCTION public.activity_play_view(p plays, credits JSONB)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'n', p.sequence,
    'q', p.quarter,
    'clock', p.clock,
    'type', p.play_type,
    'yards', p.yards_gained,
    'td', p.is_touchdown,
    'turnover', p.is_turnover,
    'penalty', p.is_penalty,
    'desc', p.description,
    'pd', (
      SELECT COALESCE(jsonb_object_agg(key,
               CASE WHEN key IN ('opp_tagged', 'pending_tagged', 'team_tagged')
                    THEN public.activity_sorted(value) ELSE value END), '{}'::jsonb)
      FROM jsonb_each(COALESCE(p.play_data, '{}'::jsonb))
      WHERE value <> 'null'::jsonb AND key IN (
        'result', 'penalty_type', 'penalty_yards', 'play_category', 'penalty_enforcement',
        'penalty_play_counts', 'penalty_down_outcome', 'penalty_enforcement_from',
        'foul_spot_ball_on', 'is_touchback', 'blocked_kick_type', 'kick_outcome',
        'fumble_recovered_at', 'fumble_return_yards', 'interception_return_yards',
        'muff_recovered_by_kicking', 'blocked_recovered_by_kicking', 'kicked_to_yard',
        'return_to_ball_on', 'score_delta', 'score_delta_team', 'bad_snap', 'no_tackle',
        'timeout_team', 'opp_tagged', 'pending_tagged', 'team_tagged')
    ),
    'credits', credits
  ));
$$;

-- What two views must agree on to be the same play: the view minus its
-- number, clock and description (renumbering and the clock move no stat; the
-- description is shown, not compared, since it is rebuilt from the rest).
CREATE OR REPLACE FUNCTION public.activity_compared(v JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT v - 'n' - 'clock' - 'desc';
$$;

CREATE OR REPLACE FUNCTION public.activity_game_info(target_game_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'opponent', o.name,
    'date', g.game_date,
    'is_home', g.is_home
  )
  FROM games g LEFT JOIN opponents o ON o.id = g.opponent_id
  WHERE g.id = target_game_id;
$$;

-- One log row, with the signed-in account filled in.
CREATE OR REPLACE FUNCTION public.activity_write(
  p_program_id UUID,
  p_game_id    UUID,
  p_game_info  JSONB,
  p_play_id    UUID,
  p_play_number INT,
  p_action     TEXT,
  p_status     TEXT,
  p_before     JSONB,
  p_after      JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_name  TEXT;
BEGIN
  IF p_program_id IS NULL THEN RETURN; END IF;
  IF v_uid IS NOT NULL THEN
    SELECT u.email::TEXT,
           NULLIF(btrim(COALESCE(
             u.raw_user_meta_data ->> 'full_name',
             u.raw_user_meta_data ->> 'name',
             u.raw_user_meta_data ->> 'display_name')), '')
      INTO v_email, v_name
      FROM auth.users u WHERE u.id = v_uid;
  END IF;
  INSERT INTO game_activity (
    program_id, game_id, game_info, play_id, play_number, action, game_status,
    actor_id, actor_email, actor_name, before, after
  ) VALUES (
    p_program_id, p_game_id, p_game_info, p_play_id, p_play_number, p_action, p_status,
    v_uid, v_email, v_name, p_before, p_after
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Plays: note the first touch, compare at commit
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activity_touch_play(
  target_play_id UUID,
  play_row plays,
  touched BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO game_activity_pending (txid, play_id, before_view, play_touched)
  VALUES (
    txid_current(), target_play_id,
    CASE WHEN play_row.id IS NULL THEN NULL
         ELSE public.activity_play_view(play_row, public.activity_credits(target_play_id)) END,
    touched
  )
  ON CONFLICT (txid, play_id) DO UPDATE
    SET play_touched = game_activity_pending.play_touched OR EXCLUDED.play_touched
    WHERE touched AND NOT game_activity_pending.play_touched;
END;
$$;

-- plays BEFORE UPDATE: the row as it was, credits not yet replaced.
CREATE OR REPLACE FUNCTION public.activity_plays_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.activity_touch_play(OLD.id, OLD, true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- plays AFTER INSERT: a new play. Nothing to compare it against; the flush
-- logs it only if the game was already final.
CREATE OR REPLACE FUNCTION public.activity_plays_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO game_activity_pending (txid, play_id, before_view, play_touched)
    VALUES (txid_current(), NEW.id, NULL, true)
    ON CONFLICT (txid, play_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- play_players BEFORE anything: the play's credits before this statement's
-- first row changes them. BEFORE, because by an AFTER row trigger the whole
-- statement has already run.
CREATE OR REPLACE FUNCTION public.activity_credits_before()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_play_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.play_id ELSE NEW.play_id END;
  v_play    plays%ROWTYPE;
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM game_activity_pending WHERE txid = txid_current() AND play_id = v_play_id) THEN
      SELECT * INTO v_play FROM plays WHERE id = v_play_id;
      IF FOUND THEN
        PERFORM public.activity_touch_play(v_play_id, v_play, false);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- At commit: how the play stands now against how it stood.
CREATE OR REPLACE FUNCTION public.activity_flush_play()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_play    plays%ROWTYPE;
  v_status  TEXT;
  v_program UUID;
  v_after   JSONB;
BEGIN
  BEGIN
    SELECT * INTO v_play FROM plays WHERE id = NEW.play_id;
    -- Deleted in this transaction: the delete has its own entry.
    IF FOUND THEN
      SELECT g.status, s.program_id INTO v_status, v_program
        FROM games g JOIN seasons s ON s.id = g.season_id WHERE g.id = v_play.game_id;
      v_after := public.activity_play_view(v_play, public.activity_credits(v_play.id));

      IF NEW.before_view IS NULL THEN
        IF v_status = 'completed' THEN
          PERFORM public.activity_write(v_program, v_play.game_id, public.activity_game_info(v_play.game_id),
            v_play.id, v_play.sequence, 'play_added', v_status, NULL, v_after);
        END IF;
      ELSIF public.activity_compared(NEW.before_view) IS DISTINCT FROM public.activity_compared(v_after) THEN
        IF NOT NEW.play_touched
           AND jsonb_array_length(COALESCE(v_after -> 'credits', '[]'::jsonb)) = 0
           AND jsonb_array_length(COALESCE(NEW.before_view -> 'credits', '[]'::jsonb)) > 0 THEN
          -- Every credit removed and the play itself untouched: the first of
          -- the two requests that delete a play. Hold the names for its entry.
          INSERT INTO game_activity_stash (play_id, credits)
          VALUES (v_play.id, NEW.before_view -> 'credits')
          ON CONFLICT (play_id) DO UPDATE SET credits = EXCLUDED.credits, stashed_at = now();
        ELSE
          PERFORM public.activity_write(v_program, v_play.game_id, public.activity_game_info(v_play.game_id),
            v_play.id, v_play.sequence, 'play_edited', v_status, NEW.before_view, v_after);
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  DELETE FROM game_activity_pending WHERE txid = NEW.txid AND play_id = NEW.play_id;
  RETURN NULL;
END;
$$;

-- plays BEFORE DELETE: credits are still there if they go by cascade.
CREATE OR REPLACE FUNCTION public.activity_plays_before_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status  TEXT;
  v_program UUID;
  v_credits JSONB;
  v_stashed JSONB;
BEGIN
  BEGIN
    SELECT g.status, s.program_id INTO v_status, v_program
      FROM games g JOIN seasons s ON s.id = g.season_id WHERE g.id = OLD.game_id;
    -- No game: the game itself is being deleted, which is one entry, not one
    -- per play.
    IF FOUND THEN
      DELETE FROM game_activity_stash WHERE play_id = OLD.id RETURNING credits INTO v_stashed;
      v_credits := public.activity_credits(OLD.id);
      IF jsonb_array_length(v_credits) = 0 AND v_stashed IS NOT NULL THEN
        v_credits := v_stashed;
      END IF;
      PERFORM public.activity_write(v_program, OLD.game_id, public.activity_game_info(OLD.game_id),
        OLD.id, OLD.sequence, 'play_deleted', v_status,
        public.activity_play_view(OLD, v_credits), NULL);
    END IF;
    -- Stashes that never met their delete (a refused one) are not kept.
    DELETE FROM game_activity_stash WHERE stashed_at < now() - interval '1 day';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS plays_activity_before_update ON plays;
CREATE TRIGGER plays_activity_before_update
  BEFORE UPDATE ON plays
  FOR EACH ROW EXECUTE FUNCTION public.activity_plays_before_update();

DROP TRIGGER IF EXISTS plays_activity_after_insert ON plays;
CREATE TRIGGER plays_activity_after_insert
  AFTER INSERT ON plays
  FOR EACH ROW EXECUTE FUNCTION public.activity_plays_after_insert();

DROP TRIGGER IF EXISTS plays_activity_before_delete ON plays;
CREATE TRIGGER plays_activity_before_delete
  BEFORE DELETE ON plays
  FOR EACH ROW EXECUTE FUNCTION public.activity_plays_before_delete();

DROP TRIGGER IF EXISTS play_players_activity_before ON play_players;
CREATE TRIGGER play_players_activity_before
  BEFORE INSERT OR UPDATE OR DELETE ON play_players
  FOR EACH ROW EXECUTE FUNCTION public.activity_credits_before();

DROP TRIGGER IF EXISTS game_activity_pending_flush ON game_activity_pending;
CREATE CONSTRAINT TRIGGER game_activity_pending_flush
  AFTER INSERT ON game_activity_pending
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.activity_flush_play();

-- ----------------------------------------------------------------------------
-- 4. Games: start, End Game, stats final, changes to a final
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activity_games_after_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_program   UUID;
  v_info      JSONB;
  v_old_score JSONB := jsonb_build_object('us', OLD.our_score, 'them', OLD.opponent_score);
  v_new_score JSONB := jsonb_build_object('us', NEW.our_score, 'them', NEW.opponent_score);
  v_was_final BOOLEAN := COALESCE(OLD.status, '') = 'completed';
  v_is_final  BOOLEAN := COALESCE(NEW.status, '') = 'completed';
  v_old_tag   BOOLEAN := COALESCE('stats_final' = ANY(OLD.tags), false);
  v_new_tag   BOOLEAN := COALESCE('stats_final' = ANY(NEW.tags), false);
  v_old_len   INT := CASE WHEN jsonb_typeof(OLD.final_history) = 'array' THEN jsonb_array_length(OLD.final_history) ELSE 0 END;
  v_new_len   INT := CASE WHEN jsonb_typeof(NEW.final_history) = 'array' THEN jsonb_array_length(NEW.final_history) ELSE 0 END;
  v_entry     JSONB;
BEGIN
  -- The live clock and situation are written on almost every play; leave
  -- those updates before doing any work.
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.tags IS NOT DISTINCT FROM NEW.tags
     AND OLD.our_score IS NOT DISTINCT FROM NEW.our_score
     AND OLD.opponent_score IS NOT DISTINCT FROM NEW.opponent_score
     AND v_old_len = v_new_len THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_program := public.season_program(NEW.season_id);
    v_info := public.activity_game_info(NEW.id);
    -- The newest version of the official final, when this update added one.
    IF v_new_len > v_old_len THEN
      v_entry := NEW.final_history -> (v_new_len - 1);
    END IF;

    IF NEW.status = 'live' AND COALESCE(OLD.status, '') NOT IN ('live', 'completed') THEN
      PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'game_started', NEW.status,
        NULL, v_new_score);
    END IF;

    IF v_is_final AND NOT v_was_final THEN
      PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'game_ended', NEW.status,
        v_old_score, v_new_score);
    ELSIF v_was_final AND NOT v_is_final THEN
      PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'game_reopened', NEW.status,
        v_old_score, v_new_score);
    END IF;

    IF v_new_tag AND NOT v_old_tag THEN
      PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'stats_final', NEW.status,
        v_old_score, v_new_score || jsonb_build_object('entry', v_entry));
    ELSIF v_old_tag AND NOT v_new_tag THEN
      PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'stats_unfinal', NEW.status,
        NULL, v_new_score);
    ELSIF v_was_final AND v_is_final
      AND (v_old_score IS DISTINCT FROM v_new_score
           OR COALESCE(v_entry ->> 'source', '') IN ('change', 'accepted')) THEN
      -- A 'recorded' entry is the app taking a first official copy of an old
      -- final that already adds up - no change, nothing to log.
      PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'final_changed', NEW.status,
        v_old_score, v_new_score || jsonb_build_object('entry', v_entry));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.activity_games_before_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_program UUID;
BEGIN
  BEGIN
    -- No season: a whole season is going (Danger Zone), not one game.
    SELECT program_id INTO v_program FROM seasons WHERE id = OLD.season_id;
    IF FOUND THEN
      PERFORM public.activity_write(v_program, NULL, public.activity_game_info(OLD.id),
        NULL, NULL, 'game_deleted', OLD.status,
        jsonb_build_object('us', OLD.our_score, 'them', OLD.opponent_score,
                           'game_id', OLD.id,
                           'plays', (SELECT count(*) FROM plays WHERE game_id = OLD.id)),
        NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS games_activity_after_update ON games;
CREATE TRIGGER games_activity_after_update
  AFTER UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION public.activity_games_after_update();

DROP TRIGGER IF EXISTS games_activity_before_delete ON games;
CREATE TRIGGER games_activity_before_delete
  BEFORE DELETE ON games
  FOR EACH ROW EXECUTE FUNCTION public.activity_games_before_delete();

-- Internal: called by the triggers above, never by the app.
REVOKE ALL ON FUNCTION public.activity_sorted(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_credits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_play_view(plays, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_compared(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_game_info(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_write(UUID, UUID, JSONB, UUID, INT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_touch_play(UUID, plays, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_plays_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_plays_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_credits_before() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_flush_play() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_plays_before_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_games_after_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_games_before_delete() FROM PUBLIC, anon, authenticated;
