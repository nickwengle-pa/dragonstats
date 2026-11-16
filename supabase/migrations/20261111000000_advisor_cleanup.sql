-- ============================================================================
-- Advisor cleanup: the helpers are for signed-in coaches only, and now say so
-- ============================================================================
-- 20261016000000_program_roles.sql revoked the membership and role helpers
-- FROM PUBLIC, meaning to leave them to signed-in coaches. On Supabase that is
-- not enough: the platform's default privileges grant EXECUTE on every new
-- public function to `anon` by name, and a revoke from PUBLIC leaves that
-- grant standing. So 27 functions were still callable with nothing but the
-- public anon key, 21 of them SECURITY DEFINER, which is what the security
-- advisor keeps reporting. None of them gives a signed-out caller anything -
-- each resolves membership through auth.uid(), which is NULL without a
-- session - but nothing signed-out has any business calling them.
--
-- Revoking alone would break something, though. Every table policy was written
-- without a TO clause, so it applies to `anon` as well and calls these helpers
-- while filtering rows. Take EXECUTE away and an anon read stops coming back
-- empty and starts failing with 42501 - and keep-warm.yml makes exactly that
-- read on `programs` every two days, so the job would go red. The policies
-- therefore move to TO authenticated first. With no policy for anon, RLS
-- denies by default: the same read returns [] with HTTP 200, as it does now,
-- without evaluating anything.
--
-- For a signed-in coach nothing changes: same policies, same functions, same
-- grants. For anon, table reads still return nothing, and RPC calls are
-- refused instead of answered with false.
--
-- Both loops read the catalog instead of naming objects, because
-- rls_auto_enable() was created from the dashboard and does not exist on a
-- local stack, where a REVOKE that named it would fail the whole reset.
-- Safe to run twice.

-- 1. Policies: signed-in users only ------------------------------------------
-- 47 policies on 15 tables at the time of writing. The two that already name
-- their roles ("Private rollout blocks program creation" and "Auth checks
-- signup invites") are left alone.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{public}'::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                   p.policyname, p.schemaname, p.tablename);
  END LOOP;
END;
$$;

-- 2. Functions: nothing in public is callable without a session --------------
-- Trigger functions cannot be called directly, so they only lose anon and
-- PUBLIC. Everything else keeps (or regains) its grant to authenticated, in
-- case that access had been arriving through PUBLIC.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature,
           p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype) AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.signature);
    IF NOT f.is_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.signature);
    END IF;
  END LOOP;
END;
$$;

-- 3. Pin the search path on the two functions that never had one -------------
-- Both use only built-ins, so this changes nothing they resolve.
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.generate_invite_code() SET search_path = public;

-- 4. Index the foreign keys the performance advisor lists --------------------
CREATE INDEX IF NOT EXISTS idx_programs_owner
  ON public.programs (owner_id);
CREATE INDEX IF NOT EXISTS idx_games_opponent
  ON public.games (opponent_id);
CREATE INDEX IF NOT EXISTS idx_program_invite_codes_created_by
  ON public.program_invite_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_program_member_removals_user
  ON public.program_member_removals (user_id);
CREATE INDEX IF NOT EXISTS idx_program_member_removals_removed_by
  ON public.program_member_removals (removed_by);

-- 5. Say so if anything was missed -------------------------------------------
-- A warning, not an error: a leftover is worth knowing about but is no reason
-- to roll back the rest.
DO $$
DECLARE
  leftover INTEGER;
BEGIN
  SELECT count(*) INTO leftover
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF leftover > 0 THEN
    RAISE WARNING 'advisor_cleanup: % public function(s) still executable by anon', leftover;
  END IF;

  SELECT count(*) INTO leftover
  FROM pg_policies
  WHERE schemaname = 'public'
    AND roles = '{public}'::name[];
  IF leftover > 0 THEN
    RAISE WARNING 'advisor_cleanup: % public policy(ies) still apply to PUBLIC', leftover;
  END IF;
END;
$$;

-- What the advisor will still list afterwards, on purpose:
--   * "Signed-in users can execute SECURITY DEFINER function" - they have to;
--     that is how the policies and the People card work.
--   * "RLS enabled, no policy" on game_activity_pending, game_activity_stash
--     and program_member_removals - only the definer functions touch those.
--   * "Leaked password protection disabled" - a Pro plan setting.
