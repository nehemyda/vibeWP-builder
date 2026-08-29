import { group, siteTitle, paragraph } from "@/lib/wp/blocks";
import { text , copyrightLine, parseCopyrightName } from "./shared";
import type { SectionDefinition } from "./types";

export type FooterSimpleProps = { copyright?: string; note?: string };

/**
 * Brand and a copyright line.
 *
 * The copyright year is deliberately NOT generated into the text: a hard-coded
 * "© 2026" is wrong every January and nobody notices for months. The theme
 * renders the year, and this field carries only the name.
 */
export const FooterSimple: SectionDefinition<FooterSimpleProps> = {
  key: "footer-simple",
  nodeType: "FooterSimple",
  name: "Footer, minimal",
  category: "Footer",
  placement: "footer",
  description: "Brand and a copyright line. No hard-coded year — that's wrong every January.",
  rootClass: "yp-ftr",
  fields: {
    copyright: { type: "text", label: "Copyright name", hint: "The name only — the year is added for you" },
    note: { type: "text", label: "Note", maxChars: 90 },
  },
  aiPrompt: "The copyright field takes the business name only, never a year. The note is optional — a registration number or a one-line descriptor.",
  sample: { copyright: "Bluebell Florist", note: "A working flower shop in Bath." },
  toGutenberg(p) {
    return group("yp-ftr", group("yp-ftr__inner",
      siteTitle("yp-ftr__brand") +
      (p.note ? paragraph(p.note, "yp-ftr__note") : "") +
      (p.copyright ? paragraph(copyrightLine(p.copyright), "yp-ftr__copy") : "")), "div");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ftr");
    if (!el) return null;
    return { copyright: parseCopyrightName(text(el.querySelector(".yp-ftr__copy"))), note: text(el.querySelector(".yp-ftr__note")) };
  },
};
