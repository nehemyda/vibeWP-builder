import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type CtaSplitProps = { heading?: string; body?: string; actions?: Action[] };

/**
 * Copy on the left, the button hard right, on one full-width line.
 *
 * The most compact ask in the set — it reads as a single line rather than a
 * section, so it can sit mid-page between content blocks without interrupting
 * the argument the way a tall centred band does.
 */
export const CtaSplit: SectionDefinition<CtaSplitProps> = {
  key: "cta-split",
  nodeType: "CtaSplit",
  name: "CTA, inline split",
  category: "Conversion",
  description: "Copy left, button right, one line. Compact enough to sit mid-page without interrupting the flow.",
  rootClass: "yp-ctasplit",
  fields: {
    heading: { type: "text", label: "The ask", maxChars: 50 },
    body: { type: "text", label: "One supporting line", maxChars: 110 },
    actions: { type: "list", label: "Buttons", hint: "One", of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } } },
  },
  aiPrompt: "Very short — this renders on one line at desktop width. Heading under seven words, supporting line under fifteen, one button phrased as the customer's intent.",
  sample: { heading: "Know what you want?", body: "Tell us the occasion and we'll come back within a day.", actions: [{ label: "Start an order", href: "#", variant: "primary" }] },
  toGutenberg(p) {
    const copy = group("yp-ctasplit__copy", (p.heading ? heading(p.heading, 2, "yp-ctasplit__heading") : "") + (p.body ? paragraph(p.body, "yp-ctasplit__body") : ""));
    return group("yp-ctasplit", group("yp-ctasplit__inner", copy + (p.actions?.length ? buttons(p.actions, "yp-ctasplit__actions") : "")), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ctasplit");
    if (!el) return null;
    return { heading: text(el.querySelector(".yp-ctasplit__heading")), body: text(el.querySelector(".yp-ctasplit__body")), actions: parseActions(el) };
  },
};
