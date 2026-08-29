import { group, heading, paragraph, paragraphLink, buttons, contactHref } from "@/lib/wp/blocks";
import { text, parseActions, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type ContactCalloutProps = {
  eyebrow?: string;
  heading?: string;
  phone?: string;
  body?: string;
  actions?: Action[];
};

/**
 * The phone number as the largest thing on the page.
 *
 * Built for trades and emergency services, where the entire conversion is a
 * phone call and any other option is friction. The number is rendered at
 * headline scale and IS the link, so on a phone the primary action is a single
 * tap on the biggest target on screen.
 *
 * Everything else is deliberately subordinate — one supporting line, and
 * buttons only as a fallback for people who won't ring.
 */
export const ContactCallout: SectionDefinition<ContactCalloutProps> = {
  key: "contact-callout",
  nodeType: "ContactCallout",
  name: "Phone callout",
  category: "Contact",
  description:
    "The phone number set at headline size, as the tap target. For trades and emergency work where the call IS the conversion.",
  rootClass: "yp-contact-callout",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", hint: "e.g. 24/7 CALL-OUT", maxChars: 40 },
    heading: { type: "text", label: "Line above the number", maxChars: 50 },
    phone: { type: "text", label: "Phone number", hint: "Shown very large" },
    body: { type: "text", label: "Reassurance line", maxChars: 130 },
    actions: {
      type: "list",
      label: "Fallback buttons",
      hint: "For people who won't call",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
  },

  aiPrompt:
    "The number is the point. The line above it creates urgency or removes hesitation in under " +
    "eight words; the line below handles the obvious worry — cost of calling out, hours, response " +
    "time. Leave the phone field EMPTY unless a real number was given.",

  sample: {
    eyebrow: "24/7 EMERGENCY CALL-OUT",
    heading: "Burst pipe? Call us now.",
    phone: "01225 000 000",
    body: "No call-out charge inside the city, and we'll tell you the price before we start.",
    actions: [{ label: "Request a callback", href: "#", variant: "outline" }],
  },

  toGutenberg(p) {
    const inner = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-contact-callout__eyebrow") : "",
      p.heading ? heading(p.heading, 2, "yp-contact-callout__heading") : "",
      // The number itself is the link, not a button beside it.
      p.phone
        ? paragraphLink(p.phone, contactHref("phone", p.phone), "yp-contact-callout__phone")
        : "",
      p.body ? paragraph(p.body, "yp-contact-callout__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-contact-callout__actions") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-contact-callout", group("yp-contact-callout__inner", inner), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-contact-callout");
    if (!el) return null;
    return {
      eyebrow: text(el.querySelector(".yp-contact-callout__eyebrow")),
      heading: text(el.querySelector(".yp-contact-callout__heading")),
      phone: text(el.querySelector(".yp-contact-callout__phone")),
      body: text(el.querySelector(".yp-contact-callout__body")),
      actions: parseActions(el),
    };
  },
};
