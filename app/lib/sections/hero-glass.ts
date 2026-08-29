import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroGlassProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  image?: SectionImage;
};

/**
 * Full-bleed photo with the copy inside a frosted glass card.
 *
 * The card exists to solve a real problem with text-over-photo heroes: a busy
 * photograph destroys legibility, and the usual fix — darkening the whole image
 * — throws away the picture you chose it for. A blurred panel keeps the photo
 * visible everywhere except directly behind the words.
 *
 * backdrop-filter is well supported now, but an @supports fallback fills the
 * card with a solid tint where it is not, so the text is never unreadable.
 * Degrading to "slightly plainer" is fine; degrading to "white on white" is not.
 */
export const HeroGlass: SectionDefinition<HeroGlassProps> = {
  key: "hero-glass",
  nodeType: "HeroGlass",
  name: "Glass card hero",
  category: "Hero",
  description:
    "Full-width photo with the copy in a frosted panel. Keeps a busy photograph visible while the text stays readable.",
  rootClass: "yp-hero-glass",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 55 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 160 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: { type: "image", label: "Background photo", hint: "Wide; busy is fine here" },
  },

  aiPrompt:
    "Brief — the copy sits in a panel roughly a third of the width. Headline of five words or fewer, " +
    "one short sentence, one button.",

  sample: {
    eyebrow: "MARKET STREET",
    heading: "Fresh, every morning",
    body: "Cut and conditioned before the shop opens. Come early for the best of it.",
    actions: [{ label: "Opening hours", href: "#", variant: "primary" }],
    image: {
      url: "https://images.pexels.com/photos/10096892/pexels-photo-10096892.jpeg?auto=compress&cs=tinysrgb&h=650&w=1200&fm=webp",
      alt: "Buckets of cut flowers set out on the pavement at a market stall.",
    },
  },

  toGutenberg(p) {
    const card = group(
      "yp-hero-glass__card",
      [
        p.eyebrow ? paragraph(p.eyebrow, "yp-hero-glass__eyebrow") : "",
        p.heading ? heading(p.heading, 1, "yp-hero-glass__heading") : "",
        p.body ? paragraph(p.body, "yp-hero-glass__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-hero-glass__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const media = p.image?.url
      ? group(
          "yp-hero-glass__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-hero-glass__frame", {
            id: p.image.id,
            width: p.image.width,
            height: p.image.height,
          }),
        )
      : "";

    return group("yp-hero-glass", media + group("yp-hero-glass__inner", card), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-glass");
    if (!el) return null;
    const img = parseImage(el, ".yp-hero-glass__frame");
    return {
      eyebrow: text(el.querySelector(".yp-hero-glass__eyebrow")),
      heading: text(el.querySelector(".yp-hero-glass__heading")),
      body: text(el.querySelector(".yp-hero-glass__body")),
      actions: parseActions(el),
      ...(img ? { image: img } : {}),
    };
  },
};
