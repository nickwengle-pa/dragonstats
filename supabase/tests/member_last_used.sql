-- Checks for 20261020000000_member_last_used.sql. Run after the migrations,
-- with psql as a superuser, e.g. against the local stack:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/member_last_used.sql
-- Everything is rolled back. The first result lists only the checks that did
-- NOT come out as expected, then a one-row summary; an empty first result is
-- a pass.
BEGIN;

-- ---------------------------------------------------------------- fixtures
INSERT INTO auth.users (id, email, raw_user_meta_data, last_sign_in_at) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'admin@test',  '{}', '2026-10-01 12:00+00'),
  ('a1000000-0000-4000-8000-000000000002', 'head@test',   '{}', '2026-10-02 12:00+00'),
  ('a1000000-0000-4000-8000-000000000003', 'asst@test',   '{}', '2026-10-03 12:00+00'),
  ('a1000000-0000-4000-8000-000000000004', 'staff@test',  '{}', '2026-10-04 12:00+00'),
  ('a1000000-0000-4000-8000-000000000005', 'never@test',  '{}', NULL);

INSERT INTO programs (id, name, abbreviation, owner_id) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'Test HS', 'THS', 'a1000000-0000-4000-8000-000000000001');
INSERT INTO program_members (program_id, user_id, role) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'head_coach'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'assistant'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'staff'),
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000005', 'staff');

-- admin: two devices; the newer renewal wins.
-- head: renewal stamped only in refreshed_at, which has no zone and is UTC.
-- asst: a session never renewed since sign-in.
-- staff and never: no session (signed out, or never signed in), so no last used.
INSERT INTO auth.sessions (id, user_id, created_at, updated_at, refreshed_at) VALUES
  ('51000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', '2026-10-01 12:00+00', '2026-10-15 09:00+00', '2026-10-15 09:00'),
  ('51000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', '2026-10-01 12:00+00', '2026-10-19 21:30+00', '2026-10-19 21:30'),
  ('51000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', '2026-10-02 12:00+00', '2026-10-02 12:00+00', '2026-10-18 23:45'),
  ('51000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000003', '2026-10-03 12:00+00', '2026-10-03 12:00+00', NULL);

-- ------------------------------------------------------------------ harness
CREATE TEMP TABLE results (n INT, label TEXT, expected TEXT, got TEXT);

CREATE FUNCTION pg_temp.listed(who UUID) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  outcome TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    -- email=last used/last in, in UTC
    SELECT string_agg(email || '=' || COALESCE(to_char(last_used_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI'), '-')
                      || '/' || COALESCE(to_char(last_sign_in_at AT TIME ZONE 'UTC', 'MM-DD'), '-'), ' ' ORDER BY email)
      INTO outcome
      FROM public.list_program_members('b1000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN OTHERS THEN
    outcome := SQLSTATE;
  END;
  RESET ROLE;
  RETURN outcome;
END;
$$;

-- ------------------------------------------------------------------ checks
INSERT INTO results VALUES
  (1, 'last used is the newest renewal, none without a session, and last in stays as it was',
    'admin@test=10-19 21:30/10-01 asst@test=10-03 12:00/10-03 head@test=10-18 23:45/10-02 never@test=-/- staff@test=-/10-04',
    pg_temp.listed('a1000000-0000-4000-8000-000000000002')),
  (2, 'an assistant still cannot list people', '42501',
    pg_temp.listed('a1000000-0000-4000-8000-000000000003'));

INSERT INTO results
SELECT 3, 'still a definer function signed-in users may call, anon may not',
  'definer auth:true anon:false',
  CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END
    || ' auth:' || has_function_privilege('authenticated', p.oid, 'execute')
    || ' anon:' || has_function_privilege('anon', p.oid, 'execute')
FROM pg_proc p WHERE p.oid = 'public.list_program_members(uuid)'::regprocedure;

SELECT n, label, expected, got FROM results WHERE got IS DISTINCT FROM expected ORDER BY n;
SELECT count(*) AS checks, count(*) FILTER (WHERE got = expected) AS passed FROM results;

ROLLBACK;
