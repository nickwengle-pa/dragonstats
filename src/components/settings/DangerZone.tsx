import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Database, Smartphone, Trash2, Users } from "lucide-react";
import {
  countSeasonData,
  deleteSeason,
  deleteUnrosteredPlayers,
  purgeSeasonGames,
  purgeSeasonRoster,
  wipeDeviceCache,
  type PurgeResult,
  type SeasonDataCounts,
} from "@/services/dangerZone";
import { formatSeasonName, type Season } from "@/services/seasonService";

interface Props {
  programId: string;
  season: Season | null;
  seasons: Season[];
  /** Reload program + seasons after anything is destroyed. */
  onChanged: () => Promise<void> | void;
}

/**
 * One irreversible action, gated behind a typed confirmation.
 *
 * The phrase is deliberately specific (a season's own name, not just "DELETE")
 * wherever picking the wrong row is the likely mistake.
 */
function DangerAction({
  icon,
  title,
  description,
  actionLabel,
  confirmPhrase,
  disabled,
  disabledReason,
  onRun,
  onDone,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  confirmPhrase: string;
  disabled?: boolean;
  disabledReason?: string;
  onRun: () => Promise<PurgeResult>;
  onDone: (result: PurgeResult) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PurgeResult | null>(null);

  const matches = typed.trim().toLowerCase() === confirmPhrase.toLowerCase();

  const reset = () => {
    setConfirming(false);
    setTyped("");
  };

  const run = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setResult(null);

    const outcome = await onRun();

    setBusy(false);
    setResult(outcome);
    reset();
    onDone(outcome);
  };

  return (
    <div className="py-3 border-b border-red-900/25 last:border-0">
      <div className="flex items-start gap-3">
        <div className="text-red-500/70 mt-0.5 shrink-0">{icon}</div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{title}</div>
          <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{description}</p>

          {disabled && disabledReason && (
            <p className="text-xs text-neutral-600 italic mt-1">{disabledReason}</p>
          )}

          {result && (
            <p className={`text-xs mt-1.5 ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
              {result.ok
                ? `Done — ${result.count} row${result.count === 1 ? "" : "s"} removed.${result.warning ? ` ${result.warning}` : ""}`
                : result.error}
            </p>
          )}
        </div>

        {!confirming && (
          <button
            onClick={() => { setConfirming(true); setResult(null); }}
            disabled={disabled}
            className="btn-ghost text-xs px-3 py-1.5 shrink-0 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {actionLabel}
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 ml-8 p-3 rounded-xl bg-red-950/25 border border-red-900/40 space-y-2">
          <p className="text-xs text-neutral-300">
            This cannot be undone. Type{" "}
            <span className="font-mono font-bold text-red-300">{confirmPhrase}</span> to confirm.
          </p>

          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") run(); }}
            placeholder={confirmPhrase}
            className="input h-10 text-sm font-mono"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={!matches || busy}
              className="btn-primary text-xs px-3 py-1 h-9 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Working..." : actionLabel}
            </button>
            <button onClick={reset} disabled={busy} className="btn-ghost text-xs px-3 py-1 h-9">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DangerZone({ programId, season, seasons, onChanged }: Props) {
  const [counts, setCounts] = useState<SeasonDataCounts | null>(null);

  const loadCounts = useCallback(async () => {
    if (!season) {
      setCounts(null);
      return;
    }
    setCounts(await countSeasonData(season.id));
  }, [season]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Every action reloads the counts and refreshes the program context, so the
  // rest of Settings can't keep showing a season that no longer exists.
  const afterChange = async (result: PurgeResult) => {
    if (!result.ok) return;
    await Promise.all([loadCounts(), onChanged()]);
  };

  const seasonLabel = season ? formatSeasonName(season) : "";
  const summary = counts
    ? `${counts.games} game${counts.games === 1 ? "" : "s"}, ${counts.plays} play${counts.plays === 1 ? "" : "s"}, ${counts.rosterEntries} roster spot${counts.rosterEntries === 1 ? "" : "s"}`
    : "counting...";

  return (
    <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-4">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <span className="font-bold text-red-400">Danger Zone</span>
      </div>
      <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
        Permanent deletions. Nothing here can be undone, and there is no backup.
      </p>

      {season && (
        <>
          <div className="text-[11px] font-display font-bold text-surface-muted uppercase tracking-widest mb-1 pt-2">
            {seasonLabel} — {summary}
          </div>

          <DangerAction
            icon={<Database className="w-4 h-4" />}
            title="Clear this season's games"
            description="Deletes every game in this season along with all recorded plays and stats. Keeps the roster, coaching staff, and opponents."
            actionLabel="Clear Games"
            confirmPhrase="DELETE GAMES"
            onRun={() => purgeSeasonGames(season.id)}
            onDone={afterChange}
          />

          <DangerAction
            icon={<Users className="w-4 h-4" />}
            title="Clear this season's roster"
            description="Removes every player from this season's roster. The player records stay in the program and can be re-added."
            actionLabel="Clear Roster"
            confirmPhrase="DELETE ROSTER"
            onRun={() => purgeSeasonRoster(season.id)}
            onDone={afterChange}
          />
        </>
      )}

      <div className="text-[11px] font-display font-bold text-surface-muted uppercase tracking-widest mb-1 pt-4">
        Program
      </div>

      <DangerAction
        icon={<Users className="w-4 h-4" />}
        title="Remove unrostered players"
        description="Deletes players who aren't on any season's roster — the leftovers after clearing out test data. Players still credited on a recorded play are kept."
        actionLabel="Remove"
        confirmPhrase="REMOVE PLAYERS"
        onRun={() => deleteUnrosteredPlayers(programId)}
        onDone={afterChange}
      />

      {seasons.length > 0 && (
        <>
          <div className="text-[11px] font-display font-bold text-surface-muted uppercase tracking-widest mb-1 pt-4">
            Delete a Season
          </div>

          {seasons.map((entry) => (
            <DangerAction
              key={entry.id}
              icon={<Trash2 className="w-4 h-4" />}
              title={formatSeasonName(entry)}
              description="Deletes the season and everything in it: games, plays, roster, and coaching staff. Players and opponents are kept."
              actionLabel="Delete Season"
              confirmPhrase={formatSeasonName(entry)}
              disabled={entry.is_active}
              disabledReason="Set another season active before deleting this one."
              onRun={() => deleteSeason(entry.id)}
              onDone={afterChange}
            />
          ))}
        </>
      )}

      <div className="text-[11px] font-display font-bold text-surface-muted uppercase tracking-widest mb-1 pt-4">
        This Device
      </div>

      <DangerAction
        icon={<Smartphone className="w-4 h-4" />}
        title="Clear offline data"
        description="Wipes cached plays and the pending sync queue on this device only. Server data is untouched — but anything recorded offline that hasn't synced yet will be lost."
        actionLabel="Clear Cache"
        confirmPhrase="CLEAR CACHE"
        onRun={wipeDeviceCache}
        onDone={afterChange}
      />
    </div>
  );
}
