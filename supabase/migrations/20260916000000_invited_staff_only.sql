-- Private rollout: new accounts need an owner-issued invite; app clients
-- cannot create programs. Existing membership and team editing are unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.require_signup_invite(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  submitted text := upper(btrim(event #>> '{user,user_metadata,pending_invite_code}'));
BEGIN
  IF submitted IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.program_invite_codes
    WHERE code = submitted
      AND NOT revoked
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR uses < max_uses)
  ) THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'DragonStats is invite-only. Ask your program administrator for a valid invite code.'
    ));
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.require_signup_invite(jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.require_signup_invite(jsonb) TO supabase_auth_admin;
GRANT SELECT (code, revoked, expires_at, max_uses, uses)
  ON public.program_invite_codes TO supabase_auth_admin;
DROP POLICY IF EXISTS "Auth checks signup invites" ON public.program_invite_codes;
CREATE POLICY "Auth checks signup invites" ON public.program_invite_codes
  FOR SELECT TO supabase_auth_admin USING (true);

-- Restrictive policy protects against any other permissive INSERT policy.
DROP POLICY IF EXISTS "Private rollout blocks program creation" ON public.programs;
CREATE POLICY "Private rollout blocks program creation" ON public.programs
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
REVOKE INSERT ON public.programs FROM anon, authenticated;

COMMIT;
