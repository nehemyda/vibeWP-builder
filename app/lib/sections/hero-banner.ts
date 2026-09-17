import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroBannerProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  image?: SectionImage;
};

/**
 * Full-bleed photograph with copy over it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A REAL <img>, NOT A CSS BACKGROUND
 *
 * The obvious implementation is background-image on the section, and it is the
 * wrong one. A CSS background carries no alt text, is invisible to search
 * engines, and would bypass the media-library sideload entirely — so the
 * exported site would hotlink the stock CDN forever.
 *
 * Instead the photo is a genuine image block, positioned behind the copy by the
 * stylesheet. It keeps its mandatory alt text, exports into the client's own
 * media library like every other image, and remains editable in wp-admin.
 * ─────────────────────────────────────────────────────────────────────
 *
 * The scrim is a CSS gradient rather than a semi-transparent overlay element,
 * so contrast holds on both light and dark photographs without anyone tuning
 * an opacity per site.
 */
export const HeroBanner: SectionDefinition<HeroBannerProps> = {
  key: "hero-banner",
  nodeType: "HeroBanner",
  name: "Image banner hero",
  category: "Hero",
  description:
    "Full-width photograph with the headline over it. The most dramatic option — needs one genuinely good wide photo.",
  rootClass: "yp-hero-banner",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 60 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 170 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: { type: "image", label: "Background photo", hint: "Wide, uncluttered, room for text" },
  },

  aiPrompt:
    "Copy sits over a photograph, so keep it brief and high-contrast in meaning: a headline of five " +
    "or six words and one supporting sentence. Avoid detail that competes with the image.",

  sample: {
    eyebrow: "OPEN TUESDAY TO SATURDAY",
    heading: "Grown here. Arranged here.",
    body: "Seasonal British flowers, cut from our own beds and local growers within thirty miles.",
    actions: [{ label: "Visit the shop", href: "#", variant: "primary" }],
    image: {
      url: "https://images.pexels.com/photos/4612208/pexels-photo-4612208.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
      alt: "Cut flowers laid out in rows across a workbench.",
    },
  },

  toGutenberg(p) {
    const copy = group(
      "yp-hero-banner__inner",
      [
        p.eyebrow ? paragraph(p.eyebrow, "yp-hero-banner__eyebrow") : "",
        p.heading ? heading(p.heading, 1, "yp-hero-banner__heading") : "",
        p.body ? paragraph(p.body, "yp-hero-banner__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-hero-banner__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const media = p.image?.url
      ? group(
          "yp-hero-banner__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-hero-banner__frame", {
            id: p.image.id,
            title: p.image.title,
            width: p.image.width,
            height: p.image.height,
          }),
        )
      : "";

    // Media first in the DOM so it sits behind without needing a z-index war.
    return group("yp-hero-banner", media + copy, "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-banner");
    if (!el) return null;
    const img = parseImage(el, ".yp-hero-banner__frame");
    return {
      eyebrow: text(el.querySelector(".yp-hero-banner__eyebrow")),
      heading: text(el.querySelector(".yp-hero-banner__heading")),
      body: text(el.querySelector(".yp-hero-banner__body")),
      actions: parseActions(el),
      ...(img ? { image: img } : {}),
    };
  },
};
