import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroAuroraProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  trustLine?: string;
};

/**
 * Soft multi-colour gradient mesh behind centred copy.
 *
 * The background is three overlapping radial gradients derived from the brand
 * colour — no image, no asset, nothing to download, and it recolours itself
 * when the palette changes because every stop is a color-mix() of --primary.
 *
 * That last point is the reason to build it this way rather than shipping a
 * background PNG: a generated site has no art direction budget, so the
 * decoration has to follow the brand automatically or it will clash.
 */
export const HeroAurora: SectionDefinition<HeroAuroraProps> = {
  key: "hero-aurora",
  nodeType: "HeroAurora",
  name: "Aurora gradient hero",
  category: "Hero",
  description:
    "Centred copy over a soft gradient mesh built from the brand colour. No image needed, and it recolours with the palette.",
  rootClass: "yp-hero-aurora",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 55 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 180 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    trustLine: { type: "text", label: "Trust line", hint: "Separate claims with ·", maxChars: 90 },
  },

  aiPrompt:
    "Confident and modern. A short headline of five or six words, one sentence beneath, and a trust " +
    "line of three factual claims separated by ·. The background is decorative, so the copy carries " +
    "all the meaning.",

  sample: {
    eyebrow: "NOW TAKING BOOKINGS",
    heading: "Flowers, done beautifully",
    body: "Hand-tied arrangements from a working shop — seasonal, local, and never out of a box.",
    actions: [
      { label: "Order now", href: "#", variant: "primary" },
      { label: "See our work", href: "#", variant: "outline" },
    ],
    trustLine: "Same-day delivery · Locally grown · 14 years trading",
  },

  toGutenberg(p) {
    const inner = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-hero-aurora__eyebrow") : "",
      p.heading ? heading(p.heading, 1, "yp-hero-aurora__heading") : "",
      p.body ? paragraph(p.body, "yp-hero-aurora__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-hero-aurora__actions") : "",
      p.trustLine ? paragraph(p.trustLine, "yp-hero-aurora__trust") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-hero-aurora", group("yp-hero-aurora__inner", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-aurora");
    if (!el) return null;
    return {
      eyebrow: text(el.querySelector(".yp-hero-aurora__eyebrow")),
      heading: text(el.querySelector(".yp-hero-aurora__heading")),
      body: text(el.querySelector(".yp-hero-aurora__body")),
      actions: parseActions(el),
      trustLine: text(el.querySelector(".yp-hero-aurora__trust")),
    };
  },
};
