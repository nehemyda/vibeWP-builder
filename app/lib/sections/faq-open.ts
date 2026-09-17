import { group, heading, paragraph } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type FaqOpenProps = {
  heading?: string;
  intro?: string;
  items?: Array<{ question: string; answer: string }>;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * Questions and answers always visible, numbered.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY AN ALWAYS-OPEN VARIANT EXISTS
 *
 * Accordions hide their answers behind a click, and while search engines do
 * index collapsed <details> content, the reader has to work for it. For the
 * three or four questions that genuinely decide a sale — do you cover my area,
 * how much, how soon — hiding the answer is the wrong trade.
 *
 * So this one omits the interaction entirely. Fewer questions, all readable at
 * a glance, no clicking.
 * ─────────────────────────────────────────────────────────────────────
 */
export const FaqOpen: SectionDefinition<FaqOpenProps> = {
  key: "faq-open",
  nodeType: "FaqOpen",
  name: "FAQ, always open",
  category: "Support",
  description: "Numbered questions with answers always visible. For the three or four that decide the sale — no clicking.",
  rootClass: "yp-faqo",
  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 150 },
    items: { type: "list", label: "Questions", hint: "Three to five only", of: { question: { type: "text", label: "Question" }, answer: { type: "text", label: "Answer" } } },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Different reason from most: heading and intro sit
     * outside .yp-faqo__list with no shared ancestor, so toGutenberg wraps
     * them together in a NEW element (.yp-faqo__inner) — the same fix
     * content-gallery needed.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The heading and questions stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the heading and questions.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },
  aiPrompt: "Only the questions that decide whether someone buys — coverage area, cost, timing, what happens if plans change. Three to five, no more, because every answer is visible. Two or three sentences each.",
  sample: {
    heading: "The three things everyone asks",
    intro: "Answered properly, so you don't have to ring to find out.",
    items: [
      { question: "Do you cover my area?", answer: "The city and villages within roughly ten miles. Further out we'll still quote, but there's a delivery charge and we'll tell you what it is up front." },
      { question: "What does it cost?", answer: "Hand-tied bouquets start low and go as far as you want. Weddings are quoted per event after a free consultation — no obligation." },
      { question: "How quickly can you do it?", answer: "Same day for most things if you ring before lunch. Funerals we prioritise, always." },
    ],
  },
  toGutenberg(p) {
    const rows = (p.items ?? []).filter((i) => i?.question).map((i) =>
      group("yp-faqo__item", heading(i.question, 3, "yp-faqo__question") + (i.answer ? paragraph(i.answer, "yp-faqo__answer") : ""))).join("");
    const head = [p.heading ? heading(p.heading, 2, "yp-faqo__heading") : "", p.intro ? paragraph(p.intro, "yp-faqo__intro") : ""].filter(Boolean).join("");
    const rootClass = [
      "yp-faqo",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(rootClass, group("yp-faqo__inner", head + group("yp-faqo__list", rows)), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-faqo");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-faqo__heading")),
      intro: text(el.querySelector(".yp-faqo__intro")),
      items: el.querySelectorAll(".yp-faqo__item").map((i) => ({ question: text(i.querySelector(".yp-faqo__question")), answer: text(i.querySelector(".yp-faqo__answer")) })).filter((i) => i.question),
    };
  },
};
