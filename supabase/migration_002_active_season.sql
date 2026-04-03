-- Ensure only one active season exists per program.
WITH ranked_active_seasons AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY program_id
      ORDER BY year DESC, created_at DESC, id DESC
    ) AS rn
  FROM seasons
  WHERE is_active = true
)
UPDATE seasons
SET is_active = false
FROM ranked_active_seasons
WHERE seasons.id = ranked_active_seasons.id
  AND ranked_active_seasons.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_one_active_per_program
  ON seasons(program_id)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.set_active_season(target_program_id UUID, target_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
