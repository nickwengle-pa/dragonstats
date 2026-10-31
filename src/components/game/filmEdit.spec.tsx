// @vitest-environment jsdom
/**
 * The Film Chart's edit screen: a play and its film charting on one summary,
 * with one Save for both.
 *
 * The play itself is written only when it changed - charting a play must not
 * re-save it and re-chain the game behind it - and a coach locked out of a
 * final game's stats can still chart it.
 */
import { useState } from "react";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import PlayEntryModal, { type PlaySubmitData } from "@/components/game/PlayEntryModal";
import { findPlayTypeDef, type PlayRecord } from "@/components/game/types";
import type { PlayChartingDraft } from "@/services/chartingService";
import { chartingChanged, collectFilmSeen } from "./FilmChartingFields";

beforeAll(() => {
  (window as any).matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as any).scrollIntoView ??= function () {};
  (Element.prototype as any).scrollTo ??= function () {};
  window.confirm = () => true;
});
afterEach(() => cleanup());

const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };

const pass: PlayRecord = {
  id: "p1", sequence: 23, quarter: 2, clock: 412, type: "pass_comp", yards: 14, result: "",
  penalty: null, flagYards: 0, isTouchdown: false, firstDown: true, turnover: false,
  tagged: [
    { id: "u7", player_id: "u7", jersey_number: 7, name: "Alex Miller", role: "passer" },
    { id: "u3", player_id: "u3", jersey_number: 3, name: "Casey Hill", role: "receiver" },
  ],
  ballOn: 34, down: 2, distance: 7, possession: "us", description: "Pass from #7 to #3 for 14 yards",
};

const charted: PlayChartingDraft = {
  play_id: "p1", game_id: "g", hash_mark: "middle", personnel: "11", offensive_formation: "Shotgun",
  defensive_formation: null, motion: null, play_call: null, passer: null, receiver: null, tags: null, notes: null,
};

function renderFilm(opts: { canEditStats?: boolean; canChart?: boolean } = {}) {
  const saves: Array<{ stats: PlaySubmitData | null; then: string; chart: PlayChartingDraft }> = [];
  function Harness() {
    const [draft, setDraft] = useState(charted);
    return (
      <PlayEntryModal
        playType={findPlayTypeDef("pass_comp")!}
        gameState={{ quarter: 2, clock: 412, possession: "us", ourScore: 0, theirScore: 0, down: 2, distance: 7, ballOn: 34 }}
        roster={[]}
        opponentPlayers={[]}
        progName="Dragons" oppName="Visitors" progAbbr="DRG" oppAbbr="VIS"
        editing={pass}
        playNumber={23}
        trackFormations
        trackTacklers
        onSubmit={() => {}}
        onClose={() => {}}
        onDelete={() => {}}
        film={{
          draft, saved: charted, onChange: patch => setDraft(d => ({ ...d, ...patch })),
          canChart: opts.canChart ?? true, canEditStats: opts.canEditStats ?? true,
          seen: collectFilmSeen([], []), hasNext: true,
          onSave: async (stats, then) => { saves.push({ stats, then, chart: draft }); return true; },
        }}
      />
    );
  }
  render(<Harness />);
  return saves;
}

describe("film chart edit", () => {
  it("saves charting alone without re-saving the play", async () => {
    const saves = renderFilm();
    await click(screen.getByRole("button", { name: "Right hash" }));
    await click(screen.getByRole("button", { name: /^Save$/ }));
    expect(saves).toHaveLength(1);
    expect(saves[0].stats).toBeNull();
    expect(saves[0].then).toBe("close");
    expect(saves[0].chart.hash_mark).toBe("right");
  });

  it("writes the play when its stats changed", async () => {
    const saves = renderFilm();
    await click(screen.getByRole("button", { name: "+ Bad snap" }));
    await click(screen.getByRole("button", { name: /^Save & next/ }));
    expect(saves).toHaveLength(1);
    expect(saves[0].then).toBe("next");
    expect(saves[0].stats?.playData?.bad_snap).toBe(true);
  });

  it("an untouched play saves as unchanged", async () => {
    const saves = renderFilm();
    await click(screen.getByRole("button", { name: /^Save$/ }));
    expect(saves[0].stats).toBeNull();
  });

  it("locked stats: nothing on the play opens, the charting still saves", async () => {
    const saves = renderFilm({ canEditStats: false });
    expect(screen.queryByRole("button", { name: /^Passer:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Bad snap" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete play" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change start" })).toBeNull();
    await click(screen.getByRole("button", { name: "Left hash" }));
    await click(screen.getByRole("button", { name: /^Save$/ }));
    expect(saves[0].stats).toBeNull();
    expect(saves[0].chart.hash_mark).toBe("left");
  });

  it("view only is a Close button and no Save", () => {
    renderFilm({ canEditStats: false, canChart: false });
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Right hash" })).toBeNull();
  });
});

describe("film charting helpers", () => {
  it("blank, null and padding are the same charting", () => {
    expect(chartingChanged(charted, { ...charted, defensive_formation: "", notes: "  ", tags: [] })).toBe(false);
    expect(chartingChanged(charted, { ...charted, personnel: " 11 " })).toBe(false);
    expect(chartingChanged(charted, { ...charted, tags: ["RPO"] })).toBe(true);
    expect(chartingChanged(charted, { ...charted, hash_mark: "left" })).toBe(true);
  });

  it("offers what the game has used, most used first, live formations included", () => {
    const row = (patch: Partial<PlayChartingDraft>) => ({ ...charted, defensive_formation: null, ...patch });
    const seen = collectFilmSeen(
      [row({ offensive_formation: "Trips Right", tags: ["RPO"] }), row({ offensive_formation: "trips right", tags: ["RPO", "explosive"] }), row({ offensive_formation: "Pistol" })],
      [{ offensive_formation: "Wing-T", defensive_formation: "3-3 Stack" }],
    );
    expect(seen.offense.slice(0, 2)).toEqual(["Trips Right", "Pistol"]);
    expect(seen.offense).toContain("Wing-T");
    expect(seen.defense).toEqual(["3-3 Stack"]);
    expect(seen.tags).toEqual(["RPO", "explosive"]);
  });
});
