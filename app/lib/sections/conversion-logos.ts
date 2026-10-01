import { group, heading, paragraph } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ConversionLogosProps = {
  heading?: string;
  names?: Array<{ name: string }>;
  note?: string;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * Names of clients or accreditations, set as a quiet strip.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WORDMARKS, NOT LOGO IMAGES
 *
 * The conventional version uses logo files, and we cannot: another company's
 * logo is their trademark, we have no licence to reproduce it, and a generator
 * that pulls logo images would be manufacturing infringement at scale.
 *
 * Set names as styled text instead. It is honest, needs no assets, and the
 * client can replace it with real licensed logos if they have permission —
 * which is a decision only they can make.
 * ─────────────────────────────────────────────────────────────────────
 */
export const ConversionLogos: SectionDefinition<ConversionLogosProps> = {
  key: "conversion-logos",
  nodeType: "ConversionLogos",
  name: "Trusted by",
  category: "Conversion",
  description:
    "Client names or accreditations as a quiet wordmark strip. Text rather than logo files — we have no licence to reproduce other companies' marks.",
  rootClass: "yp-logos",

  fields: {
    heading: { type: "text", label: "Lead-in line", maxChars: 50 },
    names: { type: "list", label: "Names", of: { name: { type: "text", label: "Name" } } },
    note: { type: "text", label: "Note", maxChars: 110 },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-logos__inner already wraps everything under the root, heading
     * included, with nothing else emitted alongside it.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The lead-in and names stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the lead-in and names.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },

  aiPrompt:
    "Leave the names EMPTY unless real ones were supplied. Inventing client names or accreditations " +
    "is a false endorsement claim published on the client's site, and naming a business that never " +
    "hired them is actionable. Write the lead-in and let them fill the list.",

  sample: {
    heading: "Regular work for",
    names: [
      { name: "Local venue name" },
      { name: "Hotel name" },
      { name: "Restaurant name" },
      { name: "Office client" },
    ],
    note: "Replace these with your own — and only names you have permission to use.",
  },

  toGutenberg(p) {
    const items = (p.names ?? [])
      .filter((n) => n?.name)
      .map((n) => paragraph(n.name, "yp-logos__name"))
      .join("");

    const rootClass = [
      "yp-logos",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(
      rootClass,
      group(
        "yp-logos__inner",
        (p.heading ? heading(p.heading, 2, "yp-logos__heading") : "") +
          group("yp-logos__row", items) +
          (p.note ? paragraph(p.note, "yp-logos__note") : ""),
      ),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-logos");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-logos__heading")),
      names: el.querySelectorAll(".yp-logos__name").map((n) => ({ name: n.textContent.trim() })).filter((n) => n.name),
      note: text(el.querySelector(".yp-logos__note")),
    };
  },
};
