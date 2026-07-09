-- Fix Supabase linter CRITICAL: "Security Definer View"
-- Views default to running with the creator's permissions, which bypasses
-- row-level security for anyone holding the public anon key. security_invoker
-- makes the view enforce the QUERYING user's RLS instead.
ALTER VIEW public.game_schedule SET (security_invoker = true);
ALTER VIEW public.player_season_summary SET (security_invoker = true);
