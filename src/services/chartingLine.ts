/**
 * A play's film charting as one line under it in the play-by-play:
 * "Shotgun · 11 pers · Motion: Jet · Power Rt · vs 4-3 · Left hash ·
 * Tags: RPO · Note: …".
 *
 * The Film Chart's values win. Where it has none, the formation, hash and
 * wristband call picked when the play was entered fill in, in the same order
 * the Film Chart table and the Hudl export read them. Blank when nothing was
 * charted, so a season charted only from some week on prints nothing extra
 * before it.
 */
import type { PlayCharting } from "./chartingService";

/** What the play row itself may carry from entry. */
export interface ChartedAtSnap {
  offensive_formation?: string | null;
  defensive_formation?: string | null;
  hash_mark?: string | null;
  play_data?: Record<string, unknown> | null;
}

const HASH: Record<string, string> = { left: "Left hash", middle: "Middle of field", right: "Right hash" };

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The line in its parts, for a layout that breaks between them. */
export function chartingParts(charting: PlayCharting | undefined, play: ChartedAtSnap): string[] {
  const formation = clean(charting?.offensive_formation) || clean(play.offensive_formation);
  const personnel = clean(charting?.personnel);
  const motion = clean(charting?.motion);
  const call = clean(charting?.play_call) || clean(play.play_data?.wristband_call);
  const defense = clean(charting?.defensive_formation) || clean(play.defensive_formation);
  const hash = clean(charting?.hash_mark) || clean(play.hash_mark);
  const tags = (charting?.tags ?? []).map(clean).filter(Boolean);
  const notes = clean(charting?.notes).replace(/\s+/g, " ");

  return [
    formation,
    personnel && (/^\d+$/.test(personnel) ? `${personnel} pers` : personnel),
    motion && `Motion: ${motion}`,
    // A bare wristband number would read as a stat.
    call && (/^\d+$/.test(call) ? `Call ${call}` : call),
    defense && `vs ${defense}`,
    hash && (HASH[hash.toLowerCase()] ?? `${hash} hash`),
    tags.length > 0 && `Tags: ${tags.join(", ")}`,
    notes && `Note: ${notes}`,
  ].filter((part): part is string => Boolean(part));
}

export function chartingLine(charting: PlayCharting | undefined, play: ChartedAtSnap): string {
  return chartingParts(charting, play).join(" · ");
}
