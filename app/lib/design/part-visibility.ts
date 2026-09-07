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
 * HIDE FROM, NOT SHOW ON
 *
 * This began as one five-way choice per part — everywhere, desktop only, not
 * on phones, phones only, hidden — on the reasoning that three toggles is
 * nine states and several of them are nonsense.
 *
 * That was wrong, and looking at how Duda does it is what showed why. Nobody
 * thinks "I want this shown on desktop only". They think "hide this on
 * mobile", and then they have to translate that into whichever of five labels
 * means it — "Not on phones", which is a double negative wearing a positive
 * name. The screen sizes are independent facts and the control should be
 * three of them, ticked.
 *
 * So each part carries one boolean per screen size. The nonsense states are
 * still reachable and still nonsense; the cost of that is a client hiding
 * something from all three, which is a thing they can see and undo, rather
 * than every client having to decode a matrix on the way to the obvious.
 *
 * It also made the read-back simpler. Matching a SET of classes exactly, so
 * that "desktop only" was not read as "not on phones", was the fiddliest code
 * in this file; a boolean per class is just "is it there".
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
  /*
   * The big telephone number a callout is built around.
   *
   * Added because it had no chip, so a client clicking it got nothing and no
   * explanation — its words are usually {{phone}}, resolved from the business
   * record, and inline editing skips tokens on purpose. Being a part means the
   * chip can at least say where the number comes from.
   */
  { key: "phone", label: "Phone", match: /yp-[a-z0-9-]+__phone\b/g, except: [] },
  {
    key: "media",
    label: "Photo",
    match: /yp-[a-z0-9-]+__(?:media|frame)\b/g,
    except: [],
  },
];

/** The screen sizes a part can be hidden from, and the class for each. */
export const SCREENS: Array<{ key: string; label: string; cls: string }> = [
  { key: "desktop", label: "Desktop", cls: "u-hide--desktop" },
  { key: "tablet", label: "Tablet", cls: "u-hide--tablet" },
  { key: "mobile", label: "Mobile", cls: "u-hide--mobile" },
];

const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** The prop hiding one part from one screen, e.g. "hideHeadingMobile". */
export const fieldFor = (partKey: string, screen: string): string =>
  `hide${cap(partKey)}${cap(screen)}`;

const SPEC: FieldSpec = { type: "boolean", label: "Hidden", default: false };

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
export const PART_VISIBILITY_OPTIONS: Record<string, FieldSpec> = {
  ...Object.fromEntries(
    SECTION_PARTS.flatMap((p) =>
      SCREENS.map((screen) => [
        fieldFor(p.key, screen.key),
        { ...SPEC, label: `Hide ${p.label.toLowerCase()} on ${screen.label.toLowerCase()}` },
      ]),
    ),
  ),
  /*
   * Declared so it is a known field rather than stray content.
   *
   * carry-props sorts every prop into content, setting or ghost by what the
   * registry says about it. An undeclared partOrder would be read as words
   * the client wrote, and a design swap would report "you will lose
   * heading,body,actions" — which is not copy, and not lost.
   *
   * Not a choice: its values are orderings, not a fixed list. So it is not an
   * option field either, and set_option will not touch it — the reorder has
   * an operation of its own.
   */
  partOrder: {
    type: "text",
    label: "Order of the parts",
    hint: "Set by dragging in the editor. A comma-separated list of part names.",
  },
};

/** Applies the visibility classes to the emitted markup. */
export function applyPartVisibility(
  html: string,
  props: Record<string, unknown> | undefined,
): string {
  if (!props) return html;
  let out = html;

  for (const part of SECTION_PARTS) {
    const hidden = SCREENS.filter((s) => props[fieldFor(part.key, s.key)] === true);
    if (hidden.length === 0) continue;

    /*
     * Appended to the class token wherever it occurs, which is both the
     * className in the Gutenberg comment and the class on the element. core
     * regenerates one from the other, so they have to agree or the block is
     * invalid in wp-admin.
     */
    const suffix = ` ${hidden.map((s) => s.cls).join(" ")}`;
    out = out.replace(new RegExp(part.match.source, "g"), (token) =>
      part.except.includes(token) ? token : token + suffix,
    );
  }
  return out;
}

/**
 * Reads the hiding back off the markup.
 *
 * gutenbergToSchema rebuilds every prop from scratch, so this is what stops a
 * pull from WordPress un-hiding everything the client hid. One class, one
 * boolean — no set to match exactly, which is what the five-way version had
 * to do and got wrong twice.
 */
export function partVisibilityFromHtml(html: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};

  for (const part of SECTION_PARTS) {
    // The whole class attribute containing this part's token, so the hide
    // classes sitting beside it can be read whatever order they are in.
    const attr = new RegExp(`class="([^"]*${part.match.source.replace(/\\b$/, "")}[^"]*)"`);
    const found = attr.exec(html);
    if (!found) continue;
    const classes = new Set(found[1].split(/\s+/));
    for (const screen of SCREENS) {
      if (classes.has(screen.cls)) out[fieldFor(part.key, screen.key)] = true;
    }
  }
  return out;
}
