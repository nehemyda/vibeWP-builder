import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroStackedProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  image?: SectionImage;
};

/**
 * Centred copy above one wide landscape image.
 *
 * The only hero here that wants a LANDSCAPE photo — every other image slot is
 * a 4:5 portrait crop. That matters for generation: the stock search has to ask
 * for a different orientation, and a portrait photo dropped into this slot gets
 * cropped to a letterbox and usually loses its subject.
 *
 * Suits businesses whose premises or work is the selling point: a restaurant
 * room, a finished build, a shopfront.
 */
export const HeroStacked: SectionDefinition<HeroStackedProps> = {
  key: "hero-stacked",
  nodeType: "HeroStacked",
  name: "Stacked hero",
  category: "Hero",
  description:
    "Centred headline above one wide photograph. Wants a landscape image — a room, a shopfront, finished work.",
  rootClass: "yp-hero-stacked",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 60 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 170 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: {
      type: "image",
      label: "Wide photo",
      hint: "LANDSCAPE, roughly 16:9 — unlike the other heroes",
    },
  },

  aiPrompt:
    "The photograph carries this layout, so the copy introduces rather than describes: a headline " +
    "of six words or fewer and one sentence of context. Say where the business is if it is a place " +
    "customers visit.",

  sample: {
    eyebrow: "MARKET STREET, BATH",
    heading: "Come in and have a look",
    body: "The bench is always covered in something. Wander in, tell us the occasion, and we'll make it up while you wait.",
    actions: [
      { label: "Find us", href: "#", variant: "primary" },
      { label: "Opening hours", href: "#", variant: "outline" },
    ],
    image: {
      url: "https://images.pexels.com/photos/4238333/pexels-photo-4238333.jpeg?auto=compress&cs=tinysrgb&h=650&w=1200&fm=webp",
      alt: "Inside a flower shop, with arrangements displayed on shelves and stands.",
    },
  },

  toGutenberg(p) {
    const copy = group(
      "yp-hero-stacked__copy",
      [
        p.eyebrow ? paragraph(p.eyebrow, "yp-hero-stacked__eyebrow") : "",
        p.heading ? heading(p.heading, 1, "yp-hero-stacked__heading") : "",
        p.body ? paragraph(p.body, "yp-hero-stacked__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-hero-stacked__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const media = p.image?.url
      ? group(
          "yp-hero-stacked__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-hero-stacked__frame", {
            id: p.image.id,
            width: p.image.width,
            height: p.image.height,
          }),
        )
      : "";

    return group("yp-hero-stacked", copy + media, "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-stacked");
    if (!el) return null;
    const img = parseImage(el, ".yp-hero-stacked__frame");
    return {
      eyebrow: text(el.querySelector(".yp-hero-stacked__eyebrow")),
      heading: text(el.querySelector(".yp-hero-stacked__heading")),
      body: text(el.querySelector(".yp-hero-stacked__body")),
      actions: parseActions(el),
      ...(img ? { image: img } : {}),
    };
  },
};
