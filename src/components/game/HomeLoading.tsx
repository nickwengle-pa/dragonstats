export default function HomeLoading({ label = "Loading your team and season…" }: { label?: string }) {
  return <div className="w-full max-w-xl mx-auto space-y-4 p-5" role="status" aria-live="polite">
    <div className="flex items-center gap-3 text-sm font-semibold text-slate-300"><span aria-hidden="true" className="h-5 w-5 rounded-full border-2 border-slate-600 border-t-slate-200 motion-safe:animate-spin" />{label}</div>
    <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
      <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="card h-24 bg-slate-800/50" />)}</div>
      {[0,1].map(i => <div key={i} className="card p-4 flex gap-3"><div className="h-11 w-11 rounded-xl bg-slate-700/50" /><div className="flex-1 space-y-3 py-1"><div className="h-3 w-2/3 rounded bg-slate-700/50" /><div className="h-2 w-1/3 rounded bg-slate-700/40" /></div></div>)}
    </div>
  </div>;
}
