import { useMemo, useState } from "react";
import { TEAM_PLAYER_ID } from "@/components/game/types";
import { per, type BookPlayer, type PeriodStats } from "@/services/seasonBook";
import type { StatCategory, StatColumn } from "./statCategories";

interface Props<T> {
  category: StatCategory<T>;
  stats: PeriodStats;
  players: Map<string, BookPlayer>;
  /** Season tables: games each player has a line in, for GP and per game. */
  gamesPlayed?: Map<string, number>;
  /** Games in the season slice, for the total row's per game. */
  seasonGames?: number;
  onPlayer?: (id: string) => void;
}

/** Sort key: a column index, or -1 for the player's number. */
interface Sort { col: number; desc: boolean }

/**
 * One category's player table. Tap a heading to sort by it (biggest first,
 * tap again to flip); tap a player to open their page. The first column stays
 * put while the numbers scroll sideways, so a wide table like defense still
 * reads on a phone.
 */
export default function StatTable<T>({ category, stats, players, gamesPlayed, seasonGames, onPlayer }: Props<T>) {
  const strongAt = Math.max(0, category.cols.findIndex(c => c.strong));
  const [sort, setSort] = useState<Sort>({ col: strongAt, desc: true });
  const perGame = gamesPlayed ? category.perGame : undefined;

  const rows = useMemo(() => {
    const list = category.rows(stats).map(r => {
      const player = r.id ? players.get(r.id) : undefined;
      const name = player?.label
        ?? (r.id === TEAM_PLAYER_ID ? "TEAM" : r.name || "Unrostered");
      return { ...r, name, jersey: player?.jersey ?? null, linked: Boolean(player), team: r.id === TEAM_PLAYER_ID };
    });
    const by = sort.col >= 0 ? category.cols[sort.col] : null;
    return list.sort((a, b) => {
      if (!by) return (a.jersey ?? 1000) - (b.jersey ?? 1000) || a.name.localeCompare(b.name);
      const d = by.value(a.data) - by.value(b.data);
      return (sort.desc ? -d : d) || a.name.localeCompare(b.name);
    });
  }, [category, stats, players, sort]);
  const total = category.total(stats);

  if (rows.length === 0) return <p className="ss-empty">No {category.title.toLowerCase()} in this stretch.</p>;

  const pick = (col: number) => setSort(s => (s.col === col ? { col, desc: !s.desc } : { col, desc: col >= 0 }));
  const cell = (c: StatColumn<T>, data: T) => (c.text ? c.text(data) : String(c.value(data)));
  const ariaSort = (col: number) => (sort.col === col ? (sort.desc ? "descending" : "ascending") : undefined);

  return (
    <div className="ss-table-wrap">
      <table className="ss-table">
        <thead>
          <tr>
            <th scope="col" className="ss-name" aria-sort={ariaSort(-1)}>
              <button type="button" onClick={() => pick(-1)} title="Sort by number">Player</button>
            </th>
            {gamesPlayed && <th scope="col" title="Games with a stat line">GP</th>}
            {category.cols.map((c, i) => (
              <th key={`${c.label}-${i}`} scope="col" aria-sort={ariaSort(i)} className={sort.col === i ? "on" : undefined}>
                <button type="button" onClick={() => pick(i)} title={c.title ? `Sort by ${c.title.toLowerCase()}` : undefined}>
                  {c.label}{sort.col === i && <i aria-hidden>{sort.desc ? "▼" : "▲"}</i>}
                </button>
              </th>
            ))}
            {perGame && <th scope="col" title="Per game played">{perGame.label}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const gp = r.id ? gamesPlayed?.get(r.id) ?? 0 : 0;
            return (
              <tr key={`${r.id ?? r.name}-${ri}`} className={r.linked && onPlayer ? "tap" : undefined}
                onClick={r.linked && onPlayer && r.id ? () => onPlayer(r.id!) : undefined}>
                <th scope="row" className="ss-name">
                  {r.linked && onPlayer && r.id
                    ? <button type="button" onClick={e => { e.stopPropagation(); onPlayer(r.id!); }}>{r.name}</button>
                    : <span className={r.linked || r.team ? undefined : "ss-unrostered"} title={r.linked || r.team ? undefined : "Not on the roster"}>{r.name}</span>}
                </th>
                {gamesPlayed && <td className="ss-mute">{r.id ? gp || "" : ""}</td>}
                {category.cols.map((c, i) => (
                  <td key={`${c.label}-${i}`} className={c.strong ? "ss-strong" : undefined}>{cell(c, r.data)}</td>
                ))}
                {perGame && <td>{gp ? per(perGame.value(r.data), gp) : ""}</td>}
              </tr>
            );
          })}
        </tbody>
        {total && rows.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row" className="ss-name">Total</th>
              {gamesPlayed && <td />}
              {category.cols.map((c, i) => <td key={`${c.label}-${i}`}>{cell(c, total)}</td>)}
              {perGame && <td>{seasonGames ? per(perGame.value(total), seasonGames) : ""}</td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
