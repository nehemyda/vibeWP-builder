import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, htmlBlock, formMount } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormEmbedProps = {
  heading?: string;
  body?: string;
  /** Which form to show — the embed token from Leads & forms. */
  formToken?: string;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * A form built in Leads & forms, placed on a page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PLACEMENT, NOT A FORM BUILDER
 *
 * The website builder never learns what a field is. This section holds one
 * fact — WHICH form — and the form itself is owned, edited and styled in Leads
 * & forms, where a client can also embed it on sites we did not build.
 *
 * That separation is deliberate. An earlier attempt put a whole contact form in
 * this registry, which meant two places defined what a form was and neither
 * could change without the other.
 */
export const FormEmbed: SectionDefinition<FormEmbedProps> = {
  key: "form-embed",
  nodeType: "FormEmbed",
  name: "Contact form",
  category: "Contact",
  description:
    "Shows one of your forms. Built and styled in Leads & forms; enquiries arrive in the same inbox.",
  rootClass: "yp-embed",

  fields: {
    heading: { type: "text", label: "Heading", maxChars: 60 },
    body: { type: "text", label: "Intro line", maxChars: 160 },
  },

  aiPrompt:
    "A heading that says what happens next (“Tell us about your project”) and one line setting " +
    "expectations — when they will hear back. Never invent form fields; the form itself is built elsewhere.",

  sample: {
    heading: "Get in touch",
    body: "Tell us what you need and we'll come back to you within one working day.",
  },

  toGutenberg(p) {
    /*
     * The mount point carries the token; the script renders into it. Both are
     * emitted even when the token is missing, so a page saved before a form
     * existed starts working the moment one is attached.
     */
    const mount = formMount(p.formToken);

    const inner = [
      p.heading ? heading(p.heading, 2, "yp-embed__heading") : "",
      p.body ? paragraph(p.body, "yp-embed__body") : "",
      htmlBlock(mount),
    ]
      .filter(Boolean)
      .join("");

    return group("yp-embed", inner, "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-embed");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-embed__heading")),
      body: text(el.querySelector(".yp-embed__body")),
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
