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
    "Only figures the client can stand behind. If a real number was not supplied, use an obviously " +
    "round placeholder the client will correct — never a precise-looking invention like 2,847, which " +
    "reads as verified and will be published as a factual claim.",

  sample: {
    heading: "Fourteen years on the same street",
    intro: "The numbers we'd give you if you asked in the shop.",
    stats: [
      { value: "500+", label: "Weddings arranged" },
      { value: "14", label: "Years trading" },
      { value: "4.9★", label: "From 300+ reviews" },
      { value: "30mi", label: "Growers we buy within" },
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

    return group("yp-stats", group("yp-stats__inner", head + group("yp-stats__grid", items)), "section");
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
