import type { FieldSpec } from "@/lib/sections/types";
import { SECTION_PARTS } from "./part-visibility";

/**
 * How wide one part of a section is.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY STEPS AND NOT A NUMBER
 *
 * The request was px and %. Percentages come in steps because the carrier is
 * a class, and that is not a stylistic preference — it is what keeps a
 * client's site working.
 *
 * WordPress regenerates a static block's HTML from the className in its
 * comment. An inline `style="width:60%"` has no attribute to be regenerated
 * from, so the stored markup and the regenerated markup disagree and every
 * such block reports "this block contains unexpected or invalid content" in
 * wp-admin. One click of Attempt Block Recovery then strips it silently. A
 * class round-trips through that; an arbitrary inline style does not.
 *
 * Six steps also happen to be what people reach for. A width of 62% is almost
 * never a decision; "about two thirds" is.
 *
 * WHERE THE PIXELS ARE
 *
 * Genuinely arbitrary pixels live where WordPress itself keeps them: an
 * image's width and height are real core block attributes, so they survive
 * validation by being what core expects. That is handled separately, on the
 * image, and is why "px" is not offered here — a px width on a heading would
 * be the one that breaks.
 * ─────────────────────────────────────────────────────────────────────
 */

/** The widths a part can take. "auto" is the design's own. */
export const WIDTHS: Array<{ value: string; label: string; cls: string }> = [
  { value: "auto", label: "As designed", cls: "" },
  { value: "25", label: "A quarter", cls: "u-w--25" },
  { value: "33", label: "A third", cls: "u-w--33" },
  { value: "50", label: "Half", cls: "u-w--50" },
  { value: "66", label: "Two thirds", cls: "u-w--66" },
  { value: "75", label: "Three quarters", cls: "u-w--75" },
  { value: "100", label: "Full width", cls: "u-w--100" },
];

const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** The prop carrying one part's width, e.g. "widthHeading". */
export const widthFieldFor = (partKey: string): string => `width${cap(partKey)}`;

/** Declared on every page section; a part it has not got emits nothing. */
export const PART_SIZE_OPTIONS: Record<string, FieldSpec> = Object.fromEntries(
  SECTION_PARTS.map((p) => [
    widthFieldFor(p.key),
    {
      type: "choice",
      label: `Width of the ${p.label.toLowerCase()}`,
      choices: WIDTHS.map((w) => w.value),
      default: "auto",
    } as FieldSpec,
  ]),
);

/** Puts the width class on the part, in the comment and on the element. */
export function applyPartWidth(
  html: string,
  props: Record<string, unknown> | undefined,
): string {
  if (!props) return html;
  let out = html;

  for (const part of SECTION_PARTS) {
    const value = props[widthFieldFor(part.key)];
    if (typeof value !== "string") continue;
    const width = WIDTHS.find((w) => w.value === value);
    if (!width?.cls) continue;

    out = out.replace(new RegExp(part.match.source, "g"), (token) =>
      part.except.includes(token) ? token : `${token} ${width.cls}`,
    );
  }
  return out;
}

/**
 * Reads the width back off the markup.
 *
 * gutenbergToSchema rebuilds every prop from scratch, so without this a pull
 * from WordPress would reset every width a client had set.
 */
export function partWidthFromHtml(html: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const part of SECTION_PARTS) {
    const attr = new RegExp(`class="([^"]*${part.match.source.replace(/\\b$/, "")}[^"]*)"`);
    const found = attr.exec(html);
    if (!found) continue;
    const classes = new Set(found[1].split(/\s+/));
    const width = WIDTHS.find((w) => w.cls && classes.has(w.cls));
    if (width) out[widthFieldFor(part.key)] = width.value;
  }
  return out;
}
