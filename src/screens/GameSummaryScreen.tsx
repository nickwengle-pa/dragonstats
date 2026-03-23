import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Share2 } from "lucide-react";

export default function GameSummaryScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate(`/game/${gameId}`)} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Game Summary</h1>
        <button className="btn-ghost p-2">
          <Share2 className="w-5 h-5" />
        </button>
        <button className="btn-ghost p-2">
          <Download className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 px-5 space-y-4">
        {/* Final score */}
        <div className="card p-6 text-center">
          <div className="text-xs font-bold text-neutral-500 uppercase mb-3">Final Score</div>
          <div className="flex items-center justify-center gap-8">
            <div>
              <div className="text-4xl font-black">0</div>
              <div className="text-xs font-bold text-neutral-500 mt-1">HOME</div>
            </div>
            <div className="text-neutral-600 text-sm font-bold">—</div>
            <div>
              <div className="text-4xl font-black">0</div>
              <div className="text-xs font-bold text-neutral-500 mt-1">AWAY</div>
            </div>
          </div>
        </div>

        {/* Team stats placeholder */}
        <div className="card p-5">
          <div className="text-xs font-bold text-neutral-500 uppercase mb-3">Team Stats</div>
          <p className="text-neutral-600 text-sm">
            Stats will be computed by the engine from play-by-play data.
            Total yards, first downs, 3rd down %, turnovers, TOP, and more.
          </p>
        </div>

        {/* Player leaders placeholder */}
        <div className="card p-5">
          <div className="text-xs font-bold text-neutral-500 uppercase mb-3">Player Leaders</div>
          <p className="text-neutral-600 text-sm">
            Passing, rushing, receiving, and defensive leaders — auto-computed.
          </p>
        </div>

        {/* Export actions */}
        <div className="flex gap-3">
          <button className="btn-primary flex-1 gap-2">
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button className="btn-secondary flex-1 gap-2">
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}
