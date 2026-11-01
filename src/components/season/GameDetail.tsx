import { useMemo, useState } from "react";
import PeriodSwitch, { useStatPeriod } from "@/components/report/PeriodSwitch";
import { playByPlay, type PbpPlay } from "@/services/playByPlay";
import {
  gameHasOT, gameResult, gameStats, type BookGame, type BookPlayer, type BookProgram,
} from "@/services/seasonBook";
import { inPeriod, PERIOD_LONG } from "@/services/statPeriod";
import { BackIcon, ChevronIcon, DrivesIcon, GridIcon, SheetIcon, StatsIcon } from "@/components/icons/BroadcastIcons";
import StatTable from "./StatTable";
import { STAT_CATEGORIES } from "./statCategories";
import { CategoryPicker, TeamCompare } from "./SeasonViews";

type Tab = "team" | "players" | "plays";

function longDate(date: string | null): string {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!m) return "";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * One game, drilled into from the Games list: the line score, then the team
 * and every player for the game or any half or quarter of it, and the
 * play-by-play the numbers came from. The period pick is the game screens'
 * own, so Q3 here is Q3 on the Box Score too.
 */
export default function GameDetail({ program, game, players, onBack, onPlayer, onOpen }: {
  program: BookProgram;
  game: BookGame;
  players: Map<string, BookPlayer>;
  onBack: () => void;
  onPlayer: (id: string) => void;
  /** Open one of the game's own screens: "boxscore", "report", "drives", "summary". */
  onOpen: (screen: string) => void;
}) {
  const [period, setPeriod] = useStatPeriod("game");
  const [tab, setTab] = useState<Tab>("team");
  const [categoryId, setCategoryId] = useState("rushing");
  const hasOT = gameHasOT(game);
  const shown = period === "ot" && !hasOT ? "game" : period;
  const stats = useMemo(() => gameStats(program, game, shown), [program, game, shown]);
  const whole = useMemo(() => gameStats(program, game, "game"), [program, game]);
  const result = gameResult(game.meta);
  const { meta } = game;
  const report = whole?.report;

  return (
    <div className="ss-game">
      <button type="button" className="ss-crumb" onClick={onBack}><BackIcon size={14} />All games</button>

      <div className="ss-game-head" style={{ ["--c" as string]: meta.opponentColor }}>
        <div className="ss-game-top">
          <span className="bc-eyebrow">Game {game.number} · {longDate(meta.date)} · {meta.isHome ? "Home" : "Away"}</span>
          {result
            ? <span className={`ss-result ${result.toLowerCase()}`}>{result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"} {meta.ourScore}-{meta.theirScore}</span>
            : <span className="ss-result live">{meta.status === "live" ? "Live" : "—"} {meta.ourScore}-{meta.theirScore}</span>}
        </div>
        <div className="ss-game-title"><span className="bc-vs">{meta.isHome ? "vs" : "at"}</span>{meta.opponentName}</div>
        {report && (
          <table className="ss-line">
            <thead>
              <tr><th scope="col">Team</th>{report.quarters.map(q => <th key={q} scope="col">{q}</th>)}<th scope="col">T</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">{program.abbreviation}</th>{report.lineScore.us.map((v, i) => <td key={i}>{v}</td>)}<td className="ss-strong">{meta.ourScore}</td></tr>
              <tr><th scope="row">{meta.opponentAbbr}</th>{report.lineScore.them.map((v, i) => <td key={i}>{v}</td>)}<td className="ss-strong">{meta.theirScore}</td></tr>
            </tbody>
          </table>
        )}
      </div>

      {!stats ? <p className="ss-empty">No plays were charted for this game.</p> : (
        <>
          <PeriodSwitch value={shown} onChange={setPeriod} showOT={hasOT} className="ss-periods" />
          <div className="ss-subtabs" role="tablist" aria-label="Game view">
            {([["team", "Team"], ["players", "Players"], ["plays", "Play-by-play"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : undefined} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === "team" && (
            <>
              <TeamCompare report={stats.report} usAbbr={program.abbreviation} themAbbr={meta.opponentAbbr} />
              {stats.report.scoring.length > 0 && (
                <section className="ss-block">
                  <h2 className="bc-section"><span>Scoring</span></h2>
                  <ol className="ss-scoring">
                    {stats.report.scoring.map((s, i) => {
                      const [them, us] = s.score.split("-");
                      return (
                        <li key={i} className={s.isUs ? "us" : undefined}>
                          <span className="ss-mute">{s.quarter > 4 ? "OT" : `Q${s.quarter}`} {s.clock}</span>
                          <span className="ss-scoring-play"><b>{s.team}</b> {s.play}{s.conversion ? ` ${s.conversion}` : ""}</span>
                          <span className="ss-strong">{us}-{them}</span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </>
          )}

          {tab === "players" && (
            <PlayersInGame stats={stats} players={players} categoryId={categoryId} onCategory={setCategoryId} onPlayer={onPlayer} />
          )}

          {tab === "plays" && whole && (
            <PlayByPlayList game={game} whole={whole} period={shown} usAbbr={program.abbreviation} />
          )}
        </>
      )}

      <div className="ss-open">
        {([
          ["boxscore", "Box Score", <GridIcon key="i" size={16} />],
          ["report", "Game Report", <SheetIcon key="i" size={16} />],
          ["drives", "Drive Chart", <DrivesIcon key="i" size={16} />],
          ["summary", "Game Summary", <StatsIcon key="i" size={16} />],
        ] as const).map(([screen, label, icon]) => (
          <button key={screen} type="button" className="ss-open-btn" onClick={() => onOpen(screen)}>
            {icon}<span>{label}</span><ChevronIcon size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayersInGame({ stats, players, categoryId, onCategory, onPlayer }: {
  stats: NonNullable<ReturnType<typeof gameStats>>;
  players: Map<string, BookPlayer>;
  categoryId: string;
  onCategory: (id: string) => void;
  onPlayer: (id: string) => void;
}) {
  const available = STAT_CATEGORIES.filter(c => c.rows(stats).length > 0);
  const category = available.find(c => c.id === categoryId) ?? available[0];
  if (!category) return <p className="ss-empty">Nobody has a stat line in this stretch.</p>;
  return (
    <section className="ss-block">
      <CategoryPicker categories={available} value={category.id} onChange={onCategory} />
      <StatTable key={category.id} category={category} stats={stats} players={players} onPlayer={onPlayer} />
    </section>
  );
}

/** The game's plays, a quarter at a time, as the Season Book prints them. */
function PlayByPlayList({ game, whole, period, usAbbr }: {
  game: BookGame;
  whole: NonNullable<ReturnType<typeof gameStats>>;
  period: Parameters<typeof inPeriod>[1];
  usAbbr: string;
}) {
  const quarters = useMemo(
    () => playByPlay(whole.bundle.allPlays, whole.bundle.summary.drives, whole.bundle.roster, usAbbr, game.meta.opponentAbbr),
    [whole, usAbbr, game.meta.opponentAbbr],
  );
  const shown = quarters.filter(q => inPeriod(q.quarter, period));
  if (shown.length === 0) return <p className="ss-empty">No plays in the {PERIOD_LONG[period].toLowerCase()}.</p>;
  return (
    <section className="ss-block ss-pbp" style={{ ["--c" as string]: game.meta.opponentColor }}>
      <p className="ss-note">Yards are what the stats counted. # is the play's number in the game's play log.</p>
      {shown.map(q => (
        <div key={q.quarter} className="ss-pbp-q">
          <h3 className="ss-pbp-qh"><span>{q.title}</span><em>End of quarter: {q.endScore}</em></h3>
          {q.drives.map((d, di) => (
            <div key={di} className={`ss-pbp-drive ${d.side}`}>
              <div className="ss-pbp-dh">
                <b>{d.kind === "kick" ? `${d.abbr} ${d.label.toLowerCase()}` : `${d.abbr} ${d.label}`}{d.result ? ` · ${d.result}` : ""}</b>
                {d.continuedFrom != null && <em>from Q{d.continuedFrom}</em>}
                {d.continuesInto != null && <em>into Q{d.continuesInto}</em>}
                {d.summary && <span>{d.summary}</span>}
              </div>
              {d.plays.map(p => <PlayRow key={p.number} play={p} />)}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function PlayRow({ play: p }: { play: PbpPlay }) {
  const td = p.flags.includes("TD");
  return (
    <div className={`ss-play ${td ? "td" : ""}`}>
      <div className="ss-play-n"><b>{p.number}</b><span>{p.clock}</span></div>
      <div className="ss-play-body">
        {(p.situation || p.spot) && <div className="ss-play-sit">{[p.situation, p.spot].filter(Boolean).join(" · ")}</div>}
        <div className="ss-play-text">{p.text}</div>
        {p.credits && <div className="ss-play-credit">{p.credits}</div>}
      </div>
      <div className="ss-play-gain">
        {p.gain && <b className={p.gain === "No play" ? "amber" : undefined}>{p.gain}</b>}
        {p.flags.length > 0 && <span className="ss-flags">{p.flags.map(f => <i key={f} className={f.toLowerCase()}>{f}</i>)}</span>}
        {p.score && <span className="ss-play-score">{p.score}</span>}
      </div>
    </div>
  );
}
