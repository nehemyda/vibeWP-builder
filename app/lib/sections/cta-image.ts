import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type CtaImageProps = { heading?: string; body?: string; actions?: Action[]; image?: SectionImage };

/**
 * The ask over a photograph.
 *
 * Same real-<img>-behind-a-scrim construction as the banner hero, and for the
 * same reasons: a CSS background would carry no alt text, be invisible to
 * search engines, and skip the media-library sideload so the exported site
 * hotlinked the stock CDN permanently.
 */
export const CtaImage: SectionDefinition<CtaImageProps> = {
  key: "cta-image",
  nodeType: "CtaImage",
  name: "CTA over photo",
  category: "Conversion",
  description: "The closing ask over a full-width photograph. Real image with alt text, not a CSS background.",
  rootClass: "yp-ctaimg",
  fields: {
    heading: { type: "text", label: "The ask", maxChars: 55 },
    body: { type: "text", label: "Supporting line", maxChars: 130 },
    actions: { type: "list", label: "Buttons", of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } } },
    image: { type: "image", label: "Background photo", hint: "Wide, uncluttered" },
  },
  aiPrompt: "Short — the copy sits over a photo. Heading under seven words, one supporting line, one button.",
  sample: {
    heading: "Let's make something",
    body: "Tell us the occasion. We'll do the rest.",
    actions: [{ label: "Get in touch", href: "#", variant: "primary" }],
    image: { url: "https://images.pexels.com/photos/4612208/pexels-photo-4612208.jpeg?auto=compress&cs=tinysrgb&h=650&w=1200&fm=webp", alt: "Cut flowers laid out in rows across a workbench." },
  },
  toGutenberg(p) {
    const media = p.image?.url ? group("yp-ctaimg__media", image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-ctaimg__frame", { id: p.image.id, width: p.image.width, height: p.image.height })) : "";
    const inner = group("yp-ctaimg__inner", [
      p.heading ? heading(p.heading, 2, "yp-ctaimg__heading") : "",
      p.body ? paragraph(p.body, "yp-ctaimg__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-ctaimg__actions") : "",
    ].filter(Boolean).join(""));
    return group("yp-ctaimg", media + inner, "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ctaimg");
    if (!el) return null;
    const img = parseImage(el, ".yp-ctaimg__frame");
    return { heading: text(el.querySelector(".yp-ctaimg__heading")), body: text(el.querySelector(".yp-ctaimg__body")), actions: parseActions(el), ...(img ? { image: img } : {}) };
  },
};
