import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn(
    "⚠️  VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY not set.\n" +
    "   Copy .env.example to .env and fill in your Supabase credentials."
  );
}

/**
 * Press-box wifi and one-bar cell both produce the same nasty state: the
 * socket connects, so `navigator.onLine` stays true, but nothing ever comes
 * back. Without a deadline that request hangs for the browser default (tens of
 * seconds), and every caller that meant to fall back to the offline cache sits
 * there waiting instead. A hung read blocks the game screen; a hung write
 * delays the play reaching the sync queue.
 *
 * Ten seconds is well past a healthy round trip (~300ms measured) and well
 * short of a stall the operator would sit through. On timeout the fetch
 * rejects, which every offline-aware path already treats as "network failed" —
 * reads fall back to IndexedDB, writes enqueue.
 *
 * Realtime is a websocket and does not go through this fetch, so a quiet
 * subscription is unaffected.
 */
const REQUEST_TIMEOUT_MS = 10_000;

const timeoutFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // A caller-supplied signal still has to win — Supabase aborts its own
  // requests on teardown, and dropping that would leak the request.
  const caller = init?.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  key || "placeholder-key",
  { global: { fetch: timeoutFetch } }
);
