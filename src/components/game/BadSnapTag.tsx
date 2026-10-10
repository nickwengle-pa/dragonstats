import { isBadSnap } from "./types";

/** "BS" beside a play that had a bad snap, in every list of plays. */
export default function BadSnapTag({ type, playData, className = "" }: {
  type: string | null | undefined;
  playData: unknown;
  className?: string;
}) {
  if (!isBadSnap(type, playData)) return null;
  return (
    <span title="Bad snap" aria-label="Bad snap"
      className={`mr-1 inline-block rounded bg-orange-500/20 px-1 align-[1px] text-[9px] font-display font-black leading-[14px] tracking-wider text-orange-300 print:bg-transparent print:text-black ${className}`}>
      BS
    </span>
  );
}
