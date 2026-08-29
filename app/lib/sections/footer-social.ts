import { group, siteTitle, navigation, socialLinks, paragraph } from "@/lib/wp/blocks";
import { text , copyrightLine, parseCopyrightName } from "./shared";
import type { SectionDefinition } from "./types";

export type FooterSocialProps = { blurb?: string; copyright?: string };

/**
 * Brand, menu, social icons, copyright — stacked and centred.
 *
 * Uses WordPress's own social-links block rather than hand-built icons, so the
 * client adds their accounts in the editor and gets the right brand icon for
 * each. Shipping our own icon set would mean reproducing platform logos we have
 * no licence for, and maintaining them as those platforms rebrand.
 */
export const FooterSocial: SectionDefinition<FooterSocialProps> = {
  key: "footer-social",
  nodeType: "FooterSocial",
  name: "Footer with social",
  category: "Footer",
  placement: "footer",
  description: "Brand, menu and social icons, centred. Uses WordPress's social block — no unlicensed platform logos.",
  rootClass: "yp-ftrs",
  fields: {
    blurb: { type: "text", label: "Line under the brand", maxChars: 110 },
    copyright: { type: "text", label: "Copyright name", hint: "Name only" },
  },
  aiPrompt: "One short line under the brand — what the business is, in a phrase. The copyright field takes the name only, never a year.",
  sample: { blurb: "Seasonal flowers, arranged by hand in Bath.", copyright: "Bluebell Florist" },
  toGutenberg(p) {
    return group("yp-ftrs", group("yp-ftrs__inner",
      siteTitle("yp-ftrs__brand") +
      (p.blurb ? paragraph(p.blurb, "yp-ftrs__blurb") : "") +
      navigation("yp-ftrs__nav") +
      socialLinks("yp-ftrs__social") +
      (p.copyright ? paragraph(copyrightLine(p.copyright), "yp-ftrs__copy") : "")), "div");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ftrs");
    if (!el) return null;
    return { blurb: text(el.querySelector(".yp-ftrs__blurb")), copyright: parseCopyrightName(text(el.querySelector(".yp-ftrs__copy"))) };
  },
};
