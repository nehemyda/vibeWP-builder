import { parse } from "node-html-parser";
import { getSectionByNodeType, SECTIONS } from "@/lib/sections";
import { esc, escAttr } from "./blocks";
import { defaultSpan, staticFormMarkup } from "@/lib/forms/static-markup";

/**
 * Page-level conversion between stored schemas and Gutenberg markup.
 *
 * LAYERING — this file exists to keep the dependency graph acyclic:
 *
 *   lib/wp/blocks.ts     block primitives (group, paragraph, image…)
 *          ↑
 *   lib/sections/*       each section, built from those primitives
 *          ↑
 *   lib/wp/serialize.ts  walks a page, delegating to the registry
 *
 * Putting the walk in blocks.ts would make blocks import sections while
 * sections import blocks. Keeping the primitives ignorant of sections is what
 * lets a section be added without touching them.
 */

/** One field of the attached form, as the canvas needs to draw it. */
export type FormPreviewField = {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  span?: number;
  placeholder?: string;
  /** A dropdown's choices, so the canvas one opens with the real options. */
  options?: string[];
};

type SchemaNode = { id?: string; type?: string; props?: Record<string, unknown> };
type PageSchema = { schemaVersion?: string; nodes?: SchemaNode[] };

/**
 * Serializes a whole page.
 *
 * Unknown node types are skipped rather than throwing: a page holding one
 * unrecognised section should still export the sections we do understand,
 * which also means an older client can render a schema written by a newer
 * deploy without erroring.
 */
export function schemaToGutenberg(
  schema: unknown,
  /**
   * Stamps each section's outermost element with `data-vibewp-node="<index>"`.
   *
   * FOR THE BUILDER CANVAS ONLY, and opt-in so the export path cannot pick it
   * up by accident — a stray attribute in a client's WordPress content would
   * outlive us. Nothing else identifies a node in the rendered markup: node
   * `id`s are assigned only by add_section, so a generated page has none, and
   * matching on the root class is ambiguous the moment a page holds two
   * sections of the same design.
   */
  opts?: { markNodes?: boolean },
): string {
  const nodes = (schema as PageSchema)?.nodes;
  if (!Array.isArray(nodes)) return "";

  return nodes
    .map((node, index) => {
      const section = getSectionByNodeType(node?.type);
      if (!section) return "";
      /*
       * Header and footer sections belong in the theme's template parts, which
       * is what makes them appear once site-wide. Writing one into page content
       * would put a second navigation bar mid-page, on every page it reached.
       * Skipped rather than thrown so one mistaken node can't fail an export.
       */
      if (section.placement && section.placement !== "page") return "";
      const html = section.toGutenberg(node.props ?? {});
      return opts?.markNodes ? markElement(html, "data-vibewp-node", String(index)) : html;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Adds an attribute to the FIRST element in a section's markup.
 *
 * The first `<` in the string is always the section's own root element: the
 * Gutenberg block comment that precedes it carries its attributes as JSON, and
 * a class name cannot contain an angle bracket. Asserted for all 62 sections in
 * verify.ts rather than trusted, because a section that silently failed to be
 * stamped would be a section the client cannot click.
 */
export function markElement(html: string, attr: string, value: string): string {
  return html.replace(/<([a-zA-Z][\w-]*)/, (_, tag: string) => `<${tag} ${attr}="${escAttr(value)}"`);
}

/**
 * Serializes a section for a template part (header/footer), where page-content
 * placement rules do not apply.
 */
export function sectionToTemplatePart(
  nodeType: string,
  props: unknown,
  /**
   * Stamps `data-vibewp-chrome`, for the same reason page nodes are stamped
   * and with the same opt-in. A click on the header has to route to
   * swap_chrome: the header is a template part shared by every page, not a
   * node on this one, and treating it as a page section is how a change to it
   * silently does nothing.
   */
  opts?: { mark?: "header" | "footer" },
): string {
  const section = getSectionByNodeType(nodeType);
  if (!section) return "";
  const html = section.toGutenberg(props ?? {});
  return opts?.mark ? markElement(html, "data-vibewp-chrome", opts.mark) : html;
}

/**
 * Markup for previewing ONE section of any placement.
 *
 * Needed because schemaToGutenberg() deliberately refuses header and footer
 * sections — correct for page content, but it would render every header and
 * footer card in the library blank. This routes by placement and substitutes
 * the dynamic blocks so previews show something real.
 */
/**
 * The four questions the library card shows for a form section.
 *
 * A catalogue card has to look like the thing it is selling. With no site and
 * no form, the preview fell back to grey bars — which said "unfinished", not
 * "this is a contact form". These are illustrative and the caption says so;
 * the real questions come from the client's own form once there is one.
 */
const EXAMPLE_FORM_FIELDS: FormPreviewField[] = [
  { name: "name", label: "Your name", type: "text", required: true, span: 6 },
  { name: "email", label: "Email", type: "email", required: true, span: 6 },
  { name: "phone", label: "Phone", type: "tel", span: 12 },
  { name: "message", label: "How can we help?", type: "textarea", required: true, span: 12 },
];

/**
 * Contact details for a library card, standing in for the site's own.
 *
 * Samples carry {{phone}} rather than a number, because on a real site those
 * follow the business details. With no site to read them from the tokens are
 * stripped, so the form-and-details card showed PHONE, EMAIL and HOURS with
 * nothing beside them — a section that looked broken in the catalogue meant
 * to sell it. Illustrative, exactly like the example form questions above.
 */
const EXAMPLE_FACTS: Record<string, string> = {
  phone: "01225 000000",
  email: "hello@example.com",
  address: "12 High Street, Bath BA1 5AQ",
  hours: "Mon–Fri 9–5\nSat 9–1",
};

export function sectionPreviewMarkup(nodeType: string, props: unknown): string {
  const markup = sectionToTemplatePart(nodeType, props);
  /*
   * Any section carrying a form mount gets the example questions — matched on
   * the MARKUP, not the node type. Keyed on the name it only covered
   * FormEmbed, so the five newer form sections previewed as an empty skeleton
   * in the very catalogue meant to sell them.
   */
  const showsAForm = markup.includes("yp-embed__mount");
  return withPreviewPlaceholders(
    markup,
    undefined,
    EXAMPLE_FACTS,
    undefined,
    undefined,
    showsAForm ? EXAMPLE_FORM_FIELDS : undefined,
  );
}

/**
 * Swaps WordPress's dynamic blocks for visible placeholders.
 *
 * FOR PREVIEWS ONLY. `wp:site-title` and `wp:navigation` are rendered by PHP at
 * request time and carry no inner HTML, so in the preview iframe — which has no
 * WordPress — a header built from them renders as literally nothing. The library
 * would show blank cards for all five headers.
 *
 * Never use this on export markup: the point of those blocks is that the title
 * follows Settings and the menu follows whatever the client edits, and baking in
 * a placeholder would freeze both.
 */
export function withPreviewPlaceholders(
  html: string,
  businessName?: string,
  /**
   * The site's real contact details, keyed as the theme's tokens are: phone,
   * email, address, hours.
   *
   * Generated content carries {{phone}} rather than a literal number, so that
   * changing it in WordPress updates every page at once. Without this the
   * builder canvas would show a literal "{{phone}}" where the live site shows
   * the number — a preview that disagrees with the thing it previews.
   */
  facts?: Record<string, string>,
  /** The business logo as a data URL, so the canvas shows the real thing. */
  logoUrl?: string,
  /**
   * The site's real pages, in menu order.
   *
   * The placeholder used to be a fixed row reading Home / Services / About /
   * Contact, in plain <span>s. Both halves were wrong. The names were invented,
   * so a site with a Pricing page never saw it and a site without an About saw
   * one that did not exist; and spans are not links, so the menu could not be
   * clicked. On the exported site the navigation block falls back to a list of
   * published pages, which is exactly this list — so passing it is what makes
   * the canvas agree with WordPress instead of guessing at it.
   */
  pages?: { slug: string; title: string }[],
  /**
   * The fields of the form attached to this site, so the canvas can draw the
   * client's ACTUAL questions.
   *
   * The placeholder used to be grey bars. It was honest — the canvas runs no
   * JavaScript, so the real form cannot render — but it told the client nothing
   * about the form they had built, and looked like a section that had failed.
   * Drawing the real labels turns "something goes here" into "this is your
   * form".
   */
  formFields?: FormPreviewField[],
  /** The attached form's embed token, so the canvas can link to the real thing. */
  formToken?: string,
  /**
   * The form's saved styling, so the canvas shows the same background and
   * spacing the live page will. Without it the three views of one form —
   * canvas, standalone preview and WordPress — disagreed on how it looks.
   */
  formStyle?: Record<string, string>,
): string {
  /*
   * The site title is a real value we hold, so the builder passes it and the
   * canvas shows the actual business name. "Your Business" is only the fallback
   * for the section library, where a preview belongs to no particular site.
   */
  const brand = esc(businessName?.trim() || "Your Business");

  /*
   * The menu, from the pages that actually exist.
   *
   * `data-vibewp-slug` rather than a real href: inside the canvas there is no
   * server to navigate to, so the builder intercepts the click and switches
   * which page it is editing. The href is still "#" so the browser treats these
   * as links — focusable, keyboard-activatable, and showing a pointer — which
   * plain <span>s were not.
   *
   * Falls back to a generic menu ONLY when no pages were supplied, which is the
   * section library previewing a header that belongs to no site.
   */
  /*
   * The form as it will appear, drawn rather than run.
   *
   * Inputs are rendered but DISABLED. The canvas has no JavaScript and no
   * token, so nothing could submit anyway — disabling says so plainly instead
   * of offering a box that silently does nothing when typed into.
   *
   * Falls back to a generic three-field skeleton when no form is attached yet,
   * which is what the section library and a brand-new site see.
   */
  /*
   * A way to actually try the form.
   *
   * The drawing is deliberately inert — the canvas has no token, so a working
   * form here would post real leads every time someone looked at a page. But
   * "you cannot click this" is a dead end unless it also says where you CAN,
   * and being asked twice why it does not respond is the sign it was one.
   *
   * target="_blank" because this opens outside the iframe, and the builder
   * intercepts in-canvas clicks for page navigation.
   */
  const caption = formToken
    ? `<a class="yp-embed__try" href="/forms/preview/${escAttr(formToken)}" target="_blank" rel="noreferrer">` +
      "Open the working form &#8599;</a>"
    : "<em>Your form appears here on the live site</em>";

  /*
   * REAL controls, not drawings of them.
   *
   * These were <div>s styled to look like inputs, so the previewed form could
   * not be clicked, focused, tabbed through or typed into — asked twice why,
   * which is the answer that the drawing was the problem.
   *
   * Real inputs need no JavaScript to be interactive, so the canvas gets a form
   * that behaves like one. What it deliberately does NOT get is a <form>
   * element or a submit button: with no action, submitting would navigate the
   * iframe, and with an action it would post real leads every time someone
   * looked at a page. Send is type="button" and goes nowhere — the link beside
   * it opens the form that really submits.
   */
  /* Keys validated: these become custom properties, and stored text must not
     be able to become anything else. */
  const phTokens = Object.entries(formStyle ?? {})
    .filter(([k]) => /^[a-z0-9-]+$/i.test(k))
    .map(([k, v]) => `--vwf-${k}:${String(v).replace(/[;"<>]/g, "")}`)
    .join(";");
  const phStyle = phTokens ? ` style="${escAttr(phTokens)}"` : "";

  /*
   * The SAME renderer the live site uses, in inert mode.
   *
   * The canvas used to draw its own skeleton with its own classes, so the
   * preview and the real form were two descriptions of one thing that drifted
   * apart whenever either changed — exactly how the builder canvas came to
   * disagree with WordPress before. One function, one stylesheet, and "does the
   * preview match?" stops being a question anyone has to ask.
   */
  const formPreview = formFields?.length
    ? staticFormMarkup({
        fields: formFields as Parameters<typeof staticFormMarkup>[0]["fields"],
        token: formToken ?? "",
        endpoint: "",
        style: formStyle,
        inert: true,
      }) + caption
    : '<div class="vibewp-form yp-embed__skeleton">' +
      '<label style="grid-column:span 6"><span></span><i></i></label>' +
      '<label style="grid-column:span 12"><span></span><i class="tall"></i></label>' +
      "<b>Send</b><em>Add a form in Leads &amp; forms to see it here</em></div>"

  const navLinks = (pages?.length ? pages : [{ slug: "home", title: "Home" }, { slug: "services", title: "Services" }, { slug: "about", title: "About" }, { slug: "contact", title: "Contact" }])
    .map(
      (p) =>
        `<a class="yp-ph-nav__link" href="#" data-vibewp-slug="${escAttr(p.slug)}">${esc(p.title)}</a>`,
    )
    .join("");

  /*
   * site-logo is a dynamic block like the others: no inner HTML, rendered by
   * PHP from the WordPress media library. In the canvas there is no WordPress,
   * so the stored data URL stands in for it.
   */
  let out = html.replace(
    /<!--\s*wp:site-logo[^>]*?\/-->/g,
    logoUrl
      ? `<p class="yp-ph-logo"><img src="${escAttr(logoUrl)}" alt="${brand}"></p>`
      : `<p class="yp-ph-brand">${brand}</p>`,
  );

  for (const [key, value] of Object.entries(facts ?? {})) {
    // Newlines in hours become <br>, matching what the theme's filter does.
    const rendered = esc(value).replace(/\n/g, "<br />");
    out = out.split(`{{${key}}}`).join(rendered);
  }
  /*
   * Any token with no value left over is removed rather than shown. A visible
   * "{{email}}" reads as broken; an empty space reads as a detail not yet
   * filled in, which is what it is.
   */
  out = out.replace(/\{\{(?:phone|email|address|hours)\}\}/g, "");

  return out
    .replace(
      /<!--\s*wp:site-title[^>]*?\/-->/g,
      `<p class="yp-ph-brand">${brand}</p>`,
    )
    /*
     * The navigation placeholder COLLAPSES, because core's navigation block
     * does.
     *
     * It used to be a fixed row of inline links at every width, so the canvas
     * showed a desktop menu on the Mobile preset and the hamburger — which core
     * provides and the exported site really has — appeared nowhere in the
     * builder. Setting overlayMenu on the block changed the live site and
     * nothing here, which read as the feature not working.
     *
     * <details> so it actually opens with no JavaScript, matching the rest of
     * the theme. It is still a placeholder — core's overlay is full-screen and
     * this is a dropdown — but it now tells the truth about the breakpoint.
     */
    .replace(
      /<!--\s*wp:navigation[^>]*?\/-->/g,
      '<details class="yp-ph-nav">' +
        '<summary class="yp-ph-nav__toggle" aria-label="Menu">' +
        '<span class="yp-ph-nav__bars"></span></summary>' +
        // Backdrop first so the panel stacks above it, and so tapping outside
        // reads as dismissable even though a placeholder cannot close itself.
        '<span class="yp-ph-nav__scrim"></span>' +
        '<div class="yp-ph-nav__panel">' +
        '<div class="yp-ph-nav__links">' +
        navLinks +
        "</div></div></details>",
    )
    /*
     * The embedded form, drawn rather than run.
     *
     * The canvas has no JavaScript, so embed.js never executes and the mount
     * stays empty — the section would render as blank space and read as broken.
     * A skeleton says "a form belongs here" honestly, without pretending to be
     * the real fields, which are defined in Leads & forms and can change
     * without this knowing.
     */
    .replace(
      /<div class="yp-embed__mount"[^>]*><\/div>\s*<script[^>]*><\/script>/g,
      `<div class="yp-embed__ph">${formPreview}</div>`,
    )
    .replace(
      /<!--\s*wp:social-links[^>]*?\/-->/g,
      '<p class="yp-ph-social"><span>Facebook</span><span>Instagram</span></p>',
    )
    /*
     * The same substitution the theme's render_block filter performs, so a
     * preview shows the real year rather than a literal {{year}}. Computed
     * here rather than hard-coded for the obvious reason.
     */
    .replace(/\{\{year\}\}/g, String(new Date().getFullYear()));
}

/**
 * Swaps the site title for the site logo, when the business has one.
 *
 * A boundary transform, like withPreviewPlaceholders — deliberately NOT a
 * property of the header sections themselves. Whether a logo exists is a fact
 * about the site, and a section that had to know it would be a section that
 * could no longer be rendered in the library or tested on its own.
 *
 * WordPress has no "logo, or the title if there is no logo" block: site-logo
 * renders nothing when unset and site-title always renders, so emitting both
 * would show both. Choosing here, once, at the point where the site's template
 * part is written, is what makes it one or the other.
 */
export function withSiteLogo(html: string, hasLogo: boolean): string {
  if (!hasLogo) return html;
  return html.replace(
    /<!--\s*wp:site-title\s*(\{.*?\})?\s*\/-->/g,
    (_match, attrs: string | undefined) => {
      const className = attrs?.match(/"className":"([^"]*)"/)?.[1] ?? "";
      // width caps it in the header; the theme's CSS handles the rest.
      return `<!-- wp:site-logo {"width":180,"className":"${className}"} /-->`;
    },
  );
}

/**
 * Reads markup back into a page schema, for WordPress→VibeWP sync.
 *
 * Sections are matched in registry order, and each contributes at most one
 * node. That is a real limitation: two Testimonial sections on one page come
 * back as one. Worth fixing when a section is legitimately repeatable, but it
 * needs per-instance identity in the markup to do properly, so it is called
 * out rather than quietly wrong.
 */
export function gutenbergToSchema(html: string): PageSchema | null {
  if (!html?.trim()) return null;
  const root = parse(html);

  const nodes: SchemaNode[] = [];
  for (const section of SECTIONS) {
    if (!section.fromGutenberg) continue;
    const props = section.fromGutenberg(root);
    if (props) {
      nodes.push({ id: `n_${section.key}`, type: section.nodeType, props });
    }
  }

  if (nodes.length === 0) return null;
  return { schemaVersion: "1.0", nodes };
}

/**
 * Every block type the registry is capable of producing.
 *
 * Derived by serializing each section's sample rather than hand-listed, because
 * a hand-listed set silently rots: adding a section that used core/quote and
 * core/details made sync warn that pulling would DROP the testimonials and FAQ
 * it had just written, since those names were missing from the list.
 *
 * The base set covers block types a sample may not happen to exercise — a hero
 * with no feature list still supports one.
 */
let knownBlocksCache: Set<string> | null = null;
function knownBlockTypes(): Set<string> {
  if (knownBlocksCache) return knownBlocksCache;

  const known = new Set([
    "group",
    "heading",
    "paragraph",
    "buttons",
    "button",
    "image",
    "list",
    "list-item",
  ]);

  for (const section of SECTIONS) {
    try {
      for (const m of section.toGutenberg(section.sample).matchAll(/<!--\s*wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)/gi)) {
        known.add(m[1].toLowerCase().replace(/^core\//, ""));
      }
    } catch {
      // A section whose sample fails to serialize shouldn't break sync detection.
    }
  }

  knownBlocksCache = known;
  return known;
}

/**
 * Block types in the markup that no registered section can represent.
 *
 * Empty paragraphs are excluded deliberately: the block editor leaves them
 * behind routinely, and counting them as content would flag a change on pages
 * nobody meaningfully edited.
 */
export function detectUnmodelledBlocks(html: string): string[] {
  const found = new Set<string>();
  const KNOWN = knownBlockTypes();

  for (const m of html.matchAll(/<!--\s*wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)/gi)) {
    const name = m[1].toLowerCase().replace(/^core\//, "");
    if (!KNOWN.has(name)) found.add(name);
  }

  // Text outside every known section root is content a pull would discard.
  const root = parse(html);
  const roots = SECTIONS.map((s) => `.${s.rootClass}`).join(",");
  const strays = root
    .querySelectorAll("p")
    .filter((p) => p.textContent.trim().length > 0)
    .filter((p) => !roots || !p.closest(roots));
  if (strays.length) found.add(`paragraph (${strays.length} outside any known section)`);

  return [...found];
}
