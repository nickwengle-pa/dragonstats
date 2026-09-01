-- ============================================================================
-- Program-scoped RLS
-- ============================================================================
-- Replaces the placeholder policies from the initial schema, which were all
-- `auth.role() = 'authenticated'` with no WITH CHECK — i.e. any account that
-- could log in could read, edit and delete every program's players, plays,
-- games and film charting. The anon key ships in the public JS bundle, so with
-- open sign-up that was effectively public write access to the whole database.
--
-- Membership model, deliberately small: a program has members, one or more of
-- whom are owners. That is enough to isolate one school from another. Invites,
-- read-only sharing and per-season roles are a later concern; nothing here
-- blocks adding them.
--
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Membership
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS program_members (
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_program_members_user ON program_members(user_id);

-- Existing programs already record their creator. Backfill so nobody is locked
-- out of their own data the moment these policies take effect.
INSERT INTO program_members (program_id, user_id, role)
SELECT id, owner_id, 'owner' FROM programs WHERE owner_id IS NOT NULL
ON CONFLICT (program_id, user_id) DO NOTHING;

-- A program created under the new policies has no membership row yet, so the
-- creator would be locked out of the row they just inserted. Enrol them in the
-- same transaction. SECURITY DEFINER because program_members is itself RLS'd.
--
-- Fires on owner_id changes too, not just INSERT: seed and admin scripts create
-- programs with no owner and attach one afterwards, and a program whose owner
-- was set by a later UPDATE needs the membership just as much. A NULL owner is
-- left alone rather than raising — that is a service-role insert with no user
-- to enrol, and failing there would break seeding and restores.
CREATE OR REPLACE FUNCTION public.enrol_program_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_owner UUID := COALESCE(NEW.owner_id, auth.uid());
BEGIN
  IF new_owner IS NOT NULL THEN
    INSERT INTO program_members (program_id, user_id, role)
    VALUES (NEW.id, new_owner, 'owner')
    ON CONFLICT (program_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programs_enrol_creator ON programs;
DROP TRIGGER IF EXISTS programs_enrol_owner ON programs;
CREATE TRIGGER programs_enrol_owner
  AFTER INSERT OR UPDATE OF owner_id ON programs
  FOR EACH ROW EXECUTE FUNCTION public.enrol_program_owner();

-- ----------------------------------------------------------------------------
-- 2. Membership predicates
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so they read the membership/parent tables without invoking
-- the very policies that call them (a policy on seasons that queries seasons
-- recurses). STABLE lets the planner reuse the result within one statement,
-- which matters because a policy predicate is evaluated per row.
--
-- Each one answers: does the current user belong to the program that owns this
-- row? The chains mirror the foreign keys —
--   season_rosters/coaches -> seasons -> programs
--   games -> seasons -> programs
--   plays/game_stats_cache/play_charting -> games -> seasons -> programs
--   play_players -> plays -> games -> seasons -> programs
--   opponent_players -> opponents -> programs

CREATE OR REPLACE FUNCTION public.is_program_member(target_program_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM program_members m
    WHERE m.program_id = target_program_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_program_owner(target_program_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM program_members m
    WHERE m.program_id = target_program_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_season_member(target_season_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM seasons s
    JOIN program_members m ON m.program_id = s.program_id
    WHERE s.id = target_season_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_game_member(target_game_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM games g
    JOIN seasons s ON s.id = g.season_id
    JOIN program_members m ON m.program_id = s.program_id
    WHERE g.id = target_game_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_play_member(target_play_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM plays p
    JOIN games g ON g.id = p.game_id
    JOIN seasons s ON s.id = g.season_id
    JOIN program_members m ON m.program_id = s.program_id
    WHERE p.id = target_play_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_player_member(target_player_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM players pl
    JOIN program_members m ON m.program_id = pl.program_id
    WHERE pl.id = target_player_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_opponent_member(target_opponent_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM opponents o
    JOIN program_members m ON m.program_id = o.program_id
    WHERE o.id = target_opponent_id AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_program_member(UUID)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_program_owner(UUID)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_season_member(UUID)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_game_member(UUID)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_play_member(UUID)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_player_member(UUID)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_opponent_member(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_program_member(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_program_owner(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_season_member(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_game_member(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_play_member(UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_player_member(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_opponent_member(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Out with the placeholder policies
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users full access" ON programs;
DROP POLICY IF EXISTS "Authenticated users full access" ON seasons;
DROP POLICY IF EXISTS "Authenticated users full access" ON players;
DROP POLICY IF EXISTS "Authenticated users full access" ON season_rosters;
DROP POLICY IF EXISTS "Authenticated users full access" ON opponents;
DROP POLICY IF EXISTS "Authenticated users full access" ON games;
DROP POLICY IF EXISTS "Authenticated users full access" ON plays;
DROP POLICY IF EXISTS "Authenticated users full access" ON play_players;
DROP POLICY IF EXISTS "Authenticated users full access" ON game_stats_cache;
DROP POLICY IF EXISTS "Authenticated users full access" ON coaches;
DROP POLICY IF EXISTS "Authenticated users full access" ON opponent_players;
DROP POLICY IF EXISTS "Authenticated users full access" ON play_charting;

ALTER TABLE program_members ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Program-scoped policies
-- ----------------------------------------------------------------------------
-- Every policy carries WITH CHECK as well as USING. Without it a user could
-- satisfy the read test on a row they own and then UPDATE it to point at
-- someone else's program — writing into data they cannot see.

-- programs: INSERT is separate because the membership row cannot exist yet.
-- The trigger above creates it; the check just insists you own what you make.
DROP POLICY IF EXISTS "Members read their programs" ON programs;
CREATE POLICY "Members read their programs" ON programs
  FOR SELECT USING (public.is_program_member(id));

DROP POLICY IF EXISTS "Users create their own program" ON programs;
CREATE POLICY "Users create their own program" ON programs
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members update their programs" ON programs;
CREATE POLICY "Members update their programs" ON programs
  FOR UPDATE USING (public.is_program_member(id))
  WITH CHECK (public.is_program_member(id));

DROP POLICY IF EXISTS "Owners delete their programs" ON programs;
CREATE POLICY "Owners delete their programs" ON programs
  FOR DELETE USING (public.is_program_owner(id));

DROP POLICY IF EXISTS "Program scoped" ON seasons;
CREATE POLICY "Program scoped" ON seasons FOR ALL
  USING (public.is_program_member(program_id))
  WITH CHECK (public.is_program_member(program_id));

DROP POLICY IF EXISTS "Program scoped" ON players;
CREATE POLICY "Program scoped" ON players FOR ALL
  USING (public.is_program_member(program_id))
  WITH CHECK (public.is_program_member(program_id));

DROP POLICY IF EXISTS "Program scoped" ON opponents;
CREATE POLICY "Program scoped" ON opponents FOR ALL
  USING (public.is_program_member(program_id))
  WITH CHECK (public.is_program_member(program_id));

-- Both sides checked: the season AND the player have to be yours, or a roster
-- row becomes a way to attach someone else's player to your season.
DROP POLICY IF EXISTS "Program scoped" ON season_rosters;
CREATE POLICY "Program scoped" ON season_rosters FOR ALL
  USING (public.is_season_member(season_id))
  WITH CHECK (public.is_season_member(season_id) AND public.is_player_member(player_id));

DROP POLICY IF EXISTS "Program scoped" ON coaches;
CREATE POLICY "Program scoped" ON coaches FOR ALL
  USING (public.is_season_member(season_id))
  WITH CHECK (public.is_season_member(season_id));

DROP POLICY IF EXISTS "Program scoped" ON games;
CREATE POLICY "Program scoped" ON games FOR ALL
  USING (public.is_season_member(season_id))
  WITH CHECK (public.is_season_member(season_id));

DROP POLICY IF EXISTS "Program scoped" ON plays;
CREATE POLICY "Program scoped" ON plays FOR ALL
  USING (public.is_game_member(game_id))
  WITH CHECK (public.is_game_member(game_id));

DROP POLICY IF EXISTS "Program scoped" ON play_players;
CREATE POLICY "Program scoped" ON play_players FOR ALL
  USING (public.is_play_member(play_id))
  WITH CHECK (public.is_play_member(play_id) AND public.is_player_member(player_id));

DROP POLICY IF EXISTS "Program scoped" ON game_stats_cache;
CREATE POLICY "Program scoped" ON game_stats_cache FOR ALL
  USING (public.is_game_member(game_id))
  WITH CHECK (public.is_game_member(game_id));

DROP POLICY IF EXISTS "Program scoped" ON opponent_players;
CREATE POLICY "Program scoped" ON opponent_players FOR ALL
  USING (public.is_opponent_member(opponent_id))
  WITH CHECK (public.is_opponent_member(opponent_id));

DROP POLICY IF EXISTS "Program scoped" ON play_charting;
CREATE POLICY "Program scoped" ON play_charting FOR ALL
  USING (public.is_game_member(game_id))
  WITH CHECK (public.is_game_member(game_id));

-- program_members: you can see who is in your programs; only an owner changes
-- the roster of members. These MUST go through the SECURITY DEFINER helpers —
-- a policy on program_members that sub-selects program_members re-enters its
-- own policy and Postgres aborts with "infinite recursion detected in policy".
DROP POLICY IF EXISTS "Members read their memberships" ON program_members;
CREATE POLICY "Members read their memberships" ON program_members
  FOR SELECT USING (user_id = auth.uid() OR public.is_program_member(program_id));

DROP POLICY IF EXISTS "Owners manage members" ON program_members;
CREATE POLICY "Owners manage members" ON program_members
  FOR ALL USING (public.is_program_owner(program_id))
  WITH CHECK (public.is_program_owner(program_id));

-- ----------------------------------------------------------------------------
-- 5. Harden the security-definer season switch
-- ----------------------------------------------------------------------------
-- It verified the season belonged to the program, but never that the caller
-- belonged to the program — so any authenticated user could switch any
-- school's active season.

CREATE OR REPLACE FUNCTION public.set_active_season(target_program_id UUID, target_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_program_member(target_program_id) THEN
    RAISE EXCEPTION 'Not authorised for program %', target_program_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM seasons
    WHERE id = target_season_id
      AND program_id = target_program_id
  ) THEN
    RAISE EXCEPTION 'Season % does not belong to program %', target_season_id, target_program_id;
  END IF;

  UPDATE seasons
  SET is_active = CASE WHEN id = target_season_id THEN true ELSE false END
  WHERE program_id = target_program_id
    AND (is_active = true OR id = target_season_id);

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_season(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_season(UUID, UUID) TO authenticated;
