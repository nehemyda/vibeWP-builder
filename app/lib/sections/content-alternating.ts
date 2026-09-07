import { group, heading, paragraph, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseImage, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type ContentAlternatingProps = {
  heading?: string;
  rows?: Array<{ title: string; body: string; image?: SectionImage }>;
};

/**
 * Image-and-text rows that alternate sides down the page.
 *
 * The single most effective fix for the "column of identical boxes" problem:
 * every other section here is a symmetric grid, and a page of them reads as a
 * template. Alternating sides gives a long page rhythm for the cost of one
 * :nth-child rule.
 *
 * Costs more than it looks in generation, though — each row is another stock
 * photo to find and another file to sideload on export.
 */
export const ContentAlternating: SectionDefinition<ContentAlternatingProps> = {
  key: "content-alternating",
  nodeType: "ContentAlternating",
  name: "Alternating rows",
  category: "Content",
  description:
    "Image-and-text rows that flip sides down the page. The strongest way to stop a long page looking templated.",
  rootClass: "yp-alt",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    rows: {
      type: "list",
      label: "Rows",
      hint: "Two or three — each needs its own photo",
      of: {
        title: { type: "text", label: "Row heading" },
        body: { type: "text", label: "Row copy" },
        image: { type: "image", label: "Photo" },
      },
    },
  },

  aiPrompt:
    "Each row is one distinct thing the business does or believes, with a concrete heading and two " +
    "or three sentences. Two or three rows; more becomes a scroll. Give each a different angle — " +
    "what they make, how they work, who they serve — rather than three restatements.",

  sample: {
    heading: "How we work",
    rows: [
      {
        title: "Everything is cut and conditioned here",
        body: "Stems arrive from growers in the morning and are stripped, cut and rested before anything is built. It is the unglamorous part that decides how long your flowers last.",
        image: {
          url: "https://images.pexels.com/photos/6720587/pexels-photo-6720587.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
          alt: "A florist in an apron trimming flower stems with secateurs.",
        },
      },
      {
        title: "We buy what's good, not what's on a list",
        body: "Menus of fixed bouquets mean importing whatever fills the gap. We tell you what's genuinely good this week and build around it.",
        image: {
          url: "https://images.pexels.com/photos/10096892/pexels-photo-10096892.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
          alt: "Buckets of cut flowers set out on the pavement at a market stall.",
        },
      },
    ],
  },

  toGutenberg(p) {
    const rows = (p.rows ?? [])
      .filter((r) => r?.title || r?.body)
      .map((r) => {
        const copy = group(
          "yp-alt__copy",
          (r.title ? heading(r.title, 3, "yp-alt__title") : "") +
            (r.body ? paragraph(r.body, "yp-alt__body") : ""),
        );
        const media = r.image?.url
          ? group(
              "yp-alt__media",
              image(r.image.url, requireAlt(r.image.alt, r.title), "yp-alt__frame", {
                id: r.image.id,
                title: r.image.title,
                width: r.image.width,
                height: r.image.height,
              }),
            )
          : "";
        return group("yp-alt__row", copy + media);
      })
      .join("");

    return group(
      "yp-alt",
      (p.heading ? heading(p.heading, 2, "yp-alt__heading") : "") + rows,
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-alt");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-alt__heading")),
      rows: el
        .querySelectorAll(".yp-alt__row")
        .map((row) => {
          const img = parseImage(row, ".yp-alt__frame");
          return {
            title: text(row.querySelector(".yp-alt__title")),
            body: text(row.querySelector(".yp-alt__body")),
            ...(img ? { image: img } : {}),
          };
        })
        .filter((r) => r.title || r.body),
    };
  },
};
