/**
 * Works out what a builder chat message is actually asking for.
 *
 * Before this existed the chat had exactly one behaviour — regenerate the
 * current page — so "create services page" silently destroyed the homepage
 * and reported success. Intent is decided here, deterministically, rather
 * than being left to the content model.
 */

export type ChatIntent =
  | { kind: "create_page"; slug: string; title: string }
  | { kind: "switch_page"; slug: string }
  | { kind: "edit_page" };

/** Reserved because they collide with the app's own routes or WP internals. */
const RESERVED_SLUGS = new Set(["wp-admin", "wp-content", "wp-includes", "feed", "admin"]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Common misspellings are folded in deliberately — "servies" was a real
 * user message, and failing to understand it caused data loss.
 */
const NORMALISE: Array<[RegExp, string]> = [
  [/\bservie?s\b/gi, "services"],
  [/\bservice\b/gi, "services"],
  [/\babout ?us\b/gi, "about"],
  [/\bcontact ?us\b/gi, "contact"],
  [/\bhome ?page\b/gi, "home"],
];

function normalise(text: string): string {
  let out = text;
  for (const [pattern, replacement] of NORMALISE) out = out.replace(pattern, replacement);
  return out;
}

const CREATE_PATTERNS: RegExp[] = [
  /\b(?:create|add|make|new|build|generate)\s+(?:an?\s+|the\s+)?["']?([a-z0-9][a-z0-9 \-]{0,50}?)["']?\s+page\b/i,
  /\b(?:create|add|make|new|build|generate)\s+(?:an?\s+|the\s+)?page\s+(?:called|named|for)\s+["']?([a-z0-9][a-z0-9 \-]{0,50})["']?/i,
];

const SWITCH_PATTERNS: RegExp[] = [
  /\b(?:go to|open|edit|switch to|show me)\s+(?:the\s+)?["']?([a-z0-9][a-z0-9 \-]{0,50}?)["']?\s+page\b/i,
];

export function detectIntent(message: string): ChatIntent {
  const text = normalise(message);

  for (const pattern of CREATE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const slug = slugify(match[1]);
      if (slug && !RESERVED_SLUGS.has(slug)) {
        return { kind: "create_page", slug, title: titleCase(slug) };
      }
    }
  }

  for (const pattern of SWITCH_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const slug = slugify(match[1]);
      if (slug && !RESERVED_SLUGS.has(slug)) return { kind: "switch_page", slug };
    }
  }

  return { kind: "edit_page" };
}
