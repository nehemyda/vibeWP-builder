import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, htmlBlock, formMount } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormCardProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  formToken?: string;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * A form lifted onto a card, over a tinted full-width band.
 *
 * The band separates the ask from whatever came before it, and the card gives
 * the form an edge to sit against — which matters because a form on a plain
 * page reads as part of the page rather than as the thing to do next. Centred
 * and capped narrow: a wide form looks like paperwork.
 */
export const FormCard: SectionDefinition<FormCardProps> = {
  key: "form-card",
  nodeType: "FormCard",
  name: "Form on a card",
  category: "Contact",
  description: "A tinted band with your form raised on a card — the clear close to a page.",
  rootClass: "yp-formc",

  fields: {
    eyebrow: { type: "text", label: "Small label above", maxChars: 28 },
    heading: { type: "text", label: "Heading", maxChars: 56 },
    body: { type: "text", label: "Supporting line", maxChars: 150 },
  },

  aiPrompt:
    "The eyebrow is two or three words naming the action (“Get in touch”, “Book a visit”). " +
    "The heading is the invitation; the supporting line removes one reason to hesitate.",

  sample: {
    eyebrow: "Get in touch",
    heading: "Start your order",
    body: "Tell us the occasion and roughly when you need it — we'll take it from there.",
  },

  toGutenberg(p) {
    const inner = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-formc__eyebrow") : "",
      p.heading ? heading(p.heading, 2, "yp-formc__heading") : "",
      p.body ? paragraph(p.body, "yp-formc__body") : "",
      group("yp-formc__card", htmlBlock(formMount(p.formToken))),
    ]
      .filter(Boolean)
      .join("");

    return group("yp-formc", group("yp-formc__inner", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-formc");
    if (!el) return null;
    return {
      eyebrow: text(el.querySelector(".yp-formc__eyebrow")),
      heading: text(el.querySelector(".yp-formc__heading")),
      body: text(el.querySelector(".yp-formc__body")),
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
