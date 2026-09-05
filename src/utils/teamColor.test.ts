/**
 * Run with: node src/utils/teamColor.test.ts
 * (no test framework — plain node, node strips the types)
 *
 * The reported bug: playing a team whose colour is black, the yard ruler went
 * dark and the selected number could not be read. The marker fills with the
 * team colour and outlines in it, and the selection is set in it, so a black
 * team colour blacked the control out against the app's near-black surface.
 */
import assert from "node:assert/strict";
import { readableAccent } from "./teamColor.ts";

/** Perceived lightness of a hex, 0..1 — the thing that has to clear the bar. */
function lightnessOf(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/** Hue in degrees, so "navy stays navy" can actually be asserted. */
function hueOf(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return -1;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(err as Error).message.split("\n")[0]}`);
    process.exitCode = 1;
  }
};

console.log("teamColor");

test("the reported bug: black comes back light enough to see", () => {
  const out = readableAccent("#000000");
  assert.ok(lightnessOf(out) >= 0.5, `black lifted to ${out}, lightness ${lightnessOf(out)}`);
});

test("navy stays navy, just brighter", () => {
  const out = readableAccent("#0a1a3a");
  assert.ok(lightnessOf(out) >= 0.5, `still dark: ${out}`);
  const hue = hueOf(out);
  assert.ok(hue > 200 && hue < 250, `hue drifted off blue: ${hue}`);
});

test("maroon stays maroon", () => {
  const out = readableAccent("#4a0d1f");
  assert.ok(lightnessOf(out) >= 0.5);
  const hue = hueOf(out);
  assert.ok(hue > 320 || hue < 20, `hue drifted off red: ${hue}`);
});

test("a colour that already reads is returned untouched", () => {
  // Most teams are here, and their accent must not shift at all.
  assert.equal(readableAccent("#dc2626"), "#dc2626");
  assert.equal(readableAccent("#f59e0b"), "#f59e0b");
});

test("shorthand hex is understood", () => {
  const out = readableAccent("#000");
  assert.ok(lightnessOf(out) >= 0.5);
});

test("a missing colour falls back rather than throwing", () => {
  assert.equal(readableAccent(null), "#9ca3af");
  assert.equal(readableAccent(undefined), "#9ca3af");
  assert.equal(readableAccent(""), "#9ca3af");
});

test("something that is not a hex passes straight through", () => {
  // A named colour or a gradient is somebody else's business, not ours to mangle.
  assert.equal(readableAccent("rebeccapurple"), "rebeccapurple");
});

test("the lift is the minimum needed, not a wash-out", () => {
  // A colour just under the bar should land near it, not at white.
  const out = readableAccent("#1e4620");
  assert.ok(lightnessOf(out) < 0.62, `over-lightened to ${out}`);
});

console.log(`\n${passed}/${total} passed`);
