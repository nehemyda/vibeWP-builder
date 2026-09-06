import type { FieldSpec } from "@/lib/sections/types";

/**
 * Showing and hiding one part of a section, per screen size.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HIDE IS NOT DELETE
 *
 * Hiding is temporary and keeps the content: the words stay in the schema,
 * the part simply is not painted at the sizes chosen, and unhiding is one
 * click. Deleting removes the content, and is undone the way any other edit
 * is. Two different things, so two different mechanisms — a "delete" that
 * merely set display:none would leave a client's abandoned copy in the
 * markup of their live site, invisible to them and perfectly visible to a
 * search engine.
 *
 * WHY A CLASS AND NOT AN INLINE STYLE
 *
 * The same reason is-sticky is a class: core rebuilds a static block's markup
 * from the className in its comment, so an inline style has no attribute to
 * survive in and the block goes invalid in wp-admin. And a prop no parser
 * reads is destroyed on every pull from WordPress.
 *
 * WHY FIVE CHOICES AND NOT THREE CHECKBOXES
 *
 * Three independent toggles is nine states, of which several are nonsense
 * (hidden everywhere but tablet) and one is a trap (hidden everywhere, which
 * reads as deleted and is not). These five are the ones people actually
 * want, named as intentions rather than as combinations of breakpoints.
 * ─────────────────────────────────────────────────────────────────────
 */

/** The structural parts a section is built from, by the class each wears. */
export const SECTION_PARTS: Array<{
  key: string;
  label: string;
  /** Matches the class token this part owns, in any of the 62 families. */
  match: RegExp;
  /** Classes that wear the suffix and are not the part. */
  except: string[];
}> = [
  { key: "eyebrow", label: "Eyebrow", match: /yp-[a-z0-9-]+__eyebrow\b/g, except: [] },
  {
    key: "heading",
    label: "Heading",
    match: /yp-[a-z0-9-]+__heading\b/g,
    // 0.74rem uppercase mono — a caption wearing the heading suffix. Same
    // exclusion the heading style role makes, and for the same reason.
    except: ["yp-logos__heading"],
  },
  { key: "intro", label: "Intro line", match: /yp-[a-z0-9-]+__intro\b/g, except: [] },
  { key: "body", label: "Body copy", match: /yp-[a-z0-9-]+__body\b/g, except: [] },
  { key: "actions", label: "Buttons", match: /yp-[a-z0-9-]+__actions\b/g, except: [] },
  {
    key: "media",
    label: "Photo",
    match: /yp-[a-z0-9-]+__(?:media|frame)\b/g,
    except: [],
  },
];

/** What "showing" can mean, as an intention rather than a set of breakpoints. */
export const VISIBILITY: Array<{ value: string; label: string; classes: string[] }> = [
  { value: "all", label: "Everywhere", classes: [] },
  { value: "desktop", label: "Desktop only", classes: ["u-hide--tablet", "u-hide--mobile"] },
  { value: "not-mobile", label: "Not on phones", classes: ["u-hide--mobile"] },
  { value: "mobile", label: "Phones only", classes: ["u-hide--desktop", "u-hide--tablet"] },
  {
    value: "none",
    label: "Hidden",
    classes: ["u-hide--desktop", "u-hide--tablet", "u-hide--mobile"],
  },
];

/** The prop that carries a part's visibility, e.g. "showHeading". */
export const fieldFor = (partKey: string): string =>
  `show${partKey[0].toUpperCase()}${partKey.slice(1)}`;

const SPEC: FieldSpec = {
  type: "choice",
  label: "Show",
  choices: VISIBILITY.map((v) => v.value),
  default: "all",
};

/**
 * Declared on every page section, whether or not it has the part.
 *
 * A field for a part the section does not have costs nothing: its class
 * pattern matches nothing, so it emits nothing. The panel decides what to
 * OFFER by looking at what the section actually rendered, which is the same
 * way text and photographs are found — the markup is the truth about what is
 * there, and a registry of which section has an eyebrow would be a second
 * copy of that truth, free to drift.
 */
export const PART_VISIBILITY_OPTIONS: Record<string, FieldSpec> = Object.fromEntries(
  SECTION_PARTS.map((p) => [fieldFor(p.key), { ...SPEC, label: `Show ${p.label.toLowerCase()}` }]),
);

/** Applies the visibility classes to the emitted markup. */
export function applyPartVisibility(
  html: string,
  props: Record<string, unknown> | undefined,
): string {
  if (!props) return html;
  let out = html;

  for (const part of SECTION_PARTS) {
    const value = props[fieldFor(part.key)];
    if (typeof value !== "string" || value === "all") continue;
    const choice = VISIBILITY.find((v) => v.value === value);
    if (!choice || choice.classes.length === 0) continue;

    /*
     * Appended to the class token wherever it occurs, which is both the
     * className in the Gutenberg comment and the class on the element. core
     * regenerates one from the other, so they have to agree or the block is
     * invalid in wp-admin.
     */
    const suffix = ` ${choice.classes.join(" ")}`;
    out = out.replace(new RegExp(part.match.source, "g"), (token) =>
      part.except.includes(token) ? token : token + suffix,
    );
  }
  return out;
}

/**
 * Reads the visibility back off the markup.
 *
 * gutenbergToSchema rebuilds every prop from scratch, so this is what stops a
 * pull from WordPress un-hiding everything the client hid.
 *
 * Matched on the SET of hide classes present next to the part's own class,
 * not on a substring of them in order. Appending a second utility between
 * them — which the element style pass is entitled to do — would defeat a
 * substring test silently.
 */
export function partVisibilityFromHtml(html: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const part of SECTION_PARTS) {
    // The whole class attribute containing this part's token, so the hide
    // classes sitting beside it can be read whatever order they are in.
    const attr = new RegExp(`class="([^"]*${part.match.source.replace(/\\b$/, "")}[^"]*)"`);
    const found = attr.exec(html);
    if (!found) continue;
    const classes = new Set(found[1].split(/\s+/));

    const match = VISIBILITY.find(
      (v) =>
        v.classes.length > 0 &&
        v.classes.every((c) => classes.has(c)) &&
        // Exactly this set, so "desktop only" is not read as "not on phones".
        v.classes.length === [...classes].filter((c) => c.startsWith("u-hide--")).length,
    );
    if (match) out[fieldFor(part.key)] = match.value;
  }
  return out;
}
