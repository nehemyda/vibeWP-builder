import { group, heading, paragraph, details } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type FaqTwoColumnProps = { heading?: string; intro?: string; items?: Array<{ question: string; answer: string }> };
const T = text;

/**
 * The accordion list, in two columns.
 *
 * For businesses with a lot of questions — eight or ten as a single column is a
 * wall to scroll past. Columns are CSS `columns`, not a grid, so a row of
 * uneven answers doesn't leave gaps.
 */
export const FaqTwoColumn: SectionDefinition<FaqTwoColumnProps> = {
  key: "faq-two-column",
  nodeType: "FaqTwoColumn",
  name: "FAQ, two columns",
  category: "Support",
  description: "Expandable questions split across two columns. For when eight or more questions would be a wall.",
  rootClass: "yp-faq2",
  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 150 },
    items: { type: "list", label: "Questions", hint: "Six to twelve", of: { question: { type: "text", label: "Question" }, answer: { type: "text", label: "Answer" } } },
  },
  aiPrompt: "Six to twelve real pre-purchase questions in the customer's voice, first person. Answer plainly and commit to something specific. Never invent a price, policy or guarantee — write answers the client can drop their own detail into.",
  sample: {
    heading: "Questions we get asked",
    intro: "If yours isn't here, ring us — we'd rather answer it properly.",
    items: [
      { question: "How far ahead should I order?", answer: "A few days for a bouquet, three to six months for a wedding. We can often help sooner — ask." },
      { question: "Do you deliver?", answer: "Across the city and nearby villages. Tell us your postcode and we'll confirm the charge." },
      { question: "Can I change my order?", answer: "Up to a couple of days before. After that we may already have bought your stems." },
      { question: "What if I don't know what I want?", answer: "Most people don't. Tell us the occasion and budget and we'll suggest." },
      { question: "Do you do funerals?", answer: "Yes, and at short notice. Call and we'll handle it quietly." },
      { question: "Are the flowers British?", answer: "Mostly, in season. We'll tell you honestly what isn't." },
    ],
  },
  toGutenberg(p) {
    const rows = (p.items ?? []).filter((i) => i?.question).map((i) => details(i.question, i.answer ?? "", "yp-faq2__item")).join("");
    const head = [p.heading ? heading(p.heading, 2, "yp-faq2__heading") : "", p.intro ? paragraph(p.intro, "yp-faq2__intro") : ""].filter(Boolean).join("");
    return group("yp-faq2", head + group("yp-faq2__cols", rows), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-faq2");
    if (!el) return null;
    return {
      heading: T(el.querySelector(".yp-faq2__heading")),
      intro: T(el.querySelector(".yp-faq2__intro")),
      items: el.querySelectorAll(".yp-faq2__item").map((i) => ({ question: T(i.querySelector("summary")), answer: T(i.querySelector("p")) })).filter((i) => i.question),
    };
  },
};
