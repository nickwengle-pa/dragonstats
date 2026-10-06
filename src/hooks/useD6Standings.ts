import { useEffect, useState } from "react";
import { fetchStandings, readCachedStandings, type D6Standings } from "@/services/d6Rankings";

/** The last copy of our District 6 table straight away, then a fresh one when
 *  the network allows. Tries again when the device comes back online. */
export function useD6Standings(team: string, year: number | null): D6Standings | null {
  const [standings, setStandings] = useState<D6Standings | null>(() => (year ? readCachedStandings(team, year) : null));

  useEffect(() => {
    if (!year) return;
    setStandings(readCachedStandings(team, year));
    const ctl = new AbortController();
    const load = () => {
      fetchStandings(team, year, ctl.signal)
        .then(fresh => { if (fresh) setStandings(fresh); })
        .catch(err => { if (!ctl.signal.aborted) console.warn("[d6] standings unavailable:", err); });
    };
    load();
    window.addEventListener("online", load);
    return () => { ctl.abort(); window.removeEventListener("online", load); };
  }, [team, year]);

  return standings;
}
