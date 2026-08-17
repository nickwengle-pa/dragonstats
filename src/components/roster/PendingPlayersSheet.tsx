import { useState } from "react";
import { AlertTriangle, ArrowRight, Trash2, UserPlus, X } from "lucide-react";
import {
  discardPending,
  mergePendingIntoPlayer,
  promotePendingToPlayer,
  type PendingPlayerSummary,
} from "@/services/pendingPlayerService";
/**
 * Minimal shape this sheet needs from a roster row. Kept structural rather
 * than importing a concrete type — RosterScreen and seasonService each carry
 * their own slightly different roster interface.
 */
export interface MergeCandidate {
  player_id: string;
  jersey_number: number | null;
  player?: { first_name?: string | null; last_name?: string | null } | null;
}

interface Props {
  seasonId: string;
  programId: string;
  pending: PendingPlayerSummary[];
  roster: MergeCandidate[];
  onClose: () => void;
  /** Called after any successful resolution so the caller can reload. */
  onResolved: () => Promise<void> | void;
}

type Mode = "menu" | "merge" | "promote" | "discard";

function playerLabel(entry: MergeCandidate) {
  const jersey = entry.jersey_number != null ? `#${entry.jersey_number} ` : "";
  return `${jersey}${entry.player?.first_name ?? ""} ${entry.player?.last_name ?? ""}`.trim();
}

/**
 * Resolve one unrostered jersey. Kept deliberately linear — pick an action,
 * confirm, done — because this runs the morning after a game, not during one.
 */
function PendingCard({
  item, roster, seasonId, programId, onResolved, onError,
}: {
  item: PendingPlayerSummary;
  roster: MergeCandidate[];
  seasonId: string;
  programId: string;
  onResolved: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [busy, setBusy] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");

  const jerseyLabel = item.jersey != null ? `#${item.jersey}` : "#?";
  const jerseyClash = item.jersey != null
    && roster.some((r) => r.jersey_number === item.jersey);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      onError(result.error ?? "Could not resolve that player.");
      return;
    }
    await onResolved();
  };

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 shrink-0 rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-500/10 flex items-center justify-center">
          <span className="text-lg font-black tabular-nums text-amber-400">{item.jersey ?? "?"}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{jerseyLabel} — unrostered</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {item.tagCount} tag{item.tagCount === 1 ? "" : "s"} across {item.playCount} play
            {item.playCount === 1 ? "" : "s"}
            {item.roles.length > 0 ? ` · ${item.roles.join(", ")}` : ""}
          </div>
          {item.games.length > 0 && (
            <div className="text-[11px] text-neutral-600 mt-0.5">vs {item.games.join(", ")}</div>
          )}
        </div>
      </div>

      {mode === "menu" && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setMode("merge")} className="btn-ghost text-[11px] py-2 h-auto flex-col gap-1">
            <ArrowRight className="w-4 h-4" />
            Merge
          </button>
          <button onClick={() => setMode("promote")} className="btn-ghost text-[11px] py-2 h-auto flex-col gap-1">
            <UserPlus className="w-4 h-4" />
            New player
          </button>
          <button onClick={() => setMode("discard")} className="btn-ghost text-[11px] py-2 h-auto flex-col gap-1 text-red-400">
            <Trash2 className="w-4 h-4" />
            Discard
          </button>
        </div>
      )}

      {mode === "merge" && (
        <div className="space-y-2">
          <div className="text-xs text-neutral-400">
            Move all {item.tagCount} tag{item.tagCount === 1 ? "" : "s"} onto an existing player.
          </div>
          <select
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            className="input text-sm appearance-none"
          >
            <option value="">Select a player…</option>
            {roster.map((entry) => (
              <option key={entry.player_id} value={entry.player_id}>{playerLabel(entry)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => run(() => mergePendingIntoPlayer(seasonId, item.pendingId, mergeTarget))}
              disabled={!mergeTarget || busy}
              className="btn-primary text-xs px-3 py-1 h-9 disabled:opacity-40"
            >
              {busy ? "Merging…" : "Merge"}
            </button>
            <button onClick={() => setMode("menu")} disabled={busy} className="btn-ghost text-xs px-3 py-1 h-9">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "promote" && (
        <div className="space-y-2">
          <div className="text-xs text-neutral-400">
            Create a new player wearing {jerseyLabel} and move the tags to them.
          </div>
          {jerseyClash && (
            <div className="text-[11px] text-amber-400">
              Heads up: someone on this roster already wears {jerseyLabel}.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="input text-sm"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="input text-sm"
            />
          </div>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value.toUpperCase())}
            placeholder="Position (optional)"
            className="input text-sm"
            maxLength={4}
          />
          <div className="flex gap-2">
            <button
              onClick={() => run(() => promotePendingToPlayer(seasonId, programId, item.pendingId, {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                position: position.trim() || null,
                jersey: item.jersey,
              }))}
              disabled={!firstName.trim() || !lastName.trim() || busy}
              className="btn-primary text-xs px-3 py-1 h-9 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create & merge"}
            </button>
            <button onClick={() => setMode("menu")} disabled={busy} className="btn-ghost text-xs px-3 py-1 h-9">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "discard" && (
        <div className="space-y-2 p-3 rounded-xl bg-red-950/25 border border-red-900/40">
          <div className="text-xs text-neutral-300 leading-relaxed">
            Remove {item.tagCount} tag{item.tagCount === 1 ? "" : "s"} across {item.playCount} play
            {item.playCount === 1 ? "" : "s"}? Those stats become untagged. The plays themselves are kept.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => run(() => discardPending(seasonId, item.pendingId))}
              disabled={busy}
              className="btn-primary text-xs px-3 py-1 h-9 disabled:opacity-40"
            >
              {busy ? "Removing…" : "Discard tags"}
            </button>
            <button onClick={() => setMode("menu")} disabled={busy} className="btn-ghost text-xs px-3 py-1 h-9">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PendingPlayersSheet({
  seasonId, programId, pending, roster, onClose, onResolved,
}: Props) {
  const [error, setError] = useState("");

  return (
    <div className="sheet bg-black/80" onClick={onClose}>
      <div className="sheet-panel max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 pb-3 shrink-0">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Unresolved Players
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Jersey numbers recorded during a game with nobody rostered under them.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
          {error && (
            <div className="card p-3 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {pending.length === 0 ? (
            <div className="card p-6 text-center text-sm text-neutral-500">
              Nothing to resolve — every recorded jersey maps to a rostered player.
            </div>
          ) : (
            pending.map((item) => (
              <PendingCard
                key={item.pendingId}
                item={item}
                roster={roster}
                seasonId={seasonId}
                programId={programId}
                onResolved={onResolved}
                onError={setError}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
