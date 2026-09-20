import { group, heading, paragraph } from "@/lib/wp/blocks";
import { text, parseStats } from "./shared";
import type { SectionDefinition } from "./types";

export type ContentStatsProps = {
  heading?: string;
  intro?: string;
  stats?: Array<{ value: string; label: string }>;
};

/**
 * A band of large numbers.
 *
 * High impact for very little markup, which is why it was worth building early:
 * years trading, jobs completed, rating. Numbers carry credibility that prose
 * cannot, because they are checkable.
 *
 * The prompt is deliberately strict about invention. A made-up "2,000 happy
 * customers" is a factual claim published on a real business's site, and unlike
 * a clumsy sentence it exposes the client rather than merely reading badly.
 */
export const ContentStats: SectionDefinition<ContentStatsProps> = {
  key: "content-stats",
  nodeType: "ContentStats",
  name: "Numbers band",
  category: "Content",
  description:
    "Three or four large figures — years trading, jobs done, rating. Credibility that prose can't buy.",
  rootClass: "yp-stats",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 140 },
    stats: {
      type: "list",
      label: "Figures",
      hint: "Three or four",
      of: {
        value: { type: "text", label: "Figure" },
        label: { type: "text", label: "What it counts" },
      },
    },
  },

  aiPrompt:
    "Stats are figures ONLY from the business details supplied — opening hours, a year the owner " +
    "stated, a service count, a location. Never invent one, and never use a \"placeholder\" number: " +
    "a round figure reads as a claim the moment it is published, and the client may not notice. " +
    "If no real figure was supplied, return an empty stats list — the section renders without the row." +
    " Do not write a heading or intro that promises numbers the list does not contain.",

  sample: {
    heading: "What you can count on",
    intro: "The numbers we'd give you if you asked in the shop.",
    stats: [
      { value: "Mon–Sat", label: "Open six days" },
      { value: "Bath", label: "Growers we buy from" },
      { value: "Same day", label: "Collection available" },
    ],
  },

  toGutenberg(p) {
    const items = (p.stats ?? [])
      .filter((s) => s?.value || s?.label)
      .map((s) =>
        group(
          "yp-stats__item",
          paragraph(s.value, "yp-stats__value") + paragraph(s.label, "yp-stats__label"),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-stats__heading") : "",
      p.intro ? paragraph(p.intro, "yp-stats__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    /* No figures, no grid. An empty styled container is the shape verify-carry
       exists to catch, and it is what a fully-stripped stats row would be. */
    const grid = items ? group("yp-stats__grid", items) : "";
    return group("yp-stats", group("yp-stats__inner", head + grid), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-stats");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-stats__heading")),
      intro: text(el.querySelector(".yp-stats__intro")),
      stats: parseStats(el, ".yp-stats__item", ".yp-stats__value", ".yp-stats__label"),
    };
  },
};
