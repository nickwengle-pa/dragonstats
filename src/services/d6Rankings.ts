/* District 6 standings for the bar across the top of the home screen.

   Source: the feed behind the D6 power-points simulator (nickwengle-pa/football),
   rebuilt four times a day from the PIAA District 6 scoreboard and Blackline's
   official ranking report. It is public and read-only. The home screen has to
   work without it — in a press box with no signal the bar falls back to the last
   copy it saw, and with none it shows just its links. */

export const OUR_D6_TEAM = "Purchase Line";
export const PL_MAXPREPS_URL = "https://www.maxpreps.com/pa/commodore/purchase-line-red-dragons/football/";
/** Blackline's report is the official ranking; the simulator adds playoff scenarios. */
export const D6_OFFICIAL_URL = "https://sports.blkline.com/sports/reports/d6FootballRanking.action";
export const D6_SIMULATOR_URL = "https://nickwengle-pa.github.io/football/heritage_conference_power_points_simulator_25_26v1.html";
export const d6FeedUrl = (year: number) => `https://nickwengle-pa.github.io/football/data/football-${year}.json`;

/** District playoff field per class. Only the classes we have confirmed are listed. */
const PLAYOFF_SPOTS: Record<string, number> = { A: 8 };
const CACHE_KEY = "ds-d6-standings";

export interface D6Row {
  /** Competition rank: teams level on average points share a number. */
  rank: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  /** D6 power points per game played — what the district ranks by. */
  avg: number;
  /** Total ranking points from Blackline's report, which the ticker shows.
   *  Null when the report has none, and absent on copies cached before the
   *  field was read. */
  points?: number | null;
  us: boolean;
}

export interface D6Standings {
  cls: string;
  rows: D6Row[];
  /** How many make the district playoffs, when known. */
  cut: number | null;
  /** Blackline's own "Updated:" stamp, e.g. "10/05/2026 12:17". */
  updatedAt: string;
}

interface FeedTeam {
  name?: unknown; district?: unknown; cls?: unknown;
  wins?: unknown; losses?: unknown; ties?: unknown; rankingPoints?: unknown; averagePoints?: unknown;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Our class's table, ranked the way District 6 ranks it: by average points. */
export function standingsFromFeed(feed: unknown, ourTeam: string): D6Standings | null {
  const f = feed as { teams?: FeedTeam[]; sources?: { rankingsUpdatedAt?: unknown } } | null;
  if (!f || !Array.isArray(f.teams)) return null;
  const us = f.teams.find(t => t.name === ourTeam && t.district === 6);
  if (!us || typeof us.cls !== "string") return null;
  const cls = us.cls;
  const ranked = f.teams
    .filter(t => t.district === 6 && t.cls === cls && typeof t.name === "string" && typeof t.averagePoints === "number")
    .map(t => ({
      name: t.name as string,
      wins: num(t.wins), losses: num(t.losses), ties: num(t.ties),
      avg: t.averagePoints as number,
      points: typeof t.rankingPoints === "number" && Number.isFinite(t.rankingPoints) ? t.rankingPoints : null,
      us: t.name === ourTeam,
    }))
    .sort((a, b) => b.avg - a.avg || b.wins - a.wins || a.name.localeCompare(b.name));
  if (!ranked.some(r => r.us)) return null;
  const rows = ranked.map(r => ({ ...r, rank: 1 + ranked.filter(o => o.avg > r.avg).length }));
  return {
    cls,
    rows,
    cut: PLAYOFF_SPOTS[cls] ?? null,
    updatedAt: typeof f.sources?.rankingsUpdatedAt === "string" ? f.sources.rankingsUpdatedAt : "",
  };
}

export function readCachedStandings(ourTeam: string, year: number): D6Standings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    return cached && cached.team === ourTeam && cached.year === year ? cached.standings as D6Standings : null;
  } catch {
    return null;
  }
}

export async function fetchStandings(ourTeam: string, year: number, signal?: AbortSignal): Promise<D6Standings | null> {
  const res = await fetch(d6FeedUrl(year), { cache: "no-cache", signal });
  if (!res.ok) throw new Error(`D6 feed returned HTTP ${res.status}`);
  const standings = standingsFromFeed(await res.json(), ourTeam);
  if (standings) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ team: ourTeam, year, standings })); } catch { /* private mode */ }
  }
  return standings;
}
