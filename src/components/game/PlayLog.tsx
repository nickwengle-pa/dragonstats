import { useMemo, useState } from "react";
import { X, Pencil, RotateCcw, CloudOff, Plus } from "lucide-react";
import { fmtClock, quarterLabel, yardLabel, TEAM_JERSEY, type PlayRecord, type TaggedPlayer } from "./types";

type LogFilter = "all" | "off" | "def" | "k";

/** Anything where the kicking team is on the field. Filed under K rather than
 *  by possession, because "who had the ball" is not the useful question about
 *  a punt. */
const KICKING_TYPES = new Set([
  "kickoff", "punt", "onside_kick", "fair_catch", "blocked_kick", "fg", "pat",
]);

/** Which unit was on the field. Timeouts belong to no unit and show only
 *  under All. */
function unitOf(play: PlayRecord): LogFilter | "none" {
  if (play.type === "timeout") return "none";
  if (KICKING_TYPES.has(play.type)) return "k";
  return play.possession === "us" ? "off" : "def";
}

/** The two roles that carry defensive stop credit. */
const TACKLE_ROLES = new Set(["tackler", "sacker"]);

/**
 * Our tacklers on this play, or none.
 *
 * Opponent tags are filtered out rather than greyed: the log is read to check
 * OUR defense, and a list of their tacklers on our own runs is exactly the
 * noise that kept this line off the play row before. Opponent tags carry
 * isOpponent, so this needs no possession test and reads the same on a kickoff
 * cover team as on a defensive snap.
 */
function ourTacklers(play: PlayRecord): TaggedPlayer[] {
  return (play.tagged ?? []).filter(t => TACKLE_ROLES.has(t.role) && !t.isOpponent);
}

/** "#42 Smith", or "TEAM" for a stop nobody got a number on. Jersey numbers
 *  come back null from the play_players join, so the surname carries it. */
function tacklerLabel(t: TaggedPlayer): string {
  if (t.isTeam) return "TEAM";
  const surname = t.name.trim().split(/\s+/).slice(-1)[0] || t.name;
  return t.jersey_number != null ? `#${t.jersey_number} ${surname}` : surname;
}

const FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "off", label: "Off" },
  { id: "def", label: "Def" },
  { id: "k", label: "K" },
];

interface Props {
  plays: PlayRecord[];
  onEdit: (play: PlayRecord) => void;
  /** Record a play that belongs immediately after this one - a snap missed
   *  live and noticed a few downs later. */
  onInsertAfter?: (play: PlayRecord) => void;
  onUndo: () => void;
  onClose: () => void;
  /** Play ids that are still in the sync queue (haven't pushed to server yet). */
  pendingPlayIds?: Set<string>;
}

const PLAY_ICONS: Record<string, string> = {
  rush: "\u25B6",
  pass_comp: "\u2714",
  pass_inc: "\u2718",
  sack: "\u2193",
  fumble: "\u21BB",
  int: "\u25CF",
  kickoff: "\u26A1",
  punt: "\u2191",
  fg: "\u2605",
  pat: "\u2713",
  two_pt: "\u2161",
  safety: "\u25B2",
  penalty_only: "\u2691",
  timeout: "TO",
};

const PLAY_ICON_COLORS: Record<string, string> = {
  rush: "text-emerald-400",
  pass_comp: "text-blue-400",
  pass_inc: "text-red-400",
  sack: "text-red-400",
  fumble: "text-orange-400",
  int: "text-red-500",
  kickoff: "text-amber-400",
  punt: "text-purple-400",
  fg: "text-amber-400",
  pat: "text-emerald-400",
  two_pt: "text-blue-400",
  safety: "text-amber-500",
  penalty_only: "text-orange-400",
  timeout: "text-amber-300",
};

export default function PlayLog({ plays, onEdit, onInsertAfter, onUndo, onClose, pendingPlayIds }: Props) {
  const [filter, setFilter] = useState<LogFilter>("all");
  const [playerQuery, setPlayerQuery] = useState("");

  /* Number by RECORDING order, before any filtering or reversing, so a play
     keeps the same number whichever filter is on. Derived from position rather
     than play.sequence: position is always contiguous and always present. */
  const numbered = useMemo(
    () => plays.map((play, idx) => ({ play, number: idx + 1 })),
    [plays],
  );
  /* Everything on a play that names somebody, flattened once per play. The
     tags are already rebuilt with their jersey numbers by the time they reach
     here, so this is just a join - and TEAM answers to the word or to the
     number it wears on a stat sheet, which is what somebody looking for
     uncredited stops would type. */
  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const play of plays) {
      const parts = (play.tagged ?? []).map(t => (
        t.isTeam
          ? `team ${TEAM_JERSEY}`
          : `${t.jersey_number ?? ""} ${t.name ?? ""}`
      ).toLowerCase());
      index.set(play.id, parts.join(" | "));
    }
    return index;
  }, [plays]);

  const visible = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    /* A bare number is a jersey, and a jersey matches at a word boundary:
       typing 2 must not return every 12, 20 and 42 in the log. */
    const numeric = /^\d+$/.test(q);
    const jerseyRe = numeric ? new RegExp(`(^|[^0-9])${q}([^0-9]|$)`) : null;

    /* Oldest first, unlike the inline list on the game screen, which stays
       newest-first because live entry cares about the last snap. This log is
       where you review and where you insert, and both of those read forwards:
       "add a play after this one" means the row BELOW, the way the game
       actually ran. Reversed, that instruction pointed at the row above. */
    return numbered.filter(({ play }) => {
      if (filter !== "all" && unitOf(play) !== filter) return false;
      if (!q) return true;
      const hay = searchIndex.get(play.id) ?? "";
      return jerseyRe ? jerseyRe.test(hay) : hay.includes(q);
    });
  }, [numbered, filter, playerQuery, searchIndex]);
  const counts = useMemo(() => {
    const c: Record<LogFilter, number> = { all: plays.length, off: 0, def: 0, k: 0 };
    for (const play of plays) {
      const u = unitOf(play);
      if (u !== "none") c[u]++;
    }
    return c;
  }, [plays]);

  return (
    <div className="sheet bg-black/80">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <h2 className="text-lg font-display font-extrabold uppercase tracking-[0.1em]">Play Log <span className="text-surface-muted font-semibold text-sm">({plays.length})</span></h2>
          <div className="flex items-center gap-2">
            {plays.length > 0 && (
              <button onClick={onUndo} className="text-[10px] font-display font-bold text-red-400 flex items-center gap-1 uppercase tracking-wider cursor-pointer">
                <RotateCcw className="w-3 h-3" /> Undo
              </button>
            )}
            <span className="text-[9px] font-display font-bold uppercase tracking-[0.14em] text-surface-muted/60">
              Oldest first
            </span>
            <button onClick={onClose} className="btn-ghost p-1.5 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {plays.length > 0 && (
          <div className="flex gap-1.5 px-4 pb-2 shrink-0">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-display font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  filter === f.id
                    ? "border-dragon-primary bg-dragon-primary/15 text-dragon-primary"
                    : "border-surface-border bg-surface-bg text-surface-muted"
                }`}
              >
                {f.label}
                <span className="ml-1 opacity-60 tabular-nums">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Find a player's snaps without scrolling the game. Number or name;
            the chips above narrow by unit at the same time. */}
        {plays.length > 0 && (
          <div className="px-4 pb-2 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={playerQuery}
                onChange={(e) => setPlayerQuery(e.target.value)}
                placeholder="Player # or name…"
                className="input w-full text-xs py-1.5 pr-7"
              />
              {playerQuery && (
                <button
                  onClick={() => setPlayerQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-surface-muted cursor-pointer"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* A filtered log reading "12 plays" is indistinguishable from a
                game with 12 plays in it. */}
            {(playerQuery.trim() !== "" || filter !== "all") && (
              <div className="text-[10px] text-surface-muted mt-1.5 tabular-nums">
                {visible.length} of {plays.length} plays
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {plays.length === 0 ? (
            <div className="text-sm text-surface-muted text-center py-8 font-body">No plays recorded yet.</div>
          ) : (
            visible.length === 0 ? (
              <div className="text-sm text-surface-muted text-center py-8 font-body">
                {playerQuery.trim()
                  ? `No plays with "${playerQuery.trim()}".`
                  : `No ${FILTERS.find(f => f.id === filter)?.label.toLowerCase()} plays yet.`}
                <button
                  onClick={() => { setFilter("all"); setPlayerQuery(""); }}
                  className="block mx-auto mt-3 text-dragon-primary font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            ) :
            visible.map(({ play, number }) => {
              // "Last" means the most recent play overall, not the most recent
              // one passing the filter.
              const isLast = number === plays.length;
              const tacklers = ourTacklers(play);
              return (
                <div
                  key={play.id}
                  className={`flex items-start gap-2 rounded-xl px-3 py-2 border transition-colors ${
                    isLast ? "border-dragon-primary/30 bg-dragon-primary/5" : "border-surface-border bg-surface-card"
                  }`}
                >
                  {/* Recording order, so a play can be called out by number
                      between the box and the booth. */}
                  <span className="text-[10px] mt-1 font-display font-bold text-surface-muted/70 tabular-nums w-5 shrink-0 text-right">
                    {number}
                  </span>
                  <span className={`text-xs mt-1 font-bold ${PLAY_ICON_COLORS[play.type] ?? "text-surface-muted"}`}>
                    {PLAY_ICONS[play.type] ?? "\u25B8"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-body font-semibold truncate">{play.description}</div>
                    <div className="text-[10px] text-surface-muted mt-0.5 font-body">
                      {quarterLabel(play.quarter)} · {fmtClock(play.clock)} · {play.down}{play.down === 1 ? "st" : play.down === 2 ? "nd" : play.down === 3 ? "rd" : "th"}&{play.distance} · {yardLabel(play.ballOn)}
                      {play.possession === "them" && " (DEF)"}
                      {/* Everything left of the arrow is the situation the play
                          STARTED from; everything right of it is what the play
                          left behind. Without the second half you can only read
                          a play's result by finding the next one down the list -
                          which in a newest-first log is the row ABOVE it. */}
                      {play.nextDown != null && play.nextBallOn != null && (
                        <span className="text-surface-muted/70">
                          {" → "}
                          {play.nextPossession && play.nextPossession !== play.possession && (
                            <span className="text-orange-400/90">{"⇄ "}</span>
                          )}
                          {play.nextDown}{play.nextDown === 1 ? "st" : play.nextDown === 2 ? "nd" : play.nextDown === 3 ? "rd" : "th"}&{play.nextDistance}
                          {" · "}
                          {yardLabel(play.nextBallOn)}
                        </span>
                      )}
                    </div>
                    {play.offensiveFormation && (
                      <div className="text-[10px] text-blue-500/70 mt-0.5 font-body">{play.offensiveFormation} vs {play.defensiveFormation ?? "\u2014"}</div>
                    )}
                    {/* Who made the stop, on the play row itself. The bracketed
                        number is split credit - two names at 0.5 each is one
                        shared tackle, not two. */}
                    {tacklers.length > 0 && (
                      <div className="text-[10px] text-red-400/80 mt-0.5 font-body truncate">
                        {play.type === "sack" ? "Sack: " : "Tkl: "}
                        {tacklers
                          .map(t => `${tacklerLabel(t)}${t.credit != null && t.credit !== 1 ? ` (${t.credit})` : ""}`)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <div className={`text-xs font-display font-extrabold tabular-nums ${
                      play.type === "timeout"
                        ? "text-amber-300"
                        : play.yards > 0
                          ? "text-emerald-400"
                          : play.yards < 0
                            ? "text-red-400"
                            : "text-surface-muted"
                    }`}>
                      {play.type === "timeout" ? "TO" : play.yards > 0 ? `+${play.yards}` : play.yards === 0 ? "0" : play.yards}
                    </div>
                    {play.isTouchdown && <span className="text-[10px] font-display font-bold text-amber-400 uppercase tracking-wider">TD</span>}
                    {play.penalty && <span className="text-[10px] font-display font-bold text-orange-400 uppercase tracking-wider">PEN</span>}
                    {pendingPlayIds?.has(play.id) && (
                      <span
                        title="Not yet synced to server"
                        className="text-[10px] font-display font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1"
                      >
                        <CloudOff className="w-3 h-3" /> queue
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    {/* Timeouts are editable too now - the clock and which side
                        called it, which the derived remaining counts depend on. */}
                    <button onClick={() => onEdit(play)} className="btn-ghost p-1 text-surface-muted/40 mt-0.5 cursor-pointer" title="Edit play">
                      <Pencil className="w-3 h-3" />
                    </button>
                    {/* A missed snap belongs where it happened, not on the end
                        of the list - everything after it is computed from the
                        order. */}
                    {onInsertAfter && (
                      <button
                        onClick={() => onInsertAfter(play)}
                        className="btn-ghost p-1 text-surface-muted/40 cursor-pointer"
                        title={`Insert a play between #${number} and #${number + 1}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
