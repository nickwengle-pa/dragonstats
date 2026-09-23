import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { isEditableTarget, refreshApp, refreshGate, type BeforeRefreshDetail } from "@/services/appRefresh";

const THRESHOLD = 72;

function atTop(target: Element): boolean {
  for (let node: Element | null = target; node; node = node.parentElement) {
    if (node.scrollTop > 1) return false;
  }
  return window.scrollY <= 1;
}

export default function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const refreshing = useRef(false);
  /* Only the live game screen and the sync panel can say what is unsaved on
     them. Film review, schedule, roster and settings save on a button, so
     anything typed since arriving on one of those may be unsaved and a pull
     asks first. Leaving a screen drops its typing anyway, so arriving on one
     starts clean. */
  const edited = useRef(false);
  const { pathname } = useLocation();

  useEffect(() => { edited.current = false; setConfirming(false); }, [pathname]);

  useEffect(() => {
    const mark = (event: Event) => { if (isEditableTarget(event.target)) edited.current = true; };
    document.addEventListener("input", mark, true);
    document.addEventListener("change", mark, true);
    return () => {
      document.removeEventListener("input", mark, true);
      document.removeEventListener("change", mark, true);
    };
  }, []);

  const refresh = useCallback(async (confirmed: boolean) => {
    if (refreshing.current) return;
    // Screens can veto a refresh while a draft or a local save is in flight.
    const check = new CustomEvent<BeforeRefreshDetail>("app:before-refresh", { cancelable: true, detail: { screenGuarded: false } });
    const vetoed = !window.dispatchEvent(check);
    const gate = refreshGate({ vetoed, screenGuarded: check.detail.screenGuarded, edited: edited.current, confirmed });
    setConfirming(gate === "confirm");
    if (gate === "vetoed") { setMessage("Finish or cancel the current entry before refreshing."); return; }
    if (gate === "confirm") { setMessage(""); return; }
    refreshing.current = true;
    setBusy(true);
    try { await refreshApp(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not refresh. Try again."); }
    finally { refreshing.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    const reset = () => { start = null; pulled = 0; setDistance(0); };
    const begin = (event: TouchEvent) => {
      if (refreshing.current || event.touches.length !== 1) return;
      const target = event.target;
      const touch = event.touches[0];
      if (!(target instanceof Element) || touch.clientY > 120 || !atTop(target)) return;
      if (target.closest("input, textarea, select, button, a, [contenteditable=true], [role=dialog], .sheet")) return;
      start = { x: touch.clientX, y: touch.clientY };
      pulled = 0;
      setMessage("");
      setConfirming(false);
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { reset(); return; }
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      if (dy < 0 || Math.abs(touch.clientX - start.x) > Math.max(16, dy)) { reset(); return; }
      if (dy > 8 && event.cancelable) event.preventDefault();
      pulled = Math.min(100, dy * 0.6);
      setDistance(pulled);
    };
    const finish = () => {
      const trigger = start && pulled >= THRESHOLD;
      reset();
      if (trigger) void refresh(false);
    };
    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", finish);
    document.addEventListener("touchcancel", reset);
    return () => {
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", finish);
      document.removeEventListener("touchcancel", reset);
    };
  }, [refresh]);

  if (!distance && !busy && !message && !confirming) return null;
  return (
    <>
    {busy && <div className="fixed inset-0 z-[99] bg-black/20" aria-hidden="true" />}
    <div className="fixed inset-x-3 z-[100] flex justify-center pointer-events-none" style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}>
      {confirming ? (
        <div role="alertdialog" aria-labelledby="refresh-confirm-text" className="pointer-events-auto max-w-sm rounded-xl border border-amber-400 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <p id="refresh-confirm-text">You've typed on this screen. Anything not saved yet will be lost if the app refreshes.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button className="px-3 py-2 text-slate-300" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-slate-950" onClick={() => void refresh(true)}>Refresh anyway</button>
          </div>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-500 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">
          <RefreshCw className={`h-4 w-4 shrink-0 ${busy ? "animate-spin" : ""}`} />
          <span>{message || (busy ? "Checking for updates…" : distance >= THRESHOLD ? "Release to update" : "Pull down to update")}</span>
          {message && <button aria-label="Dismiss refresh message" className="pointer-events-auto ml-2 px-2" onClick={() => setMessage("")}>×</button>}
        </div>
      )}
    </div>
    </>
  );
}
