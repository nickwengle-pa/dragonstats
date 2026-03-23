import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Flag } from "lucide-react";

export default function GameScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={() => navigate("/schedule")} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-neutral-500" />
          <span className="text-sm font-mono font-bold text-neutral-400">Q1 12:00</span>
        </div>
        <button
          onClick={() => navigate(`/game/${gameId}/summary`)}
          className="btn-ghost p-2 text-xs font-bold text-dragon-primary"
        >
          Summary
        </button>
      </div>

      {/* Scoreboard placeholder */}
      <div className="px-4 py-3">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <div className="text-xs font-bold text-neutral-500 uppercase">Home</div>
              <div className="text-3xl font-black mt-1">0</div>
            </div>
            <div className="text-neutral-600 font-bold text-sm">VS</div>
            <div className="text-center flex-1">
              <div className="text-xs font-bold text-neutral-500 uppercase">Away</div>
              <div className="text-3xl font-black mt-1">0</div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-surface-border">
            <Flag className="w-3 h-3 text-dragon-gold" />
            <span className="text-xs font-bold text-neutral-500">1st & 10 at OWN 20</span>
          </div>
        </div>
      </div>

      {/* Play-by-play entry area (to be built) */}
      <div className="flex-1 px-4">
        <div className="card p-8 text-center">
          <p className="text-neutral-500 text-sm mb-2 font-semibold">
            Play-by-Play Entry
          </p>
          <p className="text-neutral-600 text-xs leading-relaxed">
            This is where the game-day PBP interface will live — field visualization,
            tap-to-record plays, player tagging, and live stat computation via
            the football-stats-engine.
          </p>
          <p className="text-dragon-primary text-xs font-bold mt-4">
            Coming next session
          </p>
        </div>
      </div>

      {/* Play log placeholder */}
      <div className="px-4 pb-4">
        <div className="card p-4">
          <div className="text-xs font-bold text-neutral-500 uppercase mb-2">Play Log</div>
          <p className="text-neutral-600 text-xs">No plays recorded yet.</p>
        </div>
      </div>
    </div>
  );
}
