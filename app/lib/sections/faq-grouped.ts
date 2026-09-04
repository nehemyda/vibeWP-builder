import { group, heading, details } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type FaqGroupedProps = { heading?: string; groups?: Array<{ title: string; items?: Array<{ question: string; answer: string }> }> };

/**
 * Questions grouped under topic headings.
 *
 * The nested-list case, which nothing else in the library exercises: a list of
 * groups, each holding its own list. Worth having because a long FAQ is far
 * easier to scan by topic — Ordering, Delivery, Weddings — than as one run.
 */
export const FaqGrouped: SectionDefinition<FaqGroupedProps> = {
  key: "faq-grouped",
  nodeType: "FaqGrouped",
  name: "FAQ by topic",
  category: "Support",
  description: "Questions grouped under topic headings. Far easier to scan than one long run of twenty.",
  rootClass: "yp-faqg",
  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    groups: { type: "list", label: "Topics", hint: "Two to four topics", of: { title: { type: "text", label: "Topic" }, items: {
          type: "list",
          label: "Questions in it",
          of: {
            question: { type: "text", label: "Question" },
            answer: { type: "text", label: "Answer" },
          },
        } } },
  },
  aiPrompt: "Group by the customer's concern — Ordering, Delivery, Weddings, Payment — not by internal department. Two to four topics, three or four questions each. Invent no prices or policies.",
  sample: {
    heading: "Everything you might want to know",
    groups: [
      { title: "Ordering", items: [ { question: "How do I place an order?", answer: "Call, email, or come in. We confirm everything in writing before charging." }, { question: "Is there a minimum?", answer: "No minimum in the shop. Delivery has one — we'll tell you what it is." } ] },
      { title: "Delivery", items: [ { question: "Where do you deliver?", answer: "The city and villages within about ten miles." }, { question: "Can you deliver on a specific time?", answer: "Morning or afternoon, yes. Exact times we can't promise honestly." } ] },
      { title: "Weddings", items: [ { question: "Do you do consultations?", answer: "Yes, free, in the shop with whoever will make your flowers." }, { question: "How far ahead?", answer: "Three to six months is comfortable. Ask anyway if it's sooner." } ] },
    ],
  },
  toGutenberg(p) {
    const groups = (p.groups ?? []).filter((g) => g?.title).map((g) =>
      group("yp-faqg__group",
        heading(g.title, 3, "yp-faqg__group-title") +
        group("yp-faqg__list", (g.items ?? []).filter((i) => i?.question).map((i) => details(i.question, i.answer ?? "", "yp-faqg__item")).join("")),
      )).join("");
    return group("yp-faqg", (p.heading ? heading(p.heading, 2, "yp-faqg__heading") : "") + group("yp-faqg__groups", groups), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-faqg");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-faqg__heading")),
      groups: el.querySelectorAll(".yp-faqg__group").map((g) => ({
        title: text(g.querySelector(".yp-faqg__group-title")),
        items: g.querySelectorAll(".yp-faqg__item").map((i) => ({ question: text(i.querySelector("summary")), answer: text(i.querySelector("p")) })).filter((i) => i.question),
      })).filter((g) => g.title),
    };
  },
};
