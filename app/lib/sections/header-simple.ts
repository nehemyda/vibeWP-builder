import { group, siteTitle, navigation } from "@/lib/wp/blocks";
import { sticky, parseSticky } from "./shared";
import type { SectionDefinition } from "./types";

export type HeaderSimpleProps = { sticky?: boolean };

/**
 * Brand left, navigation right. The default.
 *
 * No content fields at all, and that is the point: the title comes from
 * Settings and the menu from Appearance → Menus, so there is nothing here for
 * the AI to generate or for a client to have to re-enter.
 */
export const HeaderSimple: SectionDefinition<HeaderSimpleProps> = {
  key: "header-simple",
  nodeType: "HeaderSimple",
  name: "Header, brand + nav",
  category: "Header",
  placement: "header",
  description: "Brand on the left, menu on the right. Content comes from Settings and Menus, not from here.",
  rootClass: "yp-hdr",
  fields: {
    sticky: {
      type: "boolean",
      label: "Stick to the top when scrolling",
      hint: "On by default. Say \"remove the sticky header\" in chat to turn it off.",
      default: true,
    },
  },
  aiPrompt: "No copy to write — the title and menu come from WordPress settings.",
  sample: { sticky: true },
  toGutenberg(p) {
    return group(sticky(p, "yp-hdr"), group("yp-hdr__inner", siteTitle("yp-hdr__brand") + navigation("yp-hdr__nav")), "div");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hdr");
    if (!el) return null;
    return { sticky: parseSticky(el) };
  },
};
