import { group, siteTitle, navigation, paragraph, paragraphLink, contactHref } from "@/lib/wp/blocks";
import { text, sticky, parseSticky } from "./shared";
import type { SectionDefinition } from "./types";

export type HeaderTopbarProps = {
  sticky?: boolean; phone?: string; note?: string };

/**
 * A thin strip of phone and hours above the brand and menu.
 *
 * For businesses people ring rather than browse. The number sits above
 * everything on every page and is a tel: link, so it is one tap from anywhere
 * on the site.
 */
export const HeaderTopbar: SectionDefinition<HeaderTopbarProps> = {
  key: "header-topbar",
  nodeType: "HeaderTopbar",
  name: "Header with contact bar",
  category: "Header",
  placement: "header",
  description: "Thin bar with phone and hours above the brand and menu. One tap to call from any page.",
  rootClass: "yp-hdrt",
  fields: {
    sticky: {
      type: "boolean",
      label: "Stick to the top when scrolling",
      hint: "On by default. Say \"remove the sticky header\" in chat to turn it off.",
      default: true,
    },
    phone: { type: "text", label: "Phone" },
    note: { type: "text", label: "Note beside it", hint: "Hours, or a short claim", maxChars: 60 },
  },
  aiPrompt: "The note is six words at most — opening hours or one claim. Leave the phone EMPTY unless a real number was supplied; a wrong number in the header is wrong on every page.",
  sample: { phone: "01225 000 000", note: "Tue–Sat, 9am–5pm" },
  toGutenberg(p) {
    const bar = group("yp-hdrt__bar", group("yp-hdrt__bar-inner",
      (p.phone ? paragraphLink(p.phone, contactHref("phone", p.phone), "yp-hdrt__phone") : "") +
      (p.note ? paragraph(p.note, "yp-hdrt__note") : "")));
    const main = group("yp-hdrt__main", siteTitle("yp-hdrt__brand") + navigation("yp-hdrt__nav"));
    return group(sticky(p, "yp-hdrt"), bar + main, "div");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-hdrt");
    if (!el) return null;
    return {
      sticky: parseSticky(el), phone: text(el.querySelector(".yp-hdrt__phone")), note: text(el.querySelector(".yp-hdrt__note")) };
  },
};
