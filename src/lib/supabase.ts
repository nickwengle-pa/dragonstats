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

/* Auth is the exception, and it took a missing confirmation email to notice.
 *
 * The ten-second deadline above is built for reads and writes that have
 * somewhere to fall back to - a read drops to IndexedDB, a write enqueues - so
 * cutting them off early is strictly better than hanging. An auth request has
 * neither: there is no cached sign-up.
 *
 * Worse, it is genuinely slow by design. GoTrue sends the confirmation email
 * INSIDE the sign-up request and only answers once the mail server has taken
 * it, so a sluggish SMTP provider can push a perfectly healthy sign-up past
 * ten seconds. The client then aborts, the coach sees "signal is aborted
 * without reason", and whether the account was created depends on where the
 * server had got to - which is the worst possible outcome for the one request
 * that must not be ambiguous.
 *
 * Thirty seconds is past any real mail handoff and still short of a wait
 * somebody would sit through twice. Nothing on the game-day path goes through
 * these endpoints, so the press-box behaviour above is untouched. */
const AUTH_TIMEOUT_MS = 30_000;

const isAuthRequest = (input: RequestInfo | URL): boolean => {
  const href =
    typeof input === "string" ? input
    : input instanceof URL ? input.href
    : input.url;
  return href.includes("/auth/v1/");
};

const timeoutFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const deadline = isAuthRequest(input) ? AUTH_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), deadline);

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
