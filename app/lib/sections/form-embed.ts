import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, htmlBlock, formMount } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormEmbedProps = {
  heading?: string;
  body?: string;
  /** Which form to show — the embed token from Leads & forms. */
  formToken?: string;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
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
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Different reason from most: this section's own
     * max-width already lives on the root, not shared with anything else,
     * and there is no wrapper at all to reach into — u-row--full overrides
     * the root directly instead.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The heading and form stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the heading and form.",
      choices: ["contained", "full"],
      default: "contained",
    },
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

    const rootClass = [
      "yp-embed",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(rootClass, inner, "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-embed");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-embed__heading")),
      body: text(el.querySelector(".yp-embed__body")),
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
