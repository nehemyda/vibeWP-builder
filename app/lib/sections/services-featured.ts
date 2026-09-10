import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type ServicesFeaturedProps = {
  heading?: string;
  featured?: { title: string; body: string; meta?: string; image?: SectionImage };
  actions?: Action[];
  others?: Array<{ title: string; body: string }>;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * One service given the whole left side, the rest listed beside it.
 *
 * Deliberately unequal, which is the point: most small businesses have one
 * service that pays the bills and several that fill the diary. A grid of equal
 * cards flattens that and makes a visitor work out the priority for themselves.
 *
 * Only the featured service carries an image, so this costs one stock photo
 * rather than one per service.
 */
export const ServicesFeatured: SectionDefinition<ServicesFeaturedProps> = {
  key: "services-featured",
  nodeType: "ServicesFeatured",
  name: "Services, one featured",
  category: "Content",
  description:
    "One headline service with a photo, the rest listed beside it. Shows priority instead of flattening everything into equal cards.",
  rootClass: "yp-svcf",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    featured: {
      type: "list",
      label: "Featured service",
      hint: "The one that matters most",
      of: {
        title: { type: "text", label: "Service" },
        body: { type: "text", label: "Two or three sentences" },
        meta: { type: "text", label: "Aside" },
        image: { type: "image", label: "Photo" },
      },
    },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    others: {
      type: "list",
      label: "Other services",
      hint: "Three or four, one line each",
      of: { title: { type: "text", label: "Service" }, body: { type: "text", label: "One line" } },
    },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Different reason from most: the heading sits outside
     * .yp-svcf__grid with no shared ancestor, so toGutenberg wraps them
     * together in a NEW element (.yp-svcf__inner) — the same fix
     * content-gallery needed.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The heading and services stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the heading and services.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },

  aiPrompt:
    "Pick as featured the service the business most wants to sell — usually the highest value or the " +
    "one they lead with when asked what they do. Give it two or three sentences. The others get one " +
    "line each and should read as genuine alternatives, not afterthoughts.",

  sample: {
    heading: "Where most people start",
    featured: {
      title: "Wedding flowers",
      body: "It starts with a free half-hour in the shop with whoever will actually make your flowers. You get honest advice on what your budget will reach and what will be genuinely good on your date, then a written quote within two days.",
      meta: "Book 3–6 months ahead",
      image: { url: "https://images.pexels.com/photos/5409696/pexels-photo-5409696.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp", alt: "Two florists arranging a bouquet together at a shop workbench." },
    },
    actions: [{ label: "Book a consultation", href: "#", variant: "primary" }],
    others: [
      { title: "Subscriptions", body: "Weekly or fortnightly, home or office." },
      { title: "Sympathy tributes", body: "Handled quietly, same day where possible." },
      { title: "Events and venues", body: "Installations, delivered and cleared." },
      { title: "Workshops", body: "Small groups in the shop, seasonal." },
    ],
  },

  toGutenberg(p) {
    const f = p.featured;
    const main = group(
      "yp-svcf__main",
      (f?.image?.url
        ? image(f.image.url, requireAlt(f.image.alt, f.title), "yp-svcf__frame", {
            id: f.image.id,
            title: f.image.title,
            width: f.image.width,
            height: f.image.height,
          })
        : "") +
        group(
          "yp-svcf__maincopy",
          [
            f?.meta ? paragraph(f.meta, "yp-svcf__meta") : "",
            f?.title ? heading(f.title, 3, "yp-svcf__title") : "",
            f?.body ? paragraph(f.body, "yp-svcf__body") : "",
            p.actions?.length ? buttons(p.actions, "yp-svcf__actions") : "",
          ]
            .filter(Boolean)
            .join(""),
        ),
    );

    const others = group(
      "yp-svcf__others",
      (p.others ?? [])
        .filter((o) => o?.title || o?.body)
        .map((o) =>
          group(
            "yp-svcf__other",
            (o.title ? heading(o.title, 4, "yp-svcf__other-title") : "") +
              (o.body ? paragraph(o.body, "yp-svcf__other-body") : ""),
          ),
        )
        .join(""),
    );

    const rootClass = [
      "yp-svcf",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(
      rootClass,
      group(
        "yp-svcf__inner",
        (p.heading ? heading(p.heading, 2, "yp-svcf__heading") : "") + group("yp-svcf__grid", main + others),
      ),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-svcf");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    const main = el.querySelector(".yp-svcf__main");
    const img = main ? parseImage(main, ".yp-svcf__frame") : null;
    const title = text(el.querySelector(".yp-svcf__title"));

    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-svcf__heading")),
      ...(title || img
        ? {
            featured: {
              title,
              body: text(el.querySelector(".yp-svcf__body")),
              meta: text(el.querySelector(".yp-svcf__meta")),
              ...(img ? { image: img } : {}),
            },
          }
        : {}),
      actions: parseActions(el),
      others: el
        .querySelectorAll(".yp-svcf__other")
        .map((o) => ({
          title: text(o.querySelector(".yp-svcf__other-title")),
          body: text(o.querySelector(".yp-svcf__other-body")),
        }))
        .filter((o) => o.title || o.body),
    };
  },
};
