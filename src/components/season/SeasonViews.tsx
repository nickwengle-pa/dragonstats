import { useMemo } from "react";
import { ChevronIcon } from "@/components/icons/BroadcastIcons";
import type { GameReport } from "@/services/gameReport";
import {
  clockFromSeconds, gameResult, gameStats, leaders, per, recordLabel, seasonRecord, seasonSlice, shortDate,
  teamPeriodLines, type BookGame, type BookPlayer, type SeasonModel, type SeasonStats,
} from "@/services/seasonBook";
import { PERIOD_LONG, PERIOD_SHORT, type StatPeriod } from "@/services/statPeriod";
import StatTable from "./StatTable";
import { STAT_CATEGORIES, type StatCategory } from "./statCategories";

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/* ── Shared pieces ────────────────────────────────────────────────────────── */

/** Stat category chips: only the ones with someone in them. */
export function CategoryPicker({ categories, value, onChange }: {
  categories: StatCategory[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="ss-cats" role="tablist" aria-label="Stat category">
      {categories.map(c => (
        <button key={c.id} type="button" role="tab" aria-selected={c.id === value} className={c.id === value ? "on" : undefined}
          onClick={() => onChange(c.id)} title={c.title}>
          {c.title}
        </button>
      ))}
    </div>
  );
}

/** The stat sheet's team table: us beside them, a line per statistic. With
 *  `games`, each side gets a per-game column too. */
export function TeamCompare({ report, usAbbr, themAbbr, games, points, label = "Team statistics" }: {
  report: GameReport;
  label?: string;
  usAbbr: string;
  themAbbr: string;
  games?: number;
  /** A points line on top, for the season (a game has its line score). */
  points?: { us: number; them: number; usTop: number; themTop: number };
}) {
  const perGame = (v: string) => (games && /^-?\d+(\.\d+)?$/.test(v) ? per(Number(v), games) : "");
  const rows = report.teamStats.filter(r => !(games && /possession/i.test(r.label)));
  return (
    <div className="ss-table-wrap">
      <table className="ss-table ss-compare">
        <thead>
          <tr>
            <th scope="col" className="ss-name">{label}</th>
            <th scope="col">{usAbbr}</th>
            {games ? <th scope="col" className="ss-mute">/G</th> : null}
            <th scope="col">{themAbbr}</th>
            {games ? <th scope="col" className="ss-mute">/G</th> : null}
          </tr>
        </thead>
        <tbody>
          {points && games ? (
            <tr className="head">
              <th scope="row" className="ss-name">Points</th>
              <td>{points.us}</td><td className="ss-mute">{per(points.us, games)}</td>
              <td>{points.them}</td><td className="ss-mute">{per(points.them, games)}</td>
            </tr>
          ) : null}
          {rows.map((r, i) => {
            const rate = /average|per /i.test(r.label);
            return (
              <tr key={i} className={r.emphasis ?? undefined}>
                <th scope="row" className="ss-name">{r.label}</th>
                <td>{r.us}</td>
                {games ? <td className="ss-mute">{rate ? "" : perGame(r.us)}</td> : null}
                <td>{r.them}</td>
                {games ? <td className="ss-mute">{rate ? "" : perGame(r.them)}</td> : null}
              </tr>
            );
          })}
          {points && games ? (
            <tr>
              <th scope="row" className="ss-name">Possession per game</th>
              <td>{clockFromSeconds(points.usTop / games)}</td><td />
              <td>{clockFromSeconds(points.themTop / games)}</td><td />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ── Team ─────────────────────────────────────────────────────────────────── */

export function TeamView({ model, slice, period, players, onPlayer }: {
  model: SeasonModel;
  slice: SeasonStats;
  period: StatPeriod;
  players: Map<string, BookPlayer>;
  onPlayer: (id: string) => void;
}) {
  const { program } = model;
  const sides = teamPeriodLines(slice, program.id);
  const rec = seasonRecord(model.games);
  const live = model.games.filter(g => g.meta.status === "live").length;
  const g = slice.games;
  const pre = period === "game" ? "" : `${PERIOD_SHORT[period]} `;
  const tiles: Array<[string, string, string]> = [
    ["Record", recordLabel(rec), `${rec.final} final${live ? ` · ${live} live` : ""}`],
    [`${pre}Points / game`, per(sides.us.points, g), `${sides.us.points} total`],
    [`${pre}Allowed / game`, per(sides.them.points, g), `${sides.them.points} total`],
    [`${pre}Yards / game`, per(sides.us.totalYds, g), `${sides.us.rushYds} rush · ${sides.us.passYds} pass`],
    [`${pre}Yds allowed / g`, per(sides.them.totalYds, g), `${sides.them.rushYds} rush · ${sides.them.passYds} pass`],
    [`${pre}Turnover margin`, signed(sides.them.turnovers - sides.us.turnovers), `${sides.them.turnovers} gained · ${sides.us.turnovers} lost`],
  ];
  const top = leaders(slice, id => players.has(id));

  // The season's line score, whatever the period: it is where Q1 vs Q4 shows.
  const quarters: StatPeriod[] = model.games.some(x => x.inputs?.plays.some(p => Number(p.quarter) > 4))
    ? ["q1", "q2", "q3", "q4", "ot"] : ["q1", "q2", "q3", "q4"];
  const byQuarter = useMemo(() => quarters.map(q => {
    const s = seasonSlice(model, q);
    return s ? teamPeriodLines(s, program.id) : null;
  }), [model, program.id, quarters.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = seasonSlice(model, "game");
  const fullSides = full ? teamPeriodLines(full, program.id) : null;

  return (
    <>
      {period !== "game" && <p className="ss-note">Every game's {PERIOD_LONG[period].toLowerCase()} added up, {g} game{g === 1 ? "" : "s"}.</p>}
      <div className="ss-tiles">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="ss-tile">
            <span className="ss-tile-l">{label}</span>
            <b className="ss-tile-v">{value}</b>
            <span className="ss-tile-s">{sub}</span>
          </div>
        ))}
      </div>

      {top.length > 0 && (
        <section className="ss-block">
          <h2 className="bc-section"><span>Leaders</span></h2>
          <div className="ss-leaders">
            {top.map(l => (
              <button key={l.category} type="button" className="ss-leader" onClick={() => onPlayer(l.id)}>
                <span className="ss-tile-l">{l.category}</span>
                <b>{players.get(l.id)?.label ?? ""}</b>
                <span>{l.value}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="ss-block">
        <h2 className="bc-section"><span>Team statistics</span></h2>
        <TeamCompare report={slice.report} usAbbr={program.abbreviation} themAbbr="OPP" games={g} label="Statistic"
          points={{ us: sides.us.points, them: sides.them.points, usTop: sides.us.topSeconds, themTop: sides.them.topSeconds }} />
      </section>

      {fullSides && (
        <section className="ss-block">
          <h2 className="bc-section"><span>Points by quarter</span></h2>
          <div className="ss-table-wrap">
            <table className="ss-table ss-quarters">
              <thead>
                <tr>
                  <th scope="col" className="ss-name">Team</th>
                  {quarters.map(q => <th key={q} scope="col">{PERIOD_SHORT[q]}</th>)}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="ss-name">{program.name}</th>
                  {byQuarter.map((l, i) => <td key={i}>{l?.us.points ?? 0}</td>)}
                  <td className="ss-strong">{fullSides.us.points}</td>
                </tr>
                <tr>
                  <th scope="row" className="ss-name">Opponents</th>
                  {byQuarter.map((l, i) => <td key={i}>{l?.them.points ?? 0}</td>)}
                  <td className="ss-strong">{fullSides.them.points}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

/* ── Players ──────────────────────────────────────────────────────────────── */

export function PlayersView({ slice, players, gamesPlayed, categoryId, onCategory, onPlayer }: {
  slice: SeasonStats;
  players: Map<string, BookPlayer>;
  gamesPlayed: Map<string, number>;
  categoryId: string;
  onCategory: (id: string) => void;
  onPlayer: (id: string) => void;
}) {
  const available = STAT_CATEGORIES.filter(c => c.rows(slice).length > 0);
  const category = available.find(c => c.id === categoryId) ?? available[0];
  if (!category) return <p className="ss-empty">Nobody has a stat line in this stretch yet.</p>;
  return (
    <section className="ss-block ss-first">
      <CategoryPicker categories={available} value={category.id} onChange={onCategory} />
      <StatTable key={category.id} category={category} stats={slice} players={players}
        gamesPlayed={gamesPlayed} seasonGames={slice.games} onPlayer={onPlayer} />
      <p className="ss-note">GP is games with a stat line. Tap a heading to sort; tap a player for their page.</p>
    </section>
  );
}

/* ── Games ────────────────────────────────────────────────────────────────── */

export function GamesList({ model, onGame }: { model: SeasonModel; onGame: (id: string) => void }) {
  const { program } = model;
  if (model.games.length === 0) return <p className="ss-empty">No games played yet this season.</p>;
  return (
    <section className="ss-block ss-first">
      <div className="ss-games">
        {model.games.map((game: BookGame) => {
          const s = gameStats(program, game, "game");
          const sides = s ? teamPeriodLines(s, program.id) : null;
          const result = gameResult(game.meta);
          const { meta } = game;
          return (
            <button key={meta.id} type="button" className="bc-card tap ss-game-row" style={{ ["--c" as string]: meta.opponentColor }}
              onClick={() => onGame(meta.id)}>
              <span className={`bc-wl ${result ? result.toLowerCase() : "t"}`}>{result ?? (meta.status === "live" ? "•" : "–")}</span>
              <span className="ss-game-info">
                <span className="bc-name">{meta.isHome ? "vs" : "at"} {meta.opponentName}</span>
                <span className="ss-game-meta">
                  {shortDate(meta.date)} · {meta.isHome ? "Home" : "Away"}{meta.status === "live" ? " · Live" : ""}
                  {sides ? ` · ${sides.us.totalYds} yds · TO ${signed(sides.them.turnovers - sides.us.turnovers)}` : " · no plays charted"}
                </span>
              </span>
              <span className="bc-score">{meta.ourScore}<span className="bc-dash">-</span>{meta.theirScore}</span>
              <ChevronIcon size={16} className="bc-chev" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
