import { group, heading, paragraph } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ConversionGuaranteeProps = {
  heading?: string;
  body?: string;
  promises?: Array<{ title: string; body: string }>;
};

/**
 * The promises that remove the reason not to buy.
 *
 * Distinct from the Services grid, which says what you get; this says what
 * happens if something goes wrong. For a small business competing against
 * bigger names, this section is often what actually closes the sale.
 *
 * Prompt is strict for the same reason as pricing: a guarantee is a contractual
 * commitment. "Full refund within 30 days" invented by a generator is a promise
 * the client is then held to.
 */
export const ConversionGuarantee: SectionDefinition<ConversionGuaranteeProps> = {
  key: "conversion-guarantee",
  nodeType: "ConversionGuarantee",
  name: "Our promises",
  category: "Conversion",
  description:
    "Guarantees and commitments — what happens if something goes wrong. Often the section that closes the sale.",
  rootClass: "yp-promise",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    body: { type: "text", label: "Intro line", maxChars: 160 },
    promises: {
      type: "list",
      label: "Promises",
      hint: "Three or four",
      of: {
        title: { type: "text", label: "The promise" },
        body: { type: "text", label: "What it means in practice" },
      },
    },
  },

  aiPrompt:
    "A guarantee is a commitment the client must honour, so promise only what is safe and generic — " +
    "we answer the phone, we quote before starting, we turn up when we say. Never invent refund " +
    "windows, warranty lengths, insurance cover or accreditations: those are contractual and the " +
    "client will be held to whatever is published.",

  sample: {
    heading: "What we promise",
    body: "Small business, so our name is on every order that leaves the shop.",
    promises: [
      { title: "We quote before we start", body: "You know the price before anything is cut. No adjustments at the till." },
      { title: "We tell you what's actually good", body: "If what you asked for is poor this week, we'll say so and suggest better." },
      { title: "A person answers the phone", body: "During shop hours you get whoever is on the bench, not a call centre." },
    ],
  },

  toGutenberg(p) {
    const items = (p.promises ?? [])
      .filter((x) => x?.title || x?.body)
      .map((x) =>
        group(
          "yp-promise__item",
          (x.title ? heading(x.title, 3, "yp-promise__title") : "") +
            (x.body ? paragraph(x.body, "yp-promise__body") : ""),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-promise__heading") : "",
      p.body ? paragraph(p.body, "yp-promise__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-promise", group("yp-promise__inner", head + group("yp-promise__grid", items)), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-promise");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-promise__heading")),
      body: text(el.querySelector(".yp-promise__intro")),
      promises: el
        .querySelectorAll(".yp-promise__item")
        .map((i) => ({
          title: text(i.querySelector(".yp-promise__title")),
          body: text(i.querySelector(".yp-promise__body")),
        }))
        .filter((i) => i.title || i.body),
    };
  },
};
