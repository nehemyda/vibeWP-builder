import { group, heading, paragraph, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseImage, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type ServicesShowcaseProps = {
  heading?: string;
  intro?: string;
  items?: Array<{ title: string; body: string; meta?: string; image?: SectionImage }>;
};

/**
 * Service cards, each with its own photograph.
 *
 * The most image-hungry services layout: three cards is three stock searches
 * and three files sideloaded on export. Worth it when the work is visual —
 * florists, builders, salons, food — and the wrong choice when it isn't, which
 * is why the editorial and price-list variants exist beside it.
 *
 * The image sits above the copy with no border on the card, so the photograph
 * is the object rather than something inside a box.
 */
export const ServicesShowcase: SectionDefinition<ServicesShowcaseProps> = {
  key: "services-showcase",
  nodeType: "ServicesShowcase",
  name: "Services, photo cards",
  category: "Content",
  description:
    "Each service with its own photograph. For visual trades — costs one stock image per card, so use it where the work is the sell.",
  rootClass: "yp-svcs",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 160 },
    items: {
      type: "list",
      label: "Services",
      hint: "Three fills the row cleanly",
      of: {
        title: { type: "text", label: "Service" },
        body: { type: "text", label: "One or two sentences" },
        meta: { type: "text", label: "Aside", hint: "From-price or lead time" },
        image: { type: "image", label: "Photo" },
      },
    },
  },

  aiPrompt:
    "Three services, each named as a customer would search for it, with one or two sentences. The " +
    "aside is a factual qualifier or empty — never an invented price. Describe the SERVICE, not the " +
    "photograph.",

  sample: {
    heading: "What we're known for",
    intro: "Three things we do more of than anything else.",
    items: [
      {
        title: "Weddings",
        body: "From a single bouquet to the whole venue, planned with you and set up on the day.",
        meta: "Free consultation",
        image: { url: "https://images.pexels.com/photos/7119089/pexels-photo-7119089.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp", alt: "A bouquet of roses and greenery on a rustic wooden surface." },
      },
      {
        title: "Subscriptions",
        body: "Weekly or fortnightly arrangements for homes and offices, changing with the season.",
        meta: "Pause any time",
        image: { url: "https://images.pexels.com/photos/31497181/pexels-photo-31497181.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp", alt: "Bunches of bright tulips on display at an outdoor market stall." },
      },
      {
        title: "Events",
        body: "Installations for restaurants, hotels and parties — delivered, arranged and cleared.",
        meta: "Quoted per event",
        image: { url: "https://images.pexels.com/photos/17001833/pexels-photo-17001833.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp", alt: "An event table set with floral arrangements and lit candles." },
      },
    ],
  },

  toGutenberg(p) {
    const cards = (p.items ?? [])
      .filter((i) => i?.title || i?.body)
      .map((i) =>
        group(
          "yp-svcs__card",
          (i.image?.url
            ? image(i.image.url, requireAlt(i.image.alt, i.title), "yp-svcs__frame", {
                id: i.image.id,
                width: i.image.width,
                height: i.image.height,
              })
            : "") +
            group(
              "yp-svcs__copy",
              [
                i.title ? heading(i.title, 3, "yp-svcs__title") : "",
                i.body ? paragraph(i.body, "yp-svcs__body") : "",
                i.meta ? paragraph(i.meta, "yp-svcs__meta") : "",
              ]
                .filter(Boolean)
                .join(""),
            ),
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-svcs__heading") : "",
      p.intro ? paragraph(p.intro, "yp-svcs__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group("yp-svcs", head + group("yp-svcs__grid", cards), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-svcs");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-svcs__heading")),
      intro: text(el.querySelector(".yp-svcs__intro")),
      items: el
        .querySelectorAll(".yp-svcs__card")
        .map((c) => {
          const img = parseImage(c, ".yp-svcs__frame");
          return {
            title: text(c.querySelector(".yp-svcs__title")),
            body: text(c.querySelector(".yp-svcs__body")),
            meta: text(c.querySelector(".yp-svcs__meta")),
            ...(img ? { image: img } : {}),
          };
        })
        .filter((i) => i.title || i.body),
    };
  },
};
