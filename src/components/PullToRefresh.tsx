import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { refreshApp } from "@/services/appRefresh";

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
  const refreshing = useRef(false);

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
    const finish = async () => {
      const trigger = start && pulled >= THRESHOLD;
      reset();
      if (!trigger || refreshing.current) return;
      // Screens can veto a refresh while a draft or a local save is in flight.
      const check = new Event("app:before-refresh", { cancelable: true });
      if (!window.dispatchEvent(check)) {
        setMessage("Finish or cancel the current entry before refreshing.");
        return;
      }
      refreshing.current = true;
      setBusy(true);
      try { await refreshApp(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Could not refresh. Try again."); }
      finally { refreshing.current = false; setBusy(false); }
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
  }, []);

  if (!distance && !busy && !message) return null;
  return (
    <>
    {busy && <div className="fixed inset-0 z-[99] bg-black/20" aria-hidden="true" />}
    <div className="fixed inset-x-3 z-[100] flex justify-center pointer-events-none" style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}>
      <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-500 bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">
        <RefreshCw className={`h-4 w-4 shrink-0 ${busy ? "animate-spin" : ""}`} />
        <span>{message || (busy ? "Checking for updates…" : distance >= THRESHOLD ? "Release to update" : "Pull down to update")}</span>
        {message && <button aria-label="Dismiss refresh message" className="pointer-events-auto ml-2 px-2" onClick={() => setMessage("")}>×</button>}
      </div>
    </div>
    </>
  );
}
