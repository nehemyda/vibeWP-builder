import { isOptionField, type FieldSpec } from "@/lib/sections/types";
import { ELEMENT_STYLE_FIELDS } from "./element-style";
import { PART_VISIBILITY_OPTIONS } from "./part-visibility";
import { PART_SIZE_OPTIONS } from "./part-size";

/**
 * Style settings every page section carries.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THESE ARE DECLARED FIELDS AND NOT A RESERVED `style` PROP
 *
 * The obvious shape is a bag — `props.style = { headings: "lg" }`. It costs
 * more than it looks. carry-props accounts for every prop as carried, dropped,
 * missing or converted, so an unrecognised key is reported to the client as
 * content they are about to lose; verify-carry fails every ordered pair for
 * carrying something the target does not declare; findGhosts reads the values
 * as copy and deletes them; and the AI has no operation that can reach it.
 *
 * Declared as ordinary `choice` fields instead, all of that works with no new
 * code: set_option validates them, carry-props carries a setting when the
 * target has the same one and otherwise takes the target's default — its
 * stated policy, that "a layout choice made for one design says nothing about
 * another" — and chat can already set them.
 *
 * Declared ONCE here and merged into every page section, rather than written
 * into 62 files, because the whole point of a multiplier is that it means the
 * same thing everywhere.
 *
 * WHY A CLASS AND NOT AN INLINE CUSTOM PROPERTY
 *
 * `className` is what a static Gutenberg block's save() emits, so it survives
 * a round trip through the WordPress editor. An inline `style="--x:…"` does
 * not: core regenerates the block's HTML from its attributes, finds no style
 * attribute there, and marks every section as containing unexpected content —
 * and one click of Attempt Block Recovery strips it. `is-sticky` has worked
 * this way since the first header.
 * ─────────────────────────────────────────────────────────────────────
 */

export type StyleOption = {
  field: string;
  spec: FieldSpec;
  /** Choice value → the class that carries it. "" means "add no class". */
  classes: Record<string, string>;
};

export const SECTION_STYLE_OPTIONS: StyleOption[] = [
  {
    field: "headings",
    spec: {
      type: "choice",
      label: "Heading size",
      hint: "Scales this section's headings, keeping the design's own proportions.",
      choices: ["smaller", "small", "default", "large", "larger"],
      default: "default",
    },
    classes: {
      smaller: "u-headings--xs",
      small: "u-headings--sm",
      default: "",
      large: "u-headings--lg",
      larger: "u-headings--xl",
    },
  },
  {
    field: "bodyText",
    spec: {
      type: "choice",
      label: "Body text size",
      choices: ["small", "default", "large"],
      default: "default",
    },
    classes: { small: "u-text--sm", default: "", large: "u-text--lg" },
  },
  {
    field: "space",
    spec: {
      type: "choice",
      label: "Space around it",
      hint: "How much air sits above and below this section.",
      choices: ["tightest", "tight", "default", "airy", "airiest"],
      default: "default",
    },
    classes: {
      tightest: "u-space--xs",
      tight: "u-space--sm",
      default: "",
      airy: "u-space--lg",
      airiest: "u-space--xl",
    },
  },
];

const BY_FIELD = new Map(SECTION_STYLE_OPTIONS.map((o) => [o.field, o]));

/** The field declarations, for merging into a section definition. */
export const SECTION_STYLE_FIELDS: Record<string, FieldSpec> = Object.fromEntries(
  SECTION_STYLE_OPTIONS.map((o) => [o.field, o.spec]),
);

/** The utility classes a section's props ask for, as one space-joined string. */
export function styleClassesFor(props: Record<string, unknown> | undefined): string {
  if (!props) return "";
  const out: string[] = [];
  for (const option of SECTION_STYLE_OPTIONS) {
    const value = props[option.field];
    if (typeof value !== "string") continue;
    const cls = option.classes[value];
    if (cls) out.push(cls);
  }
  return out.join(" ");
}

/**
 * Reads the settings back out of a class list.
 *
 * The counterpart of styleClassesFor, and the reason section styling survives
 * a pull from WordPress: gutenbergToSchema rebuilds every node's props from
 * scratch, so anything no parser reads is destroyed.
 */
export function styleFromClasses(className: string): Record<string, string> {
  const present = new Set(className.split(/\s+/).filter(Boolean));
  const out: Record<string, string> = {};
  for (const option of SECTION_STYLE_OPTIONS) {
    for (const [value, cls] of Object.entries(option.classes)) {
      if (cls && present.has(cls)) out[option.field] = value;
    }
  }
  return out;
}

/** Every utility class this module can emit, for the stylesheet gate. */
export function allStyleClasses(): string[] {
  return SECTION_STYLE_OPTIONS.flatMap((o) => Object.values(o.classes)).filter(Boolean);
}

export function isStyleField(field: string): boolean {
  return BY_FIELD.has(field);
}

/*
 * Names already spoken for by a shared family — every field the Style panel
 * shows through some OTHER route, so a section's own option of the same name
 * is never listed twice.
 */
const SHARED_FIELD_NAMES = new Set([
  ...Object.keys(SECTION_STYLE_FIELDS),
  ...Object.keys(ELEMENT_STYLE_FIELDS),
  ...Object.keys(PART_VISIBILITY_OPTIONS),
  ...Object.keys(PART_SIZE_OPTIONS),
]);

/**
 * A section's OWN option fields — background, width, "photos per row" —
 * as opposed to the ones above that every section gets for free.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS SEPARATE FROM SECTION_STYLE_OPTIONS
 *
 * Everything above works on any section because every one of them reads the
 * same shared multiplier variable through styleClassesFor — a control that
 * means the same thing everywhere, applied through one generic pipeline with
 * no section-specific code.
 *
 * A field like hero-split's `background` is not like that: it only works
 * because THAT section's own toGutenberg reads it and writes its own class,
 * onto CSS that only that section declares. Merging it into the shared list
 * would put a working-looking control on every other section where changing
 * it does nothing — a control that lies is worse than one that is missing.
 *
 * So this reads the field back out of the section's OWN registry entry
 * instead: whatever `choice`/`boolean`/`number` field a section declares for
 * itself, beyond the shared families, shows up here automatically. Add a
 * field to a section and its control appears in the Style panel with no
 * change to this file or to BuilderApp — the same promise the registry
 * already makes everywhere else.
 * ─────────────────────────────────────────────────────────────────────
 */
export function sectionOwnOptions(
  fields: Record<string, FieldSpec> | undefined,
): Array<{ field: string; spec: FieldSpec }> {
  if (!fields) return [];
  return Object.entries(fields)
    .filter(([field, spec]) => isOptionField(spec) && !SHARED_FIELD_NAMES.has(field))
    .map(([field, spec]) => ({ field, spec }));
}
