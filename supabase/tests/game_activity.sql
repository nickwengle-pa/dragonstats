-- Checks for 20261019000000_game_activity_log.sql. Run after every migration,
-- with psql as a superuser, e.g. against the local stack:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/game_activity.sql
-- Everything is rolled back.
--
-- Each "request" below runs as one signed-in user, then SET CONSTRAINTS ALL
-- IMMEDIATE fires the deferred flush the way a commit would. The result lists
-- only the checks that did NOT come out as expected, then a summary; an empty
-- first result is a pass.
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin@test', '{"full_name":"Ada Admin"}'),
  ('a0000000-0000-4000-8000-000000000002', 'head@test', '{}'),
  ('a0000000-0000-4000-8000-000000000003', 'assistant@test', '{}'),
  ('a0000000-0000-4000-8000-000000000004', 'staff@test', '{}');
INSERT INTO programs (id, name, abbreviation, owner_id) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Test HS', 'THS', 'a0000000-0000-4000-8000-000000000001');
INSERT INTO program_members (program_id, user_id, role) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'head_coach'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'assistant'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'staff');
INSERT INTO seasons (id, program_id, year, name, is_active) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 2026, '2026', true);
INSERT INTO opponents (id, program_id, name) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Rival');
INSERT INTO games (id, season_id, opponent_id, game_date, status) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'scheduled'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'scheduled');
INSERT INTO players (id, program_id, first_name, last_name) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Pat', 'Runner'),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Sam', 'Tackle'),
  ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Lee', 'Other');
INSERT INTO season_rosters (season_id, player_id, jersey_number) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 7),
  ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 22),
  ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 44);

-- One request as one person, committed as far as the deferred flush knows.
-- quick(): a request sent right after the one before it (one action that the
-- app sends as two requests). req(): a request some minutes after - the whole
-- test is one transaction, so now() never moves, and the log is aged instead.
CREATE FUNCTION pg_temp.quick(who TEXT, stmt TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', CASE who
      WHEN 'admin' THEN 'a0000000-0000-4000-8000-000000000001'
      WHEN 'head' THEN 'a0000000-0000-4000-8000-000000000002'
      WHEN 'assistant' THEN 'a0000000-0000-4000-8000-000000000003'
      WHEN 'staff' THEN 'a0000000-0000-4000-8000-000000000004' END,
      'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE stmt;
  -- Still as the signed-in user, as at a real commit.
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RESET ROLE;
END;
$$;
CREATE FUNCTION pg_temp.req(who TEXT, stmt TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.quick(who, stmt);
  UPDATE game_activity SET created_at = created_at - interval '3 minutes';
  UPDATE game_activity_stash SET stashed_at = stashed_at - interval '3 minutes';
END;
$$;

CREATE FUNCTION pg_temp.log_count() RETURNS BIGINT LANGUAGE sql AS $$ SELECT count(*) FROM game_activity $$;

CREATE TEMP TABLE results (n SERIAL, label TEXT, expected TEXT, got TEXT);
CREATE FUNCTION pg_temp.check(label TEXT, expected TEXT, got TEXT) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO results (label, expected, got) VALUES (label, expected, COALESCE(got, '<null>'));
$$;

-- GL = e...001, played live then ended. Plays 1...001 (run, #7 runner, #22 tackler).
SELECT pg_temp.req('assistant', $q$UPDATE games SET status = 'live' WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('starting a game is logged once', 'game_started|assistant@test',
  (SELECT string_agg(action || '|' || actor_email, ',') FROM game_activity));

SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000001","game_id":"e0000000-0000-4000-8000-000000000001","sequence":1,"quarter":1,"possession":"us","play_type":"rush","yards_gained":4,"description":"#7 Runner 4 yd run","play_data":{"result":"tackled","next_down":2}}'::jsonb,
  '[{"player_id":"f0000000-0000-4000-8000-000000000001","role":"rusher"},{"player_id":"f0000000-0000-4000-8000-000000000002","role":"tackler","credit":1}]'::jsonb)$q$);
SELECT pg_temp.check('recording a live play is not logged', '1', pg_temp.log_count()::text);

SELECT pg_temp.req('assistant', $q$UPDATE games SET current_clock = '10:00', current_down = 2, our_score = 0 WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('live clock and situation writes are not logged', '1', pg_temp.log_count()::text);

-- The same play sent again (a queue retry): nothing changed.
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000001","yards_gained":4}'::jsonb,
  '[{"player_id":"f0000000-0000-4000-8000-000000000002","role":"tackler","credit":1.00},{"player_id":"f0000000-0000-4000-8000-000000000001","role":"rusher"}]'::jsonb)$q$);
SELECT pg_temp.check('a retry with the same play is not logged', '1', pg_temp.log_count()::text);

-- The rechain after an edit upstream: spots and caches only.
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000001","sequence":2,"down":3,"yard_line":40,"clock":"9:12","play_data":{"result":"tackled","next_down":3,"score_after":{"home":0}}}'::jsonb, NULL)$q$);
SELECT pg_temp.check('a situation rewrite is not logged', '1', pg_temp.log_count()::text);

-- A real edit: 4 yards to 7 and a different tackler, through the RPC.
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000001","yards_gained":7,"description":"#7 Runner 7 yd run"}'::jsonb,
  '[{"player_id":"f0000000-0000-4000-8000-000000000001","role":"rusher"},{"player_id":"f0000000-0000-4000-8000-000000000003","role":"tackler","credit":1}]'::jsonb)$q$);
SELECT pg_temp.check('an edit is one entry', '2', pg_temp.log_count()::text);
SELECT pg_temp.check('the edit has before and after yards', '4->7',
  (SELECT (before ->> 'yards') || '->' || (after ->> 'yards') FROM game_activity WHERE action = 'play_edited'));
SELECT pg_temp.check('the edit names the tacklers by jersey', '22 Sam Tackle->44 Lee Other',
  (SELECT (SELECT c ->> 'jersey' || ' ' || (c ->> 'name') FROM jsonb_array_elements(before -> 'credits') c WHERE c ->> 'role' = 'tackler')
     || '->' || (SELECT c ->> 'jersey' || ' ' || (c ->> 'name') FROM jsonb_array_elements(after -> 'credits') c WHERE c ->> 'role' = 'tackler')
   FROM game_activity WHERE action = 'play_edited'));
SELECT pg_temp.check('the edit is credited to who sent it, during the live game', 'assistant@test|live',
  (SELECT actor_email || '|' || game_status FROM game_activity WHERE action = 'play_edited'));
SELECT pg_temp.check('nothing is left pending', '0', (SELECT count(*)::text FROM game_activity_pending));

-- A jersey matched to a player: credits only, written straight to the table.
SELECT pg_temp.req('assistant', $q$INSERT INTO play_players (play_id, player_id, role) VALUES ('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'forced_fumble')$q$);
SELECT pg_temp.check('a credit added on its own is logged', '3', pg_temp.log_count()::text);

-- An opponent tag change rides in play_data.
SELECT pg_temp.req('assistant', $q$UPDATE plays SET play_data = play_data || '{"opp_tagged":[{"id":"opp_1","name":"Big Guy","jersey_number":55,"role":"tackler"}]}'::jsonb WHERE id = '10000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('an opponent tag change is logged', '4', pg_temp.log_count()::text);

-- End Game.
SELECT pg_temp.req('assistant', $q$UPDATE games SET status = 'completed', our_score = 7, opponent_score = 3,
  final_history = '[{"source":"finalized","score":{"us":7,"them":3}}]'::jsonb WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('End Game is logged with the score', 'game_ended|7-3',
  (SELECT action || '|' || (after ->> 'us') || '-' || (after ->> 'them') FROM game_activity ORDER BY id DESC LIMIT 1));

-- A head coach changes the final, with the official copy's list of what moved.
SELECT pg_temp.req('head', $q$UPDATE games SET our_score = 14,
  final_history = final_history || '[{"source":"change","score":{"us":14,"them":3},"scoreBefore":{"us":7,"them":3},"stats":[{"key":"p:x:defense.soloTackles","label":"#22 Sam Tackle: Solo tackles","before":3,"after":4}]}]'::jsonb
  WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('a change to the final is logged with its stat list', 'final_changed|7->14|4|head@test',
  (SELECT action || '|' || (before ->> 'us') || '->' || (after ->> 'us') || '|' || (after -> 'entry' -> 'stats' -> 0 ->> 'after') || '|' || actor_email
   FROM game_activity ORDER BY id DESC LIMIT 1));

-- A copy the app takes of an old final, no change: nothing.
SELECT pg_temp.req('head', $q$UPDATE games SET final_history = final_history || '[{"source":"recorded","score":{"us":14,"them":3}}]'::jsonb WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('a silent official copy is not logged', '6', pg_temp.log_count()::text);

-- Mark stats final.
SELECT pg_temp.req('head', $q$UPDATE games SET tags = ARRAY['stats_final'] WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('marking stats final is logged', 'stats_final',
  (SELECT action FROM game_activity ORDER BY id DESC LIMIT 1));

-- A play added after the game.
SELECT pg_temp.req('head', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000002","game_id":"e0000000-0000-4000-8000-000000000001","sequence":2,"quarter":4,"possession":"us","play_type":"pass","yards_gained":12}'::jsonb,
  '[{"player_id":"f0000000-0000-4000-8000-000000000001","role":"receiver"}]'::jsonb)$q$);
SELECT pg_temp.check('a play added to a final is logged with its credits', 'play_added|completed|1',
  (SELECT action || '|' || game_status || '|' || jsonb_array_length(after -> 'credits') FROM game_activity ORDER BY id DESC LIMIT 1));

-- Delete the way the app does: credits in one request, the play in the next.
SELECT pg_temp.quick('head', $q$DELETE FROM play_players WHERE play_id = '10000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('clearing credits is logged at once', '9|play_edited', pg_temp.log_count()::text || '|' ||
  (SELECT action FROM game_activity ORDER BY id DESC LIMIT 1));
SELECT pg_temp.req('head', $q$DELETE FROM plays WHERE id = '10000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.check('the delete that follows turns it into one entry', '9', pg_temp.log_count()::text);
SELECT pg_temp.check('a delete is logged with who was on the play', 'play_deleted|3|7',
  (SELECT action || '|' || jsonb_array_length(before -> 'credits') || '|' || (before ->> 'yards') FROM game_activity ORDER BY id DESC LIMIT 1));
SELECT pg_temp.check('the stash is emptied', '0', (SELECT count(*)::text FROM game_activity_stash));

-- Credits cleared with no delete after: stays an edit.
SELECT pg_temp.req('head', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000003","game_id":"e0000000-0000-4000-8000-000000000001","sequence":3,"quarter":4,"possession":"them","play_type":"rush","yards_gained":2}'::jsonb,
  '[{"player_id":"f0000000-0000-4000-8000-000000000002","role":"tackler"}]'::jsonb)$q$);
SELECT pg_temp.req('head', $q$DELETE FROM play_players WHERE play_id = '10000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.check('a tackle removed on its own is an edit', 'play_edited|1|0',
  (SELECT action || '|' || jsonb_array_length(before -> 'credits') || '|' || jsonb_array_length(after -> 'credits')
   FROM game_activity WHERE play_id = '10000000-0000-4000-8000-000000000003' ORDER BY id DESC LIMIT 1));


-- ---------------------------------------------------- noise the review found
-- GN = e...003: a fresh game for the re-save cases.
INSERT INTO games (id, season_id, opponent_id, game_date, status) VALUES
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'live');
CREATE FUNCTION pg_temp.play_entries(pid TEXT) RETURNS TEXT LANGUAGE sql AS $$
  SELECT count(*)::text FROM game_activity WHERE play_id = pid::uuid
$$;

-- A timeout stored with no penalty ruling; the re-chain writes "accepted".
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000031","game_id":"e0000000-0000-4000-8000-000000000003","sequence":1,"quarter":1,"possession":"us","play_type":"timeout","play_data":{"timeout_team":"us","penalty_enforcement":null}}'::jsonb, '[]'::jsonb)$q$);
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000031","down":2,"play_data":{"timeout_team":"us","penalty_enforcement":"accepted","is_touchback":false,"penalty_yards":0,"opp_tagged":[],"pending_tagged":[],"team_tagged":[]}}'::jsonb, NULL)$q$);
SELECT pg_temp.check('a re-chain spelling defaults the app''s way is not an edit', '0', pg_temp.play_entries('10000000-0000-4000-8000-000000000031'));

-- An old build's 0/0 fumble spots, re-saved as none.
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000032","game_id":"e0000000-0000-4000-8000-000000000003","sequence":2,"quarter":1,"possession":"us","play_type":"rush","yards_gained":3,"play_data":{"fumble_recovered_at":0,"fumble_return_yards":0,"opp_tagged":[{"id":"quick_7_123","name":"#7","jersey_number":7,"role":"tackler","credit":1}]}}'::jsonb, '[]'::jsonb)$q$);
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000032","play_data":{"fumble_recovered_at":null,"fumble_return_yards":null,"opp_tagged":[{"id":"opp_UNK_7","name":"#7","jersey_number":7,"role":"tackler","credit":1.0}]}}'::jsonb, NULL)$q$);
SELECT pg_temp.check('old fumble spots and rewritten opponent ids are not an edit', '0', pg_temp.play_entries('10000000-0000-4000-8000-000000000032'));

-- A first-down call changed by hand is an edit.
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000032","play_data":{"is_first_down":true,"opp_tagged":[{"id":"opp_UNK_7","name":"#7","jersey_number":7,"role":"tackler","credit":1.0}]}}'::jsonb, NULL)$q$);
SELECT pg_temp.check('a first down toggled is an edit', '1', pg_temp.play_entries('10000000-0000-4000-8000-000000000032'));

-- Starts: the app flagging a start it already had is quiet; a coach moving a
-- start by hand is an edit; a re-chain moving an unflagged start is quiet.
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000033","game_id":"e0000000-0000-4000-8000-000000000003","sequence":3,"quarter":1,"possession":"us","down":1,"distance":10,"yard_line":30,"play_type":"rush","yards_gained":5}'::jsonb, '[]'::jsonb)$q$);
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000033","yard_line":35}'::jsonb, NULL)$q$);
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000033","play_data":{"start_override":true}}'::jsonb, NULL)$q$);
SELECT pg_temp.check('re-chained and flagged starts are not edits', '0', pg_temp.play_entries('10000000-0000-4000-8000-000000000033'));
SELECT pg_temp.req('head', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000033","down":2,"distance":4,"yard_line":36,"play_data":{"start_override":true}}'::jsonb, NULL)$q$);
SELECT pg_temp.check('a start set by hand is an edit', '1|35->36',
  pg_temp.play_entries('10000000-0000-4000-8000-000000000033') || '|' ||
  (SELECT (before -> 'at' ->> 'ball') || '->' || (after -> 'at' ->> 'ball') FROM game_activity WHERE play_id = '10000000-0000-4000-8000-000000000033'));

-- Matching a jersey to a player: two requests, one entry, no in-between state.
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000034","game_id":"e0000000-0000-4000-8000-000000000003","sequence":4,"quarter":1,"possession":"them","play_type":"rush","yards_gained":1,"play_data":{"pending_tagged":[{"id":"pending_31","jersey_number":31,"role":"tackler","credit":1}]}}'::jsonb, '[]'::jsonb)$q$);
SELECT pg_temp.quick('head', $q$INSERT INTO play_players (play_id, player_id, role, credit) VALUES ('10000000-0000-4000-8000-000000000034', 'f0000000-0000-4000-8000-000000000002', 'tackler', 1)$q$);
SELECT pg_temp.req('head', $q$UPDATE plays SET play_data = play_data - 'pending_tagged' WHERE id = '10000000-0000-4000-8000-000000000034'$q$);
SELECT pg_temp.check('a jersey match is one entry from the jersey to the player', '1|1|0|1',
  pg_temp.play_entries('10000000-0000-4000-8000-000000000034') || '|' ||
  (SELECT jsonb_array_length(before -> 'pd' -> 'pending_tagged') || '|' || jsonb_array_length(after -> 'credits') - 1 || '|' || jsonb_array_length(after -> 'credits')
   FROM game_activity WHERE play_id = '10000000-0000-4000-8000-000000000034'));

-- Changed and changed back within the window: no entry.
SELECT pg_temp.quick('head', $q$UPDATE plays SET yards_gained = 9 WHERE id = '10000000-0000-4000-8000-000000000033'$q$);
SELECT pg_temp.quick('head', $q$UPDATE plays SET yards_gained = 5 WHERE id = '10000000-0000-4000-8000-000000000033'$q$);
SELECT pg_temp.check('a change undone straight away leaves the earlier entry only', '1', pg_temp.play_entries('10000000-0000-4000-8000-000000000033'));

-- Removing a player keeps their name on the plays they were credited on.
INSERT INTO players (id, program_id, first_name, last_name) VALUES
  ('f0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000001', 'Gone', 'Guy');
INSERT INTO season_rosters (season_id, player_id, jersey_number) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000009', 99);
SELECT pg_temp.req('assistant', $q$SELECT public.save_play_with_players(
  '{"id":"10000000-0000-4000-8000-000000000035","game_id":"e0000000-0000-4000-8000-000000000003","sequence":5,"quarter":1,"possession":"them","play_type":"rush","yards_gained":1}'::jsonb,
  '[{"player_id":"f0000000-0000-4000-8000-000000000009","role":"tackler"}]'::jsonb)$q$);
SELECT pg_temp.req('admin', $q$DELETE FROM players WHERE id = 'f0000000-0000-4000-8000-000000000009'$q$);
SELECT pg_temp.check('a removed player''s credit is logged by name', '99 Gone Guy|0',
  (SELECT (before -> 'credits' -> 0 ->> 'jersey') || ' ' || (before -> 'credits' -> 0 ->> 'name') || '|' || jsonb_array_length(after -> 'credits')
   FROM game_activity WHERE play_id = '10000000-0000-4000-8000-000000000035'));

-- ------------------------------------------------- game start, end, sign-off
-- GO = e...004: recorded with no signal. The queue sends the plays, then one
-- patch from scheduled straight to final.
INSERT INTO games (id, season_id, opponent_id, game_date, status) VALUES
  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'scheduled');
SELECT pg_temp.req('assistant', $q$UPDATE games SET status = 'completed', our_score = 21, opponent_score = 7 WHERE id = 'e0000000-0000-4000-8000-000000000004'$q$);
SELECT pg_temp.check('an offline game still says who started it', 'game_started,game_ended',
  (SELECT string_agg(action, ',' ORDER BY id) FROM game_activity WHERE game_id = 'e0000000-0000-4000-8000-000000000004'));

-- An undo back to no plays, then the first play again: one start.
SELECT pg_temp.req('assistant', $q$UPDATE games SET status = 'scheduled' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.req('assistant', $q$UPDATE games SET status = 'live' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.req('assistant', $q$UPDATE games SET status = 'scheduled' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.req('head', $q$UPDATE games SET status = 'live' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.check('a game is started once', '1',
  (SELECT count(*)::text FROM game_activity WHERE game_id = 'e0000000-0000-4000-8000-000000000003' AND action = 'game_started'));

-- Mark stats final as the app sends it: the tag, then the official copy with
-- the list of what changed since End Game.
SELECT pg_temp.quick('head', $q$UPDATE games SET tags = ARRAY['stats_final'] WHERE id = 'e0000000-0000-4000-8000-000000000004'$q$);
SELECT pg_temp.req('head', $q$UPDATE games SET final_history = '[{"source":"finalized"},{"source":"stats_final","stats":[{"label":"#22 Sam Tackle Solo tackles","before":3,"after":4}]}]'::jsonb WHERE id = 'e0000000-0000-4000-8000-000000000004'$q$);
SELECT pg_temp.check('stats final carries the list it locked in, as one entry', 'stats_final|4|1',
  (SELECT string_agg(action || '|' || COALESCE(after -> 'entry' -> 'stats' -> 0 ->> 'after', '-'), ',')
   FROM game_activity WHERE game_id = 'e0000000-0000-4000-8000-000000000004' AND action IN ('stats_final', 'final_changed'))
  || '|' || (SELECT count(*)::text FROM game_activity WHERE game_id = 'e0000000-0000-4000-8000-000000000004' AND action IN ('stats_final', 'final_changed')));

-- The sequence behind the log cannot be touched from the app.
SELECT pg_temp.check('the log''s sequence is not the app''s', 'false',
  (SELECT has_sequence_privilege('authenticated', 'game_activity_id_seq', 'UPDATE')::text));

-- Reading the log.
CREATE FUNCTION pg_temp.visible(who UUID) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM game_activity;
  RESET ROLE;
  RETURN n::text;
END;
$$;
CREATE FUNCTION pg_temp.try(who UUID, stmt TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE outcome TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__ok__';
  EXCEPTION WHEN OTHERS THEN
    outcome := CASE WHEN SQLERRM = '__ok__' THEN 'ok' ELSE SQLSTATE END;
  END;
  RESET ROLE;
  RETURN outcome;
END;
$$;
SELECT pg_temp.check('admin reads the log', (SELECT count(*)::text FROM game_activity), pg_temp.visible('a0000000-0000-4000-8000-000000000001'));
SELECT pg_temp.check('head coach reads the log', (SELECT count(*)::text FROM game_activity), pg_temp.visible('a0000000-0000-4000-8000-000000000002'));
SELECT pg_temp.check('assistant cannot read the log', '0', pg_temp.visible('a0000000-0000-4000-8000-000000000003'));
SELECT pg_temp.check('staff cannot read the log', '0', pg_temp.visible('a0000000-0000-4000-8000-000000000004'));
SELECT pg_temp.check('nobody can write the log', '42501', pg_temp.try('a0000000-0000-4000-8000-000000000001',
  $q$INSERT INTO game_activity (program_id, action) VALUES ('b0000000-0000-4000-8000-000000000001', 'game_ended')$q$));
SELECT pg_temp.check('nobody can erase the log', '42501', pg_temp.try('a0000000-0000-4000-8000-000000000001',
  $q$DELETE FROM game_activity$q$));

-- Deleting a game is one entry, not one per play, and the entry outlives it.
SELECT pg_temp.req('admin', $q$UPDATE games SET status = 'live' WHERE id = 'e0000000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.req('admin', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000009","game_id":"e0000000-0000-4000-8000-000000000002","sequence":1,"quarter":1,"possession":"us","play_type":"rush"}'::jsonb, '[]'::jsonb)$q$);
SELECT pg_temp.req('admin', $q$DELETE FROM games WHERE id = 'e0000000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.check('deleting a game logs the game only', 'game_deleted|1|Rival',
  (SELECT string_agg(action || '|' || (before ->> 'plays') || '|' || (game_info ->> 'opponent'), ',')
   FROM game_activity WHERE before ->> 'game_id' = 'e0000000-0000-4000-8000-000000000002' OR play_id = '10000000-0000-4000-8000-000000000009'));

SELECT n, label, expected, got FROM results WHERE expected IS DISTINCT FROM got ORDER BY n;
SELECT count(*) AS checks, count(*) FILTER (WHERE expected = got) AS passed FROM results;

ROLLBACK;
