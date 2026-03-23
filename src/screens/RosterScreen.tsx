import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";

export default function RosterScreen() {
  const navigate = useNavigate();

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate("/")} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Roster</h1>
        <button className="btn-ghost p-2">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 px-5">
        <div className="card p-8 text-center">
          <p className="text-neutral-500 text-sm">
            No players yet. Tap + to add players to this season's roster.
          </p>
        </div>
      </div>
    </div>
  );
}
