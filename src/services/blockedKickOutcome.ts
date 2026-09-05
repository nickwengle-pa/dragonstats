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
  // The touchdown determines the next situation. Penalties still need review.
  return !(play.play_type === "blocked_kick" && play.is_touchdown && !play.is_penalty);
}

/** Read older blocked TDs consistently without rewriting recorded games. */
export function normalizeBlockedTouchdown<T extends ReviewPlay & { yard_line: number; yards_gained: number }>(play: T): T {
  if (play.play_type !== "blocked_kick" || !play.is_touchdown) return play;
  const pd = (play.play_data ?? {}) as Record<string, unknown>;
  return { ...play, yards_gained: blockedTouchdownNetYards(play.yard_line, pd.blocked_recovered_by_kicking === true) };
}
