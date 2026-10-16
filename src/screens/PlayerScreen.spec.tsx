// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PlayerGameLine } from "@/services/statsService";

const mocks = vi.hoisted(() => ({ lines: [] as PlayerGameLine[] }));

vi.mock("@/hooks/useProgramContext", () => ({
  useProgramContext: () => ({
    program: { id: "prog", name: "Dragons", abbreviation: "DRG", game_config: null },
    season: { id: "season" },
  }),
}));
vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq"]) chain[m] = () => chain;
  chain.single = async () => ({
    data: { jersey_number: 3, position: "K", positions: ["K", "WR"],
      player: { first_name: "Sam", last_name: "Boot", preferred_name: null, graduation_year: 2027 } },
  });
  return { supabase: chain };
});
vi.mock("@/services/statsService", () => ({
  computePlayerSeasonStats: async () => mocks.lines,
  computePlayerCareerStats: async () => [],
}));

import PlayerScreen from "./PlayerScreen";

afterEach(() => cleanup());

const blank = (over: Partial<PlayerGameLine>): PlayerGameLine => ({
  gameId: "g1", opponentName: "Central", gameDate: "2026-09-05",
  passing: null, rushing: null, receiving: null, defense: null,
  kicking: null, punting: null, returns: null, scoring: null, ...over,
});

function show() {
  render(
    <MemoryRouter initialEntries={["/player/p1"]}>
      <Routes><Route path="/player/:playerId" element={<PlayerScreen />} /></Routes>
    </MemoryRouter>,
  );
}

describe("player page", () => {
  it("shows special teams and scoring for a kicker, and leaves out what he never did", async () => {
    mocks.lines = [blank({
      kicking: { fieldGoalMade: 2, fieldGoalAttempts: 3, fieldGoalLong: 38, fieldGoalBlocked: 0,
        extraPointMade: 4, extraPointAttempts: 4, kickoffs: 6, kickoffTouchbacks: 2,
        onsideKickAttempts: 0, onsideKickRecoveries: 0, averageKickoffDistance: 50 } as never,
      returns: { kickReturns: 1, kickReturnYards: 22, kickReturnLong: 22, kickReturnTouchdowns: 0,
        kickReturnFumbles: 0, puntReturns: 0, puntReturnYards: 0, puntReturnLong: 0,
        puntReturnTouchdowns: 0, puntReturnFumbles: 0, puntReturnFairCatches: 0 } as never,
      scoring: { points: 10, touchdowns: 0, twoPointMade: 0, patMade: 4, fgMade: 2 },
    })];
    show();
    expect(await screen.findByText("Kicking")).toBeTruthy();
    expect(screen.getByText("Special Teams")).toBeTruthy();
    expect(screen.getByText("Kick Returns")).toBeTruthy();
    expect(screen.queryByText("Punt Returns")).toBeNull();
    expect(screen.getByText("Scoring")).toBeTruthy();
    expect(screen.getAllByText("2/3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Offense")).toBeNull();
    expect(screen.queryByText("Defense")).toBeNull();
    expect(screen.queryByText(/No stats recorded/)).toBeNull();
  });

  it("says so when every game line is empty", async () => {
    mocks.lines = [blank({}), blank({ gameId: "g2" })];
    show();
    expect(await screen.findByText(/No stats recorded/)).toBeTruthy();
  });
});
