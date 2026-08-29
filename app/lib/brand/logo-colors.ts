/**
 * Picking a brand colour out of a logo.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT JUST "THE MOST COMMON COLOUR"
 *
 * The most common pixel in a logo is almost always the background — white, or
 * transparent, or the near-black of the wordmark. Taking it literally gives
 * every client the same grey site. So near-white, near-black and unsaturated
 * pixels are excluded, and what is left is ranked.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE RESULT IS THEN ADJUSTED
 *
 * The accent is used as a button background with near-white text on it. A pale
 * yellow logo yields a pale yellow button whose label cannot be read. Extracting
 * faithfully and shipping an unreadable button is worse than not offering the
 * feature — so a colour that fails contrast is darkened until it passes, and the
 * caller is told that happened rather than it being done silently.
 *
 * Pure functions on ImageData: the pixels come from a canvas in the browser,
 * where the file already is, so nothing has to be uploaded to find out what
 * colour it is.
 */

export type LogoColor = {
  hex: string;
  /** Share of the considered pixels, 0–1. Used only for ordering. */
  weight: number;
};

export type LogoPalette = {
  /** Best candidate for the brand accent, already contrast-corrected. */
  primary: string;
  /** Other candidates worth offering, most prominent first. */
  candidates: LogoColor[];
  /** True when `primary` had to be darkened to stay legible on a button. */
  adjustedForContrast: boolean;
};

/** Text colour the theme puts on the accent — what contrast is measured against. */
const ON_PRIMARY = "#fafafa";

/** WCAG AA for large text / UI. Buttons are large bold text. */
const MIN_CONTRAST = 3.4;

export function extractPalette(pixels: ImageData): LogoPalette | null {
  const counts = new Map<string, { r: number; g: number; b: number; n: number }>();
  let considered = 0;

  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];

    // Transparent padding is not part of the logo.
    if (a < 200) continue;

    const { s, l } = hsl(r, g, b);
    /*
     * Skip the paper and the ink. A logo is mostly its background plus black
     * or white lettering; neither says anything about the brand's colour.
     */
    if (l > 0.93 || l < 0.08) continue;
    if (s < 0.18) continue;

    considered += 1;
    // Quantised to 24 levels per channel, so near-identical pixels from
    // anti-aliasing and JPEG noise collapse into one entry.
    const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
    const bucket = counts.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    } else {
      counts.set(key, { r, g, b, n: 1 });
    }
  }

  // A logo that is purely black on white has no brand colour to offer, and
  // inventing one would be worse than saying so.
  if (considered === 0 || counts.size === 0) return null;

  const ranked = [...counts.values()]
    .map((c) => ({
      hex: toHex(Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)),
      weight: c.n / considered,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const best = ranked[0].hex;
  const usable = ensureContrast(best);

  return {
    primary: usable,
    candidates: ranked,
    adjustedForContrast: usable.toLowerCase() !== best.toLowerCase(),
  };
}

/**
 * Darkens a colour until near-white text on it is legible.
 *
 * Lightness is reduced in small steps rather than the colour being replaced,
 * so the result is still recognisably the brand's hue — a client whose logo is
 * mustard gets a darker mustard, not an arbitrary brown.
 */
export function ensureContrast(hex: string): string {
  let current = hex;
  for (let i = 0; i < 40; i += 1) {
    if (contrastRatio(current, ON_PRIMARY) >= MIN_CONTRAST) return current;
    current = darken(current, 0.03);
  }
  return current;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = fromHex(hex);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function darken(hex: string, amount: number): string {
  const { r, g, b } = fromHex(hex);
  const f = Math.max(0, 1 - amount);
  return toHex(Math.round(r * f), Math.round(g * f), Math.round(b * f));
}

function hsl(r: number, g: number, b: number): { s: number; l: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { s: 0, l };
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  return { s, l };
}

export function fromHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
