import { group, heading, paragraph, details, buttons, paragraphLink, contactHref } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type FaqWithHelpProps = {
  heading?: string;
  items?: Array<{ question: string; answer: string }>;
  helpHeading?: string;
  helpBody?: string;
  phone?: string;
  actions?: Action[];
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * Accordions with a "still stuck?" panel beside them.
 *
 * An FAQ exists to prevent phone calls, but a customer whose question ISN'T
 * listed hits a dead end — and the usual outcome is that they leave rather than
 * hunt for the contact page. This keeps the escape route visible next to the
 * questions, with a tappable number.
 */
export const FaqWithHelp: SectionDefinition<FaqWithHelpProps> = {
  key: "faq-with-help",
  nodeType: "FaqWithHelp",
  name: "FAQ with help panel",
  category: "Support",
  description: "Questions beside a “still stuck?” panel with a tappable number. Catches the customer whose question isn't listed.",
  rootClass: "yp-faqh",
  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    items: { type: "list", label: "Questions", of: { question: { type: "text", label: "Question" }, answer: { type: "text", label: "Answer" } } },
    helpHeading: { type: "text", label: "Panel heading", maxChars: 40 },
    helpBody: { type: "text", label: "Panel copy", maxChars: 140 },
    phone: { type: "text", label: "Phone" },
    actions: { type: "list", label: "Panel buttons", of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } } },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-faqh__grid already wraps everything under the root with nothing
     * else emitted alongside it.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The questions and panel stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the questions and panel.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },
  aiPrompt: "Four to six questions. The panel copy should make ringing feel easy, not like a last resort — say who answers and when. Leave the phone empty unless a real number was supplied.",
  sample: {
    heading: "Common questions",
    items: [
      { question: "How long will they last?", answer: "Seven to ten days for most things, if you change the water. We'll tell you which stems go over faster." },
      { question: "Do you take card?", answer: "Card, cash, and bank transfer for larger orders." },
      { question: "Can I collect?", answer: "Yes — tell us a time and it'll be ready on the bench." },
      { question: "Do you do subscriptions?", answer: "Weekly or fortnightly, pause any time, no contract." },
    ],
    helpHeading: "Still stuck?",
    helpBody: "Ring the shop during opening hours and you'll get whoever is on the bench.",
    phone: "01225 000 000",
    actions: [{ label: "Email us instead", href: "#", variant: "outline" }],
  },
  toGutenberg(p) {
    const rows = (p.items ?? []).filter((i) => i?.question).map((i) => details(i.question, i.answer ?? "", "yp-faqh__item")).join("");
    const left = group("yp-faqh__main", (p.heading ? heading(p.heading, 2, "yp-faqh__heading") : "") + group("yp-faqh__list", rows));
    const panel = group("yp-faqh__panel", [
      p.helpHeading ? heading(p.helpHeading, 3, "yp-faqh__panel-heading") : "",
      p.helpBody ? paragraph(p.helpBody, "yp-faqh__panel-body") : "",
      p.phone ? paragraphLink(p.phone, contactHref("phone", p.phone), "yp-faqh__phone") : "",
      p.actions?.length ? buttons(p.actions, "yp-faqh__actions") : "",
    ].filter(Boolean).join(""));
    const rootClass = [
      "yp-faqh",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(rootClass, group("yp-faqh__grid", left + panel), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-faqh");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-faqh__heading")),
      items: el.querySelectorAll(".yp-faqh__item").map((i) => ({ question: text(i.querySelector("summary")), answer: text(i.querySelector("p")) })).filter((i) => i.question),
      helpHeading: text(el.querySelector(".yp-faqh__panel-heading")),
      helpBody: text(el.querySelector(".yp-faqh__panel-body")),
      phone: text(el.querySelector(".yp-faqh__phone")),
      actions: parseActions(el),
    };
  },
};
