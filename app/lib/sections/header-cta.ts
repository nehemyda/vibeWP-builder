import { group, siteTitle, navigation, buttons } from "@/lib/wp/blocks";
import { parseActions, type Action, sticky, parseSticky } from "./shared";
import type { SectionDefinition } from "./types";

export type HeaderCtaProps = {
  sticky?: boolean; actions?: Action[] };

/**
 * Brand, navigation, and one action button pinned right.
 *
 * The only header carrying its own content — the button. Worth it because a
 * booking or call action in the header is visible on every page and every
 * scroll position, which is where most enquiries actually start.
 */
export const HeaderCta: SectionDefinition<HeaderCtaProps> = {
  key: "header-cta",
  nodeType: "HeaderCta",
  name: "Header with button",
  category: "Header",
  placement: "header",
  description: "Brand, menu, and one action button. The button is visible on every page — where most enquiries start.",
  rootClass: "yp-hdrb",
  fields: {
    sticky: {
      type: "boolean",
      label: "Stick to the top when scrolling",
      hint: "On by default. Say \"remove the sticky header\" in chat to turn it off.",
      default: true,
    },
    actions: { type: "list", label: "Button", hint: "One only — a header is not the place for choices", of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } } },
  },
  aiPrompt: "One button, two or three words, phrased as the customer's intent — Book now, Get a quote, Call us. Never two: a header with choices is a header nobody uses.",
  sample: { actions: [{ label: "Book now", href: "#", variant: "primary" }] },
  toGutenberg(p) {
    return group(sticky(p, "yp-hdrb"), group("yp-hdrb__inner",
      siteTitle("yp-hdrb__brand") + navigation("yp-hdrb__nav") +
      (p.actions?.length ? buttons(p.actions.slice(0, 1), "yp-hdrb__actions") : "")), "div");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-hdrb");
    if (!el) return null;
    return {
      sticky: parseSticky(el), actions: parseActions(el) };
  },
};
