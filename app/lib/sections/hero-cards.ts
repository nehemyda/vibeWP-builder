import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroCardsProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  cards?: Array<{ title: string; body: string }>;
};

/**
 * Copy on the left, a two-by-two grid of small cards on the right.
 *
 * Replaces the photograph with information, which makes it the strongest option
 * for a business whose value is a LIST — an accountant's disciplines, a
 * garage's services, a clinic's treatments. It also needs no imagery at all, so
 * generation never blocks on finding a decent photo.
 *
 * The cards intentionally reuse the Services grid's visual language at a
 * smaller size, so a page using both reads as one design rather than two.
 */
export const HeroCards: SectionDefinition<HeroCardsProps> = {
  key: "hero-cards",
  nodeType: "HeroCards",
  name: "Hero with cards",
  category: "Hero",
  description:
    "Headline beside a compact grid of four short cards. For businesses selling a list of services, and no photo needed.",
  rootClass: "yp-hero-cards",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 60 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 170 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    cards: {
      type: "list",
      label: "Cards",
      hint: "Exactly four fills the grid cleanly",
      of: {
        title: { type: "text", label: "Title" },
        body: { type: "text", label: "One short line" },
      },
    },
  },

  aiPrompt:
    "Four cards, each a distinct thing the business does, titled the way a customer would search " +
    "for it. One short line each — under twelve words, because the cards are small. Four exactly: " +
    "three leaves a gap and five wraps awkwardly.",

  sample: {
    eyebrow: "FULL-SERVICE FLORIST",
    heading: "Whatever the occasion, we've done it before",
    body: "Weddings, funerals, corporate contracts and the Tuesday bunch that just makes the kitchen better.",
    actions: [{ label: "Talk to us", href: "#", variant: "primary" }],
    cards: [
      { title: "Weddings", body: "Planned from first meeting to the day itself." },
      { title: "Subscriptions", body: "Weekly or fortnightly, home or office." },
      { title: "Sympathy", body: "Handled quietly, delivered same day." },
      { title: "Events", body: "Installations for venues and businesses." },
    ],
  },

  toGutenberg(p) {
    const copy = group(
      "yp-hero-cards__copy",
      [
        p.eyebrow ? paragraph(p.eyebrow, "yp-hero-cards__eyebrow") : "",
        p.heading ? heading(p.heading, 1, "yp-hero-cards__heading") : "",
        p.body ? paragraph(p.body, "yp-hero-cards__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-hero-cards__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const cards = group(
      "yp-hero-cards__grid",
      (p.cards ?? [])
        .filter((c) => c?.title || c?.body)
        .map((c) =>
          group(
            "yp-hero-cards__card",
            (c.title ? heading(c.title, 3, "yp-hero-cards__card-title") : "") +
              (c.body ? paragraph(c.body, "yp-hero-cards__card-body") : ""),
          ),
        )
        .join(""),
    );

    return group("yp-hero-cards", group("yp-hero-cards__grid-outer", copy + cards), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-cards");
    if (!el) return null;
    return {
      eyebrow: text(el.querySelector(".yp-hero-cards__eyebrow")),
      heading: text(el.querySelector(".yp-hero-cards__heading")),
      body: text(el.querySelector(".yp-hero-cards__body")),
      actions: parseActions(el),
      cards: el
        .querySelectorAll(".yp-hero-cards__card")
        .map((c) => ({
          title: text(c.querySelector(".yp-hero-cards__card-title")),
          body: text(c.querySelector(".yp-hero-cards__card-body")),
        }))
        .filter((c) => c.title || c.body),
    };
  },
};
