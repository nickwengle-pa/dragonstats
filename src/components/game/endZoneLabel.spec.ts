import { describe, it, expect } from "vitest";
import { endZoneLabel } from "./FieldVisualizer";

describe("the end zone label", () => {
  it("shortens a name too long for the end zone to its initials", () => {
    expect(endZoneLabel("Purchase Line High School", "PL")).toBe("PLHS");
  });

  it("keeps a name that fits", () => {
    expect(endZoneLabel("Penns Manor", "PM")).toBe("PENNS MANOR");
    expect(endZoneLabel("Conemaugh Township", "CT")).toBe("CONEMAUGH TOWNSHIP");
  });

  it("falls back to the abbreviation for one long word or no name", () => {
    expect(endZoneLabel("Mechanicsburgandfriends", "MECH")).toBe("MECH");
    expect(endZoneLabel("  ", "OPP")).toBe("OPP");
  });
});
