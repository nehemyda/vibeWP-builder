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
  /**
   * Read the client's EXISTING website to fill in their details.
   *
   * A verb plus a link, never a bare link. "Add a map, use this link:
   * https://…" contains a URL and is an edit — it was sent to this builder in
   * testing and would have rebuilt the homepage under a looser rule. So the
   * verb has to say the site is theirs and the ask is to read it.
   */
  | { kind: "import_site"; url: string }
  | { kind: "edit_page" };

/** Reserved because they collide with the app's own routes or WP internals. */
const RESERVED_SLUGS = new Set(["wp-admin", "wp-content", "wp-includes", "feed", "admin"]);

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  /* Folded here so create, rebuild and switch all agree on which page a
     name means, without three copies of the decision. */
  return NAME_ALIASES[slug] ?? slug;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Spellings folded onto one page, applied to the NAME and not the sentence.
 *
 * These used to be message-wide substitutions, which meant they rewrote any
 * sentence that merely contained the word. "build a terms of service page"
 * became "terms of serviceS" — a real page for a real business, named wrong,
 * because a rule about what to call the services page reached into a name it
 * had no business touching.
 *
 * Matching the whole slug is what keeps it contained: "service" IS this page,
 * "terms-of-service" merely ends with it.
 *
 * "servies" was a real user message, and failing to understand it caused data
 * loss, which is why the misspelling is kept rather than tidied away.
 */
const NAME_ALIASES: Record<string, string> = {
  servies: "services",
  servis: "services",
  service: "services",
  "about-us": "about",
  "contact-us": "contact",
};

const NORMALISE: Array<[RegExp, string]> = [
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

/**
 * A page's NAME, as it appears between the verb and the word "page".
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS WORDS AND NOT A RUN OF CHARACTERS
 *
 * It used to be `([a-z0-9][a-z0-9 \-]{0,50}?)` — a lazy run that ALLOWED
 * SPACES. Lazy only means it stops at the first "page" it can reach, and
 * since the class matched spaces, it would cross an entire clause to get
 * there. So:
 *
 *   "Add a section near the bottom of the page with a Google map"
 *          └──────── captured as the name ────────┘
 *
 * created a page called "Section Near The Bottom Of The". A request to edit
 * the page you are looking at silently became a new page in the site menu —
 * and the same shape of mistake, in this same function, is what the header
 * above records as having caused data loss once already.
 *
 * A name is one to four ordinary words. Anything longer is a sentence that
 * merely happens to contain "page", and the right reading of those is an
 * edit.
 * ─────────────────────────────────────────────────────────────────────
 */
const NAME = String.raw`([a-z0-9][a-z0-9-]*(?:\s+[a-z0-9-]+){0,3})`;

const VERB = String.raw`(?:create|add|make|new|build|generate)`;

const CREATE_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b${VERB}\s+(?:an?\s+|the\s+)?["']?${NAME}["']?\s+page\b`, "i"),
  new RegExp(
    String.raw`\b${VERB}\s+(?:an?\s+|the\s+)?page\s+(?:called|named|for)\s+["']?${NAME}["']?`,
    "i",
  ),
];

const REBUILD_PATTERNS: RegExp[] = [
  new RegExp(
    String.raw`\b(?:recreate|re-create|rebuild|regenerate|redo|start over on|remake)\s+(?:the\s+)?["']?${NAME}["']?\s+page\b`,
    "i",
  ),
  new RegExp(
    String.raw`\bdelete\s+(?:the\s+)?["']?${NAME}["']?\s+page\s+and\s+(?:re)?(?:create|build|make)\b`,
    "i",
  ),
];

/**
 * A web address, as typed. http(s)://, www., or a bare domain with a real
 * TLD — two letters or more, so "e.g." and "i.e." do not qualify.
 */
const URL_RE = String.raw`((?:https?:\/\/|www\.)[^\s"'<>]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s"'<>]*)?)`;

/**
 * Only phrasings that say "this is MY site — read it". Each anchors the URL
 * to a verb about importing or building FROM, so a link that is merely the
 * object of an edit ("use this link", "link the button to", "embed") never
 * matches: none of those name the site as the client's own.
 */
const IMPORT_PATTERNS: RegExp[] = [
  // build/make/create/start (my|our) (new)? site|website from|using|based on <url>
  new RegExp(
    String.raw`\b(?:build|make|create|start|set up)\s+(?:my|our|the|this)?\s*(?:new\s+)?(?:site|website)\s+(?:from|using|based on|off)\s+${URL_RE}`,
    "i",
  ),
  // import|read (my|our) (existing|current)? site|website|details|info (from)? <url>
  new RegExp(
    String.raw`\b(?:import|read|pull|grab|fetch)\s+(?:my|our|the|this)?\s*(?:existing|current|old)?\s*(?:site|website|details|info|information|business details)?\s*(?:from\s+)?${URL_RE}`,
    "i",
  ),
  // here's|here is|this is (my|our) (current|existing|old)? site|website[:] <url>
  new RegExp(
    String.raw`\b(?:here(?:'s| is)|this is)\s+(?:my|our)\s+(?:current|existing|old)?\s*(?:site|website)\s*[:\-—]?\s*${URL_RE}`,
    "i",
  ),
  // use <url> as (a|my|our|the)? reference|starting point|template
  new RegExp(String.raw`\buse\s+${URL_RE}\s+as\s+(?:a\s+|my\s+|our\s+|the\s+)?(?:reference|starting point|template|basis)\b`, "i"),
];

const SWITCH_PATTERNS: RegExp[] = [
  new RegExp(
    String.raw`\b(?:go to|open|edit|switch to|show me)\s+(?:the\s+)?["']?${NAME}["']?\s+page\b`,
    "i",
  ),
];

/**
 * Words that mean the capture is a phrase POINTING AT a page, not naming one.
 *
 * "add a map to the page" is four words and passes the length rule, but "to
 * the page" is a destination — the page already exists and is being edited.
 * Articles and positional prepositions are what distinguish the two.
 *
 * "of" and "and" are deliberately absent: "terms of service" and "terms and
 * conditions" are real page names, and blocking them to catch a phrase the
 * length rule already catches would trade a common right answer for a rare
 * one.
 */
const NOT_IN_A_NAME = new Set([
  "the", "a", "an", "this", "that", "these", "those",
  "to", "into", "in", "on", "at", "near", "above", "below",
  "under", "over", "beside", "between", "before", "after",
  "with", "from",
]);

/** Whether a captured phrase can be read as the name of a page. */
function isPageName(phrase: string): boolean {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  return !words.some((word) => NOT_IN_A_NAME.has(word));
}

export function detectIntent(message: string): ChatIntent {
  const text = normalise(message);

  /*
   * First, because it is the most specific — it requires a URL — and because
   * "build my site from …" contains "build", which the create patterns would
   * otherwise get a look at. Nothing here can fire on a bare link: every
   * pattern needs a verb naming the site as the client's own.
   */
  for (const pattern of IMPORT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const url = match[1].replace(/[.,;:!?)]+$/, ""); // trailing punctuation from the sentence
      return { kind: "import_site", url };
    }
  }

  for (const pattern of CREATE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && isPageName(match[1])) {
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
    if (match?.[1] && isPageName(match[1])) {
      const slug = slugify(match[1]);
      if (slug && !RESERVED_SLUGS.has(slug)) return { kind: "rebuild_page", slug };
    }
  }

  for (const pattern of SWITCH_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && isPageName(match[1])) {
      const slug = slugify(match[1]);
      if (slug && !RESERVED_SLUGS.has(slug)) return { kind: "switch_page", slug };
    }
  }

  return { kind: "edit_page" };
}
