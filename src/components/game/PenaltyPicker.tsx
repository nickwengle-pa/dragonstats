import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";

export interface PenaltyOption {
  label: string;
  name: string;
  yards: number;
}

interface PenaltyPickerProps {
  selected: string | null;
  penalties: PenaltyOption[];
  onSelect: (label: string) => void;
  onCustom: () => void;
  custom: boolean;
  onCustomNameChange: (name: string) => void;
}

const COMMON_FOULS = /holding|false start|offsides?|encroachment|delay of game|pass interference|facemask|face mask|personal foul|unsportsmanlike/i;

export default function PenaltyPicker({ selected, penalties, onSelect, onCustom, custom, onCustomNameChange }: PenaltyPickerProps) {
  const id = useId();
  const summary = useRef<HTMLButtonElement>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(!selected && !custom);
  const [view, setView] = useState<"common" | "all">("common");
  const [query, setQuery] = useState("");
  const picked = penalties.find(penalty => penalty.label === selected);
  const search = query.trim().toLowerCase();
  const sorted = useMemo(() => [...penalties].sort((a, b) => a.name.localeCompare(b.name)), [penalties]);
  const filtered = sorted.filter(penalty => {
    if (search) return `${penalty.name} ${penalty.label}`.toLowerCase().includes(search);
    return view === "all" || COMMON_FOULS.test(penalty.name);
  });

  useEffect(() => {
    if (!selected && !custom) setOpen(true);
  }, [selected, custom]);

  useEffect(() => {
    if (custom && !open) customInput.current?.focus();
  }, [custom, open]);

  const choose = (label: string) => {
    onSelect(label);
    setOpen(false);
    setQuery("");
    summary.current?.focus();
  };

  return <div className="min-w-0 space-y-2">
    <button ref={summary} type="button" aria-expanded={open} aria-controls={`${id}-picker`}
      onClick={() => { setOpen(value => !value); setQuery(""); }}
      className={`flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        selected || custom ? "border-amber-500/60 bg-amber-500/10 text-amber-300" : "border-surface-borderLight bg-surface-bg text-slate-200"
      }`}>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-400">Penalty</span>
        <span className="block break-words text-sm font-bold leading-5">{custom ? selected?.trim() || "Other penalty" : picked?.name || selected || "Select penalty"}</span>
      </span>
      {picked && !custom && <span className="shrink-0 text-xs tabular-nums">{picked.yards} yards</span>}
      {open ? <ChevronUp size={18} aria-hidden="true" className="shrink-0" /> : <ChevronDown size={18} aria-hidden="true" className="shrink-0" />}
    </button>

    {open && <div id={`${id}-picker`} className="min-w-0 space-y-2"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setQuery("");
          summary.current?.focus();
        }
      }}>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-bg p-1" role="group" aria-label="Penalty list">
        {(["common", "all"] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode}
          onClick={() => setView(mode)}
          className={`min-h-11 rounded-md px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            view === mode ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:bg-surface-hover hover:text-slate-200"
          }`}>{mode === "common" ? "Common" : "All penalties"}</button>)}
      </div>

      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-surface-borderLight bg-surface-bg px-3 focus-within:border-amber-500">
        <Search size={17} className="shrink-0 text-slate-500" aria-hidden="true" />
        <label htmlFor={`${id}-search`} className="sr-only">Search penalties</label>
        <input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Search penalties" autoComplete="off"
          className="min-h-11 w-full min-w-0 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
        {query && <button type="button" aria-label="Clear penalty search" title="Clear penalty search" onClick={() => setQuery("")}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          <X size={17} aria-hidden="true" />
        </button>}
      </div>

      <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-surface-borderLight bg-surface-bg" aria-label={search ? "Search results" : view === "common" ? "Common penalties" : "All penalties"}>
        {filtered.map(penalty => {
          const active = !custom && selected === penalty.label;
          return <button key={penalty.label} type="button" aria-pressed={active} onClick={() => choose(penalty.label)}
            className={`flex min-h-14 w-full min-w-0 items-center gap-3 border-b border-surface-border px-3 py-3 text-left last:border-b-0 focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 ${
              active ? "bg-amber-500/10 text-amber-300" : "text-slate-200 hover:bg-surface-hover"
            }`}>
            <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-5">{penalty.name}</span>
            <span className={`shrink-0 text-xs tabular-nums ${active ? "text-amber-300" : "text-slate-400"}`}>{penalty.yards} yards</span>
            {active && <Check size={17} className="shrink-0" aria-hidden="true" />}
          </button>;
        })}
        {!filtered.length && <p role="status" className="px-3 py-5 text-center text-sm text-slate-400">No matching penalties</p>}
      </div>

      <button type="button" onClick={() => { onCustom(); setOpen(false); setQuery(""); }}
        className="min-h-11 w-full rounded-lg border border-surface-borderLight px-3 py-2 text-left text-sm font-semibold text-slate-300 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
        Other penalty
      </button>
    </div>}

    {custom && !open && <div>
      <label htmlFor={`${id}-custom`} className="mb-1 block text-xs font-semibold text-slate-400">Penalty name</label>
      <input ref={customInput} id={`${id}-custom`} value={selected ?? ""} onChange={event => onCustomNameChange(event.target.value)}
        placeholder="Penalty name" autoCapitalize="words" autoCorrect="off"
        className="min-h-11 w-full min-w-0 rounded-lg border border-amber-500/50 bg-surface-bg px-3 py-2 text-sm font-semibold text-amber-300 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
    </div>}
  </div>;
}
