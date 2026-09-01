-- ============================================================================
-- Invite codes — how a coach joins a program
-- ============================================================================
-- Membership is now the thing that grants access to a program's data, so there
-- has to be a way to grant it that does not involve the owner running SQL. A
-- code is that way: the owner generates one, hands it to a coach, and the coach
-- redeems it during sign-up.
--
-- The code is the credential, so the rules that matter are:
--   * only a program's owners can create or even SEE its codes — nobody can
--     enumerate codes belonging to a program they are not in;
--   * redemption goes through a SECURITY DEFINER function, because the person
--     redeeming is by definition not yet a member and cannot write to
--     program_members themselves;
--   * a code can carry a role, but only an owner can mint an owner-granting
--     code, so redeeming can never escalate past what the issuer chose;
--   * codes expire and can be capped or revoked, so a code that leaks is a
--     bounded problem rather than a permanent back door.
--
-- Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS program_invite_codes (
  code       TEXT PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  label      TEXT,                       -- e.g. "OC" — who it was handed to
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                -- NULL = no expiry
  max_uses   INTEGER,                    -- NULL = unlimited
  uses       INTEGER NOT NULL DEFAULT 0,
  revoked    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_program ON program_invite_codes(program_id);

ALTER TABLE program_invite_codes ENABLE ROW LEVEL SECURITY;

-- Owners only, for reads as well as writes. A member cannot list the codes for
-- their own program, and nobody outside it can see they exist.
DROP POLICY IF EXISTS "Owners manage invite codes" ON program_invite_codes;
CREATE POLICY "Owners manage invite codes" ON program_invite_codes
  FOR ALL USING (public.is_program_owner(program_id))
  WITH CHECK (public.is_program_owner(program_id));

-- ----------------------------------------------------------------------------
-- Minting
-- ----------------------------------------------------------------------------
-- Alphabet excludes O/0/I/1: these get read aloud in a coaches' meeting and
-- typed on a phone. 8 characters from 32 is ~1.1e12 combinations, which is far
-- past guessing given codes also expire and can be capped.

CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invite_code(
  target_program_id UUID,
  target_role       TEXT DEFAULT 'member',
  valid_days        INTEGER DEFAULT 30,
  code_max_uses     INTEGER DEFAULT NULL,
  code_label        TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  attempts INTEGER := 0;
BEGIN
  IF NOT public.is_program_owner(target_program_id) THEN
    RAISE EXCEPTION 'Only a program owner can create invite codes'
      USING ERRCODE = '42501';
  END IF;

  IF target_role NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'Unknown role %', target_role USING ERRCODE = '22023';
  END IF;

  -- Collisions are vanishingly unlikely but the code is a primary key, so a
  -- retry is cheaper than an error surfacing to a coach in a parking lot.
  LOOP
    new_code := public.generate_invite_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM program_invite_codes WHERE code = new_code);
    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Could not allocate an unused invite code';
    END IF;
  END LOOP;

  INSERT INTO program_invite_codes (code, program_id, role, label, created_by, expires_at, max_uses)
  VALUES (
    new_code,
    target_program_id,
    target_role,
    code_label,
    auth.uid(),
    CASE WHEN valid_days IS NULL THEN NULL ELSE now() + make_interval(days => valid_days) END,
    code_max_uses
  );

  RETURN new_code;
END;
$$;

-- ----------------------------------------------------------------------------
-- Redemption
-- ----------------------------------------------------------------------------
-- Runs as definer: the caller is not a member yet, so they cannot see the code
-- row or write their own membership. Returns the program joined.

CREATE OR REPLACE FUNCTION public.redeem_invite_code(submitted_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite program_invite_codes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before redeeming an invite code' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invite
  FROM program_invite_codes
  WHERE code = upper(btrim(submitted_code))
    AND NOT revoked
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses < max_uses)
  FOR UPDATE;

  -- One message for every failure mode on purpose: expired, revoked, used up
  -- and never-existed should be indistinguishable to someone guessing.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That invite code is not valid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO program_members (program_id, user_id, role)
  VALUES (invite.program_id, auth.uid(), invite.role)
  ON CONFLICT (program_id, user_id) DO NOTHING;

  -- Only count a use that actually added someone. Re-redeeming the same code on
  -- the same account is a no-op, not another seat off the cap.
  IF FOUND THEN
    UPDATE program_invite_codes SET uses = uses + 1 WHERE code = invite.code;
  END IF;

  RETURN invite.program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invite_code(UUID, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_invite_code(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_invite_code(UUID, TEXT, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(TEXT) TO authenticated;
