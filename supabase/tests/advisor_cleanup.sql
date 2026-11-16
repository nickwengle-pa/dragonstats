-- Checks for 20261111000000_advisor_cleanup.sql. Run after the migration, with
-- psql as a superuser, e.g. against the local stack:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/advisor_cleanup.sql
-- Everything is rolled back. The first result lists only the checks that did
-- NOT come out as expected, then a one-row summary; an empty first result is
-- a pass.
--
-- "ok:N" = ran and returned or touched N rows. A SQLSTATE (42501) = refused.
-- The point of the anon checks: a signed-out read must still come back EMPTY,
-- not refused, because keep-warm.yml fails on anything but a 2xx.
BEGIN;

CREATE TEMP TABLE results (n INT, label TEXT, expected TEXT, got TEXT);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-4000-8000-0000000000c1', 'cleanup-owner@example.test', '{}');
INSERT INTO programs (id, name, abbreviation, owner_id) VALUES
  ('b0000000-0000-4000-8000-0000000000c1', 'Cleanup Check', 'CLN', 'a0000000-0000-4000-8000-0000000000c1');

-- Runs one statement as a role, in its own subtransaction, and undoes it.
CREATE FUNCTION pg_temp.try_as(role_name TEXT, claims TEXT, stmt TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  n BIGINT;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', claims, true);
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'P0999', MESSAGE = 'ok:' || n;  -- undo, keep the count
  EXCEPTION WHEN OTHERS THEN
    RETURN CASE WHEN SQLSTATE = 'P0999' THEN SQLERRM ELSE SQLSTATE END;
  END;
END;
$$;

INSERT INTO results VALUES
(1, 'no public function is executable by anon', '0',
   (SELECT count(*)::TEXT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND has_function_privilege('anon', p.oid, 'EXECUTE'))),
(2, 'no public policy applies to PUBLIC', '0',
   (SELECT count(*)::TEXT FROM pg_policies WHERE schemaname = 'public' AND roles = '{public}'::name[])),
(3, 'every public function has a search_path', '0',
   (SELECT count(*)::TEXT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proconfig IS NULL)),
(4, 'anon read of programs comes back empty, not refused (the keep-warm query)', 'ok:0',
   pg_temp.try_as('anon', '{}', 'SELECT id FROM programs LIMIT 1')),
(5, 'anon read of the game_schedule view comes back empty', 'ok:0',
   pg_temp.try_as('anon', '{}', 'SELECT * FROM game_schedule LIMIT 1')),
(6, 'anon cannot call a membership helper', '42501',
   pg_temp.try_as('anon', '{}', $q$SELECT public.is_program_member('b0000000-0000-4000-8000-0000000000c1')$q$)),
(7, 'anon cannot call redeem_invite_code', '42501',
   pg_temp.try_as('anon', '{}', $q$SELECT public.redeem_invite_code('ABCDEFGH')$q$)),
(8, 'a signed-in member still reads their program', 'ok:1',
   pg_temp.try_as('authenticated', '{"sub":"a0000000-0000-4000-8000-0000000000c1","role":"authenticated"}',
                  'SELECT id FROM programs')),
(9, 'a signed-in admin still renames their program (fires the triggers)', 'ok:1',
   pg_temp.try_as('authenticated', '{"sub":"a0000000-0000-4000-8000-0000000000c1","role":"authenticated"}',
                  $q$UPDATE programs SET name = 'Renamed' WHERE id = 'b0000000-0000-4000-8000-0000000000c1'$q$)),
(10, 'a signed-in admin still creates an invite code', 'ok:1',
   pg_temp.try_as('authenticated', '{"sub":"a0000000-0000-4000-8000-0000000000c1","role":"authenticated"}',
                  $q$SELECT public.create_invite_code('b0000000-0000-4000-8000-0000000000c1', 'assistant', 7, 5, 'check')$q$));

SELECT n, label, expected, got FROM results WHERE got IS DISTINCT FROM expected ORDER BY n;
SELECT count(*) AS checks, count(*) FILTER (WHERE got = expected) AS passed FROM results;

ROLLBACK;
