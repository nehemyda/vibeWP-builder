import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type CtaBandProps = {
  heading?: string;
  body?: string;
  actions?: Array<{ label: string; href: string; variant: "primary" | "outline" | "ghost" }>;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * A full-width tinted band asking for the next step.
 *
 * Structurally the odd one out: every other section sits inside the 1160px
 * container, but this one is full-bleed with its own inner container, so the
 * colour runs edge to edge. That is why it has a `__inner` wrapper the others
 * don't need.
 */
export const CtaBand: SectionDefinition<CtaBandProps> = {
  key: "cta-band",
  nodeType: "CtaBand",
  name: "Call to action",
  category: "Conversion",
  description:
    "A full-width tinted band with one clear ask. Sits near the bottom of a page, or between long content sections.",
  rootClass: "yp-cta",

  fields: {
    heading: { type: "text", label: "The ask", maxChars: 60 },
    body: { type: "text", label: "Supporting line", maxChars: 140 },
    actions: {
      type: "list",
      label: "Buttons",
      hint: "One is stronger than two here",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
  },

  aiPrompt:
    "One clear next step, phrased as the customer's own intent (“Book an appointment”, not “Submit”). " +
    "The supporting line removes a reason to hesitate — cost, commitment, or how long it takes. " +
    "Prefer a single button; two dilutes it.",

  sample: {
    heading: "Ready to order?",
    body: "Tell us the occasion and your budget — we'll come back within a day with options.",
    actions: [{ label: "Start an order", href: "#", variant: "primary" }],
  },

  toGutenberg(p) {
    const inner = [
      p.heading ? heading(p.heading, 2, "yp-cta__heading") : "",
      p.body ? paragraph(p.body, "yp-cta__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-cta__actions") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-cta", group("yp-cta__inner", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-cta");
    if (!el) return null;

    const actions: NonNullable<CtaBandProps["actions"]> = [];
    for (const btn of el.querySelectorAll(".wp-block-button")) {
      const anchor = btn.querySelector("a");
      const label = text(anchor);
      if (!label) continue;
      const cls = btn.getAttribute("class") ?? "";
      actions.push({
        label,
        href: anchor?.getAttribute("href")?.trim() || "#",
        variant: cls.includes("yp-btn--outline")
          ? "outline"
          : cls.includes("yp-btn--ghost")
            ? "ghost"
            : "primary",
      });
    }

    return {
      heading: text(el.querySelector(".yp-cta__heading")),
      body: text(el.querySelector(".yp-cta__body")),
      actions,
    };
  },
};
