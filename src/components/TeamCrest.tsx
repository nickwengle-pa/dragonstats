interface Props {
  /** Team logo. Falls back to initials on the team color when absent. */
  logoUrl?: string | null;
  /** Short label for the fallback badge — abbreviation beats full name here. */
  abbr: string;
  color?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "w-5 h-5 text-[8px]",
  md: "w-8 h-8 text-[10px]",
  lg: "w-12 h-12 text-sm",
};

/**
 * A team's logo, or its initials on the team color when no logo is uploaded.
 * Decorative: every call site already names the team in adjacent text, so the
 * image is alt="" rather than repeating that name to a screen reader.
 */
export default function TeamCrest({
  logoUrl,
  abbr,
  color,
  size = "md",
  className = "",
}: Props) {
  const box = SIZES[size];
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={`${box} object-contain rounded-lg shrink-0 ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} rounded-lg shrink-0 flex items-center justify-center font-display font-black uppercase text-white ${className}`}
      style={{ backgroundColor: color || "#6b7280" }}
    >
      {abbr.slice(0, 3)}
    </span>
  );
}
