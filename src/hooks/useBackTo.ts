import { useLocation, useNavigate } from "react-router-dom";

/**
 * Where a screen's back arrow goes. A screen opened from Season Stats is
 * handed `state.from` (the stats view it came from, game drill-down and all),
 * and goes back there; opened any other way it goes to its usual parent.
 */
export function useBackTo(fallback: string): () => void {
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  return () => navigate(typeof from === "string" && from.startsWith("/") ? from : fallback);
}
