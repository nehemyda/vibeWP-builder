import { group, heading, paragraph, buttons, image, requireAlt } from "@/lib/wp/blocks";
import { text, parseActions, parseImage, parseStats, type Action, type SectionImage } from "./shared";
import type { SectionDefinition } from "./types";

export type HeroShowcaseProps = {
  eyebrow?: string;
  heading?: string;
  body?: string;
  actions?: Action[];
  image?: SectionImage;
  /** Overlapping credential chip on the photo. */
  badge?: { title: string; subtitle?: string };
  stats?: Array<{ value: string; label: string }>;
};

/**
 * Split hero, plus a credential badge overlapping the photo and a stats row.
 *
 * The theme already contained styling for `yp-hero__badge` and
 * `yp-hero__stats` — seven and nine rules respectively — that no section ever
 * emitted, so the design existed and was simply unreachable. This variant is
 * where it finally gets used, which is why it needed comparatively little new
 * CSS for how much busier it looks.
 *
 * Aimed at trades and clinics, where the decision turns on credibility:
 * licensed, insured, years in business, jobs completed.
 */
export const HeroShowcase: SectionDefinition<HeroShowcaseProps> = {
  key: "hero-showcase",
  nodeType: "HeroShowcase",
  name: "Showcase hero",
  category: "Hero",
  description:
    "Headline and photo with a floating credential badge and a row of numbers beneath. For businesses that win on trust.",
  rootClass: "yp-hero-showcase",

  fields: {
    eyebrow: { type: "text", label: "Eyebrow", maxChars: 40 },
    heading: { type: "text", label: "Headline", maxChars: 70 },
    body: { type: "richtext", label: "Supporting copy", maxChars: 200 },
    actions: {
      type: "list",
      label: "Buttons",
      of: { label: { type: "text", label: "Label" }, href: { type: "link", label: "Links to" } },
    },
    image: { type: "image", label: "Photo", hint: "Portrait crop, 4:5" },
    badge: {
      type: "list",
      label: "Credential badge",
      hint: "One short claim shown over the photo",
      of: {
        title: { type: "text", label: "Claim" },
        subtitle: { type: "text", label: "Detail" },
      },
    },
    stats: {
      type: "list",
      label: "Numbers",
      hint: "Three reads best",
      of: {
        value: { type: "text", label: "Figure" },
        label: { type: "text", label: "What it counts" },
      },
    },
  },

  aiPrompt:
    "Credibility-led. The badge is a single verifiable claim (licensed, insured, accredited) — omit it entirely rather than inventing one, and never a made-up registration number. " +
    "Stats are figures ONLY from the business details supplied — opening hours, a year the owner " +
    "stated, a service count, a location. Never invent one, and never use a \"placeholder\" number: " +
    "a round figure reads as a claim the moment it is published, and the client may not notice. " +
    "If no real figure was supplied, return an empty stats list — the section renders without the row.",

  sample: {
    eyebrow: "24/7 EMERGENCY CALL-OUT",
    heading: "Plumbing done once, and done properly",
    body: "Gas Safe engineers, upfront pricing agreed before we start, and no call-out charge inside the city.",
    actions: [
      { label: "Call now", href: "#", variant: "primary" },
      { label: "Request a quote", href: "#", variant: "outline" },
    ],
    image: {
      url: "https://images.pexels.com/photos/6419128/pexels-photo-6419128.jpeg?auto=compress&cs=tinysrgb&h=650&w=940&fm=webp",
      alt: "A plumber's hands tightening a pipe fitting under a sink.",
    },
    badge: { title: "Gas Safe registered", subtitle: "Ask to see our card" },
    stats: [
      { value: "Mon–Sat", label: "Available" },
      { value: "Bath", label: "Based in" },
      { value: "Same day", label: "Call-outs" },
    ],
  },

  toGutenberg(p) {
    const copy = group(
      "yp-hero-showcase__copy",
      [
        p.eyebrow ? paragraph(p.eyebrow, "yp-hero-showcase__eyebrow") : "",
        p.heading ? heading(p.heading, 1, "yp-hero-showcase__heading") : "",
        p.body ? paragraph(p.body, "yp-hero-showcase__body") : "",
        p.actions?.length ? buttons(p.actions, "yp-hero-showcase__actions") : "",
      ]
        .filter(Boolean)
        .join(""),
    );

    const badge = p.badge?.title
      ? group(
          "yp-hero-showcase__badge",
          paragraph(p.badge.title, "yp-hero-showcase__badge-title") +
            (p.badge.subtitle
              ? paragraph(p.badge.subtitle, "yp-hero-showcase__badge-sub")
              : ""),
        )
      : "";

    const media = p.image?.url
      ? group(
          "yp-hero-showcase__media",
          image(p.image.url, requireAlt(p.image.alt, p.heading), "yp-hero-showcase__frame", {
            id: p.image.id,
            title: p.image.title,
            width: p.image.width,
            height: p.image.height,
          }) + badge,
        )
      : "";

    const stats = p.stats?.length
      ? group(
          "yp-hero-showcase__stats",
          p.stats
            .filter((s) => s.value || s.label)
            .map((s) =>
              group(
                "yp-hero-showcase__stat",
                paragraph(s.value, "yp-hero-showcase__stat-value") +
                  paragraph(s.label, "yp-hero-showcase__stat-label"),
              ),
            )
            .join(""),
        )
      : "";

    return group(
      "yp-hero-showcase",
      group("yp-hero-showcase__grid", copy + media) + stats,
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-hero-showcase");
    if (!el) return null;

    const img = parseImage(el, ".yp-hero-showcase__frame");
    const badgeTitle = text(el.querySelector(".yp-hero-showcase__badge-title"));

    return {
      eyebrow: text(el.querySelector(".yp-hero-showcase__eyebrow")),
      heading: text(el.querySelector(".yp-hero-showcase__heading")),
      body: text(el.querySelector(".yp-hero-showcase__body")),
      actions: parseActions(el),
      ...(img ? { image: img } : {}),
      ...(badgeTitle
        ? {
            badge: {
              title: badgeTitle,
              subtitle: text(el.querySelector(".yp-hero-showcase__badge-sub")),
            },
          }
        : {}),
      stats: parseStats(
        el,
        ".yp-hero-showcase__stat",
        ".yp-hero-showcase__stat-value",
        ".yp-hero-showcase__stat-label",
      ),
    };
  },
};
