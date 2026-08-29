import { group, heading, paragraph, details } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ServicesAccordionProps = {
  heading?: string;
  intro?: string;
  items?: Array<{ title: string; body: string }>;
};

/**
 * Expandable service rows.
 *
 * For a business with a long list — a garage with fifteen services, a clinic
 * with twenty treatments — where a grid of cards becomes an unreadable wall.
 * Collapsed, it is a scannable index; expanded, it holds as much detail as each
 * service needs.
 *
 * Native <details>, so no JavaScript reaches the exported site and keyboard
 * access comes free.
 */
export const ServicesAccordion: SectionDefinition<ServicesAccordionProps> = {
  key: "services-accordion",
  nodeType: "ServicesAccordion",
  name: "Services, expandable",
  category: "Content",
  description:
    "A scannable index that expands per service. For long lists where a card grid becomes a wall. No JavaScript.",
  rootClass: "yp-svca",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 150 },
    items: {
      type: "list",
      label: "Services",
      hint: "Six to fifteen — this layout is for long lists",
      of: {
        title: { type: "text", label: "Service" },
        body: { type: "text", label: "The detail" },
      },
    },
  },

  aiPrompt:
    "Because each row expands, the detail can run to three or four sentences — say what is included, " +
    "how long it takes and what the customer needs to provide. Name each service as a customer " +
    "would search for it.",

  sample: {
    heading: "Everything we offer",
    intro: "Tap any of these for the detail.",
    items: [
      { title: "Wedding flowers", body: "A free consultation first, then a written quote. Bouquets, buttonholes, table arrangements and venue installation. We deliver, set up, and come back to clear afterwards if you'd like us to." },
      { title: "Weekly and fortnightly subscriptions", body: "Delivered to home or office, changing with the season. Vase loaned free, pause whenever you need, no contract. Most people start weekly and settle into fortnightly." },
      { title: "Sympathy and funeral tributes", body: "Handled quietly and quickly. We can deliver to the home, the funeral director or the service directly, and we will always tell you honestly what is achievable at short notice." },
      { title: "Corporate and venue contracts", body: "Regular arrangements for restaurants, hotels and offices, invoiced monthly. We agree a style and budget once, then keep it consistent." },
      { title: "Workshops", body: "Small groups in the shop, seasonal themes, everything provided. Good for teams and birthdays." },
    ],
  },

  toGutenberg(p) {
    const rows = (p.items ?? [])
      .filter((i) => i?.title)
      .map((i) => details(i.title, i.body ?? "", "yp-svca__item"))
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-svca__heading") : "",
      p.intro ? paragraph(p.intro, "yp-svca__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-svca", head + group("yp-svca__list", rows), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-svca");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-svca__heading")),
      intro: text(el.querySelector(".yp-svca__intro")),
      items: el
        .querySelectorAll(".yp-svca__item")
        .map((i) => ({ title: text(i.querySelector("summary")), body: text(i.querySelector("p")) }))
        .filter((i) => i.title),
    };
  },
};
