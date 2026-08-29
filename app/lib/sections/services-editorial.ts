import { group, heading, paragraph } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ServicesEditorialProps = {
  heading?: string;
  intro?: string;
  items?: Array<{ title: string; body: string; meta?: string }>;
};

/**
 * Full-width numbered rows separated by hairlines.
 *
 * The most "designed" of the services layouts, and the cheapest to make look
 * expensive: no images, no boxes, no icons — the impression comes from a large
 * type scale, generous row height and a mono index. That matters because a
 * generated site rarely has good photography, and this layout never needs any.
 *
 * Indices come from a CSS counter, so deleting a row in wp-admin renumbers the
 * rest instead of leaving 01, 03, 04.
 */
export const ServicesEditorial: SectionDefinition<ServicesEditorialProps> = {
  key: "services-editorial",
  nodeType: "ServicesEditorial",
  name: "Services, editorial rows",
  category: "Content",
  description:
    "Large numbered rows on hairline dividers. No images needed — the type does the work, which suits clients without photography.",
  rootClass: "yp-svce",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 160 },
    items: {
      type: "list",
      label: "Services",
      hint: "Three to six rows",
      of: {
        title: { type: "text", label: "Service" },
        body: { type: "text", label: "What it involves" },
        meta: { type: "text", label: "Aside", hint: "Lead time, from-price, or who it suits" },
      },
    },
  },

  aiPrompt:
    "Name each service the way a customer searches for it. The body is one or two sentences on what " +
    "it actually involves. The aside is a short factual qualifier — a lead time, a starting point, " +
    "who it suits — and must be left empty rather than invented, since it reads as a commitment.",

  sample: {
    heading: "What we do",
    intro: "Six things, done properly, rather than everything done adequately.",
    items: [
      { title: "Wedding flowers", body: "Consultation, bouquets, buttonholes and venue arrangements, planned around your colours and the season.", meta: "Book 3–6 months ahead" },
      { title: "Weekly subscriptions", body: "A fresh arrangement delivered to your home or office, changing with what's genuinely good that week.", meta: "Pause any time" },
      { title: "Sympathy tributes", body: "Handled quietly and quickly, delivered to the home, funeral director or service.", meta: "Same-day available" },
      { title: "Event and venue work", body: "Installations for restaurants, hotels and private parties, set up and cleared by us.", meta: "Quoted per event" },
    ],
  },

  toGutenberg(p) {
    const rows = (p.items ?? [])
      .filter((i) => i?.title || i?.body)
      .map((i) =>
        group(
          "yp-svce__row",
          [
            i.title ? heading(i.title, 3, "yp-svce__title") : "",
            i.body ? paragraph(i.body, "yp-svce__body") : "",
            i.meta ? paragraph(i.meta, "yp-svce__meta") : "",
          ]
            .filter(Boolean)
            .join(""),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-svce__heading") : "",
      p.intro ? paragraph(p.intro, "yp-svce__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-svce", head + group("yp-svce__list", rows), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-svce");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-svce__heading")),
      intro: text(el.querySelector(".yp-svce__intro")),
      items: el
        .querySelectorAll(".yp-svce__row")
        .map((r) => ({
          title: text(r.querySelector(".yp-svce__title")),
          body: text(r.querySelector(".yp-svce__body")),
          meta: text(r.querySelector(".yp-svce__meta")),
        }))
        .filter((i) => i.title || i.body),
    };
  },
};
