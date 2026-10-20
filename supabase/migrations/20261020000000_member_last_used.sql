-- ============================================================================
-- People card: when each member last used the app
-- ============================================================================
-- The card already shows auth.users.last_sign_in_at as "last in", but the app
-- keeps people signed in for weeks, so that date is when someone last typed a
-- password, not when they last opened the app. Supabase stamps the session
-- (updated_at, and refreshed_at in UTC without a zone) each time the app
-- renews its token, which it does about hourly while a screen is open, so the
-- newest stamp across a member's sessions is the best "last used" the server
-- has. A sign-out deletes the session, so the last sign-in still counts.
--
-- Adding a column changes the function's return type, which CREATE OR REPLACE
-- cannot do, hence the drop. Older builds read the rows by name and ignore
-- the extra column, so this can run before or after the app deploys.

DROP FUNCTION IF EXISTS public.list_program_members(UUID);

CREATE FUNCTION public.list_program_members(target_program_id UUID)
RETURNS TABLE (
  user_id         UUID,
  email           TEXT,
  display_name    TEXT,
  role            TEXT,
  joined_at       TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  is_me           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.program_rank(target_program_id) < 3 THEN
    RAISE EXCEPTION 'Only a head coach or admin can see the people in a program'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.user_id,
    u.email::TEXT,
    NULLIF(btrim(COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'display_name'
    )), ''),
    m.role,
    m.created_at,
    u.last_sign_in_at,
    GREATEST(u.last_sign_in_at, (
      SELECT max(GREATEST(s.updated_at, s.refreshed_at AT TIME ZONE 'UTC'))
      FROM auth.sessions s
      WHERE s.user_id = m.user_id
    )),
    m.user_id = auth.uid()
  FROM program_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.program_id = target_program_id
  ORDER BY public.role_rank(m.role) DESC, m.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.list_program_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_program_members(UUID) TO authenticated;
