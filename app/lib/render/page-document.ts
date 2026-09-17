import { schemaToGutenberg, sectionToTemplatePart, withSiteLogo } from "@/lib/wp/serialize";

/**
 * One page, assembled the same way for the canvas and for a visitor.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The builder canvas was already a complete rendering of the finished site:
 * the header template part, the page's own sections, the footer, WordPress's
 * dynamic blocks substituted, tokens resolved, the theme's own sections.css,
 * and the brand palette injected as the WordPress presets the stylesheet
 * reads. That is not a likeness of the website — it is the website, which is
 * the whole point of the class-name contract the sections are built on.
 *
 * So platform hosting needs no second renderer. It needs this composition run
 * on a server instead of inside an iframe. Writing it twice is exactly how the
 * canvas drifted from WordPress before — 30.4px headings against 62.4px, a
 * missing container, the wrong image crop — and every one of those bugs came
 * out of having two descriptions of one design.
 *
 * The rule this file exists to hold: if the canvas and the live page ever
 * disagree, it must be because of something passed IN, never because of
 * something written twice.
 * ─────────────────────────────────────────────────────────────────────
 */

/** A header or footer node as it is stored on the site. */
export type ChromeSection = { type: string; props: Record<string, unknown> } | null;

/**
 * Header + page + footer as one run of markup.
 *
 * Header and footer come from the SITE, not the page: they are template parts,
 * so one of each serves every page. schemaToGutenberg deliberately refuses to
 * emit them from page content, which is why they are composed here.
 */
export function composePageBody(opts: {
  header: ChromeSection;
  footer: ChromeSection;
  schema: unknown;
  /**
   * Whether the business has a logo.
   *
   * WordPress has no "logo, or the title if there is no logo" block, so the
   * choice is made once here — the same swap export performs when it writes
   * the header template part.
   */
  hasLogo: boolean;
}): string {
  const { header, footer, schema, hasLogo } = opts;

  const head = header ? sectionToTemplatePart(header.type, header.props) : "";
  const foot = footer ? sectionToTemplatePart(footer.type, footer.props) : "";

  return withSiteLogo(head, hasLogo) + schemaToGutenberg(schema) + foot;
}

/**
 * What a page is called in a menu.
 *
 * sitePages.title is null for a page nobody has renamed — the home page,
 * usually — so both the canvas menu and a live site's menu need the same
 * fallback. They did not have it: the builder title-cased the slug inline and
 * the live renderer used the raw one, so the same site's menu read "Home" in
 * the builder and "home" on the web. Two lines of the same idea, disagreeing,
 * which is the whole reason this module exists.
 */
export function pageTitle(slug: string, title: string | null | undefined): string {
  const named = title?.trim();
  if (named) return named;
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Only plain hex reaches the stylesheet. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The brand palette, as the WordPress presets sections.css actually reads.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY PRESETS AND NOT THE THEME'S OWN VARIABLES
 *
 * sections.css never hardcodes a colour. It reads:
 *
 *     --primary: var(--wp--preset--color--primary, #f54900);
 *
 * On a WordPress site theme.json defines that preset and the palette flows
 * through. Anywhere else nothing defines it, so every site fell back to the
 * literal orange — a client who chose Forest green saw green on their live
 * site and orange in the builder. Emitting the preset, rather than the
 * theme's own --primary, means the whole cascade behaves identically to
 * WordPress including any rule that reads a preset directly.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Values are re-validated here because they are interpolated into a
 * stylesheet. This is the last gate before a browser parses them, and it has
 * to hold whether the colours came from a form, the database, or a palette.
 */
export function palettePresetCss(colors: Record<string, string> | null | undefined): string {
  return Object.entries(colors ?? {})
    .filter(([slug, value]) => /^[a-z0-9-]+$/.test(slug) && HEX.test(String(value)))
    .map(([slug, value]) => `--wp--preset--color--${slug}: ${value};`)
    .join("\n    ");
}

function escAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A complete HTML document for a page this platform serves.
 *
 * `yp-page` on <body> is what activates the theme's rules: every selector in
 * sections.css is prefixed with it to win specificity against WordPress's
 * inline layout CSS, and without the class the stylesheet matches nothing.
 * functions.php adds it on WordPress and PreviewFrame adds it in the canvas —
 * this is the third place the same fact is stated, and the only one that could
 * not be avoided.
 */
export function renderSiteDocument(opts: {
  /** Already through withPreviewPlaceholders({ target: "live" }) and withStaticForms. */
  body: string;
  title: string;
  description?: string | null;
  colors?: Record<string, string> | null;
  lang?: string;
  /**
   * The address this page should be indexed under.
   *
   * The renderer is reachable at its own internal path as well as through the
   * site's host, and two URLs serving one page is a duplicate-content problem
   * on a product whose whole job is other people's websites.
   */
  canonical?: string | null;
  /** Set for anything that must not be indexed — an unpublished preview, say. */
  noindex?: boolean;
  /**
   * Extra <head> markup, already escaped by whoever built it.
   *
   * Social tags and structured data, kept out of this function because what a
   * page claims about a business is not a property of how it is assembled —
   * and because a WordPress site gets the same claims from PHP instead.
   */
  head?: string;
}): string {
  const { body, title, description, colors, lang = "en", canonical, noindex, head } = opts;
  const palette = palettePresetCss(colors);

  return `<!doctype html>
<html lang="${escAttr(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escText(title)}</title>${
    description ? `\n<meta name="description" content="${escAttr(description)}">` : ""
  }${canonical ? `\n<link rel="canonical" href="${escAttr(canonical)}">` : ""}${
    noindex ? '\n<meta name="robots" content="noindex, nofollow">' : ""
  }
${head ? `\n${head}` : ""}
<link rel="stylesheet" href="/api/theme/sections.css">
<style>
  html, body { margin: 0; padding: 0; }
  body { background: #fff; }
  :root {
    ${palette}
  }
</style>
</head>
<body class="yp-page">${body}</body>
</html>`;
}
