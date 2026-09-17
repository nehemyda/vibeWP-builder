import type { HTMLElement } from "node-html-parser";
import { group, heading, details } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FaqProps = {
  heading?: string;
  items?: Array<{ question: string; answer: string }>;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * Questions customers actually ask, as native disclosure rows.
 *
 * Uses core/details, so each row expands with no JavaScript shipped to the
 * exported site and is keyboard accessible without any work on our part. It
 * also means the client edits these as ordinary blocks in wp-admin rather than
 * through a plugin.
 */
export const Faq: SectionDefinition<FaqProps> = {
  key: "faq",
  nodeType: "Faq",
  name: "FAQ",
  category: "Support",
  description:
    "Expandable questions and answers. Handles the objections that otherwise become phone calls.",
  rootClass: "yp-faq",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    items: {
      type: "list",
      label: "Questions",
      hint: "Four to six covers most of what people ring up to ask",
      of: {
        question: { type: "text", label: "Question" },
        answer: { type: "text", label: "Answer" },
      },
    },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Different reason from most: the heading sits outside
     * .yp-faq__list with no shared ancestor, so toGutenberg wraps them
     * together in a NEW element (.yp-faq__inner) — the same fix
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

  aiPrompt:
    "Write the questions this business is genuinely asked before someone buys — price, timing, " +
    "area covered, what happens if plans change. Phrase each in the customer's voice, first person. " +
    "Answer plainly and commit to something specific. Never invent a policy, price or guarantee: " +
    "if a number is unknown, write the answer so the client can drop theirs in.",

  sample: {
    heading: "Common questions",
    items: [
      {
        question: "How far ahead should I order wedding flowers?",
        answer:
          "Three to six months is comfortable for a full wedding, though we can often help at shorter notice — ask and we'll tell you honestly.",
      },
      {
        question: "Do you deliver, and how far?",
        answer:
          "Yes, across the city and surrounding villages. Delivery is free above a minimum order; tell us your postcode and we'll confirm.",
      },
      {
        question: "Can I change my order after placing it?",
        answer:
          "Up to a few days before, yes — flowers are cut to order, so past that point we may have already bought your stems in.",
      },
    ],
  },

  toGutenberg(p) {
    const rows = (p.items ?? [])
      .filter((i) => i?.question)
      .map((i) => details(i.question, i.answer ?? "", "yp-faq__item"))
      .join("");

    const rootClass = [
      "yp-faq",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(
      rootClass,
      group("yp-faq__inner", (p.heading ? heading(p.heading, 2, "yp-faq__heading") : "") + group("yp-faq__list", rows)),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-faq");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";

    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-faq__heading")),
      items: el
        .querySelectorAll(".yp-faq__item")
        .map((item) => ({
          question: text(item.querySelector("summary")),
          answer: text(item.querySelector("p")),
        }))
        .filter((i) => i.question),
    };
  },
};
