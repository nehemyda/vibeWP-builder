/* ============================================================
   Core Gutenberg block emitters.

   Shared by every section's export.ts. These produce the exact
   markup WordPress's own save() functions produce, including the
   classes WordPress adds (wp-block-group, wp-block-heading, …).

   All of these are STATIC core blocks: the saved markup IS the
   frontend HTML, so stripping the delimiters reproduces what
   WordPress serves. Nothing here needs PHP to render.
   ============================================================ */

export const esc = (s: unknown): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const escAttr = (s: unknown): string => esc(s).replace(/"/g, "&quot;");

export type ButtonVariant = "primary" | "outline" | "ghost";

export interface Action {
  label: string;
  href: string;
  variant: ButtonVariant;
}

/** core/group — the workhorse container. */
export function group(
  className: string,
  inner: string,
  tagName: "div" | "section" | "header" | "footer" | "aside" = "div"
): string {
  const attrs: Record<string, unknown> = {};
  if (tagName !== "div") attrs.tagName = tagName;
  attrs.className = className;

  return `<!-- wp:group ${JSON.stringify(attrs)} -->
<${tagName} class="wp-block-group ${className}">${inner}</${tagName}>
<!-- /wp:group -->`;
}

/** core/paragraph */
export function paragraph(text: string, className?: string): string {
  const attrs = className ? ` {"className":"${className}"}` : "";
  const cls = className ? ` class="${className}"` : "";
  return `<!-- wp:paragraph${attrs} -->
<p${cls}>${esc(text)}</p>
<!-- /wp:paragraph -->`;
}

/** core/heading */
export function heading(text: string, level: 1 | 2 | 3 | 4 | 5 | 6, className: string): string {
  return `<!-- wp:heading {"level":${level},"className":"${className}"} -->
<h${level} class="wp-block-heading ${className}">${esc(text)}</h${level}>
<!-- /wp:heading -->`;
}

/** core/list + core/list-item */
export function list(items: string[], className: string): string {
  const inner = items
    .map((i) => `<!-- wp:list-item --><li>${esc(i)}</li><!-- /wp:list-item -->`)
    .join("");
  return `<!-- wp:list {"className":"${className}"} -->
<ul class="wp-block-list ${className}">${inner}</ul>
<!-- /wp:list -->`;
}

/** core/image */
export function image(src: string, alt: string, className: string): string {
  return `<!-- wp:image {"className":"${className}"} -->
<figure class="wp-block-image ${className}"><img src="${escAttr(src)}" alt="${escAttr(alt)}"/></figure>
<!-- /wp:image -->`;
}

/**
 * core/buttons + core/button
 *
 * NOTE: WordPress puts its own classes on the <a> and only lets a block
 * author name the wrapping <div>. Style the anchor by position
 * (`.yp-btn--primary a`), never by a class you expect to be on it.
 */
export function buttons(actions: Action[], className: string): string {
  const inner = actions
    .map(
      (a) => `<!-- wp:button {"className":"yp-btn--${a.variant}"} -->
<div class="wp-block-button yp-btn--${a.variant}"><a class="wp-block-button__link wp-element-button" href="${escAttr(a.href)}">${esc(a.label)}</a></div>
<!-- /wp:button -->`
    )
    .join("");
  return `<!-- wp:buttons {"className":"${className}"} -->
<div class="wp-block-buttons ${className}">${inner}</div>
<!-- /wp:buttons -->`;
}

/**
 * WordPress serves static core blocks by emitting the saved markup with
 * the block delimiters removed. This reproduces that step, which is what
 * the fidelity test renders.
 */
export const renderLikeWordPress = (blockMarkup: string): string =>
  blockMarkup.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "");
