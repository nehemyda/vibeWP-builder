import type { FieldSpec } from "@/lib/sections/types";

/**
 * Styling one ELEMENT inside a section — its heading, its buttons, its photo.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY ROLES ARE DECLARED, NOT DERIVED FROM THE CLASS NAME
 *
 * The obvious rule is "suffix is role": `__heading` is a heading, `__body` is
 * body copy. An audit of the stylesheet says otherwise, in both directions.
 *
 *   `__copy` means "layout column" in 13 sections and "the copyright line" in
 *   5 — a flex container holding five children, and 0.8rem legal small print.
 *
 *   `.yp-logos__heading` computes to 11.84px mono uppercase with 1.07px
 *   tracking. It is an EYEBROW. Every other `__heading` is 1.4rem–4.7rem, so
 *   deriving from the suffix would hand a caption the display-heading control.
 *
 *   `__label` appears at four different sizes; `__value` spans 3× from a
 *   statistic to a phone number.
 *
 * So each role names the classes it covers and the ones it explicitly does
 * not, and a gate checks the exclusions still exist.
 *
 * WHY THE CLASS TOKEN IS PATCHED WHEREVER IT APPEARS
 *
 * Every block primitive writes its class in TWO places — the `className` in
 * the Gutenberg comment and the `class` on the element:
 *
 *   <!-- wp:heading {"level":2,"className":"yp-hero__heading"} -->
 *   <h2 class="wp-block-heading yp-hero__heading">
 *
 * core rebuilds the element's class from the comment, so the two must agree or
 * the block is invalid in wp-admin. Appending to the token wherever it occurs
 * keeps them in step by construction, and needs no change to any of the 62
 * sections — the primitives in lib/wp/blocks.ts are already the one place
 * these classes are written.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It styles the section's OWN heading, buttons and photo, not each repeated item
 * inside it. Per-instance styling needs per-instance identity in the markup,
 * and we keep builder attributes out of a client's exported content on
 * purpose. A card title in a grid of six is a different role, not this one.
 * ─────────────────────────────────────────────────────────────────────
 */

export type ElementRole = {
  /** Used in field names, e.g. "heading" → headingAlign. */
  key: string;
  label: string;
  /** Matches the class token this role owns. */
  match: RegExp;
  /**
   * Classes that look like the role and are not it. Named individually so a
   * gate can confirm each still exists and still means what it did.
   */
  except: string[];
  options: Array<{ field: string; spec: FieldSpec; classes: Record<string, string> }>;
};

export const ELEMENT_ROLES: ElementRole[] = [
  {
    key: "heading",
    label: "Heading",
    // The section's own heading, in any of the 62 class families.
    match: /yp-[a-z0-9-]+__heading\b/g,
    // 0.74rem uppercase mono — a caption wearing the heading suffix.
    except: ["yp-logos__heading"],
    options: [
      {
        field: "headingAlign",
        spec: {
          type: "choice",
          label: "Alignment",
          choices: ["default", "left", "centre", "right"],
          default: "default",
        },
        classes: { default: "", left: "u-align--left", centre: "u-align--center", right: "u-align--right" },
      },
    ],
  },
  {
    key: "button",
    label: "Buttons",
    // Both variants, so a section's buttons move together — which is what is
    // wanted: a row where one is a pill and one is square reads as a mistake.
    match: /yp-btn--(?:primary|outline|ghost)\b/g,
    except: [],
    options: [
      {
        field: "buttonShape",
        spec: {
          type: "choice",
          label: "Corner shape",
          choices: ["default", "square", "rounded", "pill"],
          default: "default",
        },
        classes: { default: "", square: "u-btn--square", rounded: "u-btn--rounded", pill: "u-btn--pill" },
      },
      {
        field: "buttonSize",
        spec: {
          type: "choice",
          label: "Size",
          choices: ["small", "default", "large"],
          default: "default",
        },
        classes: { small: "u-btn--sm", default: "", large: "u-btn--lg" },
      },
    ],
  },
  {
    key: "image",
    label: "Photo",
    // Every section's photo frame, whatever its family calls it.
    match: /yp-[a-z0-9-]+__(?:frame|media)\b/g,
    except: [],
    options: [
      {
        field: "imageRadius",
        spec: {
          type: "choice",
          label: "Corner shape",
          choices: ["default", "square", "rounded", "circle"],
          default: "default",
        },
        classes: { default: "", square: "u-img--square", rounded: "u-img--rounded", circle: "u-img--circle" },
      },
      {
        field: "imageRatio",
        spec: {
          type: "choice",
          label: "Crop",
          hint: "Leave as designed unless the photograph needs a different shape.",
          choices: ["default", "square", "landscape", "portrait"],
          default: "default",
        },
        classes: { default: "", square: "u-img--1x1", landscape: "u-img--16x9", portrait: "u-img--4x5" },
      },
    ],
  },
];

const ALL_OPTIONS = ELEMENT_ROLES.flatMap((r) => r.options);

/** The field declarations, for merging into every page section. */
export const ELEMENT_STYLE_FIELDS: Record<string, FieldSpec> = Object.fromEntries(
  ALL_OPTIONS.map((o) => [o.field, o.spec]),
);

export function roleFor(field: string): ElementRole | undefined {
  return ELEMENT_ROLES.find((r) => r.options.some((o) => o.field === field));
}

/**
 * Appends the utility classes each role's props ask for.
 *
 * Patches the class token wherever it appears, which covers the block comment
 * and the element together — see the note at the top of this file.
 */
export function applyElementStyles(html: string, props: Record<string, unknown> | undefined): string {
  if (!props) return html;
  let out = html;

  for (const role of ELEMENT_ROLES) {
    const extra = role.options
      .map((o) => (typeof props[o.field] === "string" ? o.classes[props[o.field] as string] : ""))
      .filter(Boolean);
    if (extra.length === 0) continue;

    const suffix = ` ${extra.join(" ")}`;
    out = out.replace(new RegExp(role.match.source, "g"), (token) =>
      role.except.includes(token) ? token : token + suffix,
    );
  }
  return out;
}

/**
 * Reads the settings back off the markup.
 *
 * gutenbergToSchema rebuilds every node's props from scratch, so anything no
 * parser reads is destroyed on a pull from WordPress. This is that parser.
 */
export function elementStylesFromHtml(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const option of ALL_OPTIONS) {
    for (const [value, cls] of Object.entries(option.classes)) {
      if (cls && new RegExp(`\\b${cls}\\b`).test(html)) out[option.field] = value;
    }
  }
  return out;
}

export function allElementClasses(): string[] {
  return ALL_OPTIONS.flatMap((o) => Object.values(o.classes)).filter(Boolean);
}
