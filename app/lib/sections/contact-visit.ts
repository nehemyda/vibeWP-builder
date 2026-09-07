import {
  group,
  heading,
  paragraph,
  paragraphLink,
  buttons,
  image,
  requireAlt,
  contactHref,
} from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type ContactVisitProps = {
  heading?: string;
  body?: string;
  address?: string;
  phone?: string;
  directions?: string;
  actions?: Action[];
  image?: SectionImage;
};

/**
 * Contact details beside a photograph of the place.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A PHOTO RATHER THAN A MAP EMBED
 *
 * The obvious move is a Google Maps iframe. It is also the one that quietly
 * costs the client: a third-party embed loads Google's scripts and cookies on
 * every page view, which drags in consent-banner obligations under GDPR and
 * makes the page measurably slower — on a small business site that mostly
 * exists to say "we are here and open".
 *
 * A photograph of the frontage plus written directions does the actual job
 * better: people recognise a shopfront when they arrive. A "Get directions"
 * button can link out to a map, which puts the third party behind an explicit
 * click rather than loading it for everyone.
 * ─────────────────────────────────────────────────────────────────────
 */
export const ContactVisit: SectionDefinition<ContactVisitProps> = {
  key: "contact-visit",
  nodeType: "ContactVisit",
  name: "Visit us",
  category: "Contact",
  description:
    "Address and directions beside a photo of the premises. A picture of the frontage beats a map embed — and loads no third-party scripts.",
  rootClass: "yp-contact-visit",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    body: { type: "text", label: "Intro line", maxChars: 150 },
    address: { type: "text", label: "Address" },
    phone: { type: "text", label: "Phone" },
    directions: {
      type: "text",
      label: "Finding us",
      hint: "Landmarks and parking — what you'd say on the phone",
      maxChars: 200,
    },
    actions: {
      type: "list",
      label: "Buttons",
      hint: "A “Get directions” link belongs here",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: { type: "image", label: "Photo of the premises", hint: "The frontage, ideally" },
  },

  aiPrompt:
    "Write the directions the way someone would give them over the phone: the nearest landmark, " +
    "which side of the street, where to park. That is what people actually need on arrival. " +
    "Leave address and phone empty unless the real values were given.",

  sample: {
    heading: "Come and see us",
    body: "The shop is small and always busy — pop in, and we'll make something up while you wait.",
    address: "12 Market Street, Bath BA1 1AA",
    phone: "01225 000 000",
    directions:
      "Two doors down from the post office, on the left as you walk up from the bridge. Parking on Green Street is free after 6pm.",
    actions: [{ label: "Get directions", href: "#", variant: "primary" }],
    image: {
      url: "https://images.pexels.com/photos/5414058/pexels-photo-5414058.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
      alt: "The doorway of a florist's shop, with plants either side.",
    },
  },

  toGutenberg(p) {
    const details = (
      [
        ["Address", p.address, "text"],
        ["Phone", p.phone, "phone"],
      ] as const
    )
      .filter(([, v]) => Boolean(v))
      .map(([label, v, kind]) =>
        group(
          "yp-contact-visit__row",
          paragraph(label, "yp-contact-visit__label") +
            (kind === "text"
              ? paragraph(v as string, "yp-contact-visit__value")
              : paragraphLink(
                  v as string,
                  contactHref(kind, v as string),
                  "yp-contact-visit__value",
                )),
        ),
      )
      .join("");

    const copy = group(
      "yp-contact-visit__copy",
      [
        p.heading ? heading(p.heading, 2, "yp-contact-visit__heading") : "",
        p.body ? paragraph(p.body, "yp-contact-visit__body") : "",
        details ? group("yp-contact-visit__details", details) : "",
        p.directions ? paragraph(p.directions, "yp-contact-visit__directions") : "",
        p.actions?.length ? buttons(p.actions, "yp-contact-visit__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const media = p.image?.url
      ? group(
          "yp-contact-visit__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-contact-visit__frame", {
            id: p.image.id,
            title: p.image.title,
            width: p.image.width,
            height: p.image.height,
          }),
        )
      : "";

    return group("yp-contact-visit", group("yp-contact-visit__grid", copy + media), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-contact-visit");
    if (!el) return null;

    const byLabel = new Map<string, string>();
    for (const row of el.querySelectorAll(".yp-contact-visit__row")) {
      const label = text(row.querySelector(".yp-contact-visit__label")).toLowerCase();
      const value = text(row.querySelector(".yp-contact-visit__value"));
      if (label && value) byLabel.set(label, value);
    }

    const img = parseImage(el, ".yp-contact-visit__frame");
    return {
      heading: text(el.querySelector(".yp-contact-visit__heading")),
      body: text(el.querySelector(".yp-contact-visit__body")),
      address: byLabel.get("address") ?? "",
      phone: byLabel.get("phone") ?? "",
      directions: text(el.querySelector(".yp-contact-visit__directions")),
      actions: parseActions(el),
      ...(img ? { image: img } : {}),
    };
  },
};
