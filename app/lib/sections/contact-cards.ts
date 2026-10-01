import { group, heading, paragraph, paragraphLink, contactHref } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ContactCardsProps = {
  heading?: string;
  intro?: string;
  channels?: Array<{ label: string; value: string; kind?: "phone" | "email" | "text" }>;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * One card per way of getting in touch.
 *
 * Each channel is equal weight, which suits a business where customers
 * genuinely split across phone, email and walking in. The alternative layouts
 * in this set all privilege one channel; this one deliberately does not.
 *
 * Phone and email become tel:/mailto: links, so the value is tappable rather
 * than something to copy by hand.
 */
export const ContactCards: SectionDefinition<ContactCardsProps> = {
  key: "contact-cards",
  nodeType: "ContactCards",
  name: "Contact cards",
  category: "Contact",
  description:
    "One card per channel — phone, email, address, hours — all equal weight. Phone and email are tappable links.",
  rootClass: "yp-contact-cards",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 150 },
    channels: {
      type: "list",
      label: "Channels",
      hint: "Three or four fills the grid",
      of: {
        label: { type: "text", label: "Label, e.g. Phone" },
        value: { type: "text", label: "The detail itself" },
        kind: { type: "text", label: "phone | email | text" },
      },
    },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Different reason from most: heading and intro sit
     * outside .yp-contact-cards__grid with no shared ancestor, so
     * toGutenberg wraps them together in a NEW element
     * (.yp-contact-cards__inner) — the same fix content-gallery needed.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The heading and channels stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the heading and channels.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },

  aiPrompt:
    "Label each channel the way a customer thinks of it — Phone, Email, Visit us, Opening hours. " +
    "Leave the value EMPTY unless the real detail was supplied: an invented phone number gets " +
    "published and dialled, which is worse than a blank the client will fill in.",

  sample: {
    heading: "Get in touch",
    intro: "However you'd rather do it — we answer the phone during shop hours and email within a day.",
    channels: [
      { label: "Phone", value: "01225 000 000", kind: "phone" },
      { label: "Email", value: "hello@example.com", kind: "email" },
      { label: "Visit us", value: "12 Market Street, Bath BA1 1AA", kind: "text" },
      { label: "Opening hours", value: "Tue–Sat, 9am–5pm", kind: "text" },
    ],
  },

  toGutenberg(p) {
    const cards = (p.channels ?? [])
      .filter((c) => c?.label || c?.value)
      .map((c) => {
        const value =
          c.value && (c.kind === "phone" || c.kind === "email")
            ? paragraphLink(c.value, contactHref(c.kind, c.value), "yp-contact-cards__value")
            : c.value
              ? paragraph(c.value, "yp-contact-cards__value")
              : "";
        return group(
          "yp-contact-cards__card",
          (c.label ? paragraph(c.label, "yp-contact-cards__label") : "") + value,
        );
      })
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-contact-cards__heading") : "",
      p.intro ? paragraph(p.intro, "yp-contact-cards__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    const rootClass = [
      "yp-contact-cards",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(
      rootClass,
      group("yp-contact-cards__inner", head + group("yp-contact-cards__grid", cards)),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-contact-cards");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";

    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-contact-cards__heading")),
      intro: text(el.querySelector(".yp-contact-cards__intro")),
      channels: el
        .querySelectorAll(".yp-contact-cards__card")
        .map((card) => {
          const value = card.querySelector(".yp-contact-cards__value");
          // The href is what says whether this was a phone, an email or plain
          // text — the visible value alone is ambiguous.
          const href = value?.querySelector("a")?.getAttribute("href") ?? "";
          const kind: "phone" | "email" | "text" = href.startsWith("tel:")
            ? "phone"
            : href.startsWith("mailto:")
              ? "email"
              : "text";
          return {
            label: text(card.querySelector(".yp-contact-cards__label")),
            value: text(value),
            kind,
          };
        })
        .filter((c) => c.label || c.value),
    };
  },
};
