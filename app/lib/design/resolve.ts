import { sanitiseTokens, type DesignTokens } from "./tokens";

/**
 * The design values a page actually renders with.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE LAYERS, AND WHY THE MERGE IS KEY BY KEY
 *
 *   the stylesheet   what a token does when unset — the designer's own value
 *   ← the platform   platform_settings.design_tokens, set at /admin/design
 *   ← the site       sites.design_tokens, set in the builder's style panel
 *
 * Merged per key rather than per object. A site that has only ever changed
 * heading size must still follow the platform's spacing: replacing the whole
 * object would freeze that site at whatever the defaults happened to be the
 * day someone first touched a slider, and the freeze would be invisible —
 * the site would simply stop responding to platform changes, with nothing
 * recorded to say why.
 *
 * Both sides are sanitised, so a value stored while a range was wider cannot
 * reach a stylesheet now that the range is narrower — from either layer.
 *
 * WHY EVERY SURFACE CALLS THIS AND NOT THE COLUMNS
 *
 * The canvas, the published Vibe page and the theme.json written on export all
 * have to agree. WordPress receives the RESOLVED answer: it has no notion of a
 * platform layer and needs none, which is only true if the arithmetic happens
 * before the values leave us.
 * ─────────────────────────────────────────────────────────────────────
 */
export function resolveTokens(platform: unknown, site: unknown): DesignTokens {
  return { ...sanitiseTokens(platform), ...sanitiseTokens(site) };
}
