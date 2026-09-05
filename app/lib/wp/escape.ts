/**
 * HTML escaping, in its own module so nothing has to import a cycle.
 *
 * blocks.ts renders copy through richtext.ts, and richtext.ts escapes through
 * these. Leaving them in blocks.ts would make the two files import each other
 * — which ESM tolerates but which is the sort of thing that breaks silently
 * years later when one of them grows a top-level side effect.
 */

export const esc = (s: unknown): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escAttr = (s: unknown): string => esc(s).replace(/"/g, "&quot;");
