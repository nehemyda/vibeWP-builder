import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type CtaBoxedProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  smallPrint?: string;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * A bordered card inside the container, rather than a full-bleed band.
 *
 * Every other CTA here runs edge to edge, which is emphatic but repetitive if a
 * page needs more than one ask. A contained card is quieter and can be used
 * twice on a page without the design shouting.
 */
export const CtaBoxed: SectionDefinition<CtaBoxedProps> = {
  key: "cta-boxed",
  nodeType: "CtaBoxed",
  name: "CTA, boxed card",
  category: "Conversion",
  description: "A bordered card rather than a full-width band. Quiet enough to use more than once on a page.",
  rootClass: "yp-ctabox",
  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 36 },
    heading: { type: "text", label: "The ask", maxChars: 55 },
    body: { type: "text", label: "Supporting copy", maxChars: 150 },
    actions: { type: "list", label: "Buttons", of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } } },
    smallPrint: { type: "text", label: "Small print", maxChars: 100 },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-ctabox__card already wraps everything under the root with nothing
     * else emitted alongside it. Width is the one worth a second thought
     * here specifically: this card exists to be the QUIET, contained CTA —
     * "every other CTA here runs edge to edge... a contained card is
     * quieter" is this section's own reason for existing, per its own
     * comment above. Full width still works mechanically; whether it still
     * looks like this section is meant to is a client's call to make while
     * looking at it, the same as any other choice here.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The card stays the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches the card itself edge to edge — this card is designed to be the contained, quieter CTA, so contained is usually right.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },
  aiPrompt: "One clear next step. The small print removes the last hesitation — cost, commitment, or how long it takes. Skip the eyebrow unless it adds urgency.",
  sample: { eyebrow: "NO OBLIGATION", heading: "Get a quote this week", body: "Send us the date and a rough budget. We'll reply with options and prices.", actions: [{ label: "Request a quote", href: "#", variant: "primary" }, { label: "Call the shop", href: "#", variant: "outline" }], smallPrint: "Quotes are free and hold for 60 days." },
  toGutenberg(p) {
    const inner = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-ctabox__eyebrow") : "",
      p.heading ? heading(p.heading, 2, "yp-ctabox__heading") : "",
      p.body ? paragraph(p.body, "yp-ctabox__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-ctabox__actions") : "",
      p.smallPrint ? paragraph(p.smallPrint, "yp-ctabox__small") : "",
    ].filter(Boolean).join("");
    const rootClass = [
      "yp-ctabox",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(rootClass, group("yp-ctabox__card", inner), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ctabox");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      eyebrow: text(el.querySelector(".yp-ctabox__eyebrow")),
      heading: text(el.querySelector(".yp-ctabox__heading")),
      body: text(el.querySelector(".yp-ctabox__body")),
      actions: parseActions(el),
      smallPrint: text(el.querySelector(".yp-ctabox__small")),
    };
  },
};
