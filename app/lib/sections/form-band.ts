import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, htmlBlock, formMount } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormBandProps = {
  heading?: string;
  body?: string;
  formToken?: string;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * A dark full-bleed band with the form reversed out of it.
 *
 * The loudest of the five, and the one to use once per page at most — its
 * whole effect comes from being the only dark thing on a light page. The
 * inputs stay light on the dark ground rather than being inverted too: a dark
 * field with pale text reads as disabled, and people do not type into it.
 */
export const FormBand: SectionDefinition<FormBandProps> = {
  key: "form-band",
  nodeType: "FormBand",
  name: "Form on a dark band",
  category: "Contact",
  description: "A full-width dark band with your form on it — the hardest close on a page.",
  rootClass: "yp-formb",

  fields: {
    heading: { type: "text", label: "Heading", maxChars: 48 },
    body: { type: "text", label: "Supporting line", maxChars: 130 },
  },

  aiPrompt:
    "Short and direct — this band is the last thing on the page. The heading is an instruction, " +
    "not a description; the line under it says what happens next.",

  sample: {
    heading: "Ready when you are",
    body: "Send the details and we'll be in touch the same working day.",
  },

  toGutenberg(p) {
    const inner = [
      p.heading ? heading(p.heading, 2, "yp-formb__heading") : "",
      p.body ? paragraph(p.body, "yp-formb__body") : "",
      group("yp-formb__form", htmlBlock(formMount(p.formToken))),
    ]
      .filter(Boolean)
      .join("");

    return group("yp-formb", group("yp-formb__inner", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-formb");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-formb__heading")),
      body: text(el.querySelector(".yp-formb__body")),
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
