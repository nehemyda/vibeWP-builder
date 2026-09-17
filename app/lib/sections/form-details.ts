import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, htmlBlock, formMount, contactHref, esc, escAttr } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormDetailsProps = {
  heading?: string;
  body?: string;
  phone?: string;
  email?: string;
  hours?: string;
  formToken?: string;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * The form, with the ways to reach a human beside it.
 *
 * Some people will not use a form however good it is — they want to ring. The
 * usual answer is a Contact section further down the page, which means the
 * person who wanted to phone has already left. Putting both in one section is
 * the whole point: it replaces a form section followed by a contact section,
 * and stops the page asking the same question twice.
 *
 * Contact values carry {{tokens}}, so they follow the business details rather
 * than being copy someone has to remember to update in two places.
 */
export const FormDetails: SectionDefinition<FormDetailsProps> = {
  key: "form-details",
  nodeType: "FormDetails",
  name: "Form and contact details",
  category: "Contact",
  description: "Your form on one side, phone, email and opening hours on the other.",
  rootClass: "yp-formd",

  fields: {
    heading: { type: "text", label: "Heading", maxChars: 56 },
    body: { type: "text", label: "Opening line", maxChars: 160 },
    phone: { type: "text", label: "Phone" },
    email: { type: "text", label: "Email" },
    hours: { type: "text", label: "Opening hours" },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-formd__inner already wraps everything under the root with nothing
     * else emitted alongside it.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The form and details stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the form and details.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },

  aiPrompt:
    "A heading and one line. Never invent a phone number, email or opening hours — those are " +
    "filled from the business details, so leave them as they are.",

  sample: {
    heading: "Send us a message",
    body: "Fill this in and we'll reply, or call if it's easier — someone is usually in the shop.",
    phone: "{{phone}}",
    email: "{{email}}",
    hours: "{{hours}}",
  },

  toGutenberg(p) {
    const row = (label: string, value: string, kind?: "phone" | "email") => {
      if (!value) return "";
      const inner = kind
        ? `<a href="${escAttr(contactHref(kind, value))}">${esc(value)}</a>`
        : esc(value);
      return (
        `<div class="yp-formd__row">` +
        `<span class="yp-formd__label">${esc(label)}</span>` +
        `<span class="yp-formd__value">${inner}</span>` +
        `</div>`
      );
    };

    const aside = [
      row("Phone", p.phone ?? "", "phone"),
      row("Email", p.email ?? "", "email"),
      row("Hours", p.hours ?? ""),
    ]
      .filter(Boolean)
      .join("");

    const left = [
      p.heading ? heading(p.heading, 2, "yp-formd__heading") : "",
      p.body ? paragraph(p.body, "yp-formd__body") : "",
      htmlBlock(formMount(p.formToken)),
    ]
      .filter(Boolean)
      .join("");

    const rootClass = [
      "yp-formd",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return group(
      rootClass,
      group(
        "yp-formd__inner",
        group("yp-formd__main", left) +
          (aside ? group("yp-formd__aside", htmlBlock(`<div class="yp-formd__rows">${aside}</div>`)) : ""),
      ),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-formd");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    const rowValue = (label: string) =>
      el
        .querySelectorAll(".yp-formd__row")
        .find((r) => r.querySelector(".yp-formd__label")?.textContent.trim() === label)
        ?.querySelector(".yp-formd__value")
        ?.textContent.trim() ?? "";

    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-formd__heading")),
      body: text(el.querySelector(".yp-formd__body")),
      phone: rowValue("Phone"),
      email: rowValue("Email"),
      hours: rowValue("Hours"),
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
