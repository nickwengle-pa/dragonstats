import { useEffect, useRef, useState } from "react";

/**
 * Hold the screen awake while a game is being charted.
 *
 * This is the root-cause fix for the press-box failure the offline cache only
 * softens. The chain is: phone sleeps between series -> iOS reclaims the tab
 * to free memory -> unlocking is a cold start, not a resume -> inside a steel
 * press box there is no signal to reload anything. Keeping the screen lit
 * breaks the chain at the first link, which is cheaper than surviving the
 * last one.
 *
 * Two things make this less trivial than it looks:
 *
 *  - The browser releases the lock every time the page is hidden, and does
 *    NOT give it back on return. Without re-acquiring on visibilitychange it
 *    works exactly once, then silently stops — the worst possible failure for
 *    something whose whole job is to be reliable for three hours.
 *  - `request()` rejects for reasons that are nobody's fault (low battery,
 *    the tab not being visible yet). Rejection is normal, so it is swallowed
 *    and reported through `held` rather than thrown.
 *
 * Unsupported browsers report `supported: false` and the caller hides the
 * control rather than offering a switch that does nothing.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

export function useWakeLock(enabled: boolean): { held: boolean; supported: boolean } {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [held, setHeld] = useState(false);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    const acquire = async () => {
      if (!enabled || sentinel.current) return;
      // Requesting while hidden always rejects; the visibility handler will
      // come back for it.
      if (document.visibilityState !== "visible") return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lock: WakeLockSentinelLike = await (navigator as any).wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel.current = lock;
        setHeld(true);
        lock.addEventListener("release", () => {
          sentinel.current = null;
          setHeld(false);
        });
      } catch {
        // Denied (battery saver, backgrounded, unsupported surface). Not an
        // error worth showing — the indicator just stays unlit.
        setHeld(false);
      }
    };

    const release = async () => {
      const lock = sentinel.current;
      sentinel.current = null;
      setHeld(false);
      if (lock && !lock.released) {
        try { await lock.release(); } catch { /* already gone */ }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      } else {
        // The browser has already dropped it; just stop claiming we hold one.
        sentinel.current = null;
        setHeld(false);
      }
    };

    if (enabled) void acquire();
    else void release();

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [enabled, supported]);

  return { held, supported };
}

const STORAGE_KEY = "dragonstats:keep-awake";

/** Defaults ON: the whole point is that the operator should not have to
 *  remember to switch it on before kickoff. Persisted so turning it off at
 *  halftime to save battery survives a reload. */
export function readKeepAwake(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeKeepAwake(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch { /* private mode; the in-memory state still works for this session */ }
}
