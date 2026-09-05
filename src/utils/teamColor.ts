/**
 * Team colours, made readable on a dark screen.
 *
 * A team colour is whatever the school wears, and plenty of schools wear
 * black. Used raw as a UI accent on this app's near-black surfaces that is
 * invisible: the yard ruler's centre marker fills with the colour at 13%
 * opacity and outlines in it, and the selected yard number is set in it, so
 * against a black team colour the whole control goes dark and unreadable.
 * Navy, maroon and forest green are all far enough down to have the same
 * problem to a lesser degree.
 *
 * So identity and legibility are separated. The raw colour still paints
 * crests, chips and end zones, where it sits on its own ground and IS the
 * point. Anything that has to read against the app's dark surface — a border,
 * a label, a selected number — asks for the accent instead, which is the same
 * hue lifted to a lightness that can actually be seen.
 */

interface Hsl { h: number; s: number; l: number }

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, "");
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* The bar a colour has to clear, and where it lands if it does not.
 *
 * These are deliberately different numbers. A fully saturated hue sits at
 * exactly 0.5 lightness by definition — the app's own dragon red is 0.506 —
 * so a threshold anywhere near the target would "fix" colours that read
 * perfectly well and shift the palette of most of the league. 0.38 is below
 * every saturated mid-tone and above the navies, maroons and forest greens
 * that genuinely disappear. */
const TOO_DARK_BELOW = 0.38;
const LIFT_TO = 0.5;

/**
 * The same colour, lifted until it reads on a dark surface.
 *
 * Hue and saturation are kept, so a navy stays navy and a maroon stays
 * maroon — only the lightness moves, and only when it is genuinely too low to
 * see. A colour that already reads comes back untouched, which is most of them.
 *
 * Black and the near-greys have no hue to preserve and come back as a light
 * neutral, which is the honest answer: a black accent has to become something,
 * and grey reads as deliberate where a muddy near-black reads as a fault.
 */
export function readableAccent(color: string | null | undefined): string {
  const FALLBACK = "#9ca3af";
  if (!color) return FALLBACK;
  const rgb = parseHex(color);
  if (!rgb) return color; // Named colours and gradients pass through untouched.
  const hsl = rgbToHsl(rgb);
  if (hsl.l >= TOO_DARK_BELOW) return color;
  return hslToHex({ ...hsl, l: LIFT_TO });
}
