import type { MouseEvent, RefObject } from "react";

/**
 * On-screen number pad for live entry.
 *
 * Every numeric field leaned on the OS keyboard, which on an iPad never
 * appears for a programmatically focused input — so the search box sat focused
 * and empty while the only numbers on screen were the player tiles. Tapping
 * "2" then "1" for #21 selected #2 and #1: two tacklers at half credit each
 * instead of one solo tackle.
 *
 * The paired input keeps inputMode="none" so no OS keyboard can cover the
 * grid. That suppresses VIRTUAL keyboards only — a hardware keyboard still
 * types, so the desktop flow and the Enter-to-confirm handler are untouched.
 *
 * Five columns on purpose: it lines up with the player grid above it, and two
 * rows of digits cost ~100px where a phone-style 3x4 pad costs ~190px.
 */
interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Digits the field accepts. Jerseys are 2, yardage 3. */
  maxLength?: number;
  /** The input this pad drives — required for the ABC hand-off. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Hide ABC where the field can only ever be numbers. */
  allowText?: boolean;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const KEY =
  "h-11 rounded-xl bg-surface-bg border border-surface-border " +
  "font-display font-black tabular-nums text-slate-200 " +
  "active:bg-surface-hover cursor-pointer select-none";

export default function Keypad({
  value,
  onChange,
  maxLength = 2,
  inputRef,
  allowText = true,
}: Props) {
  /* A key that takes focus kills the input's Enter handler, so every one of
     them refuses the focus rather than stealing and restoring it. */
  const hold = (e: MouseEvent) => e.preventDefault();

  const press = (d: string) => {
    if (value.length >= maxLength) return;
    onChange(value + d);
  };

  /**
   * Hand off to the OS keyboard so a name is still searchable.
   *
   * inputMode is set on the DOM node rather than through React state: iOS only
   * raises the keyboard for a focus() inside the user gesture that asked for
   * it, and a re-render lands after the gesture is over. Setting the attribute
   * and focusing synchronously keeps both inside the tap. React will not
   * revert it, because its own view of the prop never changed.
   */
  const handOffToKeyboard = () => {
    const el = inputRef?.current;
    if (!el) return;
    el.inputMode = "text";
    el.focus();
  };

  return (
    <div className="grid grid-cols-5 gap-1.5 mt-2">
      {DIGITS.map(d => (
        <button
          key={d}
          type="button"
          onMouseDown={hold}
          onClick={() => press(d)}
          className={`${KEY} text-base`}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        onMouseDown={hold}
        onClick={() => onChange(value.slice(0, -1))}
        className={`col-span-3 ${KEY} text-xs uppercase tracking-wide`}
      >
        ← Back
      </button>
      {allowText ? (
        <button
          type="button"
          onMouseDown={hold}
          onClick={handOffToKeyboard}
          className={`col-span-2 ${KEY} text-xs uppercase tracking-wide`}
        >
          ABC
        </button>
      ) : (
        <button
          type="button"
          onMouseDown={hold}
          onClick={() => onChange("")}
          className={`col-span-2 ${KEY} text-xs uppercase tracking-wide`}
        >
          Clear
        </button>
      )}
    </div>
  );
}
