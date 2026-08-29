import { group, heading, paragraph } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ConversionComparisonProps = {
  heading?: string;
  intro?: string;
  usLabel?: string;
  themLabel?: string;
  rows?: Array<{ point: string; us: string; them: string }>;
};

/**
 * Us against the usual alternative, row by row.
 *
 * Framed against a CATEGORY, never a named competitor. Naming a rival and
 * characterising their service invites a defamation or comparative-advertising
 * complaint, and it would be the client's business receiving the letter. The
 * prompt enforces the category framing.
 */
export const ConversionComparison: SectionDefinition<ConversionComparisonProps> = {
  key: "conversion-comparison",
  nodeType: "ConversionComparison",
  name: "Comparison table",
  category: "Conversion",
  description:
    "Row-by-row against the usual alternative — a category, never a named competitor. For businesses that lose to cheaper options.",
  rootClass: "yp-compare",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 160 },
    usLabel: { type: "text", label: "Your column heading", maxChars: 28 },
    themLabel: { type: "text", label: "Their column heading", maxChars: 28 },
    rows: {
      type: "list",
      label: "Rows",
      hint: "Four to six comparisons",
      of: {
        point: { type: "text", label: "What's being compared" },
        us: { type: "text", label: "You" },
        them: { type: "text", label: "The alternative" },
      },
    },
  },

  aiPrompt:
    "Compare against a CATEGORY — supermarket flowers, national chains, online-only sellers — and " +
    "never a named business: characterising a named competitor is a legal risk the client carries. " +
    "Be fair; acknowledge where the alternative genuinely wins, because a table where you win every " +
    "row reads as marketing and persuades nobody.",

  sample: {
    heading: "Us or the supermarket",
    intro: "Both have their place. Here's the honest version.",
    usLabel: "Our shop",
    themLabel: "Supermarket",
    rows: [
      { point: "Price", us: "Higher", them: "Cheaper — genuinely" },
      { point: "How long they last", us: "7–10 days, conditioned", them: "3–4 days, often pre-chilled" },
      { point: "Choice on the day", us: "Whatever is good that week", them: "Same six bouquets year round" },
      { point: "Made for the occasion", us: "Built to your brief", them: "Off the shelf" },
      { point: "Late at night", us: "Closed", them: "Open — they win this one" },
    ],
  },

  toGutenberg(p) {
    const header = group(
      "yp-compare__row yp-compare__row--head",
      paragraph("", "yp-compare__point") +
        paragraph(p.usLabel ?? "Us", "yp-compare__us") +
        paragraph(p.themLabel ?? "Alternative", "yp-compare__them"),
    );

    const rows = (p.rows ?? [])
      .filter((r) => r?.point)
      .map((r) =>
        group(
          "yp-compare__row",
          paragraph(r.point, "yp-compare__point") +
            paragraph(r.us ?? "", "yp-compare__us") +
            paragraph(r.them ?? "", "yp-compare__them"),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-compare__heading") : "",
      p.intro ? paragraph(p.intro, "yp-compare__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-compare", head + group("yp-compare__table", header + rows), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-compare");
    if (!el) return null;
    const all = el.querySelectorAll(".yp-compare__row");
    const head = all.find((r) => (r.getAttribute("class") ?? "").includes("--head"));
    return {
      heading: text(el.querySelector(".yp-compare__heading")),
      intro: text(el.querySelector(".yp-compare__intro")),
      usLabel: head ? text(head.querySelector(".yp-compare__us")) : "",
      themLabel: head ? text(head.querySelector(".yp-compare__them")) : "",
      rows: all
        .filter((r) => !(r.getAttribute("class") ?? "").includes("--head"))
        .map((r) => ({
          point: text(r.querySelector(".yp-compare__point")),
          us: text(r.querySelector(".yp-compare__us")),
          them: text(r.querySelector(".yp-compare__them")),
        }))
        .filter((r) => r.point),
    };
  },
};
