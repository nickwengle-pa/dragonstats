import { useMemo, useState } from "react";
import { TabBar } from "@/components/TabBar";
import { statsState, statsStateLabel, type StatsState } from "@/services/gameCompletion";
import type { Theme } from "@/hooks/useTheme";
import {
  CalendarIcon, JerseyIcon, StatsIcon, WhistleIcon, SheetIcon, GridIcon, TrendIcon, FilmIcon,
  ChevronIcon, ClockIcon, PinIcon, PlayIcon, SunIcon, MoonIcon, PowerIcon, TrophyIcon,
} from "@/components/icons/BroadcastIcons";
import "@/screens/homeBroadcast.css";

/* ── data shape ──
   Everything the home screen shows, and nothing it has to fetch itself.
   DashboardScreen fills this from the cached readers; HomePreview fills it
   from fixtures. Keeping the view free of Supabase is what makes the second
   one possible. */

export interface HomeOpponent {
  name: string;
  abbreviation: string | null;
  primary_color: string | null;
  logo_url: string | null;
}

export interface HomeGame {
  id: string;
  status: "scheduled" | "live" | "completed" | "cancelled" | string;
  opponent: HomeOpponent | null;
  our_score: number;
  opponent_score: number;
  /** YYYY-MM-DD. */
  game_date: string | null;
  /** Free text from the schedule — "7:00 PM", "19:00", or nothing. */
  kickoff_time: string | null;
  is_home: boolean;
  /** games.tags, which carries the "stats final" mark. */
  tags: unknown;
  /** Plays still needing their spot confirmed. Null means NOT KNOWN — offline,
   *  or the count has not landed — which must not read as zero. */
  toReview: number | null;
  /* Live situation, only meaningful while status === "live". */
  current_quarter?: number | null;
  current_clock?: string | null;
  current_down?: number | null;
  current_distance?: number | null;
  current_yard_line?: number | null;
  current_possession?: "us" | "them" | string | null;
}

export interface HomeData {
  abbreviation: string;
  programName: string;
  mascot: string | null;
  seasonLabel: string;
  logoUrl: string | null;
  primaryColor: string;
  /** Null until the roster has been read. */
  rosterCount: number | null;
  games: HomeGame[];
  /** False until the schedule has landed once; the record shows a dash. */
  loaded: boolean;
}

/** District 6 football rankings (PIAA). Sits beside the record so the
 *  standings are one tap from the score that feeds them. */
export const D6_RANKINGS_URL = "https://sports.blkline.com/sports/reports/d6FootballRanking.action";

interface Props {
  data: HomeData;
  theme: Theme;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
  /** Status lines from the loader — shown under the header. */
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  version?: string;
}

/* ── small helpers ── */

/** "2026-09-18" as a local date. `new Date("2026-09-18")` is midnight UTC,
 *  which is the evening before in every US timezone — Friday's game would
 *  say Thursday. */
export function parseGameDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date | null, opts: Intl.DateTimeFormatOptions) {
  return d ? d.toLocaleDateString("en-US", opts) : "—";
}

/** "19:00" → "7:00 PM"; anything else passes through. */
function fmtKickoff(t: string | null): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  if (h > 12 || (h === 0)) return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
  return t;
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function countdown(days: number | null): string {
  if (days == null) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${-days} days ago`;
  return `in ${days} days`;
}

function abbrOf(o: HomeOpponent | null): string {
  return (o?.abbreviation ?? o?.name?.slice(0, 3) ?? "OPP").toUpperCase();
}

/** Where the ball is, said the way the booth says it: yard line and whose
 *  side. `yard` counts from the offense's own goal line. */
function ballSpot(yard: number | null | undefined, possession: string | null | undefined, us: string, them: string): string {
  if (yard == null) return "";
  const offense = possession === "them" ? them : us;
  const defense = possession === "them" ? us : them;
  if (yard === 50) return "the 50";
  return yard < 50 ? `${offense} ${yard}` : `${defense} ${100 - yard}`;
}

function ordinal(n: number | null | undefined): string {
  if (n == null) return "";
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

function Crest({ opp, size, color }: { opp: HomeOpponent | null; size: "sm" | "md" | "lg"; color?: string }) {
  const c = color ?? opp?.primary_color ?? "#6b7280";
  if (opp?.logo_url) return <img src={opp.logo_url} alt="" className={`bc-crest bc-crest-${size}`} style={{ background: "transparent" }} />;
  return <span className={`bc-crest bc-crest-${size}`} style={{ "--c": c } as React.CSSProperties} aria-hidden="true">{abbrOf(opp)}</span>;
}

const CHIP: Record<StatsState, string> = { final: "final", review: "review", open: "open" };

/* ── the screen ── */

export default function HomeBroadcast({ data, theme, onToggleTheme, onNavigate, onSignOut, loading, error, onRetry, version }: Props) {
  const { games } = data;
  const completed = useMemo(
    () => games.filter(g => g.status === "completed").sort((a, b) => String(b.game_date ?? "").localeCompare(String(a.game_date ?? ""))),
    [games],
  );
  const live = games.find(g => g.status === "live") ?? null;
  const next = useMemo(() => {
    const scheduled = games.filter(g => g.status === "scheduled").sort((a, b) => String(a.game_date ?? "").localeCompare(String(b.game_date ?? "")));
    return scheduled[0] ?? null;
  }, [games]);

  const wins = completed.filter(g => g.our_score > g.opponent_score).length;
  const losses = completed.filter(g => g.our_score < g.opponent_score).length;
  const ties = completed.length - wins - losses;
  const record = data.loaded ? `${wins}–${losses}${ties ? `–${ties}` : ""}` : "–";
  /* Oldest on the left, so it reads like a ticker. */
  const last5 = completed.slice(0, 5).reverse();

  /* One game carries the four report buttons. The most recent by default; a
     tap on any other recent game swaps it in, which keeps the phone to one
     set of buttons instead of four per row. */
  const [pickedId, setPickedId] = useState<string | null>(null);
  const featured = completed.find(g => g.id === pickedId) ?? completed[0] ?? null;
  const others = completed.filter(g => g.id !== featured?.id).slice(0, 8);

  const us = data.abbreviation.toUpperCase();
  const nextDate = parseGameDate(next?.game_date);
  const nextDays = daysUntil(nextDate);
  const played = completed.length;

  return (
    <div className="bc bc-home screen safe-top pb-20">
      {/* ── header: the bug ── */}
      <header className="bc-hdr">
        <div className="bc-brand">
          {data.logoUrl
            ? <img src={data.logoUrl} alt="" className="bc-logo" />
            : <span className="bc-crest bc-crest-md" style={{ "--c": data.primaryColor } as React.CSSProperties} aria-hidden="true">{us.slice(0, 3)}</span>}
          <div style={{ minWidth: 0 }}>
            <h1 className="bc-title">{us} Stats</h1>
            <p className="bc-sub">{data.seasonLabel}{data.mascot ? ` · ${data.mascot}` : ""}</p>
          </div>
        </div>
        <div className="bc-hdr-right">
          <div className="bc-rec-row">
            <div className="bc-rec"><span className="bc-rec-l">Record</span><span className="bc-rec-v">{record}</span></div>
            <a className="bc-rank" href={D6_RANKINGS_URL} target="_blank" rel="noopener noreferrer" title="District 6 football rankings">
              <TrophyIcon size={14} /><span>D6</span>
            </a>
          </div>
          <div className="bc-hdr-tools">
            {last5.length > 0 && (
              <div className="bc-l5" aria-label={`Last ${last5.length} results`}>
                {last5.map(g => {
                  const r = g.our_score > g.opponent_score ? "w" : g.our_score < g.opponent_score ? "l" : "t";
                  return <i key={g.id} className={r}>{r.toUpperCase()}</i>;
                })}
              </div>
            )}
            <button type="button" className="bc-tool" onClick={onToggleTheme} title={theme === "light" ? "Switch to dark" : "Switch to light"} aria-label="Toggle theme">
              {theme === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
            </button>
            <button type="button" className="bc-tool" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              <PowerIcon size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="bc-stage">
        {loading && !data.loaded && <p role="status" className="bc-status" style={{ marginBottom: 16 }}>Loading schedule, roster, and game results…</p>}
        {loading && data.loaded && <p role="status" className="bc-status" style={{ marginBottom: 16 }}>Refreshing season information…</p>}
        {error && (
          <div role="alert" className="bc-alert" style={{ marginBottom: 16 }}>
            <span style={{ flex: 1 }}>{error}</span>
            {onRetry && <button type="button" className="bc-btn bc-btn-secondary" onClick={onRetry}>Try again</button>}
          </div>
        )}

        <div className="bc-grid">
          {/* ── hero: live scorebug, next game, or nothing on the schedule ── */}
          <div className="bc-a-hero">
            {live ? (
              <button type="button" className="bc-bug" onClick={() => onNavigate(`/game/${live.id}`)}>
                <div className="bc-bug-top">
                  <span className="bc-eyebrow"><span className="bc-live-dot" />Live{live.current_quarter ? ` · Q${live.current_quarter}` : ""}</span>
                  <span className="bc-eyebrow">{live.current_clock ?? ""}</span>
                </div>
                <div className="bc-bug-row">
                  <div className={`bc-bug-team l ${live.current_possession !== "them" ? "poss" : ""}`}>
                    <Crest opp={{ name: data.programName, abbreviation: us, primary_color: data.primaryColor, logo_url: data.logoUrl }} size="md" />
                    <span className="n">{data.mascot ?? us}</span>
                  </div>
                  <div className="bc-bug-score">{live.our_score}<i>–</i>{live.opponent_score}</div>
                  <div className={`bc-bug-team r ${live.current_possession === "them" ? "poss" : ""}`}>
                    <Crest opp={live.opponent} size="md" />
                    <span className="n">{live.opponent?.name ?? "Opponent"}</span>
                  </div>
                </div>
                <div className="bc-bug-sit">
                  <span>
                    {live.current_down != null && <b>{ordinal(live.current_down)} &amp; {live.current_distance ?? "?"}</b>}
                    {live.current_yard_line != null && <em> · ball on {ballSpot(live.current_yard_line, live.current_possession, us, abbrOf(live.opponent))}</em>}
                  </span>
                  <em>{live.is_home ? "Home" : "Away"}</em>
                </div>
                <div className="bc-bug-cta"><PlayIcon size={14} />Resume Entry</div>
              </button>
            ) : next ? (
              <section className="bc-next" aria-label="Next game">
                <div className="bc-next-top">
                  <span className="bc-eyebrow hot">Next game{nextDate ? ` · ${fmtDate(nextDate, { weekday: "long" })}` : ""}</span>
                  <span className="bc-eyebrow">{countdown(nextDays)}</span>
                </div>
                <div className="bc-matchup">
                  <Crest opp={next.opponent} size="lg" />
                  <div className={`bc-opp ${(next.opponent?.name ?? "").length > 11 ? "long" : ""}`}>
                    <span className="bc-vs">{next.is_home ? "vs" : "@"}</span>{next.opponent?.name ?? "TBD"}
                  </div>
                </div>
                <div className="bc-meta">
                  <span><ClockIcon size={14} />{fmtDate(nextDate, { month: "short", day: "numeric" })}{fmtKickoff(next.kickoff_time) ? ` · ${fmtKickoff(next.kickoff_time)}` : ""}</span>
                  <span><PinIcon size={14} />{next.is_home ? "Home" : "Away"}</span>
                </div>
                <div className="bc-cta">
                  <button type="button" className="bc-btn bc-btn-primary" onClick={() => onNavigate(`/game/${next.id}`)}><PlayIcon size={14} />Start Game</button>
                  <button type="button" className="bc-btn bc-btn-secondary" onClick={() => onNavigate("/schedule")}>Schedule</button>
                </div>
              </section>
            ) : data.loaded ? (
              <section className="bc-next" aria-label="Schedule">
                <div className="bc-next-top">
                  <span className="bc-eyebrow hot">{played ? "No game scheduled" : "Get started"}</span>
                </div>
                <div className="bc-matchup">
                  <div className="bc-opp long">{played ? "Season complete?" : "Build the season"}</div>
                </div>
                <div className="bc-meta"><span>{played ? "Add the next game to the schedule, or open a finished one below." : "Add your roster and schedule to get ready for kickoff."}</span></div>
                <div className="bc-cta">
                  <button type="button" className="bc-btn bc-btn-primary" onClick={() => onNavigate("/schedule")}><CalendarIcon size={14} />{played ? "Schedule" : "Add a game"}</button>
                  {!played && <button type="button" className="bc-btn bc-btn-secondary" onClick={() => onNavigate("/roster")}>Roster</button>}
                </div>
              </section>
            ) : null}
          </div>

          {/* ── the featured game and its four reports ── */}
          {featured && (
            <section className="bc-block bc-a-last">
              <div className="bc-section"><span>{featured.id === completed[0]?.id ? "Last Game" : "Selected Game"}</span></div>
              <div className="bc-card bc-last">
                <button type="button" className="bc-last-row bc-btn-reset" onClick={() => onNavigate(`/game/${featured.id}`)} title="Open the game to add or fix plays">
                  <WL g={featured} />
                  <Crest opp={featured.opponent} size="sm" />
                  <div className="bc-last-info">
                    <div className="bc-name">{featured.is_home ? "vs" : "@"} {featured.opponent?.name ?? "Opponent"}</div>
                    <div className="bc-last-meta">
                      <span>{fmtDate(parseGameDate(featured.game_date), { month: "short", day: "numeric" })}</span>
                      <StatsChip g={featured} />
                    </div>
                  </div>
                  <div className="bc-score">{featured.our_score}<span className="bc-dash">–</span>{featured.opponent_score}</div>
                  <ChevronIcon size={16} className="bc-chev" />
                </button>
                <div className="bc-quick">
                  <button type="button" className="bc-q" onClick={() => onNavigate(`/game/${featured.id}/report`)}><SheetIcon size={18} /><span>Report</span></button>
                  <button type="button" className="bc-q" onClick={() => onNavigate(`/game/${featured.id}/boxscore`)}><GridIcon size={18} /><span>Box</span></button>
                  <button type="button" className="bc-q" onClick={() => onNavigate(`/game/${featured.id}/summary`)}><TrendIcon size={18} /><span>Summary</span></button>
                  <button type="button" className="bc-q" onClick={() => onNavigate(`/game/${featured.id}/review`)}><FilmIcon size={18} /><span>Plays</span></button>
                </div>
              </div>
            </section>
          )}

          {/* ── the rest of the season, most recent first ── */}
          {others.length > 0 && (
            <section className="bc-block bc-a-recent">
              <div className="bc-section"><span>Recent Games</span></div>
              <div className="bc-rows">
                {others.map(g => (
                  <button
                    type="button"
                    key={g.id}
                    className="bc-card bc-rg tap"
                    style={{ "--c": g.opponent?.primary_color ?? undefined } as React.CSSProperties}
                    onClick={() => setPickedId(g.id)}
                    title="Show this game's reports"
                  >
                    <WL g={g} />
                    <Crest opp={g.opponent} size="sm" />
                    <div className="bc-last-info">
                      <div className="bc-name">{g.is_home ? "vs" : "@"} {g.opponent?.name ?? "Opponent"}</div>
                      <div className="bc-last-meta">
                        <span>{fmtDate(parseGameDate(g.game_date), { month: "short", day: "numeric" })}</span>
                        <StatsChip g={g} />
                      </div>
                    </div>
                    <div className="bc-score">{g.our_score}<span className="bc-dash">–</span>{g.opponent_score}</div>
                    <ChevronIcon size={16} className="bc-chev" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── season ── */}
          <section className="bc-block bc-a-season">
            <div className="bc-section"><span>Season</span></div>
            <div className="bc-rows">
              <Row icon={<CalendarIcon />} label="Schedule" meta={data.loaded ? `${games.length} games · ${played} played` : ""} onClick={() => onNavigate("/schedule")} />
              <Row icon={<JerseyIcon />} label="Roster" meta={data.rosterCount != null ? `${data.rosterCount} players` : ""} onClick={() => onNavigate("/roster")} />
              <Row icon={<StatsIcon />} label="Season Stats" meta={played ? `through ${played} game${played === 1 ? "" : "s"}` : "no games yet"} onClick={() => onNavigate("/season-stats")} />
              <Row icon={<SheetIcon />} label="Season Report" meta="printable" onClick={() => onNavigate("/season-report")} />
              <Row icon={<WhistleIcon />} label="Game Setup" meta="periods · clock · rules" onClick={() => onNavigate("/game-settings")} />
            </div>
          </section>
        </div>
      </div>

      {version && <p className="bc-version">Dragon Stats {version}</p>}
      <TabBar />
    </div>
  );
}

function WL({ g }: { g: HomeGame }) {
  const r = g.our_score > g.opponent_score ? "w" : g.our_score < g.opponent_score ? "l" : "t";
  return <span className={`bc-wl ${r}`} aria-label={r === "w" ? "Win" : r === "l" ? "Loss" : "Tie"}>{r.toUpperCase()}</span>;
}

function StatsChip({ g }: { g: HomeGame }) {
  /* Whether the stats behind this game are finished. "Completed" only means
     the clock ran out. */
  const state = statsState({ tags: g.tags, toReview: g.toReview });
  return <span className={`bc-chip ${CHIP[state]}`}>{statsStateLabel(state, g.toReview)}</span>;
}

function Row({ icon, label, meta, onClick }: { icon: React.ReactNode; label: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" className="bc-card bc-row tap" onClick={onClick}>
      {icon}
      <div className="bc-row-body"><span className="bc-name">{label}</span>{meta && <span className="bc-row-meta">{meta}</span>}</div>
      <ChevronIcon size={16} className="bc-chev" />
    </button>
  );
}
