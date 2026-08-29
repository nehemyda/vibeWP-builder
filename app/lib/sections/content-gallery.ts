import { group, heading, paragraph, image, gallery, requireAlt } from "@/lib/wp/blocks";
import { text, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type ContentGalleryProps = {
  /** Click a photo to open it full size. Default on. */
  lightbox?: boolean;
  /** \"2\" | \"3\" | \"4\" — photos per row from tablet up. */
  columns?: string;
  heading?: string;
  intro?: string;
  items?: Array<{ image?: SectionImage; caption?: string }>;
};

/**
 * A grid of captioned photographs — recent work.
 *
 * The most image-hungry section in the library: six tiles means six stock
 * searches and six files sideloaded on export. Worth stating plainly, because
 * it is also the section a client is most likely to want and most likely to
 * replace with their own photos — which is exactly the right outcome, since
 * generic stock is weakest here of anywhere.
 */
export const ContentGallery: SectionDefinition<ContentGalleryProps> = {
  key: "content-gallery",
  nodeType: "ContentGallery",
  name: "Work gallery",
  category: "Content",
  description:
    "Captioned photo grid for recent work. The section clients most want to fill with their own pictures.",
  rootClass: "yp-gallery",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    intro: { type: "text", label: "Intro line", maxChars: 150 },
    lightbox: {
      type: "boolean",
      label: "Enlarge photos when clicked",
      hint: "Uses WordPress's own popup viewer. On by default.",
      default: true,
    },
    columns: {
      type: "choice",
      label: "Photos per row",
      hint: "Applies from tablet up; always one column on a phone.",
      choices: ["2", "3", "4"],
      default: "3",
    },
    items: {
      type: "list",
      label: "Tiles",
      hint: "Three or six — each is a separate photo",
      of: {
        image: { type: "image", label: "Photo" },
        caption: { type: "text", label: "Caption" },
      },
    },
  },

  aiPrompt:
    "Captions name what the piece of work WAS — the occasion, the venue, the job — not what the " +
    "photo shows. Under eight words each. These are placeholders the client will replace with real " +
    "work, so keep them plainly generic rather than inventing specific clients or venues.",

  sample: {
    lightbox: true,
    columns: "3",
    heading: "Recent work",
    intro: "A few from the last month. Replace these with your own once you have them.",
    items: [
      {
        image: { url: "https://images.pexels.com/photos/931177/pexels-photo-931177.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp", alt: "A close-up of pale pink ranunculus flowers." },
        caption: "Hand-tied, seasonal",
      },
      {
        image: { url: "https://images.pexels.com/photos/4612208/pexels-photo-4612208.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp", alt: "Cut flowers laid out in rows across a workbench." },
        caption: "Wedding, local venue",
      },
      {
        image: { url: "https://images.pexels.com/photos/4238333/pexels-photo-4238333.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp", alt: "Inside a flower shop, with arrangements displayed on shelves and stands." },
        caption: "Weekly office contract",
      },
    ],
  },

  toGutenberg(p) {
    const cols = ["2", "3", "4"].includes(String(p.columns)) ? Number(p.columns) : 3;

    /*
     * Each photo is a bare core/image INSIDE a core/gallery — no group wrapper.
     *
     * The wrapper is what broke next/previous: core only offers navigation
     * between images sharing a galleryId, and an image only earns one by being
     * nested directly in a core/gallery. Captions move onto the image block's
     * own figcaption, which is where core expects them and what the lightbox
     * carries through to the enlarged view.
     */
    const tiles = (p.items ?? [])
      .filter((i) => i?.image?.url)
      .map((i) =>
        image(
          i.image!.url,
          requireAlt(i.image!.alt, i.caption),
          // The class mirrors the block attribute so the option survives a
          // round trip: the lightbox lives in a block COMMENT, invisible to the
          // HTML parser. It also gives the CSS its zoom cursor.
          p.lightbox !== false ? "yp-gallery__frame has-lightbox" : "yp-gallery__frame",
          {
            id: i.image!.id,
            width: i.image!.width,
            height: i.image!.height,
            // Off only when explicitly turned off: a gallery whose photos do
            // not enlarge is the unusual case, not the default.
            lightbox: p.lightbox !== false,
            inGallery: true,
          },
          i.caption,
        ),
      )
      .join("");

    const head = [
      p.heading ? heading(p.heading, 2, "yp-gallery__heading") : "",
      p.intro ? paragraph(p.intro, "yp-gallery__intro") : "",
    ]
      .filter(Boolean)
      .join("");

    return group(
      "yp-gallery",
      head + gallery(tiles, `yp-gallery__grid cols-${cols}`, cols),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-gallery");
    if (!el) return null;
    return {
      lightbox: Boolean(el.querySelector(".yp-gallery__frame.has-lightbox")),
      columns:
        (el.querySelector(".yp-gallery__grid")?.getAttribute("class") ?? "")
          .match(/cols-(\d)/)?.[1] ?? "3",
      heading: text(el.querySelector(".yp-gallery__heading")),
      intro: text(el.querySelector(".yp-gallery__intro")),
      /*
       * Each tile IS the image figure now — the group wrapper was removed so
       * core would treat these as one gallery. The caption is the block's own
       * figcaption, which is where core puts it and what the lightbox shows
       * alongside the enlarged photo.
       */
      items: el
        .querySelectorAll(".yp-gallery__frame")
        .map((frame) => {
          const img = frame.querySelector("img");
          const url = img?.getAttribute("src")?.trim();
          const idMatch = img?.getAttribute("class")?.match(/wp-image-(\d+)/);
          return {
            ...(url
              ? {
                  image: {
                    url,
                    alt: img?.getAttribute("alt")?.trim() ?? "",
                    ...(idMatch ? { id: Number(idMatch[1]) } : {}),
                  },
                }
              : {}),
            caption: text(frame.querySelector(".wp-element-caption")),
          };
        })
        .filter((i) => i.image?.url),
    };
  },
};
