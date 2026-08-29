import { group, heading, paragraph, details } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type FaqSplitProps = { heading?: string; body?: string; items?: Array<{ question: string; answer: string }> };

/**
 * A sticky heading beside a scrolling list of questions.
 *
 * The heading column uses position: sticky, so on a long list the section title
 * stays visible while the questions scroll past — the reader never loses track
 * of what they are reading. Pure CSS; sticky needs no script.
 */
export const FaqSplit: SectionDefinition<FaqSplitProps> = {
  key: "faq-split",
  nodeType: "FaqSplit",
  name: "FAQ with sticky heading",
  category: "Support",
  description: "Heading stays put while the questions scroll beside it. Keeps context on a long list, with no JavaScript.",
  rootClass: "yp-faqs",
  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    body: { type: "text", label: "Copy under the heading", maxChars: 200 },
    items: { type: "list", label: "Questions", of: { question: { type: "text", label: "Question" }, answer: { type: "text", label: "Answer" } } },
  },
  aiPrompt: "Five to eight questions. The copy under the heading sets expectations — who to ask, how fast they reply. Customer's voice, first person, and no invented policies.",
  sample: {
    heading: "Before you order",
    body: "The things worth knowing. Anything else, the shop phone is answered by a person during opening hours.",
    items: [
      { question: "Do I need to book ahead?", answer: "For a bouquet, no. For a wedding or a big event, yes — as early as you can." },
      { question: "What if the flowers I want aren't in season?", answer: "We'll say so and offer the closest thing that's actually good." },
      { question: "Can you match a photo?", answer: "Usually close, rarely exact — flowers aren't manufactured. We'll be honest about how near we can get." },
      { question: "Do you hire out vases?", answer: "For events, yes, free with the order and returned afterwards." },
      { question: "Is there parking?", answer: "Green Street is closest, free after 6pm." },
    ],
  },
  toGutenberg(p) {
    const aside = group("yp-faqs__aside", (p.heading ? heading(p.heading, 2, "yp-faqs__heading") : "") + (p.body ? paragraph(p.body, "yp-faqs__body") : ""));
    const rows = (p.items ?? []).filter((i) => i?.question).map((i) => details(i.question, i.answer ?? "", "yp-faqs__item")).join("");
    return group("yp-faqs", group("yp-faqs__grid", aside + group("yp-faqs__list", rows)), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-faqs");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-faqs__heading")),
      body: text(el.querySelector(".yp-faqs__body")),
      items: el.querySelectorAll(".yp-faqs__item").map((i) => ({ question: text(i.querySelector("summary")), answer: text(i.querySelector("p")) })).filter((i) => i.question),
    };
  },
};
