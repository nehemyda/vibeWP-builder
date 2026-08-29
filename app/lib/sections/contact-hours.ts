import { group, heading, paragraph, paragraphLink, contactHref } from "@/lib/wp/blocks";
import { text } from "./shared";
import type { SectionDefinition } from "./types";

export type ContactHoursProps = {
  heading?: string;
  body?: string;
  phone?: string;
  email?: string;
  address?: string;
  hoursHeading?: string;
  hours?: Array<{ day: string; time: string }>;
};

/**
 * Contact details beside a day-by-day opening hours table.
 *
 * The other contact layouts squeeze hours into a single line — "Tue–Sat,
 * 9am–5pm" — which is fine until a business closes for lunch, opens late on
 * Thursdays, or shuts Sundays. Shops, clinics and salons get asked this
 * constantly, and a proper table answers it without a phone call.
 *
 * Rows are read back by day name, so reordering them in wp-admin can't
 * misalign the times.
 */
export const ContactHours: SectionDefinition<ContactHoursProps> = {
  key: "contact-hours",
  nodeType: "ContactHours",
  name: "Contact & opening hours",
  category: "Contact",
  description:
    "Contact details beside a day-by-day hours table. For shops and clinics where “are you open?” is the most common question.",
  rootClass: "yp-contact-hours",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    body: { type: "text", label: "Intro line", maxChars: 150 },
    phone: { type: "text", label: "Phone" },
    email: { type: "text", label: "Email" },
    address: { type: "text", label: "Address" },
    hoursHeading: { type: "text", label: "Hours panel heading", maxChars: 30 },
    hours: {
      type: "list",
      label: "Opening hours",
      hint: "One row per day, or group days that match",
      of: {
        day: { type: "text", label: "Day" },
        time: { type: "text", label: "Hours, or Closed" },
      },
    },
  },

  aiPrompt:
    "List each day, or group consecutive days with identical hours. Say “Closed” explicitly rather " +
    "than omitting a day — a missing day reads as an oversight and prompts a phone call. Invent " +
    "nothing: leave phone, email and address empty unless the real values were supplied.",

  sample: {
    heading: "Find us on Market Street",
    body: "Two doors down from the post office. Parking on Green Street is free after 6pm.",
    phone: "01225 000 000",
    email: "hello@example.com",
    address: "12 Market Street, Bath BA1 1AA",
    hoursHeading: "Opening hours",
    hours: [
      { day: "Monday", time: "Closed" },
      { day: "Tuesday – Friday", time: "9:00 – 17:30" },
      { day: "Saturday", time: "9:00 – 16:00" },
      { day: "Sunday", time: "Closed" },
    ],
  },

  toGutenberg(p) {
    const details = (
      [
        ["Phone", p.phone, "phone"],
        ["Email", p.email, "email"],
        ["Address", p.address, "text"],
      ] as const
    )
      .filter(([, value]) => Boolean(value))
      .map(([label, value, kind]) =>
        group(
          "yp-contact-hours__row",
          paragraph(label, "yp-contact-hours__label") +
            (kind === "text"
              ? paragraph(value as string, "yp-contact-hours__value")
              : paragraphLink(
                  value as string,
                  contactHref(kind, value as string),
                  "yp-contact-hours__value",
                )),
        ),
      )
      .join("");

    const copy = group(
      "yp-contact-hours__copy",
      [
        p.heading ? heading(p.heading, 2, "yp-contact-hours__heading") : "",
        p.body ? paragraph(p.body, "yp-contact-hours__body") : "",
        details ? group("yp-contact-hours__details", details) : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const rows = (p.hours ?? [])
      .filter((h) => h?.day)
      .map((h) =>
        group(
          "yp-contact-hours__day",
          paragraph(h.day, "yp-contact-hours__day-name") +
            paragraph(h.time ?? "", "yp-contact-hours__day-time"),
        ),
      )
      .join("");

    const panel = group(
      "yp-contact-hours__panel",
      (p.hoursHeading ? heading(p.hoursHeading, 3, "yp-contact-hours__panel-heading") : "") + rows,
    );

    return group("yp-contact-hours", group("yp-contact-hours__grid", copy + panel), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-contact-hours");
    if (!el) return null;

    const byLabel = new Map<string, string>();
    for (const row of el.querySelectorAll(".yp-contact-hours__row")) {
      const label = text(row.querySelector(".yp-contact-hours__label")).toLowerCase();
      const value = text(row.querySelector(".yp-contact-hours__value"));
      if (label && value) byLabel.set(label, value);
    }

    return {
      heading: text(el.querySelector(".yp-contact-hours__heading")),
      body: text(el.querySelector(".yp-contact-hours__body")),
      phone: byLabel.get("phone") ?? "",
      email: byLabel.get("email") ?? "",
      address: byLabel.get("address") ?? "",
      hoursHeading: text(el.querySelector(".yp-contact-hours__panel-heading")),
      hours: el
        .querySelectorAll(".yp-contact-hours__day")
        .map((d) => ({
          day: text(d.querySelector(".yp-contact-hours__day-name")),
          time: text(d.querySelector(".yp-contact-hours__day-time")),
        }))
        .filter((d) => d.day),
    };
  },
};
