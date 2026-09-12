import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OffensivePlayBadge, PlayTacklers } from "./PlayRowDetails";
import type { TaggedPlayer } from "./types";

describe("play row details", () => {
  it("labels offensive runs and passes including sacks and interceptions", () => {
    for (const [type, label] of [["rush", "run"], ["scramble", "run"], ["pass_comp", "pass"], ["sack", "pass"], ["int", "pass"]]) {
      expect(renderToStaticMarkup(createElement(OffensivePlayBadge, { play: { type, possession: "us", tagged: [] } }))).toContain(`>${label}</span>`);
    }
    for (const [type, possession] of [["rush", "them"], ["punt", "us"], ["timeout", "us"]] as const) {
      expect(renderToStaticMarkup(createElement(OffensivePlayBadge, { play: { type, possession, tagged: [] } }))).toBe("");
    }
  });

  it("shows our shared tacklers and film-later tags without opponent names", () => {
    const tagged = [
      { id: "1", player_id: "1", name: "Morgan Stone", jersey_number: 44, role: "tackler", credit: 0.5 },
      { id: "2", player_id: "2", name: "Jamie Brooks", jersey_number: 52, role: "sacker", credit: 0.5 },
      { id: "3", player_id: "3", name: "Other Player", jersey_number: 8, role: "tackler", isOpponent: true },
      { id: "team", player_id: "team", name: "TEAM", jersey_number: null, role: "tackler", isTeam: true },
    ] as TaggedPlayer[];
    const html = renderToStaticMarkup(createElement(PlayTacklers, { play: { type: "sack", possession: "them", tagged } }));
    expect(html).toContain("Sack:");
    expect(html).toContain("#44 Stone (0.5), #52 Brooks (0.5), Identify on film later");
    expect(html).not.toContain("Other Player");
    expect(renderToStaticMarkup(createElement(PlayTacklers, { play: { type: "pass_inc", possession: "them", tagged: [] } }))).toBe("");
  });
});

