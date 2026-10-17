-- ============================================================================
-- Program roles: admin, head coach, assistant coach, staff
-- ============================================================================
-- Membership used to be all-or-nothing. An "owner" could mint invite codes and
-- delete the program; every "member" could do everything else - record and
-- rewrite any game, change a final, edit the schedule, roster and program
-- settings, and delete a whole season from Settings' Danger Zone. Once other
-- coaches started joining, that meant anyone handed a code could undo a final
-- score, and there was no way to see who had joined or to remove anyone.
--
-- Four roles, highest first:
--
--   admin       everything, including people and the Danger Zone.
--   head_coach  all football data, finals included: schedule, roster, program
--               and game settings. Invites and manages assistants and staff,
--               nobody above them. No Danger Zone (no season deletes).
--   assistant   records games and edits plays only while the game is not
--               final. May end a game. Roster: add and edit players. Film
--               charting (formations etc.) on any game, finals included -
--               that is breakdown, not stats.
--   staff       reads everything, writes nothing.
--
-- Existing rows map owner -> admin and member -> assistant, so nobody loses
-- anything they use on game night. Staff is new.
--
-- The rules live here, not in the app: the anon key ships in the public JS
-- bundle, so a hidden button is courtesy and these policies are the control.
--
-- Old app builds mostly keep working against this: is_program_owner() still
-- answers for admins (the old Team Access card calls it), and
-- create_invite_code() still accepts the legacy 'owner' / 'member' role names.
-- The exception is recording. An old build can send End Game ahead of plays
-- still in its sync queue, and once the game is final an assistant's plays
-- are refused. So: deploy the app first, reload it on every device that
-- records games until its sync badge shows nothing pending, THEN apply this.
--
-- Safe to re-run (a re-run makes each program's recorded owner admin again).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The role values
-- ----------------------------------------------------------------------------

ALTER TABLE program_members DROP CONSTRAINT IF EXISTS program_members_role_check;
ALTER TABLE program_invite_codes DROP CONSTRAINT IF EXISTS program_invite_codes_role_check;

UPDATE program_members SET role = 'admin' WHERE role = 'owner';
UPDATE program_members SET role = 'assistant' WHERE role = 'member';
UPDATE program_invite_codes SET role = 'admin' WHERE role = 'owner';
UPDATE program_invite_codes SET role = 'assistant' WHERE role = 'member';

-- A program set up by hand (created with no owner, owner attached later) can
-- have its owner stored as a plain 'member', which would leave it with nobody
-- able to edit the schedule, finals or settings, and no way to fix that from
-- the app. Whoever programs.owner_id names is the program's admin.
UPDATE program_members m SET role = 'admin'
FROM programs p
WHERE p.id = m.program_id AND p.owner_id = m.user_id AND m.role <> 'admin';

ALTER TABLE program_members
  ADD CONSTRAINT program_members_role_check
  CHECK (role IN ('admin', 'head_coach', 'assistant', 'staff'));
ALTER TABLE program_invite_codes
  ADD CONSTRAINT program_invite_codes_role_check
  CHECK (role IN ('admin', 'head_coach', 'assistant', 'staff'));

-- Least privilege for anything that inserts without naming a role. Every
-- writer in this schema names one; this only matters for a hand-run insert.
ALTER TABLE program_members ALTER COLUMN role SET DEFAULT 'staff';
ALTER TABLE program_invite_codes ALTER COLUMN role SET DEFAULT 'assistant';

-- ----------------------------------------------------------------------------
-- 2. Rank helpers
-- ----------------------------------------------------------------------------
-- A role's rank: staff 1, assistant 2, head_coach 3, admin 4, nothing 0. The
-- legacy names are ranked too so a row written by an old build between deploy
-- and this migration still means what it meant.

CREATE OR REPLACE FUNCTION public.role_rank(r TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE r
    WHEN 'admin' THEN 4 WHEN 'owner' THEN 4
    WHEN 'head_coach' THEN 3
    WHEN 'assistant' THEN 2 WHEN 'member' THEN 2
    WHEN 'staff' THEN 1
    ELSE 0
  END;
$$;

-- The caller's rank in a program. SECURITY DEFINER for the same reason as the
-- is_*_member helpers: a policy that reads program_members through its own
-- policy recurses.
CREATE OR REPLACE FUNCTION public.program_rank(target_program_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(public.role_rank(m.role)), 0)
  FROM program_members m
  WHERE m.program_id = target_program_id AND m.user_id = auth.uid();
$$;

-- Walk a row up to its program. Definer so they can read parents the caller
-- may not be able to see yet (a row being inserted, say).
CREATE OR REPLACE FUNCTION public.season_program(target_season_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT program_id FROM seasons WHERE id = target_season_id;
$$;

CREATE OR REPLACE FUNCTION public.game_program(target_game_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.program_id FROM games g JOIN seasons s ON s.id = g.season_id
  WHERE g.id = target_game_id;
$$;

CREATE OR REPLACE FUNCTION public.player_program(target_player_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT program_id FROM players WHERE id = target_player_id;
$$;

CREATE OR REPLACE FUNCTION public.opponent_program(target_opponent_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT program_id FROM opponents WHERE id = target_opponent_id;
$$;

-- May the caller change this game's plays and live state? Head coach and up:
-- always. Assistant: only until the game is final ('completed'). This is the
-- final lock - once End Game is pressed, only a head coach or admin can change
-- the official result. A cancelled game is shut to assistants too: recording
-- on one would set it live again, undoing a schedule decision.
CREATE OR REPLACE FUNCTION public.can_edit_game_stats(target_game_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN r >= 3 THEN true
    WHEN r = 2 THEN COALESCE(status, '') NOT IN ('completed', 'cancelled')
    ELSE false
  END
  FROM (
    SELECT public.program_rank(s.program_id) AS r, g.status
    FROM games g JOIN seasons s ON s.id = g.season_id
    WHERE g.id = target_game_id
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_play_stats(target_play_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_edit_game_stats(p.game_id) FROM plays p WHERE p.id = target_play_id;
$$;

-- Admins only now. Kept by name because the programs DELETE policy and old
-- app builds (the Team Access card) call it.
CREATE OR REPLACE FUNCTION public.is_program_owner(target_program_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.program_rank(target_program_id) >= 4;
$$;

-- Can the caller hand out or take away this role? Admins: any role. Head
-- coaches: assistant and staff only, so nobody can promote past themselves.
CREATE OR REPLACE FUNCTION public.can_assign_role(target_program_id UUID, target_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.program_rank(target_program_id) >= 4 THEN public.role_rank(target_role) > 0
    WHEN public.program_rank(target_program_id) = 3 THEN public.role_rank(target_role) IN (1, 2)
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.role_rank(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.program_rank(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.season_program(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.game_program(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.player_program(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.opponent_program(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_game_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_play_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_program_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_assign_role(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.role_rank(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.program_rank(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.season_program(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.game_program(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_program(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.opponent_program(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_game_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_play_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_program_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_assign_role(UUID, TEXT) TO authenticated;

-- The creator of a program is its admin.
CREATE OR REPLACE FUNCTION public.enrol_program_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_owner UUID := COALESCE(NEW.owner_id, auth.uid());
BEGIN
  -- The trigger fires on any UPDATE that names owner_id, including one that
  -- writes the same value back. That must not re-enrol a creator who has
  -- since been removed or demoted - only a real change of owner does.
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;

  IF new_owner IS NOT NULL AND TG_OP = 'UPDATE' THEN
    -- Only the SQL editor gets here (programs_guard_owner refuses anyone
    -- signed in), so naming a new owner makes them admin even if they had
    -- already joined with a lesser code.
    INSERT INTO program_members (program_id, user_id, role)
    VALUES (NEW.id, new_owner, 'admin')
    ON CONFLICT (program_id, user_id) DO UPDATE SET role = 'admin';
  ELSIF new_owner IS NOT NULL THEN
    INSERT INTO program_members (program_id, user_id, role)
    VALUES (NEW.id, new_owner, 'admin')
    ON CONFLICT (program_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- The enrol trigger above also fires on UPDATE OF owner_id, so whoever can
-- edit the programs row could name any account the owner and have it enrolled
-- as admin - past invite codes, past a removal, and with the power to demote
-- the real admin. The app never moves ownership, so nobody signed in may; the
-- SQL editor (no auth.uid()) still can.
CREATE OR REPLACE FUNCTION public.guard_program_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'The program owner can only be changed by support'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS programs_guard_owner ON programs;
CREATE TRIGGER programs_guard_owner
  BEFORE UPDATE OF owner_id ON programs
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_owner();

-- ----------------------------------------------------------------------------
-- 3. Policies
-- ----------------------------------------------------------------------------
-- Every table keeps "any member reads" and splits writes by role. Each write
-- policy carries WITH CHECK as well as USING, as before, so a row cannot be
-- moved into a program or game the caller could not write to directly.

-- programs: settings are head coach and up; delete stays admin.
DROP POLICY IF EXISTS "Members update their programs" ON programs;
DROP POLICY IF EXISTS "Head coaches update their programs" ON programs;
-- USING admits every member so a lower role's save is refused out loud
-- (42501 from WITH CHECK) instead of matching no rows: an old build only
-- checks for an error, and would otherwise show "Saved!" for game rules that
-- never changed.
CREATE POLICY "Head coaches update their programs" ON programs
  FOR UPDATE USING (public.is_program_member(id))
  WITH CHECK (public.program_rank(id) >= 3);

-- seasons: create and switch are head coach; delete is the Danger Zone.
DROP POLICY IF EXISTS "Program scoped" ON seasons;
DROP POLICY IF EXISTS "Members read" ON seasons;
DROP POLICY IF EXISTS "Head coaches add" ON seasons;
DROP POLICY IF EXISTS "Head coaches update" ON seasons;
DROP POLICY IF EXISTS "Admins delete" ON seasons;
CREATE POLICY "Members read" ON seasons FOR SELECT
  USING (public.is_program_member(program_id));
CREATE POLICY "Head coaches add" ON seasons FOR INSERT
  WITH CHECK (public.program_rank(program_id) >= 3);
CREATE POLICY "Head coaches update" ON seasons FOR UPDATE
  USING (public.program_rank(program_id) >= 3)
  WITH CHECK (public.program_rank(program_id) >= 3);
CREATE POLICY "Admins delete" ON seasons FOR DELETE
  USING (public.program_rank(program_id) >= 4);

-- players: assistants add and edit; removing a player is head coach.
DROP POLICY IF EXISTS "Program scoped" ON players;
DROP POLICY IF EXISTS "Members read" ON players;
DROP POLICY IF EXISTS "Assistants add" ON players;
DROP POLICY IF EXISTS "Assistants update" ON players;
DROP POLICY IF EXISTS "Head coaches delete" ON players;
CREATE POLICY "Members read" ON players FOR SELECT
  USING (public.is_program_member(program_id));
CREATE POLICY "Assistants add" ON players FOR INSERT
  WITH CHECK (public.program_rank(program_id) >= 2);
CREATE POLICY "Assistants update" ON players FOR UPDATE
  USING (public.program_rank(program_id) >= 2)
  WITH CHECK (public.program_rank(program_id) >= 2);
CREATE POLICY "Head coaches delete" ON players FOR DELETE
  USING (public.program_rank(program_id) >= 3);

-- season_rosters: the roster is assistant work, both sides still checked.
DROP POLICY IF EXISTS "Program scoped" ON season_rosters;
DROP POLICY IF EXISTS "Members read" ON season_rosters;
DROP POLICY IF EXISTS "Assistants add" ON season_rosters;
DROP POLICY IF EXISTS "Assistants update" ON season_rosters;
DROP POLICY IF EXISTS "Assistants delete" ON season_rosters;
CREATE POLICY "Members read" ON season_rosters FOR SELECT
  USING (public.is_season_member(season_id));
CREATE POLICY "Assistants add" ON season_rosters FOR INSERT
  WITH CHECK (public.program_rank(public.season_program(season_id)) >= 2
              AND public.is_player_member(player_id));
CREATE POLICY "Assistants update" ON season_rosters FOR UPDATE
  USING (public.program_rank(public.season_program(season_id)) >= 2)
  WITH CHECK (public.program_rank(public.season_program(season_id)) >= 2
              AND public.is_player_member(player_id));
CREATE POLICY "Assistants delete" ON season_rosters FOR DELETE
  USING (public.program_rank(public.season_program(season_id)) >= 2);

-- coaches (the staff list in Settings, not accounts): head coach.
DROP POLICY IF EXISTS "Program scoped" ON coaches;
DROP POLICY IF EXISTS "Members read" ON coaches;
DROP POLICY IF EXISTS "Head coaches add" ON coaches;
DROP POLICY IF EXISTS "Head coaches update" ON coaches;
DROP POLICY IF EXISTS "Head coaches delete" ON coaches;
CREATE POLICY "Members read" ON coaches FOR SELECT
  USING (public.is_season_member(season_id));
CREATE POLICY "Head coaches add" ON coaches FOR INSERT
  WITH CHECK (public.program_rank(public.season_program(season_id)) >= 3);
CREATE POLICY "Head coaches update" ON coaches FOR UPDATE
  USING (public.program_rank(public.season_program(season_id)) >= 3)
  WITH CHECK (public.program_rank(public.season_program(season_id)) >= 3);
CREATE POLICY "Head coaches delete" ON coaches FOR DELETE
  USING (public.program_rank(public.season_program(season_id)) >= 3);

-- opponents: part of the schedule, head coach.
DROP POLICY IF EXISTS "Program scoped" ON opponents;
DROP POLICY IF EXISTS "Members read" ON opponents;
DROP POLICY IF EXISTS "Head coaches add" ON opponents;
DROP POLICY IF EXISTS "Head coaches update" ON opponents;
DROP POLICY IF EXISTS "Head coaches delete" ON opponents;
CREATE POLICY "Members read" ON opponents FOR SELECT
  USING (public.is_program_member(program_id));
CREATE POLICY "Head coaches add" ON opponents FOR INSERT
  WITH CHECK (public.program_rank(program_id) >= 3);
CREATE POLICY "Head coaches update" ON opponents FOR UPDATE
  USING (public.program_rank(program_id) >= 3)
  WITH CHECK (public.program_rank(program_id) >= 3);
CREATE POLICY "Head coaches delete" ON opponents FOR DELETE
  USING (public.program_rank(program_id) >= 3);

-- opponent_players: assistants add a jersey from the press box mid-game.
DROP POLICY IF EXISTS "Program scoped" ON opponent_players;
DROP POLICY IF EXISTS "Members read" ON opponent_players;
DROP POLICY IF EXISTS "Assistants add" ON opponent_players;
DROP POLICY IF EXISTS "Assistants update" ON opponent_players;
DROP POLICY IF EXISTS "Assistants delete" ON opponent_players;
CREATE POLICY "Members read" ON opponent_players FOR SELECT
  USING (public.is_opponent_member(opponent_id));
CREATE POLICY "Assistants add" ON opponent_players FOR INSERT
  WITH CHECK (public.program_rank(public.opponent_program(opponent_id)) >= 2);
CREATE POLICY "Assistants update" ON opponent_players FOR UPDATE
  USING (public.program_rank(public.opponent_program(opponent_id)) >= 2)
  WITH CHECK (public.program_rank(public.opponent_program(opponent_id)) >= 2);
CREATE POLICY "Assistants delete" ON opponent_players FOR DELETE
  USING (public.program_rank(public.opponent_program(opponent_id)) >= 2);

-- games: scheduling (add, delete) is head coach. Updating is the live game -
-- score, clock, situation, End Game - so assistants may, until it is final.
-- WITH CHECK looks at the season, not the status: End Game is an assistant
-- writing status 'completed' onto a game that was 'live' a moment ago, and the
-- lock is on the row as it was (USING), not as it becomes. Which COLUMNS an
-- assistant may change is the trigger below; RLS cannot see columns.
DROP POLICY IF EXISTS "Program scoped" ON games;
DROP POLICY IF EXISTS "Members read" ON games;
DROP POLICY IF EXISTS "Head coaches add" ON games;
DROP POLICY IF EXISTS "Recorders update" ON games;
DROP POLICY IF EXISTS "Head coaches delete" ON games;
CREATE POLICY "Members read" ON games FOR SELECT
  USING (public.is_season_member(season_id));
CREATE POLICY "Head coaches add" ON games FOR INSERT
  WITH CHECK (public.program_rank(public.season_program(season_id)) >= 3);
CREATE POLICY "Recorders update" ON games FOR UPDATE
  USING (public.can_edit_game_stats(id))
  WITH CHECK (public.program_rank(public.season_program(season_id)) >= 2);
CREATE POLICY "Head coaches delete" ON games FOR DELETE
  USING (public.program_rank(public.season_program(season_id)) >= 3);

-- plays, play_players, game_stats_cache: the stats. The final lock applies.
-- play_players' DELETE must stay exactly as permissive as its INSERT:
-- save_play_with_players deletes then re-inserts the credits, and a delete
-- that silently matched nothing would leave the old credits next to the new.
DROP POLICY IF EXISTS "Program scoped" ON plays;
DROP POLICY IF EXISTS "Members read" ON plays;
DROP POLICY IF EXISTS "Recorders add" ON plays;
DROP POLICY IF EXISTS "Recorders update" ON plays;
DROP POLICY IF EXISTS "Recorders delete" ON plays;
CREATE POLICY "Members read" ON plays FOR SELECT
  USING (public.is_game_member(game_id));
CREATE POLICY "Recorders add" ON plays FOR INSERT
  WITH CHECK (public.can_edit_game_stats(game_id));
CREATE POLICY "Recorders update" ON plays FOR UPDATE
  USING (public.can_edit_game_stats(game_id))
  WITH CHECK (public.can_edit_game_stats(game_id));
CREATE POLICY "Recorders delete" ON plays FOR DELETE
  USING (public.can_edit_game_stats(game_id));

DROP POLICY IF EXISTS "Program scoped" ON play_players;
DROP POLICY IF EXISTS "Members read" ON play_players;
DROP POLICY IF EXISTS "Recorders add" ON play_players;
DROP POLICY IF EXISTS "Recorders update" ON play_players;
DROP POLICY IF EXISTS "Recorders delete" ON play_players;
CREATE POLICY "Members read" ON play_players FOR SELECT
  USING (public.is_play_member(play_id));
CREATE POLICY "Recorders add" ON play_players FOR INSERT
  WITH CHECK (public.can_edit_play_stats(play_id) AND public.is_player_member(player_id));
CREATE POLICY "Recorders update" ON play_players FOR UPDATE
  USING (public.can_edit_play_stats(play_id))
  WITH CHECK (public.can_edit_play_stats(play_id) AND public.is_player_member(player_id));
CREATE POLICY "Recorders delete" ON play_players FOR DELETE
  USING (public.can_edit_play_stats(play_id));

DROP POLICY IF EXISTS "Program scoped" ON game_stats_cache;
DROP POLICY IF EXISTS "Members read" ON game_stats_cache;
DROP POLICY IF EXISTS "Recorders write" ON game_stats_cache;
CREATE POLICY "Members read" ON game_stats_cache FOR SELECT
  USING (public.is_game_member(game_id));
CREATE POLICY "Recorders write" ON game_stats_cache FOR ALL
  USING (public.can_edit_game_stats(game_id))
  WITH CHECK (public.can_edit_game_stats(game_id));

-- play_charting: film breakdown (formation, personnel, notes), not stats.
-- Coordinators chart film after the game, so assistants may on a final game.
DROP POLICY IF EXISTS "Program scoped" ON play_charting;
DROP POLICY IF EXISTS "Members read" ON play_charting;
DROP POLICY IF EXISTS "Assistants write" ON play_charting;
CREATE POLICY "Members read" ON play_charting FOR SELECT
  USING (public.is_game_member(game_id));
CREATE POLICY "Assistants write" ON play_charting FOR ALL
  USING (public.program_rank(public.game_program(game_id)) >= 2)
  WITH CHECK (public.program_rank(public.game_program(game_id)) >= 2);

-- program_members: read as before; no direct writes at all any more. Joining
-- is redeem_invite_code, the creator is the enrol trigger, and changing or
-- removing someone is set_member_role / remove_member below, which carry the
-- rules a policy could not express (no promoting past yourself, never the
-- last admin).
DROP POLICY IF EXISTS "Owners manage members" ON program_members;

-- program_invite_codes: an admin sees and manages every code; a head coach
-- only the assistant and staff ones, and cannot rewrite one into a higher role.
DROP POLICY IF EXISTS "Owners manage invite codes" ON program_invite_codes;
DROP POLICY IF EXISTS "Managers manage invite codes" ON program_invite_codes;
CREATE POLICY "Managers manage invite codes" ON program_invite_codes
  FOR ALL USING (public.can_assign_role(program_id, role))
  WITH CHECK (public.can_assign_role(program_id, role));

-- Codes are minted by create_invite_code and only ever revoked from the app.
-- A direct write could set created_at in the future, and a code dated after
-- its holder's removal lets them straight back in (see redeem_invite_code).
REVOKE INSERT, UPDATE ON program_invite_codes FROM anon, authenticated;
GRANT UPDATE (revoked) ON program_invite_codes TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. What an assistant may change on a game row
-- ----------------------------------------------------------------------------
-- The live game needs score, status, clock, situation, timeouts, pregame
-- (rules_config, direction, opening kickoff) and the official copy at End
-- Game. The schedule fields sit on the same row and are head coach work, and
-- cancelling a game is a schedule decision too.

CREATE OR REPLACE FUNCTION public.guard_assistant_game_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role, SQL editor and migrations have no auth.uid(); RLS already
  -- does not apply to them, and neither does this.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Moving a game into another program is a delete here and an insert there,
  -- and an assistant on the far side could not add a game. Nobody needs it.
  IF NEW.season_id IS DISTINCT FROM OLD.season_id
     AND public.season_program(NEW.season_id) IS DISTINCT FROM public.season_program(OLD.season_id) THEN
    RAISE EXCEPTION 'A game cannot be moved to another program' USING ERRCODE = '42501';
  END IF;

  IF public.program_rank(public.season_program(OLD.season_id)) >= 3 THEN
    RETURN NEW;
  END IF;

  IF NEW.season_id IS DISTINCT FROM OLD.season_id
     OR NEW.opponent_id IS DISTINCT FROM OLD.opponent_id
     OR NEW.game_date IS DISTINCT FROM OLD.game_date
     OR NEW.kickoff_time IS DISTINCT FROM OLD.kickoff_time
     OR NEW.location IS DISTINCT FROM OLD.location
     OR NEW.is_home IS DISTINCT FROM OLD.is_home
     OR NEW.site IS DISTINCT FROM OLD.site
     OR NEW.is_playoff IS DISTINCT FROM OLD.is_playoff
     OR NEW.playoff_round IS DISTINCT FROM OLD.playoff_round
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR (COALESCE(NEW.status, '') = 'cancelled') <> (COALESCE(OLD.status, '') = 'cancelled')
  THEN
    RAISE EXCEPTION 'Only a head coach or admin can change the schedule'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS games_guard_assistant_update ON games;
CREATE TRIGGER games_guard_assistant_update
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION public.guard_assistant_game_update();

-- 3b. Players, seasons and opponents stay in their program. For someone in
-- two programs, moving a player out is a delete (head coach work) that the
-- update policies, checked on each side alone, would allow an assistant; a
-- season moved out takes its games with it, which is the Danger Zone.
CREATE OR REPLACE FUNCTION public.guard_program_move()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.program_id IS DISTINCT FROM OLD.program_id THEN
    RAISE EXCEPTION 'This cannot be moved to another program' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_guard_program_move ON players;
CREATE TRIGGER players_guard_program_move
  BEFORE UPDATE OF program_id ON players
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_move();
DROP TRIGGER IF EXISTS seasons_guard_program_move ON seasons;
CREATE TRIGGER seasons_guard_program_move
  BEFORE UPDATE OF program_id ON seasons
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_move();
DROP TRIGGER IF EXISTS opponents_guard_program_move ON opponents;
CREATE TRIGGER opponents_guard_program_move
  BEFORE UPDATE OF program_id ON opponents
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_move();

-- ----------------------------------------------------------------------------
-- 5. The active season switch
-- ----------------------------------------------------------------------------
-- Which season is "this season" is program-wide, so it is head coach work.
-- The app lets everyone else look at another season on their own device
-- without writing this.

CREATE OR REPLACE FUNCTION public.set_active_season(target_program_id UUID, target_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.program_rank(target_program_id) < 3 THEN
    RAISE EXCEPTION 'Only a head coach or admin can change the active season'
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

-- ----------------------------------------------------------------------------
-- 6. Invite codes carry a role
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_invite_code(
  target_program_id UUID,
  target_role       TEXT DEFAULT 'assistant',
  valid_days        INTEGER DEFAULT 7,
  code_max_uses     INTEGER DEFAULT 1,
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
  wanted   TEXT := CASE target_role
                     WHEN 'owner' THEN 'admin'
                     WHEN 'member' THEN 'assistant'
                     ELSE target_role
                   END;
BEGIN
  IF wanted NOT IN ('admin', 'head_coach', 'assistant', 'staff') THEN
    RAISE EXCEPTION 'Unknown role %', target_role USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_assign_role(target_program_id, wanted) THEN
    RAISE EXCEPTION 'You cannot invite someone as %', wanted
      USING ERRCODE = '42501';
  END IF;

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
    wanted,
    NULLIF(btrim(code_label), ''),
    auth.uid(),
    CASE WHEN valid_days IS NULL THEN NULL ELSE now() + make_interval(days => valid_days) END,
    code_max_uses
  );

  RETURN new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invite_code(UUID, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invite_code(UUID, TEXT, INTEGER, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Removing someone has to stick
-- ----------------------------------------------------------------------------
-- The app re-redeems the code saved in a user's sign-up metadata whenever it
-- finds them in no program (completeProgramJoin). Without this, removing a
-- coach whose code was still live would last until their next app launch.
-- A removal outranks every code minted before it; a code made afterwards is
-- a deliberate re-invite and works.

CREATE TABLE IF NOT EXISTS program_member_removals (
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  removed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, user_id)
);

-- Only the definer functions below touch it.
ALTER TABLE program_member_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON program_member_removals FROM anon, authenticated;

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

  -- Queue behind any remove_member running for this program, so a removal
  -- committing this instant is seen by the check below rather than undone by
  -- the DELETE at the end.
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext('program_members:' || invite.program_id::text));
  END IF;

  -- One message for every failure mode on purpose, removal included: someone
  -- who was removed learns nothing from trying their old code.
  IF invite.code IS NULL OR EXISTS (
    SELECT 1 FROM program_member_removals r
    WHERE r.program_id = invite.program_id
      AND r.user_id = auth.uid()
      AND r.removed_at > invite.created_at
  ) THEN
    RAISE EXCEPTION 'That invite code is not valid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO program_members (program_id, user_id, role)
  VALUES (invite.program_id, auth.uid(), invite.role)
  ON CONFLICT (program_id, user_id) DO NOTHING;

  IF FOUND THEN
    UPDATE program_invite_codes SET uses = uses + 1 WHERE code = invite.code;
    DELETE FROM program_member_removals
    WHERE program_id = invite.program_id AND user_id = auth.uid();
  END IF;

  RETURN invite.program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. People: list, change role, remove
-- ----------------------------------------------------------------------------
-- Names and emails live in auth.users, which the app cannot read, hence a
-- definer function. Head coach and up only: emails are not for every viewer.

CREATE OR REPLACE FUNCTION public.list_program_members(target_program_id UUID)
RETURNS TABLE (
  user_id         UUID,
  email           TEXT,
  display_name    TEXT,
  role            TEXT,
  joined_at       TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
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
    m.user_id = auth.uid()
  FROM program_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.program_id = target_program_id
  ORDER BY public.role_rank(m.role) DESC, m.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_role(
  target_program_id UUID,
  target_user_id    UUID,
  new_role          TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role_name TEXT;
BEGIN
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role' USING ERRCODE = '42501';
  END IF;

  -- One membership change per program at a time: two admins demoting each
  -- other at once would otherwise each see the other as the admin who stays.
  PERFORM pg_advisory_xact_lock(hashtext('program_members:' || target_program_id::text));

  SELECT m.role INTO current_role_name
  FROM program_members m
  WHERE m.program_id = target_program_id AND m.user_id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not in this program' USING ERRCODE = '22023';
  END IF;

  IF new_role NOT IN ('admin', 'head_coach', 'assistant', 'staff') THEN
    RAISE EXCEPTION 'Unknown role %', new_role USING ERRCODE = '22023';
  END IF;

  -- Both ends: a head coach can neither touch someone above assistant nor
  -- make anyone more than an assistant.
  IF NOT public.can_assign_role(target_program_id, current_role_name)
     OR NOT public.can_assign_role(target_program_id, new_role) THEN
    RAISE EXCEPTION 'You cannot make that change' USING ERRCODE = '42501';
  END IF;

  -- Unreachable while nobody can change their own role, but cheap and it is
  -- the one mistake that cannot be undone from inside the app.
  IF public.role_rank(current_role_name) = 4 AND new_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM program_members m
    WHERE m.program_id = target_program_id AND m.user_id <> target_user_id
      AND public.role_rank(m.role) = 4
  ) THEN
    RAISE EXCEPTION 'A program needs at least one admin' USING ERRCODE = '42501';
  END IF;

  UPDATE program_members SET role = new_role
  WHERE program_id = target_program_id AND user_id = target_user_id;

  RETURN new_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_member(target_program_id UUID, target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role_name TEXT;
BEGIN
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('program_members:' || target_program_id::text));

  SELECT m.role INTO current_role_name
  FROM program_members m
  WHERE m.program_id = target_program_id AND m.user_id = target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.can_assign_role(target_program_id, current_role_name) THEN
    RAISE EXCEPTION 'You cannot remove that person' USING ERRCODE = '42501';
  END IF;

  IF public.role_rank(current_role_name) = 4 AND NOT EXISTS (
    SELECT 1 FROM program_members m
    WHERE m.program_id = target_program_id AND m.user_id <> target_user_id
      AND public.role_rank(m.role) = 4
  ) THEN
    RAISE EXCEPTION 'A program needs at least one admin' USING ERRCODE = '42501';
  END IF;

  DELETE FROM program_members
  WHERE program_id = target_program_id AND user_id = target_user_id;

  INSERT INTO program_member_removals (program_id, user_id, removed_by)
  VALUES (target_program_id, target_user_id, auth.uid())
  ON CONFLICT (program_id, user_id)
  DO UPDATE SET removed_at = now(), removed_by = EXCLUDED.removed_by;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.list_program_members(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_program_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_member(UUID, UUID) TO authenticated;
