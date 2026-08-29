import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroCenteredProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  /** A short line under the buttons — "No deposit · Free quotes · 12 years". */
  trustLine?: string;
};

/**
 * Centred, typographic, no image.
 *
 * The counterpoint to every other hero here: it works when the business has no
 * good photography, which is the common case for a new client. Impact comes
 * from type scale and generous whitespace rather than a picture — and it never
 * has to wait on a stock image or look wrong because the only available photo
 * is poor.
 */
export const HeroCentered: SectionDefinition<HeroCenteredProps> = {
  key: "hero-centered",
  nodeType: "HeroCentered",
  name: "Centred hero",
  category: "Hero",
  description:
    "Big centred headline with a trust line and no image. Best when the client has no strong photography yet — the type does the work.",
  rootClass: "yp-hero-centered",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", hint: "Shorter reads bigger here", maxChars: 55 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 180 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    trustLine: {
      type: "text",
      label: "Trust line",
      hint: "Separate claims with ·",
      maxChars: 90,
    },
  },

  aiPrompt:
    "A short, declarative headline — this layout renders it very large, so under eight words. " +
    "The trust line is three short factual claims separated by ·, the kind printed on a van: " +
    "years in business, area covered, guarantee. Never invent a certification or award.",

  sample: {
    eyebrow: "BATH & NORTH SOMERSET",
    heading: "Flowers worth stopping for",
    body: "A working flower shop, not a warehouse. Everything is cut, conditioned and arranged by hand the morning it goes out.",
    actions: [
      { label: "Order flowers", href: "#", variant: "primary" },
      { label: "See our work", href: "#", variant: "outline" },
    ],
    trustLine: "Same-day delivery · Locally grown · 14 years on Market Street",
  },

  toGutenberg(p) {
    const inner = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-hero-centered__eyebrow") : "",
      p.heading ? heading(p.heading, 1, "yp-hero-centered__heading") : "",
      p.body ? paragraph(p.body, "yp-hero-centered__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-hero-centered__actions") : "",
      p.trustLine ? paragraph(p.trustLine, "yp-hero-centered__trust") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-hero-centered", group("yp-hero-centered__inner", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-centered");
    if (!el) return null;
    return {
      eyebrow: text(el.querySelector(".yp-hero-centered__eyebrow")),
      heading: text(el.querySelector(".yp-hero-centered__heading")),
      body: text(el.querySelector(".yp-hero-centered__body")),
      actions: parseActions(el),
      trustLine: text(el.querySelector(".yp-hero-centered__trust")),
    };
  },
};
