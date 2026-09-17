import type { SVGProps } from "react";

/**
 * The Broadcast icon set. 24px grid, 2px stroke, square caps, mitre joins —
 * drawn to sit beside Chakra Petch, whose corners are all hard. Lucide's
 * rounded strokes read as a different voice next to it, which is why these
 * are hand-drawn rather than imported.
 *
 * Every icon takes the usual SVG props; `size` is a convenience for the
 * common case of a square icon.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(name: string, body: React.ReactNode, filled = false) {
  function Icon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden="true"
        {...rest}
      >
        {body}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

/* ── tab bar ── */
export const GoalpostIcon = make("GoalpostIcon", <path d="M6 3v9M18 3v9M6 12h12M12 12v9M8 21h8" />);
export const CalendarIcon = make("CalendarIcon", <>
  <rect x="3" y="5" width="18" height="16" />
  <path d="M3 10h18M8 3v4M16 3v4" />
  <rect x="14" y="13" width="4" height="4" fill="currentColor" stroke="none" />
</>);
export const JerseyIcon = make("JerseyIcon", <path d="M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 2.5 0 0 1-8 0Z" />);
export const StatsIcon = make("StatsIcon", <><path d="M4 20h16" /><path d="M7 20v-7M12 20V5M17 20v-10" /></>);
export const HeadsetIcon = make("HeadsetIcon", <>
  <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
  <rect x="3" y="13" width="4" height="6" />
  <rect x="17" y="13" width="4" height="6" />
  <path d="M19 19v1a2 2 0 0 1-2 2h-4" />
</>);

/* ── game reports ── */
export const SheetIcon = make("SheetIcon", <><path d="M6 3h9l4 4v14H6Z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></>);
export const GridIcon = make("GridIcon", <><rect x="3" y="4" width="18" height="16" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>);
export const TrendIcon = make("TrendIcon", <><path d="M3 20h18" /><path d="M4 15l5-5 4 3 7-8" /><path d="M16 5h4v4" /></>);
export const FilmIcon = make("FilmIcon", <>
  <rect x="3" y="4" width="18" height="16" />
  <path d="M3 9h18M3 15h18M7 4v5M17 4v5M7 15v5M17 15v5M12 9v6" />
</>);
export const FlagIcon = make("FlagIcon", <path d="M5 21V4h11l-2 4 2 4H5" />);

/* ── season & misc ── */
export const WhistleIcon = make("WhistleIcon", <>
  <circle cx="9" cy="15" r="5" />
  <path d="M12.5 11.5 21 8v5l-7 2.5" />
  <path d="M9 10V7" />
</>);
export const ChevronIcon = make("ChevronIcon", <path d="M9 6l6 6-6 6" />);
export const ClockIcon = make("ClockIcon", <><circle cx="12" cy="12" r="9" /><path d="M12 7v5h4" /></>);
export const PinIcon = make("PinIcon", <>
  <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" />
  <circle cx="12" cy="10" r="2.5" />
</>);
export const PlayIcon = make("PlayIcon", <path d="M7 4l13 8-13 8Z" />, true);
export const PencilIcon = make("PencilIcon", <path d="M4 20v-4L15 5l4 4L8 20H4ZM13 7l4 4" />);
export const SunIcon = make("SunIcon", <>
  <circle cx="12" cy="12" r="4" />
  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" />
</>);
export const MoonIcon = make("MoonIcon", <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />);
export const PowerIcon = make("PowerIcon", <><path d="M12 3v8" /><path d="M7 7a7 7 0 1 0 10 0" /></>);
export const BackIcon = make("BackIcon", <path d="M15 5l-7 7 7 7" />);
export const EyeIcon = make("EyeIcon", <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const TrophyIcon = make("TrophyIcon", <>
  <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
  <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
  <path d="M12 14v3M9 17h6v4H9Z" />
</>);
export const ExternalIcon = make("ExternalIcon", <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v7H4V6h7" /></>);
export const PlusIcon = make("PlusIcon", <path d="M12 5v14M5 12h14" />);
export const UploadIcon = make("UploadIcon", <><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></>);
export const ShieldIcon = make("ShieldIcon", <path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6Z" />);
export const SchoolIcon = make("SchoolIcon", <><path d="M3 21V10l9-6 9 6v11" /><path d="M3 21h18M9 21v-6h6v6" /></>);
