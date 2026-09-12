import { useEffect, useRef, useState } from "react";

interface Props {
  /** Current value in seconds. */
  seconds: number;
  onChange: (seconds: number) => void;
  /** Upper bound (quarter length), so a typo can't exceed the period. */
  maxSeconds: number;
  autoFocus?: boolean;
}

/** mm:ss from a second count. */
export function formatClockValue(total: number): string {
  const mins = Math.floor(Math.max(0, total) / 60);
  const secs = Math.max(0, total) % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Read a scoreboard the way it's spoken: the last two digits are seconds,
 * everything before them is minutes.
 *
 *   "1123" → 11:23      "421" → 4:21      "45" → 0:45      "7" → 0:07
 *
 * Returns null for anything that isn't a sane clock so the caller can hold the
 * previous value rather than snapping to zero mid-type.
 */
export function parseClockDigits(digits: string): number | null {
  const clean = digits.replace(/\D/g, "");
  if (clean.length === 0) return null;

  const secs = Number(clean.length <= 2 ? clean : clean.slice(-2));
  const mins = clean.length <= 2 ? 0 : Number(clean.slice(0, -2));
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
  if (secs > 59) return null;

  return mins * 60 + secs;
}

/** Touch keypad shared by game, play, and timeout clock editors. */
export default function ClockInput({ seconds, onChange, maxSeconds, autoFocus }: Props) {
  const [digits, setDigits] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const displayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) displayRef.current?.focus();
  }, [autoFocus]);

  const commit = (raw: string) => {
    const parsed = raw === "" ? 0 : parseClockDigits(raw);
    setDigits(raw);
    if (parsed == null || parsed > maxSeconds) {
      setMessage(`Entry ${raw}: ${parsed == null ? "seconds must be 00–59" : `maximum ${formatClockValue(maxSeconds)}`}. Clock unchanged.`);
      return;
    }
    setMessage("");
    onChange(parsed);
  };
  const press = (key: string) => {
    if (key === "clear") { commit(""); return; }
    if (key === "backspace") {
      const current = digits ?? `${Math.floor(seconds / 60)}${String(seconds % 60).padStart(2, "0")}`;
      commit(current.slice(0, -1));
      return;
    }
    const current = digits ?? "";
    if (current.length >= 4) { setMessage("Tap the time to start a new entry."); return; }
    commit(current + key);
  };

  return (
    <div className="space-y-2" role="group" aria-label="Clock number pad"
      onKeyDown={event => {
        if (/^[0-9]$/.test(event.key)) { event.preventDefault(); press(event.key); }
        else if (event.key === "Backspace") { event.preventDefault(); press("backspace"); }
        else if (event.key === "Delete") { event.preventDefault(); press("clear"); }
      }}>
      <button ref={displayRef} type="button" aria-label="Clock time, tap to replace"
        onClick={() => { setDigits(null); setMessage(""); }}
        className="w-full rounded-xl border border-slate-500 bg-slate-950 py-2 text-4xl font-black text-white tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        {formatClockValue(seconds)}
      </button>
      <p className="text-center text-xs text-slate-400" aria-live="polite">
        {message || (digits == null ? "Tap numbers to replace time · 425 = 4:25" : "Tap time to start over")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"].map(key => (
          <button key={key} type="button" onClick={() => press(key)}
            aria-label={key === "backspace" ? "Delete last digit" : key === "clear" ? "Clear clock" : key}
            className={`min-h-12 rounded-xl border border-slate-600 bg-slate-800 text-white active:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${key.length > 1 ? "text-sm font-bold" : "text-2xl font-black"}`}>
            {key === "backspace" ? "⌫" : key === "clear" ? "Clear" : key}
          </button>
        ))}
      </div>
    </div>
  );
}
