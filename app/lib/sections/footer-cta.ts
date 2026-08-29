import { group, siteTitle, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action , copyrightLine, parseCopyrightName } from "./shared";
import type { SectionDefinition } from "./types";

export type FooterCtaProps = { heading?: string; body?: string; actions?: Action[]; copyright?: string };

/**
 * A final ask above a minimal footer.
 *
 * Catches the visitor who read the whole page and reached the bottom without
 * acting — which is the most engaged person on the site. Because it is in the
 * footer template part it appears on every page, so the ask should be general
 * rather than tied to any one page's content.
 */
export const FooterCta: SectionDefinition<FooterCtaProps> = {
  key: "footer-cta",
  nodeType: "FooterCta",
  name: "Footer with final ask",
  category: "Footer",
  placement: "footer",
  description: "A closing ask above the footer. Appears on every page, so keep it general rather than page-specific.",
  rootClass: "yp-ftrx",
  fields: {
    heading: { type: "text", label: "The ask", maxChars: 50 },
    body: { type: "text", label: "Supporting line", maxChars: 120 },
    actions: { type: "list", label: "Buttons", of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } } },
    copyright: { type: "text", label: "Copyright name", hint: "Name only" },
  },
  aiPrompt: "This shows on every page, so the ask must make sense everywhere — avoid referring to anything above it. One button.",
  sample: {
    heading: "Ready when you are",
    body: "Tell us the occasion and we'll come back within a day.",
    actions: [{ label: "Get in touch", href: "#", variant: "primary" }],
    copyright: "Bluebell Florist",
  },
  toGutenberg(p) {
    const cta = group("yp-ftrx__cta", [
      p.heading ? heading(p.heading, 2, "yp-ftrx__heading") : "",
      p.body ? paragraph(p.body, "yp-ftrx__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-ftrx__actions") : "",
    ].filter(Boolean).join(""));
    const base = group("yp-ftrx__base", siteTitle("yp-ftrx__brand") + (p.copyright ? paragraph(copyrightLine(p.copyright), "yp-ftrx__copy") : ""));
    return group("yp-ftrx", group("yp-ftrx__inner", cta + base), "div");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ftrx");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-ftrx__heading")),
      body: text(el.querySelector(".yp-ftrx__body")),
      actions: parseActions(el),
      copyright: parseCopyrightName(text(el.querySelector(".yp-ftrx__copy"))),
    };
  },
};
