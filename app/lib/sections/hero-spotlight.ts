import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, parseStats, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroSpotlightProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  stats?: Array<{ value: string; label: string }>;
};

/**
 * Dark section with a glow behind the headline and a faint grid.
 *
 * The one deliberately dark hero in the set. Two reasons it earns a place:
 * a dark band is the simplest way to make one page feel designed rather than
 * templated, and it needs no photography, so it is available to every client.
 *
 * The grid is a repeating-linear-gradient masked by a radial fade, so it
 * dissolves toward the edges instead of stopping at a hard line. Both the glow
 * and the grid derive from --primary, so this follows the brand rather than
 * fighting it.
 */
export const HeroSpotlight: SectionDefinition<HeroSpotlightProps> = {
  key: "hero-spotlight",
  nodeType: "HeroSpotlight",
  name: "Spotlight hero",
  category: "Hero",
  description:
    "Dark band with a brand-coloured glow behind the headline and a faint grid. Needs no photo, and gives a page one strong moment.",
  rootClass: "yp-hero-spotlight",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 55 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 170 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    stats: {
      type: "list",
      label: "Numbers",
      hint: "Three, shown under the buttons",
      of: {
        value: { type: "text", label: "Figure" },
        label: { type: "text", label: "What it counts" },
      },
    },
  },

  aiPrompt:
    "Assured, low word count — this renders large on a dark background. Five or six words in the " +
    "headline. Three stats beneath, real figures only; if the true numbers are unknown use round " +
    "placeholders the client will obviously correct, never precise-looking invented ones.",

  sample: {
    eyebrow: "TRUSTED SINCE 2011",
    heading: "The work speaks for itself",
    body: "Fourteen years arranging flowers for weddings, funerals and Tuesday afternoons across the city.",
    actions: [
      { label: "Start an order", href: "#", variant: "primary" },
      { label: "See the portfolio", href: "#", variant: "outline" },
    ],
    stats: [
      { value: "500+", label: "Weddings" },
      { value: "14 yrs", label: "On Market Street" },
      { value: "4.9★", label: "Average rating" },
    ],
  },

  toGutenberg(p) {
    const stats = p.stats?.length
      ? group(
          "yp-hero-spotlight__stats",
          p.stats
            .filter((s) => s.value || s.label)
            .map((s) =>
              group(
                "yp-hero-spotlight__stat",
                paragraph(s.value, "yp-hero-spotlight__stat-value") +
                  paragraph(s.label, "yp-hero-spotlight__stat-label"),
              ),
            )
            .join(""),
        )
      : "";

    const inner = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-hero-spotlight__eyebrow") : "",
      p.heading ? heading(p.heading, 1, "yp-hero-spotlight__heading") : "",
      p.body ? paragraph(p.body, "yp-hero-spotlight__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-hero-spotlight__actions") : "",
      stats,
    ]
      .filter(Boolean)
      .join("");

    return group("yp-hero-spotlight", group("yp-hero-spotlight__inner", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-spotlight");
    if (!el) return null;
    return {
      eyebrow: text(el.querySelector(".yp-hero-spotlight__eyebrow")),
      heading: text(el.querySelector(".yp-hero-spotlight__heading")),
      body: text(el.querySelector(".yp-hero-spotlight__body")),
      actions: parseActions(el),
      stats: parseStats(
        el,
        ".yp-hero-spotlight__stat",
        ".yp-hero-spotlight__stat-value",
        ".yp-hero-spotlight__stat-label",
      ),
    };
  },
};
