import { group, siteTitle, paragraph, paragraphLink, contactHref, heading } from "@/lib/wp/blocks";
import { text , copyrightLine, parseCopyrightName, rows } from "./shared";
import type { SectionDefinition } from "./types";

export type FooterContactProps = { phone?: string; email?: string; address?: string; hours?: Array<{ day: string; time: string }>; copyright?: string };

/**
 * Contact details and opening hours in the footer.
 *
 * The footer is where people look for a phone number when they have already
 * decided — so it repeats the essentials rather than making them scroll back.
 * Phone and email are links, as everywhere else.
 */
export const FooterContact: SectionDefinition<FooterContactProps> = {
  key: "footer-contact",
  nodeType: "FooterContact",
  name: "Footer with contact",
  category: "Footer",
  placement: "footer",
  description: "Phone, email, address and hours in the footer — where people look once they've decided.",
  rootClass: "yp-ftrk",
  fields: {
    phone: { type: "text", label: "Phone" },
    email: { type: "text", label: "Email" },
    address: { type: "text", label: "Address" },
    hours: { type: "list", label: "Hours", of: { day: { type: "text", label: "Day" }, time: { type: "text", label: "Hours" } } },
    copyright: { type: "text", label: "Copyright name", hint: "Name only" },
  },
  aiPrompt: "Leave phone, email and address EMPTY unless real values were supplied — a wrong number in the footer is wrong on every page of the site.",
  sample: {
    phone: "01225 000 000",
    email: "hello@example.com",
    address: "12 Market Street, Bath BA1 1AA",
    hours: [{ day: "Tue – Fri", time: "9:00 – 17:30" }, { day: "Saturday", time: "9:00 – 16:00" }, { day: "Sun – Mon", time: "Closed" }],
    copyright: "Bluebell Florist",
  },
  toGutenberg(p) {
    const details = ([["Phone", p.phone, "phone"], ["Email", p.email, "email"], ["Address", p.address, "text"]] as const)
      .filter(([, v]) => Boolean(v))
      .map(([label, v, kind]) => group("yp-ftrk__row",
        paragraph(label, "yp-ftrk__label") +
        (kind === "text" ? paragraph(v as string, "yp-ftrk__value") : paragraphLink(v as string, contactHref(kind, v as string), "yp-ftrk__value")))).join("");

    const hours = rows(p.hours).filter((h) => h?.day).map((h) =>
      group("yp-ftrk__day", paragraph(h.day, "yp-ftrk__day-name") + paragraph(h.time ?? "", "yp-ftrk__day-time"))).join("");

    return group("yp-ftrk", group("yp-ftrk__inner",
      group("yp-ftrk__grid",
        group("yp-ftrk__brandcol", siteTitle("yp-ftrk__brand")) +
        group("yp-ftrk__details", details) +
        (hours ? group("yp-ftrk__hours", heading("Opening hours", 3, "yp-ftrk__hours-title") + hours) : "")) +
      (p.copyright ? paragraph(copyrightLine(p.copyright), "yp-ftrk__copy") : "")), "div");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ftrk");
    if (!el) return null;
    const byLabel = new Map<string, string>();
    for (const row of el.querySelectorAll(".yp-ftrk__row")) {
      const l = text(row.querySelector(".yp-ftrk__label")).toLowerCase();
      const v = text(row.querySelector(".yp-ftrk__value"));
      if (l && v) byLabel.set(l, v);
    }
    return {
      phone: byLabel.get("phone") ?? "",
      email: byLabel.get("email") ?? "",
      address: byLabel.get("address") ?? "",
      hours: el.querySelectorAll(".yp-ftrk__day").map((d) => ({
        day: text(d.querySelector(".yp-ftrk__day-name")), time: text(d.querySelector(".yp-ftrk__day-time")),
      })).filter((d) => d.day),
      copyright: parseCopyrightName(text(el.querySelector(".yp-ftrk__copy"))),
    };
  },
};
