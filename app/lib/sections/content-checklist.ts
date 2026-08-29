import { group, heading, paragraph, list, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type ContentChecklistProps = {
  heading?: string;
  body?: string;
  items?: string[];
  actions?: Action[];
};

/**
 * Heading and copy on one side, a ticked list on the other.
 *
 * Uses core/list rather than a grid of divs, so it stays a real <ul> — which
 * means it reads correctly to a screen reader as a list of N items, and a
 * client can add a line in wp-admin by pressing Enter rather than duplicating
 * a block. The ticks are ::marker styling, not characters in the content.
 */
export const ContentChecklist: SectionDefinition<ContentChecklistProps> = {
  key: "content-checklist",
  nodeType: "ContentChecklist",
  name: "Checklist",
  category: "Content",
  description:
    "Copy beside a ticked list of inclusions. A real <ul>, so adding a line in wp-admin is just pressing Enter.",
  rootClass: "yp-check",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    body: { type: "text", label: "Supporting copy", maxChars: 200 },
    items: { type: "list", label: "Ticked items", hint: "Four to eight short lines" },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
  },

  aiPrompt:
    "Each line is one concrete thing included, in three to seven words — not a sentence. Favour the " +
    "things a customer would otherwise have to ask about: delivery, setup, guarantees, what happens " +
    "if plans change.",

  sample: {
    heading: "What's included as standard",
    body: "No upsells at the till. Everything below is part of the price we quote you.",
    items: [
      "Consultation before you commit",
      "Seasonal flowers, never imported filler",
      "Delivery within the city",
      "Setup at the venue for weddings",
      "Vases loaned free for events",
      "Same-day changes up to 48 hours before",
    ],
    actions: [{ label: "Ask for a quote", href: "#", variant: "primary" }],
  },

  toGutenberg(p) {
    const copy = group(
      "yp-check__copy",
      [
        p.heading ? heading(p.heading, 2, "yp-check__heading") : "",
        p.body ? paragraph(p.body, "yp-check__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-check__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const items = p.items?.length ? list(p.items, "yp-check__list") : "";
    return group("yp-check", group("yp-check__grid", copy + items), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-check");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-check__heading")),
      body: text(el.querySelector(".yp-check__body")),
      items: el.querySelectorAll(".yp-check__list li").map((li) => li.textContent.trim()).filter(Boolean),
      actions: parseActions(el),
    };
  },
};
