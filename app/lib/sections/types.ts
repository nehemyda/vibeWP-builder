import type { HTMLElement } from "node-html-parser";

/**
 * What a section is, in one place.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Before this, adding a section meant editing thirteen files: the content
 * shape, the AI prompt, the Gutenberg serializer and its lookup map, the sync
 * parser, the preview extractor, seeds, and the builder itself. That cost is
 * paid again for every section, which is why the library never grew past one.
 *
 * A section now declares all of it here, and the rest of the app reads the
 * registry rather than naming sections directly. Adding one becomes: write a
 * module, add a line to index.ts, add its CSS block to the theme.
 * ─────────────────────────────────────────────────────────────────────
 *
 * WHAT STAYS IN CODE VS THE DATABASE
 *
 * Structure is code: fields, markup, parsing, CSS. Those need review, testing
 * and a matching stylesheet, so they ship with a deploy.
 *
 * Policy is data: whether a section is enabled, its category and order, its AI
 * prompt, its default content, which plans may use it. Those change often and
 * are editable in /admin/sections without a deploy. The DB row overlays this
 * definition — see lib/sections/resolve.ts.
 */

/**
 * How a field is edited and what the AI is told to produce.
 *
 * Two families, and the distinction matters:
 *
 *   CONTENT — text, richtext, image, link, list. Copy the model writes.
 *   OPTIONS — boolean, choice, number. Settings that change how a section is
 *             laid out. The model must NOT write these as prose; they are set
 *             by an edit instruction ("remove sticky", "four per row") or left
 *             at their default.
 *
 * Keeping them in one map means a section still declares everything about
 * itself in one place; keeping them distinguishable means the copy prompt can
 * exclude the settings, which is what stops a model returning
 * `columns: "four across, please"`.
 */
export type FieldType =
  | "text"
  | "richtext"
  | "image"
  | "link"
  /** A repeating group, e.g. three testimonials. `of` describes one entry. */
  | "list"
  | "boolean"
  | "choice"
  | "number";

/** True for the settings family — see the note on FieldType. */
export function isOptionField(spec: { type: FieldType }): boolean {
  return spec.type === "boolean" || spec.type === "choice" || spec.type === "number";
}

export type FieldSpec = {
  type: FieldType;
  label: string;
  /** Guidance for both the AI prompt and the admin form. */
  hint?: string;
  /**
   * Only for `list`: the shape of a single entry. Recursive, so an entry may
   * itself hold a list.
   *
   * It used to be `Omit<FieldSpec, "of">`, which made a nested list
   * undeclarable — so the five sections that have one declared it as `text`
   * instead. A price list's rows, an FAQ topic's questions and a footer
   * column's links were all described to the model, and to any code reading
   * the registry, as a string. The lie was invisible until a feature tried to
   * reshape one list into another and had nothing truthful to read.
   */
  of?: Record<string, FieldSpec>;
  /** Roughly how long the copy should be, so generated text fits the design. */
  maxChars?: number;
  /** Only for `choice`: the permitted values. */
  choices?: string[];
  /** Applied when a section is added without the option being specified. */
  default?: string | number | boolean;
  /** Only for `number`. */
  min?: number;
  max?: number;
};

export type SectionCategory =
  | "Header"
  | "Hero"
  | "Content"
  | "Social proof"
  | "Conversion"
  | "Support"
  | "Contact"
  | "Footer";

/**
 * Where a section belongs in the site.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY HEADERS AND FOOTERS CANNOT BE PAGE SECTIONS
 *
 * The theme is a WordPress BLOCK theme: parts/header.html and
 * parts/footer.html are block markup, and every template pulls them in with
 * `wp:template-part`. That is what makes a header appear once, site-wide, and
 * stay consistent across pages.
 *
 * Emitting a header into a page's content instead would put a second navigation
 * bar in the middle of the page, below the real one, on every page it was added
 * to — and editing it would mean editing every page. So placement is declared
 * here, and schemaToGutenberg() refuses to write anything but "page" sections
 * into page content.
 * ─────────────────────────────────────────────────────────────────────
 */
export type SectionPlacement = "page" | "header" | "footer";

export type SectionDefinition<P = Record<string, unknown>> = {
  /** Stable identifier. Also the `sections.key` used by the admin row. */
  key: string;
  /**
   * The node `type` written into page schemas, e.g. "HeroSplit".
   *
   * Separate from `key` and permanent: it is embedded in every stored page, so
   * renaming it would orphan existing content. `key` is for humans and URLs.
   */
  nodeType: string;
  name: string;
  category: SectionCategory;
  /**
   * Defaults to "page". Header/footer sections are written to the theme's
   * template parts on export, never into page content — see SectionPlacement.
   */
  placement?: SectionPlacement;
  /** Shown in the library so someone can tell sections apart. */
  description: string;

  fields: Record<string, FieldSpec>;

  /**
   * Appended to the generation prompt. Describes the section's job, not its
   * fields — those are derived from `fields` so the two can't drift.
   */
  aiPrompt: string;

  /** Realistic content, used for library previews and as a generation fallback. */
  sample: P;

  /** Serializes props to Gutenberg block markup. */
  toGutenberg: (props: P) => string;

  /**
   * Reads props back out of markup, for WordPress→VibeWP sync. Returns null
   * when this section isn't present in the given element.
   *
   * Optional: a section without a parser still exports fine, it just cannot
   * receive edits made in wp-admin. Sync reports it as unmodelled rather than
   * silently dropping the change.
   */
  fromGutenberg?: (root: HTMLElement) => P | null;

  /**
   * The root CSS class, e.g. "yp-hero". Used to find this section's markup
   * when parsing, and to check the theme actually styles it.
   */
  rootClass: string;
};

/** Narrowed to unknown props so a heterogeneous registry can be typed. */
export type AnySectionDefinition = SectionDefinition<Record<string, never>> extends never
  ? never
  : SectionDefinition<never>;
