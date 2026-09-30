/**
 * Where an edited play leaves the ball, for the two screens that save edits.
 *
 * The editor answers that itself on a flag it shows the spot control for - an
 * accepted flag or a dead-ball foul - and it now opens those on a spot the
 * operator typed in (see the seeding in PlayEntryModal). Everywhere else the
 * Adjust Next Situation sheet is the only place a spot gets typed, and the
 * editor has nothing to say about it. Both save paths used to write the
 * editor's silence back as "no spot", so fixing a tackler on an interception
 * threw away where the operator had put the ball.
 */
import type { GameConfig } from "@/services/programService";
import { getHandSetNextSituation, handSpotSurvivingEdit } from "@/services/gameFlow";
import type { PlaySubmitData } from "./PlayEntryModal";
import type { PlayRecord } from "./types";

export interface EditedNextSituation {
  nextSituation: PlaySubmitData["nextSituation"];
  /** A spot typed in by hand that this edit replaced - the play's outcome
   *  moved under it. The live screen reopens the Adjust sheet so the new spot
   *  gets confirmed, the same as it would on entry. */
  handSpotDropped: boolean;
}

export function resolveEditedNextSituation(
  original: PlayRecord,
  result: PlaySubmitData,
  config: GameConfig,
): EditedNextSituation {
  const given = result.nextSituation ?? null;
  if (result.spotOverrideOffered || given?.source === "manual_override") {
    return { nextSituation: given, handSpotDropped: false };
  }
  if (!getHandSetNextSituation(original)) {
    return { nextSituation: given, handSpotDropped: false };
  }
  // The edited play, as far as the rules that place the ball read it.
  const edited: PlayRecord = {
    ...original,
    type: result.playType.id,
    yards: result.yards,
    result: result.result,
    penalty: result.penalty,
    penaltyCategory: result.penaltyCategory,
    penaltyEnforcement: result.penalty ? result.penaltyEnforcement : undefined,
    flagYards: result.flagYards,
    isTouchdown: result.isTouchdown,
    firstDown: result.isFirstDown,
    turnover: result.turnover ?? ["int", "fumble"].includes(result.playType.id),
    isTouchback: result.isTouchback,
    blockedKickType: result.blockedKickType,
    fumbleRecoveredAt: result.fumbleRecoveredAt ?? null,
    fumbleReturnYards: result.fumbleReturnYards ?? null,
    playData: { ...(original.playData ?? {}), ...(result.playData ?? {}) },
  };
  const kept = handSpotSurvivingEdit(original, edited, config);
  return kept
    ? { nextSituation: { ...kept, source: "manual_override" }, handSpotDropped: false }
    : { nextSituation: given, handSpotDropped: true };
}
