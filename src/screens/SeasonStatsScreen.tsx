import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import PeriodSwitch, { useStatPeriod } from "@/components/report/PeriodSwitch";
import BroadcastHeader from "@/components/BroadcastHeader";
import { TabBar } from "@/components/TabBar";
import { useProgramContext } from "@/hooks/useProgramContext";
import { loadSeasonGames } from "@/services/seasonBookLoader";
import {
  bookPlayers, gamesPlayed, seasonHasOT, seasonModel, seasonSlice,
  type BookGame, type BookPlayer, type BookProgram,
} from "@/services/seasonBook";
import { formatSeasonName } from "@/services/seasonService";
import { SeasonBookButton, SeasonBookStatus, useSeasonBook } from "@/components/season/SeasonBook";
import { GamesList, PlayersView, TeamView } from "@/components/season/SeasonViews";
import GameDetail from "@/components/season/GameDetail";
import "./seasonStats.css";

/* ═══════════════════════════════════════════════
   SEASON STATS

   Team, Players and Games, each for the season or any half or quarter of
   it, and from Games down into one game, its players and its plays. The
   whole season is read once when the screen opens; every view and period
   after that is worked out on the device from what was read
   (seasonBook.ts), so switching never waits on the network. The Season Book
   button turns the same numbers into one linked PDF.
   ═══════════════════════════════════════════════ */

type View = "team" | "players" | "games";
type Loader = typeof loadSeasonGames;

export default function SeasonStatsScreen({ loader = loadSeasonGames }: {
  /** Where the games come from. The dev preview passes a made-up season. */
  loader?: Loader;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { program, season } = useProgramContext();
  const [period, setPeriod] = useStatPeriod("season");
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "players" ? "players" : params.get("view") === "games" ? "games" : "team";
  const gameId = view === "games" ? params.get("game") : null;
  const [categoryId, setCategoryId] = useState("rushing");

  const [games, setGames] = useState<BookGame[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!season) return;
    const signal = { cancelled: false };
    setGames(null); setError(""); setProgress(null);
    loader(season.id, { signal, onProgress: (done, total) => { if (!signal.cancelled) setProgress({ done, total }); } })
      .then(list => { if (!signal.cancelled) setGames(list); })
      .catch(e => { if (!signal.cancelled) setError(e instanceof Error ? e.message : "Could not load the season."); });
    return () => { signal.cancelled = true; };
  }, [season, loader]);

  const bookProgram = useMemo<BookProgram | null>(() => program && ({
    id: program.id, name: program.name, abbreviation: program.abbreviation, game_config: program.game_config,
    logoUrl: program.logo_url, color: program.primary_color,
  }), [program]);
  const model = useMemo(() => (bookProgram && games ? seasonModel(bookProgram, games) : null), [bookProgram, games]);
  const players = useMemo(() => {
    const map = new Map<string, BookPlayer>();
    if (model) for (const p of bookPlayers(model.program, model.games)) map.set(p.id, p);
    return map;
  }, [model]);
  const gp = useMemo(() => {
    const map = new Map<string, number>();
    if (model) for (const id of players.keys()) map.set(id, gamesPlayed(model.program, model.games, id));
    return map;
  }, [model, players]);
  const hasOT = useMemo(() => (model ? seasonHasOT(model.games) : false), [model]);
  const shownPeriod = period === "ot" && !hasOT ? "game" : period;
  const slice = useMemo(() => (model ? seasonSlice(model, shownPeriod) : null), [model, shownPeriod]);

  const seasonLabel = season ? formatSeasonName(season) : "Season";
  const book = useSeasonBook(model, { seasonLabel, abbreviation: program?.abbreviation ?? "Team" });
  const finals = model?.games.filter(g => g.meta.status === "completed" && g.inputs).length ?? 0;

  /* Views and the open game live in the URL, so Back on the iPad (or the
     arrow on a game's own screens) comes back to the same place. */
  const go = (next: { view?: View; game?: string | null }, replace = false) => {
    const p = new URLSearchParams(params);
    if (next.view) { if (next.view === "team") p.delete("view"); else p.set("view", next.view); }
    if (next.game === null || (next.view && next.view !== "games")) p.delete("game");
    else if (next.game) p.set("game", next.game);
    setParams(p, { replace });
  };
  const here = `${location.pathname}${location.search}`;
  const openPlayer = (id: string) => navigate(`/player/${id}`, { state: { from: here } });
  const openGameScreen = (id: string, screen: string) => navigate(`/game/${id}/${screen}`, { state: { from: here } });
  const openGame = model?.games.find(g => g.meta.id === gameId) ?? null;

  return (
    <div className="bc ss screen safe-top pb-20">
      <BroadcastHeader
        title="Season Stats"
        subtitle={seasonLabel}
        actions={<SeasonBookButton book={book} disabled={!model || finals === 0} />}
      />
      <SeasonBookStatus book={book} />

      <div className="ss-stage">
        <div className="ss-views" role="tablist" aria-label="Season view">
          {([["team", "Team"], ["players", "Players"], ["games", "Games"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "on" : undefined}
              onClick={() => go({ view: id, game: null })}>
              {label}
            </button>
          ))}
        </div>

        {error && <div className="bc-alert" role="alert">{error}</div>}

        {!error && !model && (
          <div className="ss-loading" role="status">
            <div className="ss-book-bar"><i style={{ width: `${progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 4}%` }} /></div>
            <span>{progress && progress.total ? `Reading game ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Reading the season…"}</span>
          </div>
        )}

        {model && model.games.length === 0 && <p className="ss-empty">No games played yet this season.</p>}

        {model && model.games.length > 0 && (
          <>
            {view !== "games" && (
              <PeriodSwitch value={shownPeriod} onChange={setPeriod} showOT={hasOT} className="ss-periods" wholeLabel="Season" />
            )}

            {view === "team" && slice && (
              <TeamView model={model} slice={slice} period={shownPeriod} players={players} onPlayer={openPlayer} />
            )}
            {view === "players" && slice && (
              <PlayersView slice={slice} players={players} gamesPlayed={gp} categoryId={categoryId} onCategory={setCategoryId} onPlayer={openPlayer} />
            )}
            {view !== "games" && !slice && <p className="ss-empty">No plays charted yet this season.</p>}

            {view === "games" && !openGame && <GamesList model={model} onGame={id => go({ view: "games", game: id })} />}
            {view === "games" && openGame && (
              <GameDetail
                program={model.program}
                game={openGame}
                players={players}
                onBack={() => go({ view: "games", game: null })}
                onPlayer={openPlayer}
                onOpen={screen => openGameScreen(openGame.meta.id, screen)}
              />
            )}

            {view === "team" && (
              <button type="button" className="ss-older" onClick={() => navigate("/season-report")}>
                One-page season summary to print ›
              </button>
            )}
          </>
        )}
      </div>
      <TabBar />
    </div>
  );
}
