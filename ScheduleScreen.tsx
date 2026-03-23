import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X, MapPin, Play, Trophy, Calendar as CalIcon } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";

interface Opponent {
  id: string; name: string; abbreviation: string | null; mascot: string | null;
  primary_color: string;
}

interface GameRow {
  id: string; game_date: string; location: string | null; is_home: boolean;
  status: string; our_score: number; opponent_score: number;
  opponent: Opponent;
}

export default function ScheduleScreen() {
  const navigate = useNavigate();
  const { program, season } = useProgramContext();
  const [games, setGames] = useState<GameRow[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddGame, setShowAddGame] = useState(false);
  const [showAddOpp, setShowAddOpp] = useState(false);

  // Add game form
  const [oppId, setOppId] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [gameLocation, setGameLocation] = useState("");
  const [isHome, setIsHome] = useState(true);
  const [savingGame, setSavingGame] = useState(false);

  // Add opponent form
  const [oppName, setOppName] = useState("");
  const [oppAbbrev, setOppAbbrev] = useState("");
  const [oppMascot, setOppMascot] = useState("");
  const [oppColor, setOppColor] = useState("#6b7280");
  const [savingOpp, setSavingOpp] = useState(false);

  const loadData = useCallback(async () => {
    if (!season || !program) return;
    setLoading(true);

    const [gamesRes, oppsRes] = await Promise.all([
      supabase.from("games").select("*, opponent:opponents(*)").eq("season_id", season.id).order("game_date"),
      supabase.from("opponents").select("*").eq("program_id", program.id).order("name"),
    ]);

    setGames(gamesRes.data ?? []);
    setOpponents(oppsRes.data ?? []);
    setLoading(false);
  }, [season, program]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddOpp = async () => {
    if (!program || !oppName) return;
    setSavingOpp(true);
    await supabase.from("opponents").insert({
      program_id: program.id, name: oppName.trim(),
      abbreviation: oppAbbrev.toUpperCase() || null,
      mascot: oppMascot || null, primary_color: oppColor,
    });
    setOppName(""); setOppAbbrev(""); setOppMascot(""); setOppColor("#6b7280");
    setSavingOpp(false); setShowAddOpp(false);
    loadData();
  };

  const handleAddGame = async () => {
    if (!season || !oppId || !gameDate) return;
    setSavingGame(true);
    await supabase.from("games").insert({
      season_id: season.id, opponent_id: oppId,
      game_date: new Date(gameDate).toISOString(),
      location: gameLocation || null, is_home: isHome,
    });
    setOppId(""); setGameDate(""); setGameLocation(""); setIsHome(true);
    setSavingGame(false); setShowAddGame(false);
    loadData();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const getStatusBadge = (status: string) => {
    if (status === "completed") return <span className="text-[10px] font-bold bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">FINAL</span>;
    if (status === "live") return <span className="text-[10px] font-bold bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded animate-pulse">LIVE</span>;
    return null;
  };

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate("/")} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Schedule</h1>
        <button onClick={() => setShowAddGame(true)} className="btn-ghost p-2 text-dragon-primary">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {season && (
        <div className="px-5 pb-3">
          <span className="text-xs font-bold text-neutral-600">
            {season.name ?? `${season.year} ${season.level}`}
          </span>
        </div>
      )}

      {/* Games list */}
      <div className="flex-1 px-5 overflow-y-auto pb-4">
        {loading ? (
          <div className="text-neutral-500 text-sm text-center py-12 animate-pulse">Loading schedule...</div>
        ) : games.length === 0 ? (
          <div className="card p-8 text-center">
            <CalIcon className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm font-semibold mb-1">No games scheduled</p>
            <p className="text-neutral-600 text-xs mb-4">Tap + to add a game. You'll need to add an opponent first.</p>
            {opponents.length === 0 && (
              <button onClick={() => setShowAddOpp(true)} className="btn-secondary text-sm mx-auto">
                Add First Opponent
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {games.map(game => (
              <button key={game.id}
                onClick={() => navigate(`/game/${game.id}`)}
                className="card w-full p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-neutral-500">{formatDate(game.game_date)}</span>
                  {getStatusBadge(game.status)}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                    style={{ backgroundColor: game.opponent.primary_color + "30", color: game.opponent.primary_color }}>
                    {(game.opponent.abbreviation ?? game.opponent.name.substring(0, 3)).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm">
                      {game.is_home ? "vs" : "@"} {game.opponent.name}
                    </div>
                    {game.location && (
                      <div className="text-xs text-neutral-600 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {game.location}
                      </div>
                    )}
                  </div>
                  {game.status === "completed" ? (
                    <div className="text-right">
                      <div className="font-black text-sm">
                        {game.our_score} – {game.opponent_score}
                      </div>
                      <div className="text-[10px] font-bold" style={{
                        color: game.our_score > game.opponent_score ? "#22c55e" :
                          game.our_score < game.opponent_score ? "#ef4444" : "#a3a3a3"
                      }}>
                        {game.our_score > game.opponent_score ? "W" : game.our_score < game.opponent_score ? "L" : "T"}
                      </div>
                    </div>
                  ) : game.status === "live" ? (
                    <Play className="w-5 h-5 text-dragon-primary" />
                  ) : (
                    <span className="text-xs text-neutral-600 font-semibold">
                      {new Date(game.game_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add Game Modal */}
      {showAddGame && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="w-full max-w-app bg-surface-card rounded-t-2xl border border-surface-border max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h2 className="text-lg font-black">Add Game</h2>
              <button onClick={() => setShowAddGame(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
              {opponents.length === 0 ? (
                <div className="card p-6 text-center">
                  <p className="text-neutral-500 text-sm mb-3">You need to add an opponent first.</p>
                  <button onClick={() => { setShowAddGame(false); setShowAddOpp(true); }} className="btn-primary text-sm">
                    Add Opponent
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label block mb-1.5">Opponent *</label>
                    <select value={oppId} onChange={e => setOppId(e.target.value)} className="input appearance-none">
                      <option value="">Select opponent...</option>
                      {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <button onClick={() => { setShowAddGame(false); setShowAddOpp(true); }}
                      className="text-xs text-dragon-primary font-bold mt-1.5 ml-1">+ New Opponent</button>
                  </div>
                  <div>
                    <label className="label block mb-1.5">Date & Time *</label>
                    <input type="datetime-local" value={gameDate} onChange={e => setGameDate(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="label block mb-1.5">Home or Away</label>
                    <div className="flex gap-2">
                      <button onClick={() => setIsHome(true)}
                        className={`flex-1 h-11 rounded-xl font-bold text-sm border transition-colors ${isHome ? "bg-dragon-primary border-dragon-primary text-white" : "bg-surface-bg border-surface-border text-neutral-400"}`}>
                        Home
                      </button>
                      <button onClick={() => setIsHome(false)}
                        className={`flex-1 h-11 rounded-xl font-bold text-sm border transition-colors ${!isHome ? "bg-dragon-primary border-dragon-primary text-white" : "bg-surface-bg border-surface-border text-neutral-400"}`}>
                        Away
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label block mb-1.5">Location / Venue</label>
                    <input value={gameLocation} onChange={e => setGameLocation(e.target.value)} placeholder="Dragon Field" className="input" />
                  </div>
                  <button onClick={handleAddGame} disabled={!oppId || !gameDate || savingGame} className="btn-primary w-full mt-2">
                    {savingGame ? "Adding..." : "Add Game"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Opponent Modal */}
      {showAddOpp && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50">
          <div className="w-full max-w-app bg-surface-card rounded-t-2xl border border-surface-border max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <h2 className="text-lg font-black">Add Opponent</h2>
              <button onClick={() => setShowAddOpp(false)} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
              <div>
                <label className="label block mb-1.5">School Name *</label>
                <input value={oppName} onChange={e => setOppName(e.target.value)} placeholder="Central High School" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block mb-1.5">Abbreviation</label>
                  <input value={oppAbbrev} onChange={e => setOppAbbrev(e.target.value.toUpperCase())} placeholder="CHS" maxLength={5} className="input" />
                </div>
                <div>
                  <label className="label block mb-1.5">Mascot</label>
                  <input value={oppMascot} onChange={e => setOppMascot(e.target.value)} placeholder="Tigers" className="input" />
                </div>
              </div>
              <div>
                <label className="label block mb-1.5">Team Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={oppColor} onChange={e => setOppColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer bg-transparent" />
                  <input value={oppColor} onChange={e => setOppColor(e.target.value)} className="input flex-1 font-mono text-sm" />
                </div>
              </div>
              <button onClick={handleAddOpp} disabled={!oppName || savingOpp} className="btn-primary w-full mt-2">
                {savingOpp ? "Adding..." : "Add Opponent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
