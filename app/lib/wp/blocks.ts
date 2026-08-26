/**
 * Turns a stored page schema into Gutenberg block markup.
 *
 * THE CONTRACT: every class emitted here is identical to the one the vibewp
 * theme's sections.css styles. That parity is the whole reason an exported
 * page looks like the builder preview — the layout lives in the stylesheet,
 * and Gutenberg only carries the content.
 *
 * These are all STATIC core blocks: the saved markup IS the front-end HTML,
 * so nothing here needs PHP to render, and the page stays fully editable in
 * the WordPress block editor.
 *
 * Ported from assets/ai-builder/packages/renderer/src/gutenberg, which the
 * app had never imported.
 */

export const esc = (s: unknown): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escAttr = (s: unknown): string => esc(s).replace(/"/g, "&quot;");

export type ButtonVariant = "primary" | "outline" | "ghost";

export interface Action {
  label: string;
  href: string;
  variant: ButtonVariant;
}

export function group(
  className: string,
  inner: string,
  tagName: "div" | "section" | "header" | "footer" | "aside" = "div",
): string {
  const attrs: Record<string, unknown> = {};
  if (tagName !== "div") attrs.tagName = tagName;
  attrs.className = className;

  return `<!-- wp:group ${JSON.stringify(attrs)} -->
<${tagName} class="wp-block-group ${className}">${inner}</${tagName}>
<!-- /wp:group -->`;
}

export function paragraph(text: string, className?: string): string {
  const attrs = className ? ` {"className":"${className}"}` : "";
  const cls = className ? ` class="${className}"` : "";
  return `<!-- wp:paragraph${attrs} -->
<p${cls}>${esc(text)}</p>
<!-- /wp:paragraph -->`;
}

export function heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6, className: string): string {
  return `<!-- wp:heading {"level":${level},"className":"${className}"} -->
<h${level} class="wp-block-heading ${className}">${esc(text)}</h${level}>
<!-- /wp:heading -->`;
}

export function list(items: string[], className: string): string {
  const inner = items
    .map((i) => `<!-- wp:list-item --><li>${esc(i)}</li><!-- /wp:list-item -->`)
    .join("");
  return `<!-- wp:list {"className":"${className}"} -->
<ul class="wp-block-list ${className}">${inner}</ul>
<!-- /wp:list -->`;
}

export function image(src: string, alt: string, className: string): string {
  return `<!-- wp:image {"className":"${className}"} -->
<figure class="wp-block-image ${className}"><img src="${escAttr(src)}" alt="${escAttr(alt)}"/></figure>
<!-- /wp:image -->`;
}

/**
 * WordPress puts its own classes on the <a> and only lets a block author
 * name the wrapping <div>, so the theme styles the anchor by position
 * (`.yp-btn--primary a`) rather than by a class on the anchor itself.
 */
export function buttons(actions: Action[], className: string): string {
  const inner = actions
    .map(
      (a) => `<!-- wp:button {"className":"yp-btn--${a.variant}"} -->
<div class="wp-block-button yp-btn--${a.variant}"><a class="wp-block-button__link wp-element-button" href="${escAttr(a.href)}">${esc(a.label)}</a></div>
<!-- /wp:button -->`,
    )
    .join("");
  return `<!-- wp:buttons {"className":"${className}"} -->
<div class="wp-block-buttons ${className}">${inner}</div>
<!-- /wp:buttons -->`;
}

/* ── section serializers ─────────────────────────────────────────────── */

type HeroProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  features?: string[];
  actions?: Action[];
};

function heroSplitToGutenberg(p: HeroProps): string {
  const copy = group(
    "yp-hero__copy",
    [
      p.eyebrow ? paragraph(p.eyebrow, "yp-hero__eyebrow") : "",
      p.heading ? heading(p.heading, 1, "yp-hero__heading") : "",
      p.body ? paragraph(p.body, "yp-hero__body") : "",
      p.features?.length ? list(p.features, "yp-hero__features") : "",
      p.actions?.length ? buttons(p.actions, "yp-hero__actions") : "",
    ]
      .filter(Boolean)
      .join(""),
  );

  return group("yp-hero", group("yp-hero__grid", copy), "section");
}

type SchemaNode = { type?: string; props?: Record<string, unknown> };
type PageSchema = { nodes?: SchemaNode[] };

/** Serializers keyed by the node `type` stored in the page schema. */
const SERIALIZERS: Record<string, (props: never) => string> = {
  HeroSplit: heroSplitToGutenberg as (props: never) => string,
};

/**
 * Serializes a whole page. Unknown node types are skipped rather than
 * throwing — a page containing one unrecognised section should still
 * export the sections we do understand.
 */
export function schemaToGutenberg(schema: unknown): string {
  const nodes = (schema as PageSchema)?.nodes;
  if (!Array.isArray(nodes)) return "";

  return nodes
    .map((node) => {
      const serialize = node?.type ? SERIALIZERS[node.type] : undefined;
      if (!serialize) return "";
      return serialize((node.props ?? {}) as never);
    })
    .filter(Boolean)
    .join("\n\n");
}
