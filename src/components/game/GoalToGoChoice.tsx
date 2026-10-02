interface Props {
  value: boolean | undefined;
  onChange: (goalToGo: boolean) => void;
}

export default function GoalToGoChoice({ value, onChange }: Props) {
  return <fieldset className="min-w-0 mb-3">
    <legend className="text-xs font-bold text-slate-300 mb-2">Next down at the 10</legend>
    <div className="grid grid-cols-2 gap-2">
      {[false, true].map(goal => <button key={String(goal)} type="button"
        aria-pressed={value === goal} onClick={() => onChange(goal)}
        className={`min-h-11 rounded-lg border px-2 text-sm font-bold ${value === goal
          ? "border-amber-400 bg-amber-500/20 text-amber-200"
          : "border-surface-border bg-surface-bg text-slate-200"}`}>
        {goal ? "1st & G" : "1st & 10"}
      </button>)}
    </div>
  </fieldset>;
}
