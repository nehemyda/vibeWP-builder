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

/**
 * Returns the first non-empty candidate. Alt text is mandatory — for screen
 * readers, and because an image with no alt is dead weight for SEO — so this
 * exists to make "no alt" unrepresentable rather than merely discouraged.
 *
 * The chain runs specific → generic: the stock photo's own description, then
 * the search terms, then the page heading. The final literal should be
 * unreachable in practice; it's here so the return type can be `string` and
 * callers never have to handle an empty case.
 */
export function requireAlt(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return "Photograph of this business";
}

/**
 * @param meta Attachment id and dimensions, known only after the file has been
 *             sideloaded. The id makes the block a first-class media-library
 *             image so the client can swap it in wp-admin; width/height let the
 *             browser reserve space before the image loads, which is what
 *             keeps Cumulative Layout Shift at zero.
 */
export function image(
  src: string,
  alt: string,
  className: string,
  meta?: {
    id?: number;
    width?: number;
    height?: number;
    lightbox?: boolean;
    /** Set for images inside a gallery — how core groups them. */
    inGallery?: boolean;
  },
  /** Rendered as the block's own figcaption, which is where core keeps it. */
  caption?: string,
): string {
  // Last line of defence: whatever the caller passed, an empty alt cannot ship.
  const safeAlt = requireAlt(alt);

  const attrs: Record<string, unknown> = { className };
  if (caption) attrs.caption = caption;
  /*
   * WordPress's own image lightbox (core, since 6.4, via the Interactivity
   * API). Deliberately not a custom script: core already ships the markup,
   * the styles, focus trapping and Escape handling, and a hand-rolled version
   * would be one more thing on a client's site to keep working.
   *
   * It does nothing in the builder canvas — that iframe has no WordPress and
   * so no Interactivity API. Same as the sticky header: correct on the
   * exported site, not demonstrable in the preview.
   */
  if (meta?.lightbox) attrs.lightbox = { enabled: true };
  // Core reads this to decide the image belongs to a gallery.
  if (meta?.inGallery && meta?.id) attrs["data-id"] = String(meta.id);
  if (meta?.id) {
    attrs.id = meta.id;
    attrs.sizeSlug = "large";
  }

  const figureClass = meta?.id
    ? `wp-block-image size-large ${className}`
    : `wp-block-image ${className}`;
  const imgClass = meta?.id ? ` class="wp-image-${meta.id}"` : "";
  const dataId = meta?.inGallery && meta?.id ? ` data-id="${meta.id}"` : "";
  const width = meta?.width ? ` width="${meta.width}"` : "";
  const height = meta?.height ? ` height="${meta.height}"` : "";

  return `<!-- wp:image ${JSON.stringify(attrs)} -->
<figure class="${figureClass}"><img src="${escAttr(src)}" alt="${escAttr(safeAlt)}"${imgClass}${dataId}${width}${height}/>${
    caption ? `<figcaption class="wp-element-caption">${esc(caption)}</figcaption>` : ""
  }</figure>
<!-- /wp:image -->`;
}


/**
 * WordPress's dynamic blocks: rendered by PHP at request time, no inner HTML.
 *
 * Used by header and footer sections so the brand follows Settings → General
 * and the menu follows whatever the client edits under Appearance → Menus.
 * Baking those in as static text would fork them from the real site the moment
 * anyone renamed the business.
 *
 * They render as nothing in the preview iframe, which has no PHP — see
 * withPreviewPlaceholders() in serialize.ts.
 */
export function siteTitle(className: string): string {
  return `<!-- wp:site-title {"level":0,"className":"${className}"} /-->`;
}

export function navigation(className: string): string {
  /*
   * overlayMenu: "mobile" is set EXPLICITLY.
   *
   * Core's navigation block already ships a hamburger and a full-screen
   * overlay; it was left unset, so every site got whatever core's default
   * happened to be rather than a decision. "mobile" means: inline links on a
   * desktop, hamburger below core's breakpoint.
   *
   * `icon` and `openSubmenusOnClick` are left alone deliberately — core's
   * defaults are sensible and naming them here would freeze them against
   * future WordPress versions.
   */
  const attrs = JSON.stringify({
    className,
    overlayMenu: "mobile",
    layout: { type: "flex" },
  });
  return `<!-- wp:navigation ${attrs} /-->`;
}

export function socialLinks(className: string): string {
  return `<!-- wp:social-links {"className":"${className}"} /-->`;
}

/**
 * Turns a phone number or email into a usable href.
 *
 * Contact details rendered as plain text are a small but real failure: on a
 * phone, a number you cannot tap is a number the customer has to memorise and
 * retype. `tel:` strips everything a dialler cannot use — spaces, brackets,
 * dashes — while the visible text keeps its human formatting.
 */
export function contactHref(kind: "phone" | "email", value: string): string {
  const v = value.trim();
  if (kind === "email") return `mailto:${v}`;
  return `tel:${v.replace(/[^\d+]/g, "")}`;
}

/** A paragraph whose whole content is one link. */
export function paragraphLink(label: string, href: string, className: string): string {
  return `<!-- wp:paragraph {"className":"${className}"} -->
<p class="${className}"><a href="${escAttr(href)}">${esc(label)}</a></p>
<!-- /wp:paragraph -->`;
}

/**
 * A testimonial, as a real blockquote.
 *
 * core/quote rather than a styled group: a customer quote IS a quotation, so
 * the semantic element is worth having for screen readers and search engines,
 * and the client can edit it in wp-admin as a normal quote block.
 */
export function quote(text: string, attribution: string, className: string): string {
  const cite = attribution ? `<cite>${esc(attribution)}</cite>` : "";
  return `<!-- wp:quote {"className":"${className}"} -->
<blockquote class="wp-block-quote ${className}"><!-- wp:paragraph -->
<p>${esc(text)}</p>
<!-- /wp:paragraph -->${cite}</blockquote>
<!-- /wp:quote -->`;
}

/**
 * A disclosure row, using core/details (WordPress 6.3+).
 *
 * Deliberately native rather than a custom accordion: <details>/<summary>
 * expands with no JavaScript at all, is keyboard accessible for free, and stays
 * editable in the block editor. A hand-rolled accordion would need a script
 * shipped into every exported site to do worse.
 */
export function details(summary: string, body: string, className: string): string {
  return `<!-- wp:details {"className":"${className}"} -->
<details class="wp-block-details ${className}"><summary>${esc(summary)}</summary><!-- wp:paragraph -->
<p>${esc(body)}</p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->`;
}

/**
 * WordPress puts its own classes on the <a> and only lets a block author
 * name the wrapping <div>, so the theme styles the anchor by position
 * (`.yp-btn--primary a`) rather than by a class on the anchor itself.
 */
export function buttons(actions: Action[], className: string): string {
  const inner = actions
    .map((a, i) => {
      /*
       * The variant, defaulted — NEVER interpolated raw.
       *
       * `variant` is not a declared field on any section, so the model never
       * produces one: every AI-written button came out as
       * `class="yp-btn--undefined"`, which matches no rule in sections.css and
       * renders as bare text. It looked correct in the section library only
       * because samples hard-code variant: "primary", so the one place anyone
       * checked was the one place it worked.
       *
       * First action solid, the rest outlined: a row of identical buttons gives
       * no clue which one is the intended next step.
       */
      const variant = a.variant === "outline" || a.variant === "primary"
        ? a.variant
        : i === 0
          ? "primary"
          : "outline";
      return `<!-- wp:button {"className":"yp-btn--${variant}"} -->
<div class="wp-block-button yp-btn--${variant}"><a class="wp-block-button__link wp-element-button" href="${escAttr(a.href)}">${esc(a.label)}</a></div>
<!-- /wp:button -->`;
    })
    .join("");
  return `<!-- wp:buttons {"className":"${className}"} -->
<div class="wp-block-buttons ${className}">${inner}</div>
<!-- /wp:buttons -->`;
}

/**
 * A core/gallery wrapping already-serialised core/image blocks.
 *
 * WHY THE NATIVE BLOCK AND NOT OUR OWN GRID
 *
 * WordPress's lightbox only offers next/previous between images that share a
 * `galleryId`, and an image only gets one when it is nested inside a
 * core/gallery. Wrapping each photo in a core/group — which is what we did —
 * gives every photo its own lightbox with nothing to navigate to.
 *
 * `data-id` on each image is what core reads to detect gallery membership
 * (see block_core_gallery_data_id_backcompatibility in gallery.php), and it is
 * the attachment id, so grouping only becomes real once images have been
 * sideloaded into the media library on export.
 */
export function gallery(
  innerImages: string,
  className: string,
  columns: number,
): string {
  const attrs = JSON.stringify({ columns, linkTo: "none", className });
  return `<!-- wp:gallery ${attrs} -->
<figure class="wp-block-gallery has-nested-images columns-${columns} ${className}">${innerImages}</figure>
<!-- /wp:gallery -->`;
}

/**
 * Raw markup as a core/html block.
 *
 * Used ONLY where core genuinely has no block for the thing. Today that is one
 * case: an embedded form, which is a script and a mount point rather than
 * content. Reaching for this elsewhere gives up the parsing, styling and
 * round-trip guarantees the registry exists to provide.
 *
 * core/html rather than a plugin's custom block: it is core, so it needs
 * nothing installed, survives a theme change, and WordPress shows it as an
 * editable HTML block instead of "this block contains unexpected content".
 */
export function htmlBlock(markup: string): string {
  return `<!-- wp:html -->\n${markup}\n<!-- /wp:html -->`;
}
