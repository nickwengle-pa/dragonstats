-- Role checks for 20261016000000_program_roles.sql. Run after the migration,
-- with psql as a superuser (it uses \gset), e.g. against the local stack:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/program_roles.sql
-- Everything is rolled back. Each attempt runs as one signed-in user in its
-- own subtransaction and is undone straight away, so the checks do not lean
-- on each other. The result lists only the checks that did NOT come out as
-- expected, then a one-row summary; an empty first result is a pass.
--
-- "ok:N" = ran and touched N rows. A SQLSTATE (42501 etc.) = refused.
-- An UPDATE or DELETE that RLS filters out is "ok:0", not an error - that is
-- how PostgREST reports it to the app too.
BEGIN;

-- ---------------------------------------------------------------- fixtures
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'admin@test',     '{"full_name":"Ada Admin"}'),
  ('a0000000-0000-4000-8000-000000000002', 'head@test',      '{}'),
  ('a0000000-0000-4000-8000-000000000003', 'assistant@test', '{}'),
  ('a0000000-0000-4000-8000-000000000004', 'staff@test',     '{}'),
  ('a0000000-0000-4000-8000-000000000005', 'outsider@test',  '{}'),
  ('a0000000-0000-4000-8000-000000000006', 'other@test',     '{}');

-- Program 1. The enrol trigger makes the owner its admin.
INSERT INTO programs (id, name, abbreviation, owner_id) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Test HS', 'THS', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'Other HS', 'OHS', 'a0000000-0000-4000-8000-000000000006');
INSERT INTO program_members (program_id, user_id, role) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'head_coach'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'assistant'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'staff');

INSERT INTO seasons (id, program_id, year, name, is_active) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 2026, '2026', true),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 2025, '2025', false),
  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000002', 2026, '2026', true);
INSERT INTO opponents (id, program_id, name) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Rival'),
  ('d0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000002', 'Rival 2');
INSERT INTO games (id, season_id, opponent_id, game_date, status) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'live'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'completed'),
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'scheduled'),
  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now(), 'cancelled'),
  ('e0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000009', now(), 'live');
INSERT INTO players (id, program_id, first_name, last_name) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Pat', 'One'),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Sam', 'Spare');
INSERT INTO plays (id, game_id, sequence, quarter, possession, play_type) VALUES
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1, 1, 'us', 'rush'),
  ('10000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 1, 1, 'us', 'rush');
INSERT INTO play_players (play_id, player_id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'rusher'),
  ('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'rusher');
INSERT INTO program_invite_codes (code, program_id, role, created_at) VALUES
  ('TESTADMN', 'b0000000-0000-4000-8000-000000000001', 'admin', now() - interval '1 day'),
  ('TESTASST', 'b0000000-0000-4000-8000-000000000001', 'assistant', now() - interval '1 day');

-- ------------------------------------------------------------------ harness
CREATE FUNCTION pg_temp.attempt(who UUID, stmt TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  n BIGINT;
  outcome TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- Succeeded: undo it anyway so every attempt starts from the fixtures.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__ok__' || n;
  EXCEPTION WHEN OTHERS THEN
    outcome := CASE WHEN SQLERRM LIKE '\_\_ok\_\_%' THEN 'ok:' || substr(SQLERRM, 7) ELSE SQLSTATE END;
  END;
  RESET ROLE;
  RETURN outcome;
END;
$$;

CREATE TEMP TABLE who (name TEXT PRIMARY KEY, id UUID);
INSERT INTO who VALUES
  ('admin', 'a0000000-0000-4000-8000-000000000001'),
  ('head', 'a0000000-0000-4000-8000-000000000002'),
  ('assistant', 'a0000000-0000-4000-8000-000000000003'),
  ('staff', 'a0000000-0000-4000-8000-000000000004'),
  ('outsider', 'a0000000-0000-4000-8000-000000000005'),
  ('other_admin', 'a0000000-0000-4000-8000-000000000006');

-- Shorthands used in the statements below:
--   P1 program b...001   S1 active season c...001   S0 old season c...002
--   GL live game e...001 GF final game e...002      GS scheduled game e...003
--   GC cancelled game e...004
--   G9 another program's live game e...009
--   PL play in GL 1...001  PF play in GF 1...002   P1 player f...001, spare f...002
CREATE TEMP TABLE checks (n SERIAL, label TEXT, actor TEXT, stmt TEXT, expected TEXT);
INSERT INTO checks (label, actor, stmt, expected) VALUES
-- Reading
('staff reads plays of a final game', 'staff', $q$SELECT 1 FROM plays WHERE game_id = 'e0000000-0000-4000-8000-000000000002'$q$, 'ok:1'),
('outsider reads nothing', 'outsider', $q$SELECT 1 FROM plays$q$, 'ok:0'),
('head coach cannot read another program', 'head', $q$SELECT 1 FROM games WHERE id = 'e0000000-0000-4000-8000-000000000009'$q$, 'ok:0'),
('staff reads the member list rows', 'staff', $q$SELECT 1 FROM program_members WHERE program_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:4'),

-- Plays: the final lock
('assistant records a play in a live game', 'assistant', $q$INSERT INTO plays (game_id, sequence, quarter, possession, play_type) VALUES ('e0000000-0000-4000-8000-000000000001', 2, 1, 'us', 'pass')$q$, 'ok:1'),
('assistant cannot add a play to a final game', 'assistant', $q$INSERT INTO plays (game_id, sequence, quarter, possession, play_type) VALUES ('e0000000-0000-4000-8000-000000000002', 2, 1, 'us', 'pass')$q$, '42501'),
('assistant edits a play in a live game', 'assistant', $q$UPDATE plays SET yards_gained = 5 WHERE id = '10000000-0000-4000-8000-000000000001'$q$, 'ok:1'),
('assistant cannot edit a play in a final game', 'assistant', $q$UPDATE plays SET yards_gained = 5 WHERE id = '10000000-0000-4000-8000-000000000002'$q$, 'ok:0'),
('assistant cannot delete a play in a final game', 'assistant', $q$DELETE FROM plays WHERE id = '10000000-0000-4000-8000-000000000002'$q$, 'ok:0'),
('assistant deletes a play in a live game', 'assistant', $q$DELETE FROM plays WHERE id = '10000000-0000-4000-8000-000000000001'$q$, 'ok:1'),
('assistant saves a live play through the RPC', 'assistant', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000001","yards_gained":7}'::jsonb, '[{"player_id":"f0000000-0000-4000-8000-000000000001","role":"rusher"}]'::jsonb)$q$, 'ok:1'),
('assistant RPC on a final play is refused', 'assistant', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000002","yards_gained":7}'::jsonb, NULL)$q$, '42501'),
('assistant RPC cannot insert a new play in a final game', 'assistant', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-0000000000aa","game_id":"e0000000-0000-4000-8000-000000000002","sequence":9,"quarter":1,"possession":"us","play_type":"rush"}'::jsonb, NULL)$q$, '42501'),
('assistant cannot credit a player on a final play', 'assistant', $q$INSERT INTO play_players (play_id, player_id, role) VALUES ('10000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'tackler')$q$, '42501'),
('assistant cannot remove credits on a final play', 'assistant', $q$DELETE FROM play_players WHERE play_id = '10000000-0000-4000-8000-000000000002'$q$, 'ok:0'),
('head coach edits a play in a final game', 'head', $q$UPDATE plays SET yards_gained = 5 WHERE id = '10000000-0000-4000-8000-000000000002'$q$, 'ok:1'),
('head coach adds a play to a final game', 'head', $q$INSERT INTO plays (game_id, sequence, quarter, possession, play_type) VALUES ('e0000000-0000-4000-8000-000000000002', 2, 1, 'us', 'pass')$q$, 'ok:1'),
('head coach RPC on a final play', 'head', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000002","yards_gained":7}'::jsonb, '[]'::jsonb)$q$, 'ok:1'),
('staff cannot record a play', 'staff', $q$INSERT INTO plays (game_id, sequence, quarter, possession, play_type) VALUES ('e0000000-0000-4000-8000-000000000001', 2, 1, 'us', 'pass')$q$, '42501'),
('staff cannot edit a play', 'staff', $q$UPDATE plays SET yards_gained = 5 WHERE id = '10000000-0000-4000-8000-000000000001'$q$, 'ok:0'),
('staff RPC is refused', 'staff', $q$SELECT public.save_play_with_players('{"id":"10000000-0000-4000-8000-000000000001","yards_gained":7}'::jsonb, NULL)$q$, '42501'),
('other program cannot touch our plays', 'other_admin', $q$UPDATE plays SET yards_gained = 5 WHERE id = '10000000-0000-4000-8000-000000000001'$q$, 'ok:0'),

-- Games
('assistant ends a live game', 'assistant', $q$UPDATE games SET status = 'completed', our_score = 21, final_snapshot = '{}'::jsonb WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$, 'ok:1'),
('assistant updates the live situation', 'assistant', $q$UPDATE games SET current_down = 3, rules_config = '{}'::jsonb, direction = 'left' WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$, 'ok:1'),
('assistant cannot change a final game', 'assistant', $q$UPDATE games SET our_score = 99 WHERE id = 'e0000000-0000-4000-8000-000000000002'$q$, 'ok:0'),
('assistant cannot reopen a final game', 'assistant', $q$UPDATE games SET status = 'live' WHERE id = 'e0000000-0000-4000-8000-000000000002'$q$, 'ok:0'),
('assistant cannot move a game date', 'assistant', $q$UPDATE games SET game_date = now() + interval '1 day' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$, '42501'),
('assistant cannot change the opponent', 'assistant', $q$UPDATE games SET opponent_id = 'd0000000-0000-4000-8000-000000000001', is_home = false WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$, '42501'),
('assistant cannot cancel a game', 'assistant', $q$UPDATE games SET status = 'cancelled' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$, '42501'),
('assistant cannot add a game', 'assistant', $q$INSERT INTO games (season_id, opponent_id, game_date) VALUES ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now())$q$, '42501'),
('assistant cannot delete a game', 'assistant', $q$DELETE FROM games WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$, 'ok:0'),
('head coach changes a final game', 'head', $q$UPDATE games SET our_score = 28 WHERE id = 'e0000000-0000-4000-8000-000000000002'$q$, 'ok:1'),
('head coach moves a game date', 'head', $q$UPDATE games SET game_date = now() + interval '1 day' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$, 'ok:1'),
('head coach adds a game', 'head', $q$INSERT INTO games (season_id, opponent_id, game_date) VALUES ('c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now())$q$, 'ok:1'),
('head coach deletes a game', 'head', $q$DELETE FROM games WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$, 'ok:1'),
('head coach cannot move a game into another program', 'head', $q$UPDATE games SET season_id = 'c0000000-0000-4000-8000-000000000009' WHERE id = 'e0000000-0000-4000-8000-000000000003'$q$, '42501'),
('assistant cannot un-cancel a game', 'assistant', $q$UPDATE games SET status = 'live' WHERE id = 'e0000000-0000-4000-8000-000000000004'$q$, 'ok:0'),
('assistant cannot record on a cancelled game', 'assistant', $q$INSERT INTO plays (game_id, sequence, quarter, possession, play_type) VALUES ('e0000000-0000-4000-8000-000000000004', 1, 1, 'us', 'rush')$q$, '42501'),
('head coach un-cancels a game', 'head', $q$UPDATE games SET status = 'scheduled' WHERE id = 'e0000000-0000-4000-8000-000000000004'$q$, 'ok:1'),
('staff cannot update a game', 'staff', $q$UPDATE games SET current_down = 2 WHERE id = 'e0000000-0000-4000-8000-000000000001'$q$, 'ok:0'),

-- Seasons and program settings
('head coach adds a season', 'head', $q$INSERT INTO seasons (program_id, year, name, is_active) VALUES ('b0000000-0000-4000-8000-000000000001', 2027, '2027', false)$q$, 'ok:1'),
('assistant cannot add a season', 'assistant', $q$INSERT INTO seasons (program_id, year, name, is_active) VALUES ('b0000000-0000-4000-8000-000000000001', 2027, '2027', false)$q$, '42501'),
('head coach cannot delete a season', 'head', $q$DELETE FROM seasons WHERE id = 'c0000000-0000-4000-8000-000000000002'$q$, 'ok:0'),
('admin deletes a season', 'admin', $q$DELETE FROM seasons WHERE id = 'c0000000-0000-4000-8000-000000000002'$q$, 'ok:1'),
('head coach switches the active season', 'head', $q$SELECT public.set_active_season('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')$q$, 'ok:1'),
('assistant cannot switch the active season', 'assistant', $q$SELECT public.set_active_season('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')$q$, '42501'),
('staff cannot flip is_active directly', 'staff', $q$UPDATE seasons SET is_active = false WHERE program_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:0'),
('head coach edits program settings', 'head', $q$UPDATE programs SET name = 'Renamed' WHERE id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:1'),
('assistant cannot edit program settings', 'assistant', $q$UPDATE programs SET game_config = '{}'::jsonb WHERE id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:0'),
('head coach cannot hand the program to someone', 'head', $q$UPDATE programs SET owner_id = 'a0000000-0000-4000-8000-000000000005' WHERE id = 'b0000000-0000-4000-8000-000000000001'$q$, '42501'),
('nobody changes the owner from the app, even an admin', 'admin', $q$UPDATE programs SET owner_id = 'a0000000-0000-4000-8000-000000000003' WHERE id = 'b0000000-0000-4000-8000-000000000001'$q$, '42501'),
('saving settings with the same owner still works', 'head', $q$UPDATE programs SET name = 'Same', owner_id = 'a0000000-0000-4000-8000-000000000001' WHERE id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:1'),
('head coach cannot delete the program', 'head', $q$DELETE FROM programs WHERE id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:0'),
('head coach adds a coach to the staff list', 'head', $q$INSERT INTO coaches (season_id, name, role) VALUES ('c0000000-0000-4000-8000-000000000001', 'Coach X', 'assistant')$q$, 'ok:1'),
('assistant cannot edit the coaches list', 'assistant', $q$INSERT INTO coaches (season_id, name, role) VALUES ('c0000000-0000-4000-8000-000000000001', 'Coach X', 'assistant')$q$, '42501'),

-- Roster and opponents
('assistant adds a player', 'assistant', $q$INSERT INTO players (program_id, first_name, last_name) VALUES ('b0000000-0000-4000-8000-000000000001', 'New', 'Kid')$q$, 'ok:1'),
('assistant edits a player', 'assistant', $q$UPDATE players SET last_name = 'Two' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, 'ok:1'),
('assistant puts a player on the roster', 'assistant', $q$INSERT INTO season_rosters (season_id, player_id, jersey_number) VALUES ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 12)$q$, 'ok:1'),
('assistant cannot delete a player', 'assistant', $q$DELETE FROM players WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, 'ok:0'),
('head coach deletes a player', 'head', $q$DELETE FROM players WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, 'ok:1'),
('staff cannot add a player', 'staff', $q$INSERT INTO players (program_id, first_name, last_name) VALUES ('b0000000-0000-4000-8000-000000000001', 'New', 'Kid')$q$, '42501'),
('staff cannot touch the roster', 'staff', $q$INSERT INTO season_rosters (season_id, player_id, jersey_number) VALUES ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 12)$q$, '42501'),
('assistant adds an opponent jersey mid-game', 'assistant', $q$INSERT INTO opponent_players (opponent_id, jersey_number, name) VALUES ('d0000000-0000-4000-8000-000000000001', 55, 'Big')$q$, 'ok:1'),
('staff cannot add an opponent jersey', 'staff', $q$INSERT INTO opponent_players (opponent_id, jersey_number, name) VALUES ('d0000000-0000-4000-8000-000000000001', 55, 'Big')$q$, '42501'),
('assistant cannot add an opponent', 'assistant', $q$INSERT INTO opponents (program_id, name) VALUES ('b0000000-0000-4000-8000-000000000001', 'New Rival')$q$, '42501'),
('head coach adds an opponent', 'head', $q$INSERT INTO opponents (program_id, name) VALUES ('b0000000-0000-4000-8000-000000000001', 'New Rival')$q$, 'ok:1'),

-- Film charting
('assistant charts film on a final game', 'assistant', $q$INSERT INTO play_charting (play_id, game_id) VALUES ('10000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002')$q$, 'ok:1'),
('staff cannot chart film', 'staff', $q$INSERT INTO play_charting (play_id, game_id) VALUES ('10000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002')$q$, '42501'),

-- Invite codes
('head coach invites an assistant', 'head', $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'assistant', 7, 1, 'Coach B')$q$, 'ok:1'),
('head coach invites staff', 'head', $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'staff', 7, 1, NULL)$q$, 'ok:1'),
('head coach cannot invite a head coach', 'head', $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'head_coach', 7, 1, NULL)$q$, '42501'),
('head coach cannot invite an admin', 'head', $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'admin', 7, 1, NULL)$q$, '42501'),
('assistant cannot invite anyone', 'assistant', $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'staff', 7, 1, NULL)$q$, '42501'),
('admin invites a head coach', 'admin', $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'head_coach', 7, 1, NULL)$q$, 'ok:1'),
('an old app build''s member code still works', 'admin', $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'member', 30, NULL, NULL)$q$, 'ok:1'),
('admin sees every code', 'admin', $q$SELECT 1 FROM program_invite_codes WHERE program_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:2'),
('head coach sees only assistant and staff codes', 'head', $q$SELECT 1 FROM program_invite_codes WHERE program_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'ok:1'),
('assistant sees no codes', 'assistant', $q$SELECT 1 FROM program_invite_codes$q$, 'ok:0'),
('head coach cannot revoke the admin code', 'head', $q$UPDATE program_invite_codes SET revoked = true WHERE code = 'TESTADMN'$q$, 'ok:0'),
('head coach revokes an assistant code', 'head', $q$UPDATE program_invite_codes SET revoked = true WHERE code = 'TESTASST'$q$, 'ok:1'),
('head coach cannot upgrade a code to admin', 'head', $q$UPDATE program_invite_codes SET role = 'admin' WHERE code = 'TESTASST'$q$, '42501'),

-- People
('head coach lists people', 'head', $q$SELECT * FROM public.list_program_members('b0000000-0000-4000-8000-000000000001')$q$, 'ok:4'),
('assistant cannot list people', 'assistant', $q$SELECT * FROM public.list_program_members('b0000000-0000-4000-8000-000000000001')$q$, '42501'),
('head coach makes an assistant staff', 'head', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'staff')$q$, 'ok:1'),
('head coach makes staff an assistant', 'head', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'assistant')$q$, 'ok:1'),
('head coach cannot promote to head coach', 'head', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'head_coach')$q$, '42501'),
('head coach cannot demote the admin', 'head', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'staff')$q$, '42501'),
('nobody changes their own role', 'admin', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'staff')$q$, '42501'),
('admin makes the head coach an assistant', 'admin', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'assistant')$q$, 'ok:1'),
('admin makes an assistant an admin', 'admin', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'admin')$q$, 'ok:1'),
('assistant cannot change roles', 'assistant', $q$SELECT public.set_member_role('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'assistant')$q$, '42501'),
('head coach removes staff', 'head', $q$SELECT public.remove_member('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004')$q$, 'ok:1'),
('head coach cannot remove the admin', 'head', $q$SELECT public.remove_member('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001')$q$, '42501'),
('admin removes the head coach', 'admin', $q$SELECT public.remove_member('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002')$q$, 'ok:1'),
('nobody removes themselves', 'admin', $q$SELECT public.remove_member('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001')$q$, '42501'),
('other program admin cannot remove our people', 'other_admin', $q$SELECT public.remove_member('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003')$q$, '42501'),
('no direct membership writes, even for an admin', 'admin', $q$INSERT INTO program_members (program_id, user_id, role) VALUES ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'admin')$q$, '42501'),
('no direct role edits, even for an admin', 'admin', $q$UPDATE program_members SET role = 'staff' WHERE user_id = 'a0000000-0000-4000-8000-000000000003'$q$, 'ok:0'),
('nobody reads the removals table', 'admin', $q$SELECT 1 FROM program_member_removals$q$, '42501'),
('is_program_owner answers for admins', 'admin', $q$SELECT 1 WHERE public.is_program_owner('b0000000-0000-4000-8000-000000000001')$q$, 'ok:1'),
('is_program_owner is false for a head coach', 'head', $q$SELECT 1 WHERE public.is_program_owner('b0000000-0000-4000-8000-000000000001')$q$, 'ok:0');

CREATE TEMP TABLE results AS
SELECT c.n, c.label, c.actor, c.expected, pg_temp.attempt(w.id, c.stmt) AS got
FROM checks c JOIN who w ON w.name = c.actor
ORDER BY c.n;

-- ---------------------------------------------- removal has to stick
-- These steps build on each other, so they run for real (still rolled back
-- at the end). The assistant joined with TESTASST, is removed, and must not
-- get back in with it; a code minted after the removal does let them in.
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.remove_member('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003');
RESET ROLE;
INSERT INTO results (n, label, actor, expected, got)
SELECT 1001, 'a removed coach cannot rejoin with an old code', 'assistant', '22023',
  pg_temp.attempt('a0000000-0000-4000-8000-000000000003', $q$SELECT public.redeem_invite_code('TESTASST')$q$);

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.create_invite_code('b0000000-0000-4000-8000-000000000001', 'staff', 7, 1, 'Again') AS fresh_code \gset
RESET ROLE;
INSERT INTO results (n, label, actor, expected, got)
SELECT 1002, 'a fresh invite after removal lets them back in', 'assistant', 'ok:1',
  pg_temp.attempt('a0000000-0000-4000-8000-000000000003', format('SELECT public.redeem_invite_code(%L)', :'fresh_code'));

SELECT n, label, actor, expected, got FROM results WHERE got IS DISTINCT FROM expected ORDER BY n;
SELECT count(*) AS checks, count(*) FILTER (WHERE got = expected) AS passed FROM results;

ROLLBACK;
