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
  /**
   * Build this page again from scratch.
   *
   * "Delete the quote page and recreate it" is a request to start that page
   * over, not two operations. Regenerating gives the same outcome without
   * destroying anything — and "recreate" did not even match the create
   * patterns, because \bcreate finds no word boundary inside it.
   */
  | { kind: "rebuild_page"; slug: string }
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
  /*
   * EXPANDS, never collapses.
   *
   * This was `home page -> home`, which stripped the word every pattern here
   * depends on: "go to the home page" became "go to the home" and matched
   * nothing — the exact phrase the assistant tells people to use. Normalising
   * the one-word spelling into the two-word one leaves the keyword intact.
   */
  [/\bhomepage\b/gi, "home page"],
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

const REBUILD_PATTERNS: RegExp[] = [
  /\b(?:recreate|re-create|rebuild|regenerate|redo|start over on|remake)\s+(?:the\s+)?["']?([a-z0-9][a-z0-9 \-]{0,50}?)["']?\s+page\b/i,
  /\bdelete\s+(?:the\s+)?["']?([a-z0-9][a-z0-9 \-]{0,50}?)["']?\s+page\s+and\s+(?:re)?(?:create|build|make)\b/i,
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

  /*
   * Checked BEFORE create, because "delete the X page and recreate it" contains
   * both and means the rebuild. Checked before switch for the same reason.
   */
  for (const pattern of REBUILD_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const slug = slugify(match[1]);
      if (slug && !RESERVED_SLUGS.has(slug)) return { kind: "rebuild_page", slug };
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
