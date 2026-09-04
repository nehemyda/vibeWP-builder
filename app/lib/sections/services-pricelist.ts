import { group, heading, paragraph } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ServicesPricelistProps = {
  heading?: string;
  intro?: string;
  groups?: Array<{ title: string; items?: Array<{ name: string; note?: string; price: string }> }>;
  footnote?: string;
};

/**
 * A menu-style price list with dotted leaders.
 *
 * The layout salons, garages, clinics and restaurants actually need and almost
 * never get from a website builder: name on the left, price on the right, a
 * dotted rule joining them, grouped by type.
 *
 * The leader is a repeating-radial-gradient on the row rather than a string of
 * full stops in the content, so it stays clean when the text round-trips
 * through the editor and reflows correctly at any width.
 *
 * Prices are placeholders by default for the same reason as the pricing tiers:
 * a published price the client did not agree to is one they must honour.
 */
export const ServicesPricelist: SectionDefinition<ServicesPricelistProps> = {
  key: "services-pricelist",
  nodeType: "ServicesPricelist",
  name: "Services price list",
  category: "Content",
  description:
    "Menu-style list with dotted leaders and prices, grouped by type. What salons, garages and clinics actually need.",
  rootClass: "yp-svcp",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 150 },
    groups: {
      type: "list",
      label: "Groups",
      hint: "Two or three groups of services",
      of: {
        title: { type: "text", label: "Group name" },
        items: {
          type: "list",
          label: "Services in it",
          of: {
            name: { type: "text", label: "Service" },
            note: { type: "text", label: "Detail" },
            price: { type: "text", label: "Price" },
          },
        },
      },
    },
    footnote: { type: "text", label: "Footnote", hint: "VAT, minimums, how quotes work", maxChars: 150 },
  },

  aiPrompt:
    "Group services the way a customer would scan for them. Do NOT invent prices — use “From £—” and " +
    "let the client fill them in, because a published price becomes a commitment. The note under a " +
    "name is duration or what's included.",

  sample: {
    heading: "Prices",
    intro: "Guide prices for the things we're asked for most. Anything bespoke, just ask.",
    groups: [
      {
        title: "Bouquets",
        items: [
          { name: "Seasonal hand-tied", note: "Whatever is best that week", price: "From £—" },
          { name: "Letterbox flowers", note: "Posted, fits through the door", price: "From £—" },
          { name: "Luxury hand-tied", note: "Larger, with premium stems", price: "From £—" },
        ],
      },
      {
        title: "Subscriptions",
        items: [
          { name: "Weekly", note: "Vase loaned free", price: "From £—" },
          { name: "Fortnightly", note: "Pause any time", price: "From £—" },
        ],
      },
      {
        title: "Occasions",
        items: [
          { name: "Wedding packages", note: "After a free consultation", price: "POA" },
          { name: "Sympathy tributes", note: "Same-day where possible", price: "From £—" },
        ],
      },
    ],
    footnote: "Prices exclude delivery and VAT. Wedding quotes hold for 60 days.",
  },

  toGutenberg(p) {
    const groups = (p.groups ?? [])
      .filter((g) => g?.title)
      .map((g) =>
        group(
          "yp-svcp__group",
          heading(g.title, 3, "yp-svcp__group-title") +
            group(
              "yp-svcp__rows",
              (g.items ?? [])
                .filter((i) => i?.name)
                .map((i) =>
                  group(
                    "yp-svcp__row",
                    group(
                      "yp-svcp__left",
                      paragraph(i.name, "yp-svcp__name") +
                        (i.note ? paragraph(i.note, "yp-svcp__note") : ""),
                    ) + paragraph(i.price ?? "", "yp-svcp__price"),
                  ),
                )
                .join(""),
            ),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-svcp__heading") : "",
      p.intro ? paragraph(p.intro, "yp-svcp__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group(
      "yp-svcp",
      head +
        group("yp-svcp__groups", groups) +
        (p.footnote ? paragraph(p.footnote, "yp-svcp__footnote") : ""),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-svcp");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-svcp__heading")),
      intro: text(el.querySelector(".yp-svcp__intro")),
      groups: el
        .querySelectorAll(".yp-svcp__group")
        .map((g) => ({
          title: text(g.querySelector(".yp-svcp__group-title")),
          items: g
            .querySelectorAll(".yp-svcp__row")
            .map((r) => ({
              name: text(r.querySelector(".yp-svcp__name")),
              note: text(r.querySelector(".yp-svcp__note")),
              price: text(r.querySelector(".yp-svcp__price")),
            }))
            .filter((i) => i.name),
        }))
        .filter((g) => g.title),
      footnote: text(el.querySelector(".yp-svcp__footnote")),
    };
  },
};
