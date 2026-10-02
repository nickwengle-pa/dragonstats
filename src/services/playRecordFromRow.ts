/**
 * A stored play row as the game screen's PlayRecord.
 *
 * This was written inline in the game screen, and the film chart kept its
 * own thinner copy that left out the stored next spots - so a hand-set spot
 * the game screen honoured, the film chart's replay walked straight over.
 * The official copy of a finished game (finalRecord.ts) is computed from
 * these records on both screens, and two conversions would make them report
 * changes that are only the two copies disagreeing. One conversion.
 */
import type { PlayWithPlayers } from "./gameService";
import { readFumbleSpots } from "./fumbleSpots";
import {
  type PlayRecord,
  type BlockedKickType,
  makePendingId,
  makeTeamTag,
  teamTagConfirmed,
  normalizeOppTagId,
  pendingDisplayName,
  pendingJerseyFromId,
} from "@/components/game/types";

export function parseClockText(clockText: unknown, fallback: number): number {
  if (typeof clockText !== "string") return fallback;
  const [mins, secs] = clockText.split(":").map(Number);
  if (Number.isNaN(mins) || Number.isNaN(secs)) return fallback;
  return mins * 60 + secs;
}

export interface RosterLookups {
  /** Player id -> "First Last", for plays whose join has no player yet. */
  names?: Map<string, string>;
  /** Player id -> jersey. Jerseys live on season_rosters, not the join. */
  jerseys?: Map<string, number | null>;
}

export function playRecordFromRow(p: PlayWithPlayers, roster: RosterLookups = {}): PlayRecord {
  const pd = (p.play_data ?? {}) as Record<string, any>;
  return {
    id: p.id,
    sequence: p.sequence,
    quarter: p.quarter,
    clock: parseClockText(p.clock, 0),
    type: p.play_type,
    yards: p.yards_gained,
    result: pd.result ?? "",
    penalty: pd.penalty_type ?? null,
    flagYards: pd.penalty_yards ?? 0,
    isTouchdown: p.is_touchdown,
    firstDown: pd.is_first_down ?? false,
    turnover: p.is_turnover,
    isTouchback: !!pd.is_touchback,
    penaltyCategory: pd.play_category === "offense" || pd.play_category === "defense" ? pd.play_category : null,
    penaltyEnforcement: pd.penalty_enforcement === "declined" || pd.penalty_enforcement === "offset" ? pd.penalty_enforcement : "accepted",
    blockedKickType: (
      pd.blocked_kick_type === "field_goal"
      || pd.blocked_kick_type === "extra_point"
      || pd.blocked_kick_type === "punt"
      || pd.blocked_kick_type === "kickoff"
    ) ? pd.blocked_kick_type as BlockedKickType : null,
    /* Every save writes these as null on a play with no fumble, and
       Number(null) is 0 - which read back as "recovered, returned 0" on every
       such play, and the replay then decided its first down from the yardage
       instead of the recorded flag. Older builds stored a literal 0 on every
       play too - see readFumbleSpots. */
    ...readFumbleSpots(pd),
    tagged: [
      ...(p.play_players ?? []).map((pp: any) => ({
        id: pp.player_id,
        player_id: pp.player_id,
        jersey_number: roster.jerseys?.get(pp.player_id) ?? null,
        name: pp.player
          ? `${pp.player.first_name} ${pp.player.last_name}`
          : roster.names?.get(pp.player_id) ?? "?",
        role: pp.role,
        credit: pp.credit ?? undefined,
      })),
      // Opponent tags are persisted in play_data (no FK row possible).
      ...((Array.isArray(pd.opp_tagged) ? pd.opp_tagged : []) as any[]).map((t: any) => ({
        id: normalizeOppTagId(String(t.id ?? "opp_team"), t.jersey_number ?? null),
        player_id: normalizeOppTagId(String(t.id ?? "opp_team"), t.jersey_number ?? null),
        jersey_number: t.jersey_number ?? null,
        name: String(t.name ?? "TEAM"),
        role: String(t.role ?? ""),
        credit: t.credit ?? undefined,
        isOpponent: true,
      })),
      // Unrostered jerseys on our side — same storage reason as above.
      ...((Array.isArray(pd.pending_tagged) ? pd.pending_tagged : []) as any[]).map((t: any) => {
        const jersey = t.jersey_number ?? pendingJerseyFromId(String(t.id ?? ""));
        return {
          id: String(t.id ?? makePendingId(jersey ?? 0)),
          player_id: String(t.id ?? makePendingId(jersey ?? 0)),
          jersey_number: jersey ?? null,
          name: pendingDisplayName(jersey ?? null),
          role: String(t.role ?? ""),
          credit: t.credit ?? undefined,
          isPending: true,
        };
      }),
      // TEAM placeholders — our side, jersey never identified. Same storage
      // reason again: no players row, so no play_players FK.
      ...((Array.isArray(pd.team_tagged) ? pd.team_tagged : []) as any[]).map((t: any) => ({
        ...makeTeamTag(String(t.role ?? "")),
        credit: t.credit ?? undefined,
        ...(teamTagConfirmed(t, pd) ? { teamCreditConfirmed: true } : {}),
      })),
    ],
    ballOn: p.yard_line,
    down: p.down,
    distance: p.distance,
    description: p.description,
    possession: p.possession,
    nextPossession: pd.next_possession === "us" || pd.next_possession === "them" ? pd.next_possession : undefined,
    nextDown: typeof pd.next_down === "number" ? pd.next_down : undefined,
    nextDistance: typeof pd.next_distance === "number" ? pd.next_distance : undefined,
    nextBallOn: typeof pd.next_yard_line === "number" ? pd.next_yard_line : undefined,
    offensiveFormation: (p as any).offensive_formation ?? null,
    defensiveFormation: (p as any).defensive_formation ?? null,
    hashMark: (p as any).hash_mark ?? null,
    playData: { ...pd },
  };
}
