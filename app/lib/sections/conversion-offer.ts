import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type ConversionOfferProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  bullets?: Array<{ text: string }>;
  actions?: Action[];
  smallPrint?: string;
};

/**
 * Something free in exchange for getting in touch.
 *
 * A consultation, a survey, a sample — the low-commitment first step for
 * businesses whose real sale is too big to close from a web page. What makes it
 * work is the small print: saying plainly that it costs nothing and carries no
 * obligation removes the suspicion the offer creates.
 */
export const ConversionOffer: SectionDefinition<ConversionOfferProps> = {
  key: "conversion-offer",
  nodeType: "ConversionOffer",
  name: "Free offer",
  category: "Conversion",
  description:
    "A no-cost first step — consultation, survey, sample — with the obligations spelled out. For sales too big to close on a page.",
  rootClass: "yp-offer",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "The offer", maxChars: 60 },
    body: { type: "text", label: "What it involves", maxChars: 180 },
    bullets: { type: "list", label: "What you get", of: { text: { type: "text", label: "Line" } } },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    smallPrint: { type: "text", label: "Small print", hint: "No obligation, how long it takes", maxChars: 130 },
  },

  aiPrompt:
    "Offer only what costs the business nothing to give — advice, a look, a quote. Never invent a " +
    "discount, voucher or free product: that is money the client would have to honour. The small " +
    "print states plainly that it is free and carries no obligation.",

  sample: {
    eyebrow: "NO COST, NO OBLIGATION",
    heading: "Book a free wedding consultation",
    body: "Half an hour in the shop with whoever will actually make your flowers. Bring photos, colours, or nothing at all.",
    bullets: [
      { text: "Honest view on what's achievable in your budget" },
      { text: "What's in season on your date" },
      { text: "A written quote within two days" },
    ],
    actions: [{ label: "Book a slot", href: "#", variant: "primary" }],
    smallPrint: "Free, and you're under no obligation to book with us afterwards.",
  },

  toGutenberg(p) {
    const bullets = (p.bullets ?? [])
      .filter((b) => b?.text)
      .map((b) => group("yp-offer__bullet", paragraph(b.text, "yp-offer__bullet-text")))
      .join("");

    const inner = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-offer__eyebrow") : "",
      p.heading ? heading(p.heading, 2, "yp-offer__heading") : "",
      p.body ? paragraph(p.body, "yp-offer__body") : "",
      bullets ? group("yp-offer__bullets", bullets) : "",
      p.actions?.length ? buttons(p.actions, "yp-offer__actions") : "",
      p.smallPrint ? paragraph(p.smallPrint, "yp-offer__small") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-offer", group("yp-offer__card", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-offer");
    if (!el) return null;
    return {
      eyebrow: text(el.querySelector(".yp-offer__eyebrow")),
      heading: text(el.querySelector(".yp-offer__heading")),
      body: text(el.querySelector(".yp-offer__body")),
      bullets: el
        .querySelectorAll(".yp-offer__bullet")
        .map((b) => ({ text: text(b.querySelector(".yp-offer__bullet-text")) }))
        .filter((b) => b.text),
      actions: parseActions(el),
      smallPrint: text(el.querySelector(".yp-offer__small")),
    };
  },
};
