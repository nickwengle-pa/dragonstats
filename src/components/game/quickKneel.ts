import type { PlaySubmitData } from "./PlayEntryModal";
import { makeTeamTag, type GameState, type PlayTypeDef, type TaggedPlayer } from "./types";

export function quickKneel(playType: PlayTypeDef, situation: Pick<GameState, "possession" | "clock">, quarterback?: TaggedPlayer): PlaySubmitData {
  const carrier = quarterback ? { ...quarterback, role: "rusher" } : situation.possession === "us"
    ? { ...makeTeamTag("rusher"), teamCreditConfirmed: true }
    // Theirs: an opponent tag only. isTeam marks OUR TEAM, and the save files
    // every isTeam tag under our team_tagged, so it put their kneel on our sheet.
    : { id: "opp_team", player_id: "opp_team", name: "TEAM", jersey_number: null, role: "rusher", isOpponent: true, teamCreditConfirmed: true };
  return {
    playType,
    tagged: [carrier],
    yards: -1, clock: situation.clock,
    isTouchdown: false, isFirstDown: false, isTouchback: false, turnover: false,
    result: "", penalty: null, penaltyCategory: null, penaltyEnforcement: "accepted", flagYards: 0,
    blockedKickType: null, offensiveFormation: null, defensiveFormation: null, hashMark: null,
    description: `Kneel · ${carrier.isTeam || carrier.player_id === "opp_team" ? "Team" : `#${carrier.jersey_number ?? "?"} ${carrier.name}`} rushing −1 yd`,
    playData: { no_tackle: true, quick_kneel: true },
  };
}
