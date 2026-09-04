import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, image, htmlBlock, formMount, requireAlt } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormPhotoProps = {
  heading?: string;
  body?: string;
  image?: { url: string; alt: string };
  formToken?: string;
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

    return group("yp-formp", group("yp-formp__inner", media + form), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-formp");
    if (!el) return null;
    const img = el.querySelector(".yp-formp__img img");
    return {
      heading: text(el.querySelector(".yp-formp__heading")),
      body: text(el.querySelector(".yp-formp__body")),
      image: img
        ? { url: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") ?? "" }
        : undefined,
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
