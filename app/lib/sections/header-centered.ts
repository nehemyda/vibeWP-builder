import { group, siteTitle, navigation } from "@/lib/wp/blocks";
import { sticky, parseSticky } from "./shared";
import type { SectionDefinition } from "./types";

export type HeaderCenteredProps = { sticky?: boolean };

/**
 * Brand centred with the menu beneath it.
 *
 * Suits businesses whose name IS the brand — a restaurant, a boutique, a
 * practice — where centring the name reads as confidence rather than as a
 * missing logo.
 */
export const HeaderCentered: SectionDefinition<HeaderCenteredProps> = {
  key: "header-centered",
  nodeType: "HeaderCentered",
  name: "Header, centred",
  category: "Header",
  placement: "header",
  description: "Brand centred with the menu below. For businesses whose name is the brand.",
  rootClass: "yp-hdrc",
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
    return group(sticky(p, "yp-hdrc"), group("yp-hdrc__inner", siteTitle("yp-hdrc__brand") + navigation("yp-hdrc__nav")), "div");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hdrc");
    if (!el) return null;
    return { sticky: parseSticky(el) };
  },
};
