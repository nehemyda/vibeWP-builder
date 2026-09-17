/**
 * The design values a client can change by hand.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY MULTIPLIERS AND NOT SIZES
 *
 * The obvious design is one token per role — `--yp-heading-size` — set to an
 * absolute value. It renders identically while unset, so it looks safe. It is
 * not a token: it is 24 different values wearing one name.
 *
 * The eleven heroes carry eleven deliberately different display scales, from
 * clamp(2.8rem, 6vw, 4.7rem) down to clamp(2.1rem, 3.6vw, 3.1rem), and that
 * difference IS the difference between hero-banner and hero-glass. One
 * absolute size makes all eleven identical — not a control, a button that
 * deletes the distinction between eleven designs. The same is true of the
 * header brand at 1.15rem against the footer brand at 1.3rem, which a single
 * absolute value cannot express at all.
 *
 * So a shared token MULTIPLIES the design's own value:
 *
 *     font-size: calc(clamp(2.8rem, 6vw, 4.7rem) * var(--yp-display-scale, 1));
 *
 * Every literal stays where the designer put it, 62 designs keep their
 * proportions, and "bigger headings" still means one control. Unset is exactly
 * what the stylesheet rendered before — asserted, not assumed, by
 * lib/sections/verify-tokens.ts.
 *
 * Absolute tokens are kept only where the intended value genuinely IS global
 * and singular: the corner radius and the page width.
 * ─────────────────────────────────────────────────────────────────────
 */

export type TokenKind = "scale" | "px";

export type TokenSpec = {
  /** The CSS custom property, without the leading dashes. */
  name: string;
  label: string;
  hint?: string;
  kind: TokenKind;
  /** What the stylesheet does when this is unset. */
  unset: number;
  min: number;
  max: number;
  step: number;
  group: string;
};

/**
 * Ranges are deliberately narrow. A client cannot produce a page we have not
 * effectively seen: at the extremes every section still has to pass the same
 * overflow and legibility checks the defaults do.
 */
export const DESIGN_TOKENS: TokenSpec[] = [
  {
    name: "yp-display-scale",
    label: "Heading size",
    hint: "Scales every heading together, keeping each design's own proportions.",
    kind: "scale",
    unset: 1,
    min: 0.8,
    max: 1.3,
    step: 0.05,
    group: "Type",
  },
  {
    name: "yp-text-scale",
    label: "Body text size",
    hint: "Paragraphs, labels and small print.",
    kind: "scale",
    unset: 1,
    min: 0.85,
    max: 1.25,
    step: 0.05,
    group: "Type",
  },
  {
    name: "yp-space-scale",
    label: "Section spacing",
    hint: "How much air sits above and below each section.",
    kind: "scale",
    unset: 1,
    min: 0.6,
    max: 1.6,
    step: 0.05,
    group: "Layout",
  },
  {
    /*
     * Absolute, and it overrides the theme's own --radius rather than scaling
     * it: "rounded corners" is one decision for a whole site, and a 0px square
     * corner cannot be reached by multiplying 10px by anything sensible.
     */
    name: "radius",
    label: "Corner radius",
    kind: "px",
    unset: 10,
    min: 0,
    max: 24,
    step: 1,
    group: "Layout",
  },
  {
    name: "container",
    label: "Page width",
    hint: "How wide the content runs before it stops growing.",
    kind: "px",
    unset: 1160,
    min: 880,
    max: 1440,
    step: 20,
    group: "Layout",
  },
];

export type DesignTokens = Record<string, number>;

export const TOKEN_GROUPS = [...new Set(DESIGN_TOKENS.map((t) => t.group))];

const BY_NAME = new Map(DESIGN_TOKENS.map((t) => [t.name, t]));

/**
 * Drops anything unrecognised or out of range.
 *
 * These arrive from a browser and end up in a stylesheet, so they are checked
 * on the way in rather than trusted — the same reason writeThemePalette
 * re-validates hex it has already validated once.
 */
export function sanitiseTokens(input: unknown): DesignTokens {
  const out: DesignTokens = {};
  if (!input || typeof input !== "object") return out;
  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    const spec = BY_NAME.get(name);
    if (!spec) continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value < spec.min || value > spec.max) continue;
    // An explicit "same as the design" is stored as absent, so the stylesheet
    // keeps its own value rather than being pinned to today's default.
    if (value === spec.unset) continue;
    out[name] = value;
  }
  return out;
}

/** The declarations for a `:root` block, or "" when everything is at its default. */
export function tokensToCss(tokens: DesignTokens): string {
  const clean = sanitiseTokens(tokens);
  return Object.entries(clean)
    .map(([name, value]) => {
      const spec = BY_NAME.get(name)!;
      return `--${name}: ${spec.kind === "px" ? `${value}px` : value};`;
    })
    .join(" ");
}
