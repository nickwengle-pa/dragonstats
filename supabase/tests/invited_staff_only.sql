-- Run after the migration. Fixtures and changes are rolled back.
BEGIN;
INSERT INTO public.program_invite_codes (code, program_id, expires_at, revoked, max_uses, uses)
SELECT upper(fixture.code), p.id, fixture.expires_at, fixture.revoked, fixture.max_uses, fixture.uses
FROM (SELECT id FROM public.programs ORDER BY created_at LIMIT 1) p
CROSS JOIN (VALUES
  ('__test_valid__', now() + interval '1 day', false, 2, 0),
  ('__test_expired__', now() - interval '1 day', false, 2, 0),
  ('__test_revoked__', now() + interval '1 day', true, 2, 0),
  ('__test_used__', now() + interval '1 day', false, 2, 2)
) AS fixture(code, expires_at, revoked, max_uses, uses);

-- Hosted SQL Editor cannot SET ROLE supabase_auth_admin. Exercise the hook
-- here as postgres, then verify the configured hook via a denied signup.
SELECT
  public.require_signup_invite('{"user":{"user_metadata":{}}}') ? 'error' AS missing_code_blocked,
  public.require_signup_invite('{"user":{"user_metadata":{"pending_invite_code":"__test_unknown__"}}}') ? 'error' AS unknown_code_blocked,
  public.require_signup_invite('{"user":{"user_metadata":{"pending_invite_code":" __test_valid__ "}}}') = '{}'::jsonb AS valid_code_allowed,
  public.require_signup_invite('{"user":{"user_metadata":{"pending_invite_code":"__test_expired__"}}}') ? 'error' AS expired_code_blocked,
  public.require_signup_invite('{"user":{"user_metadata":{"pending_invite_code":"__test_revoked__"}}}') ? 'error' AS revoked_code_blocked,
  public.require_signup_invite('{"user":{"user_metadata":{"pending_invite_code":"__test_used__"}}}') ? 'error' AS used_code_blocked;
SELECT
  NOT has_table_privilege('authenticated', 'public.programs', 'INSERT') AS members_cannot_create_programs,
  NOT has_table_privilege('anon', 'public.programs', 'INSERT') AS anonymous_cannot_create_programs,
  NOT has_function_privilege('authenticated', 'public.require_signup_invite(jsonb)', 'EXECUTE') AS clients_cannot_probe_invites,
  has_table_privilege('authenticated', 'public.programs', 'SELECT')
    AND has_table_privilege('authenticated', 'public.programs', 'UPDATE') AS existing_team_access_preserved;
ROLLBACK;
