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

/**
 * Clock entry that takes the whole time as one number — no tabbing between a
 * minutes box and a seconds box while the game waits. Type 1123 for 11:23.
 * Separate minute/second fields are kept underneath for the times it's easier
 * to nudge one part.
 */
export default function ClockInput({ seconds, onChange, maxSeconds, autoFocus }: Props) {
  const [digits, setDigits] = useState("");
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const commitDigits = (raw: string) => {
    setDigits(raw);
    const parsed = parseClockDigits(raw);
    if (parsed == null) return;
    onChange(Math.max(0, Math.min(maxSeconds, parsed)));
  };

  const setPart = (nextMins: number, nextSecs: number) => {
    const total = Math.max(0, nextMins) * 60 + Math.max(0, Math.min(59, nextSecs));
    onChange(Math.max(0, Math.min(maxSeconds, total)));
    setDigits("");
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-neutral-500 block mb-1 text-center">
          Type the whole time — 1123 = 11:23
        </label>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={formatClockValue(seconds)}
          value={digits}
          onChange={(e) => commitDigits(e.target.value)}
          onFocus={() => { setEditing(true); setDigits(""); }}
          onBlur={() => { setEditing(false); setDigits(""); }}
          className="input w-full text-center text-3xl font-black tabular-nums"
          maxLength={4}
        />
        <div className="text-center text-sm font-black tabular-nums mt-1 text-dragon-primary">
          {editing && digits.length > 0 && parseClockDigits(digits) == null
            ? "—:—"
            : formatClockValue(seconds)}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="text-center">
          <span className="text-[10px] font-bold text-neutral-500 block mb-1">Min</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={Math.floor(maxSeconds / 60)}
            value={mins}
            onChange={(e) => setPart(Number(e.target.value) || 0, secs)}
            className="input w-20 text-center text-xl font-black"
          />
        </div>
        <span className="text-xl font-black pt-5">:</span>
        <div className="text-center">
          <span className="text-[10px] font-bold text-neutral-500 block mb-1">Sec</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={secs}
            onChange={(e) => setPart(mins, Number(e.target.value) || 0)}
            className="input w-20 text-center text-xl font-black"
          />
        </div>
      </div>
    </div>
  );
}
