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
--     is as fast as before, and nothing about the log can fail a save (every
--     trigger here swallows its own errors - see the EXCEPTION blocks);
--   * nobody can write, edit or delete log rows from the app. There are no
--     insert, update or delete policies; only these definer triggers write.
--
-- Who: auth.uid() of the request that reached the server. A play recorded
-- offline syncs under whoever is signed in on that iPad when it reconnects,
-- which on a shared iPad may not be the person who tapped it. The email is
-- copied onto the row so a coach who is later removed still has a name.
--
-- What is logged, and what deliberately is not:
--   game_started    the game's first move to 'live' - or straight to final,
--                   which is how a game recorded with no signal arrives (the
--                   offline queue merges its game patches into one)
--   game_ended      status became 'completed' - End Game
--   game_reopened   a final game went back to not final
--   stats_final     post-game review's "Mark stats final", with the list of
--                   stats it locked in (the official copy's history entry)
--   stats_unfinal   that taken off again
--   final_changed   the score or official copy of a final game changed;
--                   carries final_history's own list of the stats that moved
--   play_edited     a saved play's result, players or hand-set start changed
--   play_deleted    a saved play was deleted, with who was credited on it
--   play_added      a play added to a game that was already final
--   game_deleted    a game was deleted from the schedule
-- Not logged: each new play recorded live (that is the game itself), and the
-- down, distance and spot rewrites the app does to every later play after an
-- edit. Those follow from the play that was edited, which is logged, and
-- listing them would bury it. A next spot set by hand is not compared either:
-- an edit upstream legitimately carries it along.
--
-- A play edit can arrive as several statements, and as several requests (the
-- play row, then its credits; or matching a jersey: the credit, then the
-- play). Within a request the first touch notes what the play looked like
-- and a deferred trigger compares it with how the play stands at commit.
-- Across requests, a change by the same person to the same play within two
-- minutes folds into their previous entry, so one action reads as one entry.
--
-- Safe to re-run. lock_timeout makes a paste during a game give up instead of
-- holding up the app behind a long read.
-- ============================================================================

SET lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- 1. The log
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS game_activity (
  id           BIGSERIAL PRIMARY KEY,
  program_id   UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: deleting a game is itself logged, and that entry
  -- should outlive the game. game_info keeps enough to name it, its id too.
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
  ON game_activity (program_id, id DESC);
CREATE INDEX IF NOT EXISTS game_activity_game_time
  ON game_activity (game_id, id DESC);
CREATE INDEX IF NOT EXISTS game_activity_play
  ON game_activity (play_id, id DESC) WHERE play_id IS NOT NULL;

ALTER TABLE game_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Head coaches read" ON game_activity;
CREATE POLICY "Head coaches read" ON game_activity FOR SELECT
  USING (public.program_rank(program_id) >= 3);

-- Supabase hands every new table and sequence to anon and authenticated.
-- Reading is all the app may do; a setval() on the sequence would stop the
-- log silently, so that goes too.
REVOKE ALL ON game_activity FROM anon, authenticated;
GRANT SELECT ON game_activity TO authenticated;
REVOKE ALL ON SEQUENCE game_activity_id_seq FROM anon, authenticated;

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

-- A play's credits all removed in a request of their own. That is logged as an
-- edit straight away, and is also how the app deletes a play (credits, then
-- the play, in two requests) - so if the play's delete follows, the edit
-- becomes the one "deleted" entry, with the names it had.
CREATE TABLE IF NOT EXISTS game_activity_stash (
  play_id     UUID PRIMARY KEY,
  credits     JSONB NOT NULL,
  stashed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE game_activity_stash ADD COLUMN IF NOT EXISTS entry_id BIGINT;
ALTER TABLE game_activity_stash ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON game_activity_stash FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Describing a play
-- ----------------------------------------------------------------------------

-- A credit weight in one spelling: 1, 1.0 and 1.00 are the same credit.
CREATE OR REPLACE FUNCTION public.activity_credit(v JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(v) = 'number' THEN to_jsonb(trim_scale((v #>> '{}')::numeric)) END;
$$;

-- The tags that ride in play_data (opponents, unrostered jerseys, TEAM), down
-- to what names a credit: role, weight, jersey and, for an opponent, a name.
-- Ids and flags are left out - the app rewrites old opponent ids and adds a
-- per-tag "confirmed" when it re-saves a play, and neither is a change. Sorted,
-- so the same tags in another order are the same. NULL when there are none.
CREATE OR REPLACE FUNCTION public.activity_tags(arr JSONB, kind TEXT)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(arr) <> 'array' THEN NULL ELSE (
    SELECT jsonb_agg(t ORDER BY t::text)
    FROM (
      SELECT jsonb_strip_nulls(jsonb_build_object(
        'role', e -> 'role',
        'credit', public.activity_credit(e -> 'credit'),
        'jersey', CASE WHEN kind <> 'team_tagged' THEN e -> 'jersey_number' END,
        'name', CASE WHEN kind = 'opp_tagged'
                      AND NULLIF(btrim(e ->> 'name'), '') IS NOT NULL
                      AND btrim(e ->> 'name') <> '#' || COALESCE(e ->> 'jersey_number', '')
                     THEN to_jsonb(btrim(e ->> 'name')) END
      )) AS t
      FROM jsonb_array_elements(arr) e
      WHERE jsonb_typeof(e) = 'object'
    ) x
  ) END;
$$;

-- Who a play credits, named as they stood at the time. Rostered players come
-- from play_players; opponents, TEAM and unrostered jerseys ride in play_data
-- and are part of the play view instead.
CREATE OR REPLACE FUNCTION public.activity_credits(target_play_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'role', pp.role,
           'player_id', pp.player_id,
           'credit', public.activity_credit(to_jsonb(pp.credit)),
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
-- many yards, the flags and who was credited - read the way the app reads
-- them (playRecordFromRow, readFumbleSpots), so a re-save that only spells a
-- value the app's way (null penalty ruling as "accepted", a 0 fumble spot as
-- none, false and [] filled in) is not a change. Not the situation the app
-- re-derives (down, distance, spot, score caches), which every edit upstream
-- legitimately rewrites. "at" is the play's start, compared only when it was
-- set by hand (start_override) - see activity_changed.
CREATE OR REPLACE FUNCTION public.activity_play_view(p plays, credits JSONB)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'n', p.sequence,
    'q', p.quarter,
    'clock', p.clock,
    'type', p.play_type,
    'yards', COALESCE(p.yards_gained, 0),
    'td', COALESCE(p.is_touchdown, false),
    'turnover', COALESCE(p.is_turnover, false),
    'penalty', COALESCE(p.is_penalty, false),
    'desc', p.description,
    'at', jsonb_build_object('poss', p.possession, 'down', p.down, 'dist', p.distance, 'ball', p.yard_line),
    'hand_start', CASE WHEN p.play_data -> 'start_override' = 'true'::jsonb THEN true END,
    'pd', (
      SELECT COALESCE(jsonb_object_agg(key, v), '{}'::jsonb)
      FROM (
        SELECT key,
          CASE
            WHEN key IN ('opp_tagged', 'pending_tagged', 'team_tagged') THEN public.activity_tags(value, key)
            WHEN key = 'penalty_enforcement' THEN
              CASE WHEN COALESCE(p.play_data ->> 'penalty_type', '') = '' THEN NULL
                   WHEN value #>> '{}' IN ('declined', 'offset') THEN value
                   ELSE '"accepted"'::jsonb END
            WHEN key = 'fumble_recovered_at' THEN
              CASE WHEN jsonb_typeof(value) = 'number' AND (value #>> '{}')::numeric > 0 THEN value END
            ELSE value
          END AS v
        FROM jsonb_each(COALESCE(p.play_data, '{}'::jsonb))
        WHERE key IN (
          'result', 'is_first_down', 'penalty_type', 'penalty_yards', 'play_category',
          'penalty_enforcement', 'penalty_play_counts', 'penalty_down_outcome',
          'penalty_enforcement_from', 'foul_spot_ball_on', 'is_touchback', 'blocked_kick_type',
          'kick_outcome', 'fumble_recovered_at', 'fumble_return_yards', 'interception_return_yards',
          'muff_recovered_by_kicking', 'blocked_recovered_by_kicking', 'kicked_to_yard',
          'return_to_ball_on', 'score_delta', 'score_delta_team', 'bad_snap', 'no_tackle',
          'timeout_team', 'opp_tagged', 'pending_tagged', 'team_tagged')
      ) s
      WHERE v IS NOT NULL
        AND v NOT IN ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb)
    ),
    'credits', credits
  ));
$$;

-- Did the play change, as a coach would see it? Its number, clock and
-- description move with no stat (the description is rebuilt from the rest),
-- and the start is the app's to re-derive - unless the new start was set by
-- hand and differs from the old one.
CREATE OR REPLACE FUNCTION public.activity_changed(b JSONB, a JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (b - 'n' - 'clock' - 'desc' - 'at' - 'hand_start') IS DISTINCT FROM (a - 'n' - 'clock' - 'desc' - 'at' - 'hand_start')
      OR (COALESCE((a ->> 'hand_start')::boolean, false) AND (b -> 'at') IS DISTINCT FROM (a -> 'at'));
$$;

CREATE OR REPLACE FUNCTION public.activity_game_info(target_game_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', g.id,
    'opponent', o.name,
    'date', g.game_date,
    'is_home', g.is_home
  )
  FROM games g LEFT JOIN opponents o ON o.id = g.opponent_id
  WHERE g.id = target_game_id;
$$;

-- One log row, with the signed-in account filled in. Returns its id.
CREATE OR REPLACE FUNCTION public.activity_write(
  p_program_id  UUID,
  p_game_id     UUID,
  p_game_info   JSONB,
  p_play_id     UUID,
  p_play_number INT,
  p_action      TEXT,
  p_status      TEXT,
  p_before      JSONB,
  p_after       JSONB
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_name  TEXT;
  v_id    BIGINT;
BEGIN
  IF p_program_id IS NULL THEN RETURN NULL; END IF;
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
  ) RETURNING id INTO v_id;
  RETURN v_id;
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
    SET play_touched = true
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

-- players BEFORE DELETE: a removed player's credits go by cascade after the
-- player row is gone, which would leave them nameless. Note each of their
-- plays now, while the name and jersey can still be read.
CREATE OR REPLACE FUNCTION public.activity_players_before_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_play plays%ROWTYPE;
BEGIN
  BEGIN
    FOR v_play IN
      SELECT pl.* FROM plays pl
      WHERE pl.id IN (SELECT pp.play_id FROM play_players pp WHERE pp.player_id = OLD.id)
    LOOP
      IF NOT EXISTS (SELECT 1 FROM game_activity_pending WHERE txid = txid_current() AND play_id = v_play.id) THEN
        PERFORM public.activity_touch_play(v_play.id, v_play, false);
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN OLD;
END;
$$;

-- An edit to a play: one entry, or folded into the same person's entry for
-- the same play from the last two minutes (one action sent as several
-- requests, or a quick second fix). Returns the entry's id, NULL if none.
CREATE OR REPLACE FUNCTION public.activity_write_play_edit(
  p_program UUID, p_play plays, p_status TEXT, p_before JSONB, p_after JSONB
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last game_activity%ROWTYPE;
BEGIN
  SELECT * INTO v_last FROM game_activity
   WHERE play_id = p_play.id
   ORDER BY id DESC LIMIT 1;
  IF FOUND AND v_last.action = 'play_edited'
     AND v_last.actor_id IS NOT DISTINCT FROM auth.uid()
     AND v_last.created_at > now() - interval '2 minutes' THEN
    IF public.activity_changed(v_last.before, p_after) THEN
      UPDATE game_activity
         SET after = p_after, play_number = p_play.sequence, game_status = p_status
       WHERE id = v_last.id;
      RETURN v_last.id;
    END IF;
    -- Changed and changed back: nothing happened after all.
    DELETE FROM game_activity WHERE id = v_last.id;
    RETURN NULL;
  END IF;
  RETURN public.activity_write(p_program, p_play.game_id, public.activity_game_info(p_play.game_id),
    p_play.id, p_play.sequence, 'play_edited', p_status, p_before, p_after);
END;
$$;

-- At commit: how the play stands now against how it stood.
CREATE OR REPLACE FUNCTION public.activity_flush_play()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending game_activity_pending%ROWTYPE;
  v_play    plays%ROWTYPE;
  v_status  TEXT;
  v_program UUID;
  v_after   JSONB;
  v_entry   BIGINT;
BEGIN
  -- The row as it is now: a later statement in the transaction may have
  -- marked the play row touched since this trigger was queued.
  DELETE FROM game_activity_pending WHERE txid = NEW.txid AND play_id = NEW.play_id
    RETURNING * INTO v_pending;
  IF NOT FOUND THEN RETURN NULL; END IF;

  BEGIN
    SELECT * INTO v_play FROM plays WHERE id = v_pending.play_id;
    -- Deleted in this transaction: the delete has its own entry.
    IF FOUND THEN
      SELECT g.status, s.program_id INTO v_status, v_program
        FROM games g JOIN seasons s ON s.id = g.season_id WHERE g.id = v_play.game_id;

      IF v_pending.before_view IS NULL THEN
        -- A new play. Recorded live it is the game itself; only a play added
        -- to a game already final is news.
        IF v_status = 'completed' THEN
          PERFORM public.activity_write(v_program, v_play.game_id, public.activity_game_info(v_play.game_id),
            v_play.id, v_play.sequence, 'play_added', v_status, NULL,
            public.activity_play_view(v_play, public.activity_credits(v_play.id)));
        END IF;
      ELSE
        v_after := public.activity_play_view(v_play, public.activity_credits(v_play.id));
        IF public.activity_changed(v_pending.before_view, v_after) THEN
          v_entry := public.activity_write_play_edit(v_program, v_play, v_status, v_pending.before_view, v_after);
          IF NOT v_pending.play_touched
             AND jsonb_array_length(COALESCE(v_after -> 'credits', '[]'::jsonb)) = 0
             AND jsonb_array_length(COALESCE(v_pending.before_view -> 'credits', '[]'::jsonb)) > 0 THEN
            -- Every credit removed and the play itself untouched: possibly
            -- the first of the two requests that delete a play.
            INSERT INTO game_activity_stash (play_id, credits, entry_id, stashed_at)
            VALUES (v_play.id, v_pending.before_view -> 'credits', v_entry, now())
            ON CONFLICT (play_id) DO UPDATE
              SET credits = EXCLUDED.credits, entry_id = EXCLUDED.entry_id, stashed_at = now();
          ELSE
            DELETE FROM game_activity_stash WHERE play_id = v_play.id;
          END IF;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
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
  v_stash   game_activity_stash%ROWTYPE;
  v_view    JSONB;
  v_done    BOOLEAN := false;
BEGIN
  BEGIN
    SELECT g.status, s.program_id INTO v_status, v_program
      FROM games g JOIN seasons s ON s.id = g.season_id WHERE g.id = OLD.game_id;
    -- No game: the game itself is being deleted, which is one entry, not one
    -- per play.
    IF FOUND THEN
      DELETE FROM game_activity_stash WHERE play_id = OLD.id RETURNING * INTO v_stash;
      v_credits := public.activity_credits(OLD.id);
      IF jsonb_array_length(v_credits) = 0 AND v_stash.play_id IS NOT NULL THEN
        v_credits := v_stash.credits;
      END IF;
      v_view := public.activity_play_view(OLD, v_credits);

      -- The credits went in the request just before: that entry becomes this
      -- one, so a delete reads as one entry.
      IF v_stash.entry_id IS NOT NULL AND v_stash.stashed_at > now() - interval '5 minutes' THEN
        UPDATE game_activity
           SET action = 'play_deleted', before = v_view, after = NULL,
               play_number = OLD.sequence, game_status = v_status
         WHERE id = v_stash.entry_id AND play_id = OLD.id AND action = 'play_edited'
           AND actor_id IS NOT DISTINCT FROM auth.uid();
        v_done := FOUND;
      END IF;

      IF NOT v_done THEN
        PERFORM public.activity_write(v_program, OLD.game_id, public.activity_game_info(OLD.game_id),
          OLD.id, OLD.sequence, 'play_deleted', v_status, v_view, NULL);
      END IF;
    END IF;
    -- Stashes whose delete never came: the clear is already logged.
    DELETE FROM game_activity_stash WHERE stashed_at < now() - interval '1 hour';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'game_activity: %', SQLERRM;
  END;
  RETURN OLD;
END;
$$;

-- CREATE OR REPLACE rather than drop-and-create: dropping a trigger on plays
-- or games waits for every open read of the table, and holds up the app
-- behind it.
CREATE OR REPLACE TRIGGER plays_activity_before_update
  BEFORE UPDATE ON plays
  FOR EACH ROW EXECUTE FUNCTION public.activity_plays_before_update();

CREATE OR REPLACE TRIGGER plays_activity_after_insert
  AFTER INSERT ON plays
  FOR EACH ROW EXECUTE FUNCTION public.activity_plays_after_insert();

CREATE OR REPLACE TRIGGER plays_activity_before_delete
  BEFORE DELETE ON plays
  FOR EACH ROW EXECUTE FUNCTION public.activity_plays_before_delete();

CREATE OR REPLACE TRIGGER play_players_activity_before
  BEFORE INSERT OR UPDATE OR DELETE ON play_players
  FOR EACH ROW EXECUTE FUNCTION public.activity_credits_before();

CREATE OR REPLACE TRIGGER players_activity_before_delete
  BEFORE DELETE ON players
  FOR EACH ROW EXECUTE FUNCTION public.activity_players_before_delete();

-- A constraint trigger cannot be replaced, and it only exists once.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'game_activity_pending_flush' AND tgrelid = 'public.game_activity_pending'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER game_activity_pending_flush
      AFTER INSERT ON game_activity_pending
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.activity_flush_play();
  END IF;
END;
$$;

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
  v_source    TEXT;
  v_has_list  BOOLEAN;
  v_attached  BOOLEAN := false;
BEGIN
  -- The live clock and situation are written on almost every play; leave
  -- those updates before doing any work.
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND v_old_tag = v_new_tag
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
    v_source := COALESCE(v_entry ->> 'source', '');
    v_has_list := jsonb_array_length(COALESCE(v_entry -> 'stats', '[]'::jsonb)) > 0
               OR jsonb_array_length(COALESCE(v_entry -> 'added', '[]'::jsonb)) > 0
               OR jsonb_array_length(COALESCE(v_entry -> 'removed', '[]'::jsonb)) > 0
               OR jsonb_array_length(COALESCE(v_entry -> 'edited', '[]'::jsonb)) > 0;

    -- Who started scoring: the first move to live, or straight to final when
    -- an offline queue sends the whole game as one patch. Once per game - an
    -- undo back to no plays sets it 'scheduled', and the next play 'live'.
    IF NEW.status IN ('live', 'completed') AND COALESCE(OLD.status, '') NOT IN ('live', 'completed')
       AND NOT EXISTS (SELECT 1 FROM game_activity WHERE game_id = NEW.id AND action = 'game_started') THEN
      PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'game_started', NEW.status,
        NULL, NULL);
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
    ELSIF v_was_final AND v_is_final THEN
      -- "Mark stats final" is two requests: the tag, then the official copy
      -- with the list of what it locked in. Put that list on the tag's entry.
      IF v_source = 'stats_final' AND v_new_tag THEN
        UPDATE game_activity
           SET after = COALESCE(after, '{}'::jsonb) || v_new_score || jsonb_build_object('entry', v_entry)
         WHERE id = (
           SELECT id FROM game_activity
            WHERE game_id = NEW.id AND action = 'stats_final' AND created_at > now() - interval '10 minutes'
            ORDER BY id DESC LIMIT 1)
           AND COALESCE(after -> 'entry', 'null'::jsonb) = 'null'::jsonb;
        v_attached := FOUND;
      END IF;
      IF NOT v_attached
         AND (v_old_score IS DISTINCT FROM v_new_score
              OR v_source IN ('change', 'accepted')
              OR (v_source = 'stats_final' AND v_has_list)) THEN
        -- A 'recorded' entry is the app taking a first official copy of an
        -- old final that already adds up - no change, nothing to log.
        PERFORM public.activity_write(v_program, NEW.id, v_info, NULL, NULL, 'final_changed', NEW.status,
          v_old_score, v_new_score || jsonb_build_object('entry', v_entry));
      END IF;
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

CREATE OR REPLACE TRIGGER games_activity_after_update
  AFTER UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION public.activity_games_after_update();

CREATE OR REPLACE TRIGGER games_activity_before_delete
  BEFORE DELETE ON games
  FOR EACH ROW EXECUTE FUNCTION public.activity_games_before_delete();

-- Internal: called by the triggers above, never by the app.
REVOKE ALL ON FUNCTION public.activity_credit(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_tags(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_credits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_play_view(plays, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_changed(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_game_info(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_write(UUID, UUID, JSONB, UUID, INT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_touch_play(UUID, plays, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_write_play_edit(UUID, plays, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_plays_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_plays_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_credits_before() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_players_before_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_flush_play() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_plays_before_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_games_after_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_games_before_delete() FROM PUBLIC, anon, authenticated;

RESET lock_timeout;
