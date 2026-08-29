import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FeaturesGridProps = {
  heading?: string;
  intro?: string;
  items?: Array<{ title: string; body: string }>;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * What the business does, as a grid of named services.
 *
 * The first repeating-content section, which is the reason it was built early:
 * it proves the registry handles a `list` field — items the AI generates a
 * variable number of, and the parser has to read back as an array rather than a
 * fixed set of named slots.
 */
export const FeaturesGrid: SectionDefinition<FeaturesGridProps> = {
  key: "features-grid",
  nodeType: "FeaturesGrid",
  name: "Services grid",
  category: "Content",
  description:
    "Three to six named services or capabilities, each with a short explanation. The section that answers “what do you actually do?”",
  rootClass: "yp-features",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", hint: "Optional context above the grid", maxChars: 160 },
    items: {
      type: "list",
      label: "Services",
      hint: "Three or six read best — the grid is three across",
      of: {
        title: { type: "text", label: "Service name" },
        body: { type: "text", label: "What it involves" },
      },
    },
  },

  aiPrompt:
    "List the distinct services this business sells, in the words a customer would use to search for them. " +
    "Each needs a short concrete name and one sentence on what it involves or includes. " +
    "Prefer three or six items. Never invent a service the business plainly would not offer.",

  sample: {
    heading: "What we do",
    intro: "Everything from a single arrangement to a full wedding, grown and made locally.",
    items: [
      { title: "Wedding flowers", body: "Bouquets, buttonholes and venue arrangements, planned around your colours and season." },
      { title: "Weekly subscriptions", body: "A fresh arrangement delivered to your home or office, changing with what's in bloom." },
      { title: "Sympathy tributes", body: "Discreet, same-day arrangements handled with care and delivered where they're needed." },
    ],
  },

  toGutenberg(p) {
    const items = (p.items ?? [])
      .filter((i) => i?.title || i?.body)
      .map((i) =>
        group(
          "yp-features__item",
          [
            i.title ? heading(i.title, 3, "yp-features__item-title") : "",
            i.body ? paragraph(i.body, "yp-features__item-body") : "",
          ]
            .filter(Boolean)
            .join(""),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-features__heading") : "",
      p.intro ? paragraph(p.intro, "yp-features__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group(
      "yp-features",
      head + group("yp-features__grid", items),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-features");
    if (!el) return null;

    return {
      heading: text(el.querySelector(".yp-features__heading")),
      intro: text(el.querySelector(".yp-features__intro")),
      items: el
        .querySelectorAll(".yp-features__item")
        .map((item) => ({
          title: text(item.querySelector(".yp-features__item-title")),
          body: text(item.querySelector(".yp-features__item-body")),
        }))
        // A card the client emptied in wp-admin should disappear, not come back
        // as a blank grid cell.
        .filter((i) => i.title || i.body),
    };
  },
};
