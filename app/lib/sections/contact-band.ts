import { group, heading, paragraph, paragraphLink, contactHref } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ContactBandProps = {
  heading?: string;
  channels?: Array<{ label: string; value: string; kind?: "phone" | "email" | "text" }>;
};

/**
 * A dark full-width strip of contact details, for the end of a page.
 *
 * Compact by design — it is the section that closes a page, so it repeats the
 * essentials without asking for more attention than the content above it. The
 * dark treatment also gives a long page a visual full stop.
 *
 * Not a footer: a footer belongs to the theme and appears on every page. This
 * is content, placed deliberately, and it round-trips like any other section.
 */
export const ContactBand: SectionDefinition<ContactBandProps> = {
  key: "contact-band",
  nodeType: "ContactBand",
  name: "Contact band",
  category: "Contact",
  description:
    "A dark full-width strip with the essentials in a row. Closes a page without competing with it.",
  rootClass: "yp-contact-band",

  fields: {
    heading: { type: "text", label: "Heading", maxChars: 45 },
    channels: {
      type: "list",
      label: "Channels",
      hint: "Three keeps the row readable",
      of: {
        label: { type: "text", label: "Label" },
        value: { type: "text", label: "The detail" },
        kind: { type: "text", label: "phone | email | text" },
      },
    },
  },

  aiPrompt:
    "The closing line of a page — brief and warm. Three channels at most. Leave any value empty " +
    "unless the real detail was supplied.",

  sample: {
    heading: "Any questions? Just ask.",
    channels: [
      { label: "Call", value: "01225 000 000", kind: "phone" },
      { label: "Email", value: "hello@example.com", kind: "email" },
      { label: "Visit", value: "12 Market Street, Bath", kind: "text" },
    ],
  },

  toGutenberg(p) {
    const items = (p.channels ?? [])
      .filter((c) => c?.label || c?.value)
      .map((c) => {
        const value =
          c.value && (c.kind === "phone" || c.kind === "email")
            ? paragraphLink(c.value, contactHref(c.kind, c.value), "yp-contact-band__value")
            : c.value
              ? paragraph(c.value, "yp-contact-band__value")
              : "";
        return group(
          "yp-contact-band__item",
          (c.label ? paragraph(c.label, "yp-contact-band__label") : "") + value,
        );
      })
      .join("");

    return group(
      "yp-contact-band",
      group(
        "yp-contact-band__inner",
        (p.heading ? heading(p.heading, 2, "yp-contact-band__heading") : "") +
          group("yp-contact-band__row", items),
      ),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-contact-band");
    if (!el) return null;

    return {
      heading: text(el.querySelector(".yp-contact-band__heading")),
      channels: el
        .querySelectorAll(".yp-contact-band__item")
        .map((item) => {
          const value = item.querySelector(".yp-contact-band__value");
          const href = value?.querySelector("a")?.getAttribute("href") ?? "";
          const kind: "phone" | "email" | "text" = href.startsWith("tel:")
            ? "phone"
            : href.startsWith("mailto:")
              ? "email"
              : "text";
          return {
            label: text(item.querySelector(".yp-contact-band__label")),
            value: text(value),
            kind,
          };
        })
        .filter((c) => c.label || c.value),
    };
  },
};
