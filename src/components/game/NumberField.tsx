import { useEffect, useState, type InputHTMLAttributes } from "react";

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
 */
export default function NumberField({ value, onChange, min, max, onFocus, onBlur, ...rest }: Props) {
  const [text, setText] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  /* A button beside the box (a nudge, a side toggle) can change the value
     while the box keeps focus - iOS does not blur an input when a button is
     tapped - so text that no longer says the kept value gives way to it. */
  useEffect(() => {
    setText(current => {
      if (current === null) return null;
      const n = Number(current);
      return current.trim() !== "" && Number.isFinite(n) && clamp(n) === value ? current : String(value);
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
      onFocus={(event) => { setText(String(value)); onFocus?.(event); }}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        if (raw.trim() === "") return;
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(clamp(n));
      }}
      onBlur={(event) => { setText(null); onBlur?.(event); }}
    />
  );
}
