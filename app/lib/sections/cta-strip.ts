import { group, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type CtaStripProps = { text?: string; actions?: Action[] };

/**
 * A single high-contrast line.
 *
 * The thinnest possible ask — one sentence and a button on a coloured strip.
 * Deliberately NOT sticky: a bar pinned to the viewport covers content on
 * phones, is a known accessibility annoyance, and would need JavaScript in the
 * exported site. As a static strip it does most of the job and none of the harm.
 */
export const CtaStrip: SectionDefinition<CtaStripProps> = {
  key: "cta-strip",
  nodeType: "CtaStrip",
  name: "CTA strip",
  category: "Conversion",
  description: "One line and a button on a coloured strip. Not sticky, deliberately — a pinned bar covers content on phones.",
  rootClass: "yp-ctastrip",
  fields: {
    text: { type: "text", label: "The line", maxChars: 80 },
    actions: { type: "list", label: "Button", of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } } },
  },
  aiPrompt: "One sentence, under twelve words, plus one button. Announce something concrete — availability, a deadline, a free step.",
  sample: { text: "Taking wedding bookings for next spring now.", actions: [{ label: "Check your date", href: "#", variant: "primary" }] },
  toGutenberg(p) {
    return group("yp-ctastrip", group("yp-ctastrip__inner",
      (p.text ? paragraph(p.text, "yp-ctastrip__text") : "") + (p.actions?.length ? buttons(p.actions, "yp-ctastrip__actions") : "")), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ctastrip");
    if (!el) return null;
    return { text: text(el.querySelector(".yp-ctastrip__text")), actions: parseActions(el) };
  },
};
