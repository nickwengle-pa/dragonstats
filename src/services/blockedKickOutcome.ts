/** Field displacement in the kicking team's frame, not return yardage. */
export function blockedTouchdownNetYards(ballOn: number, recoveredByKicking: boolean): number {
  return recoveredByKicking ? 100 - ballOn : -ballOn;
}

interface ReviewPlay {
  play_type: string;
  is_touchdown: boolean;
  is_penalty: boolean;
  play_data: unknown;
}

export function needsNextSpotReview(play: ReviewPlay): boolean {
  const pd = (play.play_data ?? {}) as Record<string, unknown>;
  if (pd.next_situation_source !== "pending_review") return false;
  /* A touchdown decides the next situation by itself - a try for whoever
     scored - so there is no spot to review. This was true only for a blocked
     kick, which left every pick-six and scoop-and-score (a turnover, so saved
     as pending) asking for a spot that does not exist, and holding the game
     off "Stats final". Read here rather than rewritten on the rows, so games
     already recorded clear too. A flag on the play still needs a look. */
  return !(play.is_touchdown && !play.is_penalty);
}

/** Read older blocked TDs consistently without rewriting recorded games. */
export function normalizeBlockedTouchdown<T extends ReviewPlay & { yard_line: number; yards_gained: number }>(play: T): T {
  if (play.play_type !== "blocked_kick" || !play.is_touchdown) return play;
  const pd = (play.play_data ?? {}) as Record<string, unknown>;
  return { ...play, yards_gained: blockedTouchdownNetYards(play.yard_line, pd.blocked_recovered_by_kicking === true) };
}
