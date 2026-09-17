import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroDuotoneProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  image?: SectionImage;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * Photograph tinted into the brand colour, copy alongside.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY DUOTONE IS WORTH HAVING HERE SPECIFICALLY
 *
 * Generated sites use stock photography, and the single biggest tell is that
 * the photo's colours have nothing to do with the brand. A duotone treatment —
 * greyscale the image, then blend it over a solid brand colour with
 * mix-blend-mode: luminosity — forces any photograph into the palette.
 *
 * That means a mediocre or off-colour stock image still looks deliberate, which
 * matters much more for a generated site than for a hand-designed one.
 *
 * Done in CSS rather than by processing the file, so the media library keeps the
 * untouched original and the client can drop the effect by editing the theme.
 * ─────────────────────────────────────────────────────────────────────
 */
export const HeroDuotone: SectionDefinition<HeroDuotoneProps> = {
  key: "hero-duotone",
  nodeType: "HeroDuotone",
  name: "Duotone photo hero",
  category: "Hero",
  description:
    "Photo tinted into the brand colour beside the headline. Makes ordinary stock photography look deliberate and on-brand.",
  rootClass: "yp-hero-duotone",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 60 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 190 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: {
      type: "image",
      label: "Photo",
      hint: "Anything with clear shapes — colour doesn't matter, it gets tinted",
    },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-hero-duotone__grid already wraps everything under the root with
     * nothing else emitted alongside it.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The photo and copy stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the photo and copy.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },

  aiPrompt:
    "Editorial and confident. A headline of six or seven words, then two sentences of substance — " +
    "this layout gives the copy real room. The photograph is tinted, so describe the business, not " +
    "the picture.",

  sample: {
    eyebrow: "STUDIO & SHOP",
    heading: "Every arrangement made by hand, in the shop, that morning",
    body: "No warehouses, no imported boxes. We buy from growers we know, condition everything ourselves, and build each order to order.",
    actions: [{ label: "See what's in season", href: "#", variant: "primary" }],
    image: {
      url: "https://images.pexels.com/photos/6720587/pexels-photo-6720587.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
      alt: "A florist in an apron trimming flower stems with secateurs.",
    },
  },

  toGutenberg(p) {
    const copy = group(
      "yp-hero-duotone__copy",
      [
        p.eyebrow ? paragraph(p.eyebrow, "yp-hero-duotone__eyebrow") : "",
        p.heading ? heading(p.heading, 1, "yp-hero-duotone__heading") : "",
        p.body ? paragraph(p.body, "yp-hero-duotone__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-hero-duotone__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const media = p.image?.url
      ? group(
          "yp-hero-duotone__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-hero-duotone__frame", {
            id: p.image.id,
            title: p.image.title,
            width: p.image.width,
            height: p.image.height,
          }),
        )
      : "";

    const rootClass = [
      "yp-hero-duotone",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return group(rootClass, group("yp-hero-duotone__grid", copy + media), "section");
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-duotone");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    const img = parseImage(el, ".yp-hero-duotone__frame");
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      eyebrow: text(el.querySelector(".yp-hero-duotone__eyebrow")),
      heading: text(el.querySelector(".yp-hero-duotone__heading")),
      body: text(el.querySelector(".yp-hero-duotone__body")),
      actions: parseActions(el),
      ...(img ? { image: img } : {}),
    };
  },
};
