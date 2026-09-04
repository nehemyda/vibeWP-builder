import type { HTMLElement } from "node-html-parser";
import { group, paragraph, heading, list, buttons, image, requireAlt } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type HeroSplitProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  features?: string[];
  actions?: Array<{ label: string; href: string; variant: "primary" | "outline" | "ghost" }>;
  image?: { url?: string; alt?: string; id?: number; width?: number; height?: number };
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * The original section, moved here from lib/wp/blocks.ts unchanged.
 *
 * Deliberately migrated first and byte-for-byte: it is the only section with
 * live client sites behind it, so it doubles as the regression test for the
 * registry. If exported markup shifts even slightly, the abstraction is wrong.
 */
export const HeroSplit: SectionDefinition<HeroSplitProps> = {
  key: "hero-split",
  nodeType: "HeroSplit",
  name: "Split hero",
  category: "Hero",
  description:
    "Headline, supporting copy and two buttons beside a portrait image. The opening section of a page.",
  rootClass: "yp-hero",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", hint: "Short label above the headline", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 70 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 220 },
    /*
     * Declared late, and that was the defect.
     *
     * It round-trips through both the serializer and the parser and the theme
     * styles it as a two-column ticked list — but with no FieldSpec it was
     * invisible to the admin form and to the generation prompt, which derives
     * from `fields`. So nothing ever wrote one, the list never appeared on a
     * generated site, and any edit that rebuilt the props deleted one a client
     * had. A whole working feature reachable by no one.
     */
    features: {
      type: "list",
      label: "Feature lines",
      hint: "Three or four short reassurances, a few words each. Shown as a ticked list.",
    },
    actions: {
      type: "list",
      label: "Buttons",
      hint: "A primary and an outline action",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: { type: "image", label: "Photo", hint: "Portrait crop, 4:5" },
  },

  aiPrompt:
    "Open the page. State what the business does and who it serves, in the customer's words. " +
    "The eyebrow is a short credibility or urgency cue. Two actions: one primary, one secondary. " +
    "The feature lines answer the doubts that stop someone booking — hours, cost, access — not a " +
    "restatement of the services.",

  sample: {
    eyebrow: "NEW PATIENTS WELCOME",
    heading: "Friendly, Modern Dental Care for the Whole Family",
    body: "Same-week appointments, gentle hygienists, and painless checkups your kids won't dread.",
    features: [
      "Evening and Saturday slots",
      "Most insurers accepted",
      "Nervous patients welcome",
      "Free parking on site",
    ],
    actions: [
      { label: "Book an Appointment", href: "#", variant: "primary" },
      { label: "View Services", href: "#", variant: "outline" },
    ],
    image: {
      url: "https://images.pexels.com/photos/6502621/pexels-photo-6502621.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
      alt: "Dentist with protective gear examining patient in a modern dental clinic.",
    },
  },

  toGutenberg(p) {
    const copy = group(
      "yp-hero__copy",
      [
        p.eyebrow ? paragraph(p.eyebrow, "yp-hero__eyebrow") : "",
        p.heading ? heading(p.heading, 1, "yp-hero__heading") : "",
        p.body ? paragraph(p.body, "yp-hero__body") : "",
        p.features?.length ? list(p.features, "yp-hero__features") : "",
        p.actions?.length ? buttons(p.actions, "yp-hero__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    // The second grid column. Its absence is why every exported hero was
    // single-column, and why the theme's mobile `order: -1` — which puts the
    // photo above the copy on phones — had nothing to reorder.
    const media = p.image?.url
      ? group(
          "yp-hero__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-hero__frame", {
            id: p.image.id,
            width: p.image.width,
            height: p.image.height,
          }),
        )
      : "";

    return group("yp-hero", group("yp-hero__grid", copy + media), "section");
  },

  fromGutenberg(root) {
    const hero = root.querySelector(".yp-hero");
    if (!hero) return null;

    const img = hero.querySelector(".yp-hero__frame img");
    const url = img?.getAttribute("src")?.trim();
    // `wp-image-<id>` survives editor saves more reliably than block-attribute JSON.
    const idMatch = img?.getAttribute("class")?.match(/wp-image-(\d+)/);
    const width = Number(img?.getAttribute("width"));
    const height = Number(img?.getAttribute("height"));

    const actions: NonNullable<HeroSplitProps["actions"]> = [];
    for (const btn of hero.querySelectorAll(".wp-block-button")) {
      const anchor = btn.querySelector("a");
      const label = text(anchor);
      if (!label) continue;
      const cls = btn.getAttribute("class") ?? "";
      actions.push({
        label,
        href: anchor?.getAttribute("href")?.trim() || "#",
        variant: cls.includes("yp-btn--outline")
          ? "outline"
          : cls.includes("yp-btn--ghost")
            ? "ghost"
            : "primary",
      });
    }

    return {
      eyebrow: text(hero.querySelector(".yp-hero__eyebrow")),
      heading: text(hero.querySelector(".yp-hero__heading")),
      body: text(hero.querySelector(".yp-hero__body")),
      features: hero
        .querySelectorAll(".yp-hero__features li")
        .map((li) => li.textContent.trim())
        .filter(Boolean),
      actions,
      ...(url
        ? {
            image: {
              url,
              alt: img?.getAttribute("alt")?.trim() ?? "",
              ...(idMatch ? { id: Number(idMatch[1]) } : {}),
              ...(Number.isFinite(width) && width > 0 ? { width } : {}),
              ...(Number.isFinite(height) && height > 0 ? { height } : {}),
            },
          }
        : {}),
    };
  },
};
