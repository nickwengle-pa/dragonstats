/**
 * What a change to a finished game does to its official final - shown before
 * an edit saves (FinalChangeDialog) and when a game is opened with changes
 * nobody confirmed (FinalBanner). See services/finalRecord.ts.
 */
import { useState } from "react";
import { formatPlayMark, type FinalDiff, type PlayMark } from "@/services/finalRecord";

export interface TeamNames { us: string; them: string }

const fmtScore = (s: { us: number; them: number }, names: TeamNames) =>
  `${names.us} ${s.us} - ${names.them} ${s.them}`;

function PlayList({ title, marks }: { title: string; marks: PlayMark[] }) {
  if (marks.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-1">{title}</div>
      <ul className="space-y-0.5">
        {marks.map((m) => (
          <li key={`${title}-${m.n}-${m.f}`} className="text-xs text-neutral-300">{formatPlayMark(m)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Score, then every stat that moves, then the plays behind it. */
export function FinalDiffList({ diff, names }: { diff: FinalDiff; names: TeamNames }) {
  return (
    <div className="space-y-3">
      {diff.score && (
        <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Final score</div>
          <div className="font-bold text-white">{fmtScore(diff.score.before, names)}</div>
          <div className="font-bold text-amber-300">→ {fmtScore(diff.score.after, names)}</div>
        </div>
      )}
      {diff.stats.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 mb-1">Stats that change</div>
          <table className="w-full text-xs">
            <tbody>
              {diff.stats.map((s) => (
                <tr key={s.key} className="border-t border-white/5">
                  <td className="py-1 pr-2 text-neutral-300">{s.label}</td>
                  <td className="py-1 text-right tabular-nums text-neutral-500 whitespace-nowrap">{s.before}</td>
                  <td className="py-1 px-1 text-neutral-600">→</td>
                  <td className="py-1 text-right tabular-nums font-bold text-white whitespace-nowrap">{s.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PlayList title="Plays added" marks={diff.added} />
      <PlayList title="Plays removed" marks={diff.removed} />
      <PlayList title="Plays edited" marks={diff.edited} />
    </div>
  );
}

/** Asked before an edit to a finished game saves. Nothing is written on Cancel. */
export function FinalChangeDialog({
  diff,
  names,
  statsLocked,
  onConfirm,
  onCancel,
}: {
  diff: FinalDiff;
  names: TeamNames;
  statsLocked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    // Above the play editor, which is still open underneath while this asks.
    <div className="sheet bg-black/80 z-[60]">
      <div className="sheet-panel p-5 space-y-3 max-w-md mx-auto max-h-[85dvh] flex flex-col">
        <h2 className="text-lg font-black text-center">Change the official final?</h2>
        <p className="text-xs text-neutral-400 text-center">
          {statsLocked
            ? "This game's stats are marked final. Saving changes these numbers, and the change is kept in the game's history."
            : "This game is final. Saving changes the final score."}
        </p>
        <div className="overflow-y-auto min-h-0 flex-1 pr-1">
          <FinalDiffList diff={diff} names={names} />
        </div>
        <button onClick={onConfirm} className="btn-primary w-full">Save change</button>
        <button onClick={onCancel} className="w-full text-xs text-neutral-400 font-bold py-1">Cancel - don't save</button>
      </div>
    </div>
  );
}

/**
 * On opening a finished game whose plays no longer match its official final:
 * a change saved some other way, or a final from before the plays were
 * re-derived correctly. Accepting makes what the plays say now the official
 * final; the earlier version stays in the history.
 */
export function FinalBanner({
  title,
  detail,
  diff,
  names,
  onAccept,
}: {
  title: string;
  detail: string;
  diff: FinalDiff | null;
  names: TeamNames;
  onAccept?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <div className="mx-3 my-2 rounded-xl border-2 border-amber-500 bg-amber-500/10 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <span className="text-amber-400 font-black" aria-hidden>!</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-amber-300">{title}</div>
          <div className="text-xs text-neutral-300">{detail}</div>
        </div>
      </div>
      {open && diff && (
        <div className="mt-2 max-h-[50dvh] overflow-y-auto">
          <FinalDiffList diff={diff} names={names} />
        </div>
      )}
      <div className="mt-2 flex gap-2">
        {diff && (
          <button onClick={() => setOpen((o) => !o)} className="flex-1 rounded-lg border border-amber-500/60 py-1.5 text-xs font-bold text-amber-200">
            {open ? "Hide changes" : "Show changes"}
          </button>
        )}
        {onAccept && (
          <button
            disabled={saving}
            onClick={async () => { setSaving(true); try { await onAccept(); } finally { setSaving(false); } }}
            className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-black text-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Make this the official final"}
          </button>
        )}
      </div>
    </div>
  );
}
