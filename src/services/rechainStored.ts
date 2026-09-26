/**
 * Re-chain a game's STORED spots after an edit made outside the game screen.
 *
 * The game screen re-derives every play's down, distance and spot after any
 * change and writes them back. The film chart edits plays too, and never did:
 * change a gain there and every play after it kept the spot it was stored
 * with. The reports read those stored spots, and the editor opened each later
 * play against them, which is how the yardages on the film chart came to
 * disagree with the game screen's.
 *
 * Pure - it only says what to rewrite. The caller owns the writes.
 */
import type { PlayRecord } from "@/components/game/types";
import type { PlayWithPlayers } from "./gameService";
import { markHandSetStarts, rebuildPlaySituations, type PregameConfig } from "./gameFlow";
import type { GameConfig } from "./programService";

export interface SituationRewrite {
  id: string;
  fields: {
    possession: "us" | "them";
    down: number;
    distance: number;
    yard_line: number;
    end_yard_line: number;
  };
  playData: Record<string, unknown>;
}

const numOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
};

/** Just enough of a play to replay where it left the ball. */
function situationRecord(row: PlayWithPlayers): PlayRecord {
  const pd = (row.play_data ?? {}) as Record<string, any>;
  return {
    id: row.id,
    sequence: row.sequence,
    quarter: row.quarter,
    clock: 0,
    type: row.play_type,
    yards: row.yards_gained ?? 0,
    result: pd.result ?? "",
    penalty: pd.penalty_type ?? null,
    flagYards: pd.penalty_yards ?? 0,
    isTouchdown: !!row.is_touchdown,
    firstDown: pd.is_first_down ?? false,
    turnover: !!row.is_turnover,
    isTouchback: !!pd.is_touchback,
    penaltyCategory: pd.play_category === "offense" || pd.play_category === "defense" ? pd.play_category : null,
    penaltyEnforcement: pd.penalty_enforcement === "declined" || pd.penalty_enforcement === "offset" ? pd.penalty_enforcement : "accepted",
    blockedKickType: pd.blocked_kick_type ?? null,
    fumbleReturnYards: numOrNull(pd.fumble_return_yards),
    fumbleRecoveredAt: numOrNull(pd.fumble_recovered_at),
    tagged: [],
    ballOn: row.yard_line,
    down: row.down,
    distance: row.distance,
    description: row.description ?? "",
    possession: row.possession,
    nextPossession: pd.next_possession === "us" || pd.next_possession === "them" ? pd.next_possession : undefined,
    nextDown: typeof pd.next_down === "number" ? pd.next_down : undefined,
    nextDistance: typeof pd.next_distance === "number" ? pd.next_distance : undefined,
    nextBallOn: typeof pd.next_yard_line === "number" ? pd.next_yard_line : undefined,
    playData: { ...pd },
  };
}

export function rechainStoredPlays(
  rows: PlayWithPlayers[],
  pregame: PregameConfig | null,
  config: GameConfig,
): SituationRewrite[] {
  const records = markHandSetStarts(rows.map(situationRecord), pregame, config);
  const rebuilt = rebuildPlaySituations(records, pregame, config).plays;
  const rewrites: SituationRewrite[] = [];
  rebuilt.forEach((play, i) => {
    const row = rows[i];
    const pd = (row.play_data ?? {}) as Record<string, unknown>;
    const startOverride = records[i].playData?.start_override === true;
    const unchanged = row.possession === play.possession
      && row.down === play.down
      && row.distance === play.distance
      && row.yard_line === play.ballOn
      && pd.next_possession === play.nextPossession
      && pd.next_down === play.nextDown
      && pd.next_distance === play.nextDistance
      && pd.next_yard_line === play.nextBallOn
      && (pd.start_override === true) === startOverride
      // A quarter change also keeps where the quarter ended.
      && JSON.stringify(pd.quarter_change_before ?? null) === JSON.stringify(play.playData?.quarter_change_before ?? null);
    if (unchanged || play.nextPossession == null || play.nextBallOn == null) return;
    rewrites.push({
      id: row.id,
      fields: {
        possession: play.possession,
        down: play.down,
        distance: play.distance,
        yard_line: play.ballOn,
        end_yard_line: play.nextBallOn,
      },
      playData: {
        ...pd,
        ...(play.playData?.quarter_change_before ? { quarter_change_before: play.playData.quarter_change_before } : {}),
        ...(startOverride ? { start_override: true } : {}),
        next_possession: play.nextPossession,
        next_down: play.nextDown,
        next_distance: play.nextDistance,
        next_yard_line: play.nextBallOn,
      },
    });
  });
  return rewrites;
}
