import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
};

/**
 * A number box that can be emptied while you type.
 *
 * The usual controlled shape - value={n}, onChange={clamp(Number(text) || min)} -
 * turns an empty box straight back into the minimum, so backspacing out the
 * last digit left a "1" behind and the next digit typed made "13" when the
 * operator wanted 3. Here the text is the operator's while the box has focus:
 * an empty or half-typed entry stays on screen, every entry that parses is
 * passed up clamped, and leaving the box shows the value actually kept.
 *
 * Deleting passes through shorter numbers - clearing 35 sends 3 on the way -
 * so an emptied box puts back the value it had on focus. Clearing and then
 * tapping Apply without retyping keeps the old number, not its first digit.
 */
export default function NumberField({ value, onChange, min, max, onFocus, onBlur, ...rest }: Props) {
  const [text, setText] = useState<string | null>(null);
  const focusValue = useRef(value);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  /* A button beside the box (a nudge, a side toggle) can change the value
     while the box keeps focus - iOS does not blur an input when a button is
     tapped - so text that no longer says the kept value gives way to it. */
  useEffect(() => {
    setText(current => {
      if (current === null) return null;
      if (current.trim() === "") return value === focusValue.current ? current : String(value);
      const n = Number(current);
      return Number.isFinite(n) && clamp(n) === value ? current : String(value);
    });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text ?? String(value)}
      onFocus={(event) => { focusValue.current = value; setText(String(value)); onFocus?.(event); }}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        if (raw.trim() === "") {
          if (value !== focusValue.current) onChange(focusValue.current);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(clamp(n));
      }}
      onBlur={(event) => { setText(null); onBlur?.(event); }}
    />
  );
}
