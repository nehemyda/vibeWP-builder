import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type ContactBlockProps = {
  heading?: string;
  body?: string;
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
  actions?: Array<{ label: string; href: string; variant: "primary" | "outline" | "ghost" }>;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * How to reach the business.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DELIBERATELY NOT A FORM
 *
 * A working contact form needs form handling, spam protection and email
 * delivery — which on WordPress means a plugin such as Contact Form 7, and
 * that is what the (unbuilt) plugin checklist is for. Emitting form markup
 * without any of that would produce a form that silently discards enquiries,
 * which is worse for the client than no form at all.
 *
 * So this section publishes real contact details, which work immediately, and
 * a button. When the plugin checklist lands, a form variant can be added on
 * top of a shortcode that actually delivers mail.
 * ─────────────────────────────────────────────────────────────────────
 */
export const ContactBlock: SectionDefinition<ContactBlockProps> = {
  key: "contact-block",
  nodeType: "ContactBlock",
  name: "Contact details",
  category: "Contact",
  description:
    "Phone, email, address and opening hours, with a prompt to get in touch. Contact details rather than a form — a form needs a mail plugin to be real.",
  rootClass: "yp-contact",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    body: { type: "text", label: "Invitation line", maxChars: 160 },
    phone: { type: "text", label: "Phone" },
    email: { type: "text", label: "Email" },
    address: { type: "text", label: "Address" },
    hours: { type: "text", label: "Opening hours" },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
  },

  aiPrompt:
    "Invite contact in one warm, specific line — say what happens next and how quickly. " +
    "Leave phone, email, address and hours EMPTY unless the real values were given: a plausible " +
    "invented phone number is worse than a blank field, because it will be published and dialled.",

  sample: {
    heading: "Come and see us",
    body: "Pop in, call, or send a note — we usually reply the same day.",
    phone: "01225 000 000",
    email: "hello@example.com",
    address: "12 Market Street, Bath BA1 1AA",
    hours: "Tue–Sat, 9am–5pm",
    actions: [{ label: "Email us", href: "mailto:hello@example.com", variant: "primary" }],
  },

  toGutenberg(p) {
    const copy = group(
      "yp-contact__copy",
      [
        p.heading ? heading(p.heading, 2, "yp-contact__heading") : "",
        p.body ? paragraph(p.body, "yp-contact__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-contact__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    // Each detail is its own labelled row, and an absent one is omitted rather
    // than rendered as an empty line.
    const rows = (
      [
        ["Phone", p.phone],
        ["Email", p.email],
        ["Address", p.address],
        ["Hours", p.hours],
      ] as const
    )
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) =>
        group(
          "yp-contact__row",
          paragraph(label, "yp-contact__label") + paragraph(value as string, "yp-contact__value"),
        ),
      )
      .join("");

    /*
     * The details panel is a bordered box, so emitting it with no rows draws
     * an empty rectangle beside the copy. That is not hypothetical: generation
     * is instructed never to invent a phone number or address, so a business
     * that has recorded none legitimately produces zero rows — and the first
     * generated bakery homepage rendered exactly that hollow box.
     */
    return group(
      "yp-contact",
      group("yp-contact__grid", rows ? copy + group("yp-contact__details", rows) : copy),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-contact");
    if (!el) return null;

    // Read the rows back by their label, so reordering them in wp-admin
    // doesn't shuffle a phone number into the address field.
    const byLabel = new Map<string, string>();
    for (const row of el.querySelectorAll(".yp-contact__row")) {
      const label = text(row.querySelector(".yp-contact__label")).toLowerCase();
      const value = text(row.querySelector(".yp-contact__value"));
      if (label && value) byLabel.set(label, value);
    }

    const actions: NonNullable<ContactBlockProps["actions"]> = [];
    for (const btn of el.querySelectorAll(".wp-block-button")) {
      const anchor = btn.querySelector("a");
      const label = text(anchor);
      if (!label) continue;
      const cls = btn.getAttribute("class") ?? "";
      actions.push({
        label,
        href: anchor?.getAttribute("href")?.trim() || "#",
        variant: cls.includes("yp-btn--outline") ? "outline" : "primary",
      });
    }

    return {
      heading: text(el.querySelector(".yp-contact__heading")),
      body: text(el.querySelector(".yp-contact__body")),
      phone: byLabel.get("phone") ?? "",
      email: byLabel.get("email") ?? "",
      address: byLabel.get("address") ?? "",
      hours: byLabel.get("hours") ?? "",
      actions,
    };
  },
};
