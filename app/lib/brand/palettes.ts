/**
 * Brand palettes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY PRESETS AND NOT FOUR RAW COLOUR PICKERS
 *
 * A client picking four arbitrary colours reliably produces a worse site than a
 * designed pair does — the failure is never the hue, it is contrast and the
 * relationship between ink, surface and accent. So the choice offered is
 * between four finished palettes, with the accent editable for anyone who has a
 * brand colour they must match. The structural colours stay ours.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS ALMOST FREE
 *
 * theme.json already defines these eight slugs, and every rule in sections.css
 * reads them:
 *
 *     --primary: var(--wp--preset--color--primary, #f54900);
 *
 * So writing a palette into theme.json on export restyles all 56 sections at
 * once, with no per-section work and nothing to keep in sync. The token layer
 * was built for this; this is the first thing to use it.
 */

export type PaletteColors = {
  primary: string;
  "primary-fg": string;
  ink: string;
  "ink-2": string;
  muted: string;
  surface: string;
  "surface-2": string;
  line: string;
};

export type Palette = {
  key: string;
  name: string;
  /** Shown under the swatch so the choice reads as a decision, not a colour. */
  description: string;
  colors: PaletteColors;
};

/** Structural colours every palette shares. Only the accent really varies. */
const NEUTRAL = {
  "primary-fg": "#fafafa",
  ink: "#131922",
  "ink-2": "#4e5661",
  muted: "#757b83",
  surface: "#ffffff",
  "surface-2": "#f4f6f8",
  line: "#dbdee3",
} as const;

export const PALETTES: Palette[] = [
  {
    key: "ember",
    name: "Ember",
    description: "Warm orange. Confident and energetic — trades, food, fitness.",
    colors: { primary: "#f54900", ...NEUTRAL },
  },
  {
    key: "harbour",
    name: "Harbour",
    description: "Deep blue. Calm and dependable — professional and medical services.",
    colors: { primary: "#1d4ed8", ...NEUTRAL },
  },
  {
    key: "forest",
    name: "Forest",
    description: "Green. Natural and grounded — garden, wellbeing, sustainability.",
    colors: { primary: "#116b4e", ...NEUTRAL },
  },
  {
    key: "plum",
    name: "Plum",
    description: "Rich purple. Considered and premium — salons, studios, boutiques.",
    colors: { primary: "#6d28d9", ...NEUTRAL },
  },
];

export const DEFAULT_PALETTE_KEY = "ember";

export function paletteByKey(key: string | null | undefined): Palette {
  return PALETTES.find((p) => p.key === key) ?? PALETTES[0];
}

/**
 * The colours a site should actually use.
 *
 * Stored colours win over the preset, because a site keeps the palette it was
 * built with: editing a preset here must never restyle work a client has
 * already approved. The preset is only the starting point.
 */
export function resolveBrandColors(
  paletteKey: string | null | undefined,
  stored: unknown,
): PaletteColors {
  const base = paletteByKey(paletteKey).colors;
  if (!stored || typeof stored !== "object") return base;

  const overrides = stored as Partial<PaletteColors>;
  const out = { ...base };
  for (const slug of Object.keys(base) as Array<keyof PaletteColors>) {
    const value = overrides[slug];
    if (typeof value === "string" && isHexColor(value)) out[slug] = value;
  }
  return out;
}

/**
 * Only #rgb and #rrggbb are accepted.
 *
 * These values are written into theme.json and served as CSS to every visitor,
 * so an unvalidated string here would be an injection point, not just a
 * rendering bug.
 */
export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
