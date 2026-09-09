import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroPatternProps = {
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
 * Tinted panel with a dot grid, and a photo that overlaps its edge.
 *
 * The overlap is the point. Every other two-column hero keeps its image inside
 * a tidy column, which is what makes a page look templated. Letting the photo
 * break out of the tinted panel — negative margin on one side — reads as an
 * intentional composition for the cost of two CSS declarations.
 *
 * The dot grid is a single repeating radial-gradient, so it costs no request
 * and scales with the tokens rather than being a fixed-size tiled image.
 */
export const HeroPattern: SectionDefinition<HeroPatternProps> = {
  key: "hero-pattern",
  nodeType: "HeroPattern",
  name: "Pattern panel hero",
  category: "Hero",
  description:
    "Copy on a tinted dot-grid panel with the photo overlapping its edge. Asymmetric, so a page stops looking templated.",
  rootClass: "yp-hero-pattern",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 60 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 180 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: { type: "image", label: "Photo", hint: "Portrait or square works; it overlaps the panel" },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-hero-pattern__grid already wraps everything under the root with
     * nothing else emitted alongside it. Separate from the panel's own
     * dot-grid tint, which stays exactly as designed either way — this adds
     * a wash to the ROW behind the whole section, not the panel itself.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The panel and photo stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the panel and photo.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },

  aiPrompt:
    "Warm and specific. A headline of six or seven words and two short sentences — say what the " +
    "business does and one concrete thing that makes it different.",

  sample: {
    eyebrow: "FAMILY RUN SINCE 2011",
    heading: "The shop your grandmother would have used",
    body: "Proper flowers, arranged properly. We'll tell you honestly what's good this week and what to avoid.",
    actions: [
      { label: "Order flowers", href: "#", variant: "primary" },
      { label: "Find the shop", href: "#", variant: "outline" },
    ],
    image: {
      url: "https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
      alt: "A close-up of pale pink ranunculus flowers.",
    },
  },

  toGutenberg(p) {
    /*
     * The fields go DIRECTLY into the panel — no inner wrapper.
     *
     * There was one, and it broke the layout: the panel carries the flex column
     * and its gap, so with a single wrapper child the gap applied between
     * nothing, and the eyebrow, heading and buttons stacked flush against each
     * other. The panel is the copy container; a second one has no job.
     */
    const copy = [
      p.eyebrow ? paragraph(p.eyebrow, "yp-hero-pattern__eyebrow") : "",
      p.heading ? heading(p.heading, 1, "yp-hero-pattern__heading") : "",
      p.body ? paragraph(p.body, "yp-hero-pattern__body") : "",
      p.actions?.length ? buttons(p.actions, "yp-hero-pattern__actions") : "",
    ]
      .filter(Boolean)
      .join("");

    const media = p.image?.url
      ? group(
          "yp-hero-pattern__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-hero-pattern__frame", {
            id: p.image.id,
            title: p.image.title,
            width: p.image.width,
            height: p.image.height,
          }),
        )
      : "";

    const rootClass = [
      "yp-hero-pattern",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return group(
      rootClass,
      group("yp-hero-pattern__grid", group("yp-hero-pattern__panel", copy) + media),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-pattern");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    const img = parseImage(el, ".yp-hero-pattern__frame");
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      eyebrow: text(el.querySelector(".yp-hero-pattern__eyebrow")),
      heading: text(el.querySelector(".yp-hero-pattern__heading")),
      body: text(el.querySelector(".yp-hero-pattern__body")),
      actions: parseActions(el),
      ...(img ? { image: img } : {}),
    };
  },
};
