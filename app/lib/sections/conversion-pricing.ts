import { group, heading, paragraph, list } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ConversionPricingProps = {
  heading?: string;
  intro?: string;
  tiers?: Array<{ name: string; price: string; note?: string; features?: string[]; featured?: string }>;
  footnote?: string;
};

/**
 * Pricing tiers.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PROMPT MATTERS MORE THAN THE LAYOUT HERE
 *
 * Every other section can be filled with plausible generated copy and edited
 * later. A published price cannot: a customer who reads "£45" and is then
 * quoted £90 has a legitimate complaint, and it is the client who takes it, not
 * us. So the prompt is written to produce visibly-unfilled placeholders rather
 * than confident numbers.
 * ─────────────────────────────────────────────────────────────────────
 *
 * "featured" is a string rather than a boolean because form data and the
 * round-trip both carry strings; a truthy check on "false" is a classic way to
 * highlight the wrong tier.
 */
export const ConversionPricing: SectionDefinition<ConversionPricingProps> = {
  key: "conversion-pricing",
  nodeType: "ConversionPricing",
  name: "Pricing tiers",
  category: "Conversion",
  description:
    "Two to four priced tiers with inclusions. Prices are left as placeholders on purpose — a wrong published price is the client's problem, not a typo.",
  rootClass: "yp-pricing",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 160 },
    tiers: {
      type: "list",
      label: "Tiers",
      hint: "Three is the readable maximum on desktop",
      of: {
        name: { type: "text", label: "Tier name" },
        price: { type: "text", label: "Price" },
        note: { type: "text", label: "Under the price" },
        features: { type: "text", label: "Inclusions" },
        featured: { type: "text", label: 'Highlight? "yes" or empty' },
      },
    },
    footnote: { type: "text", label: "Footnote", hint: "VAT, minimums, terms", maxChars: 140 },
  },

  aiPrompt:
    "Do NOT invent prices. Put “From £—” or “POA” in every price field and let the client fill them " +
    "in; a published price they did not agree to is a commitment they have to honour or explain. " +
    "Name the tiers as a customer would recognise them, and list what each includes.",

  sample: {
    heading: "What it costs",
    intro: "Guide prices — tell us what you're planning and we'll quote properly.",
    tiers: [
      { name: "Hand-tied", price: "From £—", note: "per bouquet", features: ["Seasonal stems", "Wrapped and ready", "Collection or local delivery"] },
      { name: "Subscription", price: "From £—", note: "per month", features: ["Weekly or fortnightly", "Changes with the season", "Pause any time", "Vase loaned free"], featured: "yes" },
      { name: "Weddings", price: "POA", note: "quoted per event", features: ["Consultation included", "Bouquets and buttonholes", "Venue setup", "Hire pieces available"] },
    ],
    footnote: "Prices exclude VAT. Wedding quotes hold for 60 days.",
  },

  toGutenberg(p) {
    const tiers = (p.tiers ?? [])
      .filter((t) => t?.name || t?.price)
      .map((t) =>
        group(
          `yp-pricing__tier${t.featured ? " yp-pricing__tier--featured" : ""}`,
          [
            t.name ? heading(t.name, 3, "yp-pricing__name") : "",
            t.price ? paragraph(t.price, "yp-pricing__price") : "",
            t.note ? paragraph(t.note, "yp-pricing__note") : "",
            t.features?.length ? list(t.features, "yp-pricing__features") : "",
          ]
            .filter(Boolean)
            .join(""),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-pricing__heading") : "",
      p.intro ? paragraph(p.intro, "yp-pricing__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group(
      "yp-pricing",
      head +
        group("yp-pricing__grid", tiers) +
        (p.footnote ? paragraph(p.footnote, "yp-pricing__footnote") : ""),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-pricing");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-pricing__heading")),
      intro: text(el.querySelector(".yp-pricing__intro")),
      tiers: el
        .querySelectorAll(".yp-pricing__tier")
        .map((t) => ({
          name: text(t.querySelector(".yp-pricing__name")),
          price: text(t.querySelector(".yp-pricing__price")),
          note: text(t.querySelector(".yp-pricing__note")),
          features: t.querySelectorAll(".yp-pricing__features li").map((li) => li.textContent.trim()).filter(Boolean),
          ...((t.getAttribute("class") ?? "").includes("--featured") ? { featured: "yes" } : {}),
        }))
        .filter((t) => t.name || t.price),
      footnote: text(el.querySelector(".yp-pricing__footnote")),
    };
  },
};
