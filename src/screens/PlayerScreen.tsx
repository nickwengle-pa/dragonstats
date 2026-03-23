import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PlayerScreen() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Player Profile</h1>
      </div>

      <div className="flex-1 px-5 space-y-4">
        {/* Player info placeholder */}
        <div className="card p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-dragon-primary/20 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl font-black text-dragon-primary">#—</span>
          </div>
          <div className="text-lg font-bold">Player Name</div>
          <div className="text-sm text-neutral-500">Position • Class of 20XX</div>
        </div>

        {/* Season stats */}
        <div className="card p-5">
          <div className="text-xs font-bold text-neutral-500 uppercase mb-3">Season Stats</div>
          <p className="text-neutral-600 text-sm">
            Game-by-game and season totals computed from play data.
          </p>
        </div>

        {/* Career stats */}
        <div className="card p-5">
          <div className="text-xs font-bold text-neutral-500 uppercase mb-3">Career Stats</div>
          <p className="text-neutral-600 text-sm">
            Multi-season career totals across all years in the program.
          </p>
        </div>
      </div>
    </div>
  );
}
