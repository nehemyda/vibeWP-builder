import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, image, htmlBlock, formMount, requireAlt } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormPhotoProps = {
  heading?: string;
  body?: string;
  image?: { url: string; alt: string };
  formToken?: string;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * A photograph holding one side, the form the other.
 *
 * For businesses where the place IS the argument — a bakery, a salon, a
 * workshop. The picture does the persuading the copy would otherwise have to,
 * which is why this one carries less text than the other form sections rather
 * than the same amount alongside an image.
 *
 * The photo goes BELOW the form on a phone: an image that pushes the fields off
 * the first screen costs enquiries, however good it is.
 */
export const FormPhoto: SectionDefinition<FormPhotoProps> = {
  key: "form-photo",
  nodeType: "FormPhoto",
  name: "Form with a photograph",
  category: "Contact",
  description: "A photograph beside your form — for businesses where the place sells the visit.",
  rootClass: "yp-formp",

  fields: {
    heading: { type: "text", label: "Heading", maxChars: 52 },
    body: { type: "text", label: "One line", maxChars: 130 },
    image: { type: "image", label: "Photograph" },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-formp__inner already wraps everything under the root with nothing
     * else emitted alongside it.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The photo and form stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the photo and form.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },

  aiPrompt:
    "A short heading and a single line — the photograph is doing the work, so do not write a " +
    "paragraph beside it.",

  sample: {
    heading: "Come and talk to us",
    body: "Tell us what you're after and we'll have it ready when you arrive.",
    image: {
      url: "https://images.pexels.com/photos/1070946/pexels-photo-1070946.jpeg?auto=compress&cs=tinysrgb&w=1200",
      alt: "Baker arranging fresh loaves on a counter",
    },
  },

  toGutenberg(p) {
    const media = p.image?.url
      ? group(
          "yp-formp__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-formp__img"),
        )
      : "";

    const form = group(
      "yp-formp__panel",
      [
        p.heading ? heading(p.heading, 2, "yp-formp__heading") : "",
        p.body ? paragraph(p.body, "yp-formp__body") : "",
        htmlBlock(formMount(p.formToken)),
      ]
        .filter(Boolean)
        .join(""),
    );

    const rootClass = [
      "yp-formp",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return group(rootClass, group("yp-formp__inner", media + form), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-formp");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    const img = el.querySelector(".yp-formp__img img");
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-formp__heading")),
      body: text(el.querySelector(".yp-formp__body")),
      image: img
        ? { url: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") ?? "" }
        : undefined,
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
