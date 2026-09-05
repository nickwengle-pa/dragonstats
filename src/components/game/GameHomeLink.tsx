import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export default function GameHomeLink() {
  return (
    <nav aria-label="Game navigation" className="px-5 pt-2 print:hidden">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-surface-text hover:bg-surface-border focus-visible:outline focus-visible:outline-2">
        <Home className="h-4 w-4" aria-hidden="true" />
        Return to Home
      </Link>
    </nav>
  );
}
