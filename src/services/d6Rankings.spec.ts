import { describe, expect, it } from "vitest";
import { standingsFromFeed } from "./d6Rankings";

const team = (name: string, cls: string, wins: number, losses: number, averagePoints: number, district = 6) =>
  ({ name, cls, district, wins, losses, ties: 0, averagePoints });

const feed = {
  sources: { rankingsUpdatedAt: "10/05/2026 12:17" },
  teams: [
    team("Homer-Center", "A", 5, 1, 106.67),
    team("Purchase Line", "A", 3, 3, 60),
    team("Bishop Guilfoyle", "A", 5, 1, 123.33),
    team("Northern Cambria", "A", 3, 3, 56.67),
    team("Portage", "A", 3, 3, 56.67),
    team("Richland", "AA", 6, 0, 131.67),
    team("Meyersdale", "A", 5, 1, 90, 5),
  ],
};

describe("standingsFromFeed", () => {
  it("ranks our District 6 class by average points", () => {
    const s = standingsFromFeed(feed, "Purchase Line")!;
    expect(s.cls).toBe("A");
    expect(s.cut).toBe(8);
    expect(s.updatedAt).toBe("10/05/2026 12:17");
    expect(s.rows.map(r => r.name)).toEqual(["Bishop Guilfoyle", "Homer-Center", "Purchase Line", "Northern Cambria", "Portage"]);
    expect(s.rows.find(r => r.us)?.rank).toBe(3);
  });

  it("gives teams level on average points the same rank", () => {
    const s = standingsFromFeed(feed, "Purchase Line")!;
    expect(s.rows.slice(3).map(r => r.rank)).toEqual([4, 4]);
  });

  it("leaves out other classes and other districts", () => {
    const names = standingsFromFeed(feed, "Purchase Line")!.rows.map(r => r.name);
    expect(names).not.toContain("Richland");
    expect(names).not.toContain("Meyersdale");
  });

  it("returns nothing for a feed it cannot read or a team it cannot find", () => {
    expect(standingsFromFeed(null, "Purchase Line")).toBeNull();
    expect(standingsFromFeed({ teams: "nope" }, "Purchase Line")).toBeNull();
    expect(standingsFromFeed(feed, "Somewhere Else")).toBeNull();
  });
});
