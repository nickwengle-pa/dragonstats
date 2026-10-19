import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePermissions, useProgramContext } from "@/hooks/useProgramContext";
import {
  actorLabel, changeLines, changeTitle, gameIdOf, gameLabel, isAfterGame, isEmptyEdit, type ChangeRow,
} from "@/services/changeLog";

/**
 * Who started, ended and changed each game - admins and head coaches only.
 *
 * The database writes every row (game_activity, see changeLog.ts), so this
 * screen only reads. Newest first, a page at a time, filtered here rather
 * than on the server: a season is a few hundred entries at most.
 */

const PAGE = 200;

type Phase = "all" | "after";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** The table not being there means the SQL for this has not been run yet. */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205"
    || /could not find the table|relation .* does not exist/i.test(error.message ?? "");
}

function friendlyError(error: { code?: string; message?: string }): string {
  if (isMissingTable(error)) return "The change log starts once its database update is applied.";
  return /failed to fetch|network|load failed/i.test(error.message ?? "")
    ? "Can't reach the server. The change log needs a connection."
    : (error.message ?? "Couldn't load the change log.");
}

export default function ChangeLogScreen() {
  const navigate = useNavigate();
  const { program } = useProgramContext();
  const perms = usePermissions();
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<Phase>("all");
  const [person, setPerson] = useState("");
  const game = params.get("game") ?? "";

  const load = useCallback(async (beforeId?: number) => {
    if (!program) return;
    setLoading(true);
    let query = supabase
      .from("game_activity")
      .select("*")
      .eq("program_id", program.id)
      // Ids only grow, so they order the log and page it exactly; two
      // entries written together share a timestamp.
      .order("id", { ascending: false })
      .limit(PAGE);
    if (beforeId != null) query = query.lt("id", beforeId);
    const { data, error: err } = await query;
    setLoading(false);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    setError("");
    const page = (data as ChangeRow[] | null) ?? [];
    setRows((prev) => (beforeId != null ? [...prev, ...page] : page));
    setMore(page.length === PAGE);
  }, [program]);

  useEffect(() => {
    if (perms.seeChangeLog) void load();
  }, [load, perms.seeChangeLog]);

  const games = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      const id = gameIdOf(r);
      if (id && !seen.has(id)) seen.set(id, gameLabel(r.game_info));
    }
    return [...seen.entries()];
  }, [rows]);

  const people = useMemo(() => [...new Set(rows.map(actorLabel))].sort(), [rows]);

  const shown = rows.filter((r) =>
    !isEmptyEdit(r)
    && (!game || gameIdOf(r) === game)
    && (phase === "all" || isAfterGame(r))
    && (!person || actorLabel(r) === person));

  const setGame = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("game", id); else next.delete("game");
    setParams(next, { replace: true });
  };

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2 cursor-pointer" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] flex-1">Change Log</h1>
      </div>

      <div className="flex-1 min-w-0 px-5 pb-6 space-y-3">
        {!perms.seeChangeLog ? (
          <p className="text-sm text-neutral-500">Only an admin or head coach can see the change log.</p>
        ) : (
          <>
            <p className="text-[11px] text-surface-muted/70 font-body">
              Who started, ended and changed each game. A play recorded offline is listed under whoever was
              signed in on that device when it synced.
            </p>

            <div className="flex flex-wrap gap-2">
              <select value={game} onChange={(e) => setGame(e.target.value)} className="input text-xs py-1.5 px-2 w-auto" aria-label="Game">
                <option value="">All games</option>
                {games.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select value={person} onChange={(e) => setPerson(e.target.value)} className="input text-xs py-1.5 px-2 w-auto" aria-label="Person">
                <option value="">Everyone</option>
                {people.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="flex rounded-[4px] border border-surface-border overflow-hidden text-xs font-bold">
                {([["all", "Everything"], ["after", "After the final"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setPhase(value)}
                    className={`px-3 py-1.5 ${phase === value ? "bg-dragon-primary text-white" : "text-surface-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-400 font-body">{error}</p>}

            {!error && !loading && shown.length === 0 && (
              <div className="card p-4 text-center text-sm text-surface-muted">
                <History className="w-6 h-6 mx-auto mb-2 opacity-60" />
                {rows.length === 0 ? "Nothing logged yet. Changes show here from now on." : "Nothing matches these filters."}
              </div>
            )}

            <div className="space-y-2">
              {shown.map((r) => <Entry key={r.id} row={r} showGame={!game} />)}
            </div>

            {loading && <p className="text-xs text-surface-muted text-center">Loading…</p>}
            {more && !loading && (
              <button onClick={() => void load(rows[rows.length - 1]?.id)} className="btn-ghost w-full text-xs">
                Show older
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Entry({ row, showGame }: { row: ChangeRow; showGame: boolean }) {
  const lines = changeLines(row);
  const descBefore = row.before?.desc;
  const descAfter = row.after?.desc;
  const after = isAfterGame(row);
  return (
    <div className="card p-3 space-y-1.5">
      <div className="flex items-baseline gap-2">
        <div className="text-sm font-bold flex-1 min-w-0">{changeTitle(row)}</div>
        {after && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">
            After final
          </span>
        )}
      </div>
      <div className="text-[11px] text-surface-muted font-body">
        {actorLabel(row)} · {when(row.created_at)}
        {showGame && ` · ${gameLabel(row.game_info)}`}
      </div>

      {row.action === "play_edited" && (descBefore || descAfter) && descBefore !== descAfter && (
        <div className="text-xs font-body space-y-0.5">
          <div className="text-surface-muted line-through decoration-surface-muted/50">{descBefore || "-"}</div>
          <div>{descAfter || "-"}</div>
        </div>
      )}
      {(row.action === "play_deleted" || row.action === "play_added") && (
        <div className="text-xs font-body">
          {(row.action === "play_deleted" ? descBefore : descAfter) || "No description"}
        </div>
      )}
      {row.action === "game_deleted" && row.before && (
        <div className="text-xs font-body text-surface-muted">
          {row.before.us != null && `Score was ${row.before.us}-${row.before.them}. `}
          {row.before.plays != null && `${row.before.plays} ${row.before.plays === 1 ? "play" : "plays"} went with it.`}
        </div>
      )}

      {lines.length > 0 && (
        <table className="w-full text-xs font-body">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-t border-surface-border/50">
                <td className="py-1 pr-2 text-surface-muted align-top">{line.label}</td>
                <td className="py-1 pr-2 align-top text-surface-muted line-through decoration-surface-muted/50">{line.before}</td>
                <td className="py-1 align-top font-semibold">{line.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
