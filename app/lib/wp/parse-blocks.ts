import { parse, type HTMLElement } from "node-html-parser";

/**
 * The inverse of schemaToGutenberg: reads block markup back into a page schema.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY PARSE AT ALL, RATHER THAN COMPARE MARKUP
 *
 * WordPress re-serializes a page whenever it is saved in the block editor, and
 * its output differs from ours even when the content is byte-for-byte the same
 * to a reader:
 *
 *   ours: {"className":"yp-btn--primary"}
 *   wp:   {"className":"yp-btn--primary"}
 *
 * It also inserts blank lines between blocks and, in practice, leaves stray
 * empty paragraphs behind. Comparing raw markup would therefore report a
 * conflict on every page the client has ever opened in wp-admin, whether or not
 * they changed a word.
 *
 * So sync compares SCHEMAS. This function is what makes that possible: it reads
 * the parts we model and ignores WordPress's formatting entirely.
 * ─────────────────────────────────────────────────────────────────────
 *
 * WHAT IS DELIBERATELY NOT MODELLED
 *
 * Only what the schema can represent round-trips. A client who adds a
 * Testimonial block in wp-admin has made a change this cannot express, and
 * pulling would silently drop it. detectUnmodelledBlocks() exists so callers
 * can warn instead of destroying that work.
 */

export type ParsedHero = {
  eyebrow: string;
  heading: string;
  body: string;
  features: string[];
  actions: Array<{ label: string; href: string; variant: "primary" | "outline" | "ghost" }>;
  image: { url: string; alt: string; id?: number; width?: number; height?: number } | null;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

function parseImage(root: HTMLElement): ParsedHero["image"] {
  const img = root.querySelector(".yp-hero__frame img");
  const url = img?.getAttribute("src")?.trim();
  if (!img || !url) return null;

  // `wp-image-<id>` is how WordPress links an <img> to its attachment, and it
  // survives editor saves more reliably than the block-attribute JSON.
  const idMatch = img.getAttribute("class")?.match(/wp-image-(\d+)/);
  const width = Number(img.getAttribute("width"));
  const height = Number(img.getAttribute("height"));

  return {
    url,
    alt: img.getAttribute("alt")?.trim() ?? "",
    ...(idMatch ? { id: Number(idMatch[1]) } : {}),
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
  };
}

function parseActions(root: HTMLElement): ParsedHero["actions"] {
  const out: ParsedHero["actions"] = [];
  for (const btn of root.querySelectorAll(".wp-block-button")) {
    const anchor = btn.querySelector("a");
    const label = text(anchor);
    if (!label) continue;

    const cls = btn.getAttribute("class") ?? "";
    const variant = cls.includes("yp-btn--outline")
      ? "outline"
      : cls.includes("yp-btn--ghost")
        ? "ghost"
        : "primary";

    out.push({ label, href: anchor?.getAttribute("href")?.trim() || "#", variant });
  }
  return out;
}

/** Returns null when the markup contains no hero we can read. */
export function parseHero(html: string): ParsedHero | null {
  const root = parse(html);
  const hero = root.querySelector(".yp-hero");
  if (!hero) return null;

  return {
    eyebrow: text(hero.querySelector(".yp-hero__eyebrow")),
    heading: text(hero.querySelector(".yp-hero__heading")),
    body: text(hero.querySelector(".yp-hero__body")),
    features: hero
      .querySelectorAll(".yp-hero__features li")
      .map((li) => li.textContent.trim())
      .filter(Boolean),
    actions: parseActions(hero),
    image: parseImage(hero),
  };
}

/**
 * Rebuilds a page schema from block markup, in the same shape
 * heroContentToSchema() produces so the two are directly comparable.
 */
export function gutenbergToSchema(html: string): Record<string, unknown> | null {
  const hero = parseHero(html);
  if (!hero) return null;

  return {
    schemaVersion: "1.0",
    nodes: [
      {
        id: "n_hero",
        kind: "react",
        type: "HeroSplit",
        props: {
          eyebrow: hero.eyebrow,
          heading: hero.heading,
          body: hero.body,
          ...(hero.features.length ? { features: hero.features } : {}),
          actions: hero.actions,
          ...(hero.image ? { image: hero.image } : {}),
        },
      },
    ],
  };
}

/**
 * Block types present in the markup that the schema cannot represent.
 *
 * Empty paragraphs are excluded on purpose: the editor leaves them behind
 * routinely, and treating them as content would flag a change on pages nobody
 * meaningfully edited.
 */
export function detectUnmodelledBlocks(html: string): string[] {
  const KNOWN = new Set(["group", "heading", "paragraph", "buttons", "button", "image", "list", "list-item"]);
  const found = new Set<string>();

  for (const m of html.matchAll(/<!--\s*wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)/gi)) {
    const name = m[1].toLowerCase().replace(/^core\//, "");
    if (!KNOWN.has(name)) found.add(name);
  }

  // A paragraph outside the hero that actually carries text is content we would
  // lose, even though "paragraph" itself is a type we understand.
  const root = parse(html);
  const strays = root
    .querySelectorAll("p")
    .filter((p) => p.textContent.trim().length > 0)
    .filter((p) => !p.closest(".yp-hero"));
  if (strays.length) found.add(`paragraph (${strays.length} outside the hero)`);

  return [...found];
}
