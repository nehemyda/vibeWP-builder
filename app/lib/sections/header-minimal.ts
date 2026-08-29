import { group, siteTitle } from "@/lib/wp/blocks";
import { sticky, parseSticky } from "./shared";
import type { SectionDefinition } from "./types";

export type HeaderMinimalProps = { sticky?: boolean };

/**
 * Brand only, no navigation.
 *
 * For a genuine one-page site, where a menu of anchor links is noise. Also the
 * honest option before a client has decided what pages they want — an empty
 * navigation block renders as nothing and looks broken.
 */
export const HeaderMinimal: SectionDefinition<HeaderMinimalProps> = {
  key: "header-minimal",
  nodeType: "HeaderMinimal",
  name: "Header, brand only",
  category: "Header",
  placement: "header",
  description: "Just the brand, no menu. For one-page sites, or before the client has decided their pages.",
  rootClass: "yp-hdrm",
  fields: {
    sticky: {
      type: "boolean",
      label: "Stick to the top when scrolling",
      hint: "On by default. Say \"remove the sticky header\" in chat to turn it off.",
      default: true,
    },
  },
  aiPrompt: "No copy to write — the title comes from WordPress settings.",
  sample: { sticky: true },
  toGutenberg(p) {
    return group(sticky(p, "yp-hdrm"), group("yp-hdrm__inner", siteTitle("yp-hdrm__brand")), "div");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hdrm");
    if (!el) return null;
    return { sticky: parseSticky(el) };
  },
};
