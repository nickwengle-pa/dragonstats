import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BackIcon } from "@/components/icons/BroadcastIcons";
import "@/screens/homeBroadcast.css";

interface Props {
  title: string;
  /** Small line under the title — usually the season. */
  subtitle?: string;
  /** Where the back arrow goes. `null` hides it (first-time setup). */
  back?: string | null;
  /** A red chip on the right, like the record on the home screen. */
  chip?: ReactNode;
  /** Icon buttons on the right. Use `.bc-tool` for the ghost style. */
  actions?: ReactNode;
}

/**
 * The scorebug header for every screen that is not Home: the black bar with
 * the red slash, a back arrow, the screen's name in Chakra Petch, and room on
 * the right for a chip and a couple of tools. Home draws its own (the brand
 * and record live there); this one keeps the other four in the same family.
 */
export default function BroadcastHeader({ title, subtitle, back = "/", chip, actions }: Props) {
  const navigate = useNavigate();
  return (
    <header className="bc-hdr bc-hdr-page">
      {back !== null && (
        <button type="button" className="bc-tool bc-back" onClick={() => navigate(back)} aria-label="Back">
          <BackIcon size={20} />
        </button>
      )}
      <div className="bc-hdr-title">
        <h1 className="bc-title">{title}</h1>
        {subtitle && <p className="bc-sub">{subtitle}</p>}
      </div>
      {chip && <div className="bc-rec">{chip}</div>}
      {actions && <div className="bc-hdr-tools">{actions}</div>}
    </header>
  );
}
