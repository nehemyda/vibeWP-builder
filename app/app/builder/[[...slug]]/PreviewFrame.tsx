"use client";

import { useEffect, useRef, useState } from "react";
import { tokensToCss, type DesignTokens } from "@/lib/design/tokens";
import { ELEMENT_ROLES } from "@/lib/design/element-style";
import { textPaths } from "@/lib/design/text-map";
import { plainText, readRichTextDom } from "@/lib/wp/richtext";
import { imagePaths } from "@/lib/design/image-map";
import { SCREENS, SECTION_PARTS, fieldFor as hideField } from "@/lib/design/part-visibility";
import {
  closePartMenu,
  hideDropLine,
  hidePartChip,
  mountDropLine,
  mountPartChip,
  mountPartMenu,
  openPartMenu,
  showDropLine,
  showPartChip,
  PART_CHIP_ID,
  PART_LINE_ID,
  PART_MENU_ID,
} from "@/lib/design/part-menu";
import {
  activeTextCommands,
  hideTextToolbar,
  mountTextToolbar,
  placeTextToolbar,
  runTextCommand,
  type TextCommand,
} from "@/lib/design/text-toolbar";

/** Only plain hex is allowed into the stylesheet. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Starting height, and what the frame collapses to between documents. */
const MIN_HEIGHT = 520;

/**
 * The builder canvas: the exported page, rendered as the exported page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY AN IFRAME AND NOT A DIV
 *
 * The canvas used to be hand-written .pv* CSS approximating the theme. It
 * drifted badly — the heading was 30.4px here against 62.4px on the real site,
 * there was no 1160px container, and the image used a 4/3.4 crop where the
 * theme uses 4/5. Two stylesheets for one design will always end up here.
 *
 * So this loads the theme's own sections.css and the serializer's own output.
 * A plain <div> could do that much, but not honestly: sections.css collapses
 * the hero to one column at `max-width: 880px`, and a media query resolves
 * against the VIEWPORT, not the element. Shrinking a div to the 390px Mobile
 * preset would narrow the box while leaving the desktop two-column layout in
 * place — the preset would silently lie. An iframe has its own viewport, so the
 * breakpoints fire on the preset width exactly as they do in a real browser.
 *
 * This is the same reason WordPress iframes its own block-editor canvas.
 * ─────────────────────────────────────────────────────────────────────
 */
/**
 * What the client has clicked in the canvas.
 *
 * A page section is identified by its INDEX, which is what
 * schemaToGutenberg stamps. Header and footer are not nodes on this page at
 * all — they are template parts shared site-wide — so they are a different
 * kind of thing here, and that distinction is what routes a header change to
 * swap_chrome instead of quietly doing nothing.
 */
export type CanvasSelection =
  | {
      kind: "node";
      index: number;
      /**
       * A styleable element inside the section, when the click landed on one.
       *
       * Rides along with the section rather than replacing it: the overlay
       * still outlines and labels the whole section, because that is what was
       * clicked into, and only the style panel narrows to the element.
       */
      role?: string;
    }
  | { kind: "chrome"; slot: "header" | "footer" };

/** One section's position inside the frame, for the parent's overlay. */
export type SectionBox = {
  selection: CanvasSelection;
  top: number;
  left: number;
  width: number;
  height: number;
};

export function sameSelection(a: CanvasSelection | null, b: CanvasSelection | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === "node" && b.kind === "node") return a.index === b.index;
  if (a.kind === "chrome" && b.kind === "chrome") return a.slot === b.slot;
  return false;
}

/** The attribute and value that identify a selection in the preview DOM. */
function selectorFor(selection: CanvasSelection): string {
  return selection.kind === "node"
    ? `[data-vibewp-node="${selection.index}"]`
    : `[data-vibewp-chrome="${selection.slot}"]`;
}

const SELECTABLE = "[data-vibewp-node],[data-vibewp-chrome]";

/**
 * The builder's own overlays inside the preview document.
 *
 * A click landing on any of them must not be read as a click on the page.
 */
/** No legal drop under the pointer. Distinct from "at the end", which is null. */
const NO_DROP = Symbol("no-drop");

/**
 * The props each part renders from, for spotting a business token behind one.
 *
 * Deliberately the same list edit-ops uses to clear a part, so "what this
 * part is made of" is answered once.
 */
const PART_FIELD_NAMES: Record<string, string[]> = {
  eyebrow: ["eyebrow", "kicker", "label"],
  heading: ["heading", "title"],
  intro: ["intro", "lede", "standfirst"],
  body: ["body", "text", "description"],
  actions: ["actions", "buttons", "cta"],
  media: ["image", "photo"],
  phone: ["phone"],
};

const CHROME_SELECTOR = [
  "#vibewp-text-toolbar",
  `#${PART_CHIP_ID}`,
  `#${PART_MENU_ID}`,
  `#${PART_LINE_ID}`,
].join(",");

/**
 * Which styleable element the click landed in, if any.
 *
 * Walks up from what was hit to the section, testing each ancestor's classes
 * against the roles. Nearest wins, so clicking a button inside a heading area
 * selects the button rather than whatever encloses it.
 *
 * The role's own exclusions are honoured here too — .yp-logos__heading looks
 * like a heading and is a caption, so it is not offered heading controls.
 */
function roleUnder(from: Element | null, stopAt: Element): string | undefined {
  for (let node = from; node && node !== stopAt.parentElement; node = node.parentElement) {
    const classes = node.getAttribute?.("class") ?? "";
    if (!classes) continue;
    for (const role of ELEMENT_ROLES) {
      const hit = classes.match(new RegExp(role.match.source, "g"));
      if (hit && hit.some((token) => !role.except.includes(token))) return role.key;
    }
    if (node === stopAt) break;
  }
  return undefined;
}

/**
 * The editor's own colour, written as a literal because this stylesheet is
 * injected into the PREVIEW document, which cannot see the app's tokens.
 *
 * It must not be the site's brand colour. The outline sits directly on the
 * client's design, so drawing it in their own primary makes it invisible on
 * exactly the sections most likely to use that colour — and the previous value
 * was a hardcoded orange, which is what --primary falls back to outside the
 * theme, so it clashed with every palette that was not orange.
 *
 * The app's --accent indigo, which stays legible on a white hero and on the
 * dark band form-band paints in --ink.
 */
const EDITOR_ACCENT = "#5b6bff";

/** What each editable element said when editing began, so Escape can restore it. */
/**
 * The caret position under a point, across engines.
 *
 * caretRangeFromPoint is what Chromium and WebKit implement and is not on a
 * standards track; Firefox implements caretPositionFromPoint instead. Neither
 * is present everywhere, so a miss simply means no caret is placed and the
 * client clicks once more — the old behaviour, rather than a broken one.
 */
function caretRangeAt(doc: Document, x: number, y: number): Range | null {
  type WithCaret = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const d = doc as WithCaret;
  if (typeof d.caretRangeFromPoint === "function") return d.caretRangeFromPoint(x, y);
  if (typeof d.caretPositionFromPoint === "function") {
    const pos = d.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = doc.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

/** The markup a field had when it became editable, so Escape can restore it. */
const originalHtml = new WeakMap<Element, string>();

/**
 * Pairs the section's rendered text with the props it came from.
 *
 * Document order against declaration order, each element claimed once — see
 * lib/design/text-map.ts for why matching by value is both sufficient and
 * safe. Elements holding nothing but other elements are skipped: a container
 * whose textContent happens to equal a child's would otherwise claim it.
 */
/** Tags that are formatting WITHIN a field rather than a field of their own. */
const INLINE_FORMAT = new Set(["STRONG", "B", "EM", "I", "A", "BR"]);

function matchText(
  section: Element,
  props: Record<string, unknown>,
): Array<{ el: Element; path: string }> {
  const wanted = textPaths(props);
  const claimed = new Set<Element>();
  const out: Array<{ el: Element; path: string }> = [];

  /*
   * Emphasis is part of a field, not a child of one.
   *
   * A heading a client has italicised renders as <h1><em>…</em></h1>. Under
   * the old rule the <h1> had an element child with text in it, so it was not
   * a leaf and never became editable — the reported "I can't edit the hero
   * heading" was exactly this, on the one heading that had been italicised.
   * And the <em> WAS a leaf, so had the values matched it would have made the
   * emphasis itself the editable field and dropped it on the next commit.
   *
   * So inline formatting is transparent here: it neither disqualifies its
   * parent nor stands in for it.
   */
  const leaves = Array.from(section.querySelectorAll("*")).filter((el) => {
    if (INLINE_FORMAT.has(el.tagName)) return false;
    return !Array.from(el.children).some(
      (child) =>
        !INLINE_FORMAT.has(child.tagName) && (child.textContent ?? "").trim().length > 0,
    );
  });

  for (const { path, value } of wanted) {
    /*
     * Compared as words. The prop may carry markup; the DOM reports text.
     * plainText is what makes "<em>Authentic…</em>" pair with the heading a
     * client can actually see.
     */
    const want = plainText(value).trim();
    const hit = leaves.find((el) => !claimed.has(el) && (el.textContent ?? "").trim() === want);
    if (!hit) continue;
    claimed.add(hit);
    out.push({ el: hit, path });
  }
  return out;
}

/**
 * Draws the hover and selection outlines by injecting one stylesheet.
 *
 * A STYLESHEET, not a class or a wrapper. The preview document is the markup
 * we export, so nothing may be added to it that could survive into a client's
 * WordPress content — and `outline` is the one way to draw a border that
 * occupies no space, so a selected section does not shift the page around it.
 *
 * The previous attempt at this was deleted for putting the section's name in
 * CSS `content`: the badge read the literal string "HeroSplit", which was
 * right when a page could only hold a hero and wrong the moment it held six.
 * The label lives in the parent's overlay now, where it can come from the
 * registry.
 */
function paintSelection(doc: Document, selection: CanvasSelection | null): void {
  const ID = "vibewp-selection";
  let style = doc.getElementById(ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = ID;
    doc.head.appendChild(style);
  }
  const selected = selection ? selectorFor(selection) : null;
  style.textContent = [
    `${SELECTABLE.split(",").map((s) => `${s}:hover`).join(",")} {`,
    `  outline: 1.5px dashed color-mix(in srgb, ${EDITOR_ACCENT} 55%, transparent);`,
    `  outline-offset: -2px; cursor: pointer;`,
    `}`,
    selected
      ? `${selected} { outline: 2px solid ${EDITOR_ACCENT} !important; outline-offset: -2px; }`
      : "",
    /*
     * The field being typed in.
     *
     * Without this it wore the SITE's focus ring — sections.css gives
     * :focus-visible an outline in var(--primary), so the box around the
     * paragraph you are editing was drawn in the client's own brand colour.
     * That breaks the rule EDITOR_ACCENT exists for: builder chrome has to be
     * distinguishable from the site, or the client cannot tell which marks
     * are ours and which are theirs.
     *
     * Offset outward, so it frames the words rather than crossing them.
     */
    `[contenteditable="true"]:focus, [contenteditable="true"]:focus-visible {`,
    `  outline: 2px solid color-mix(in srgb, ${EDITOR_ACCENT} 70%, transparent) !important;`,
    `  outline-offset: 3px; border-radius: 3px;`,
    `}`,
    /*
     * A replaceable photograph. Outlined only on hover: every image in the
     * section is replaceable, and outlining them all at once would look like
     * the page was broken rather than editable.
     */
    /* A part, while the cursor is over it. Right-click opens its menu. */
    `[data-vibewp-part]:hover {`,
    `  outline: 1px dashed color-mix(in srgb, ${EDITOR_ACCENT} 60%, transparent);`,
    `  outline-offset: 2px;`,
    `}`,
    `[data-vibewp-pick] { cursor: pointer; }`,
    `[data-vibewp-pick]:hover {`,
    `  outline: 3px solid ${EDITOR_ACCENT}; outline-offset: 2px;`,
    `}`,
    /* The highlight over selected words, so it reads as ours too. */
    `[contenteditable="true"]::selection {`,
    `  background: color-mix(in srgb, ${EDITOR_ACCENT} 26%, transparent);`,
    `}`,
  ].join("\n");
}

export function PreviewFrame({
  html,
  className,
  colors,
  designTokens,
  onNavigate,
  selection,
  onSelect,
  onGeometry,
  editableProps,
  onEditText,
  onPickImage,
  onParts,
  onPartAction,
}: {
  /** Gutenberg block markup from schemaToGutenberg() — the same string exported. */
  html: string;
  className?: string;
  /**
   * The site's brand palette, keyed by theme.json slug.
   *
   * WITHOUT THIS EVERY PREVIEW IS THE DEFAULT ORANGE.
   *
   * sections.css never hardcodes a colour; it reads the WordPress preset:
   *
   *     --primary: var(--wp--preset--color--primary, #f54900);
   *
   * On a real site theme.json defines that preset, so the palette flows
   * through. This iframe has no WordPress, so nothing defined it and every
   * site fell back to the literal — a client who chose Forest green saw green
   * on their live site and orange in the builder.
   */
  colors?: Record<string, string>;
  /**
   * The site's hand-set design values, injected the same way the palette is.
   *
   * They belong in the SAME `:root` block for the same reason: this iframe has
   * no WordPress, so the only way the canvas can agree with the exported site
   * is to emit by hand what the live site emits from theme.json. A token that
   * reached one and not the other would break the parity the whole preview
   * rests on.
   */
  designTokens?: DesignTokens;
  /**
   * Called when a menu link inside the canvas is clicked, with that page's slug.
   *
   * The preview has no server behind it, so a link cannot navigate anywhere on
   * its own — the builder switches which page it is editing instead. That makes
   * the canvas menu behave the way the exported site's menu does, which is what
   * a client expects from something that looks exactly like their website.
   */
  onNavigate?: (slug: string) => void;
  /**
   * What is selected, so the frame can outline it. Null means nothing.
   *
   * Held by the parent rather than the frame because the whole srcDoc document
   * is rebuilt on every edit — anything the frame remembered would be thrown
   * away with it, and the section the client was working on would deselect
   * itself the moment they changed it.
   */
  selection?: CanvasSelection | null;
  /** A click on a section, or on empty space (null). */
  onSelect?: (selection: CanvasSelection | null) => void;
  /**
   * Where each section sits, in the frame's own coordinates.
   *
   * Reported so the parent can draw the selection toolbar and the insert
   * buttons OUTSIDE the frame. They are the builder's own controls, not part
   * of the page being designed: putting them in the preview document would
   * mean they appeared in the markup we export, and in the height we measure.
   */
  onGeometry?: (boxes: SectionBox[]) => void;
  /**
   * The selected section's props, so its text can be matched to a prop path.
   *
   * Passed in rather than looked up here: the frame renders markup and knows
   * nothing about the registry, and keeping it that way is what lets the same
   * component serve the builder and the section library.
   */
  editableProps?: Record<string, unknown>;
  /**
   * Which parts the section being edited actually rendered, in page order.
   *
   * Reported from the DOM rather than worked out from the registry, for the
   * same reason text and photographs are found by looking: the markup is what
   * is on the page, and anything else is a description of it that can be
   * wrong.
   */
  onParts?: (parts: string[]) => void;
  /** An action was chosen from a part's menu. */
  onPartAction?: (action: string, part: string, parts: string[]) => void;
  /**
   * A photograph in the section being edited was clicked, named by its path.
   *
   * Only in edit mode, like typing: outside it a click on a picture means
   * "select this section", which is what makes a section pointable at all.
   */
  onPickImage?: (path: string) => void;
  /** Committed on blur, with the path the text came from. */
  onEditText?: (path: string, value: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  /*
   * The callbacks live in refs, and the attach effect depends only on `doc`.
   *
   * Every one of these is an inline arrow in the parent, so its identity
   * changes on each render — and the effect below tears down its listeners and
   * its ResizeObserver and rebuilds them when it re-runs. That was already
   * happening for onNavigate alone; with selection state in the parent, the
   * parent re-renders on every click, and re-attaching the whole apparatus on
   * each one is how a click starts costing a reflow.
   */
  const handlers = useRef({
    onNavigate,
    onSelect,
    onGeometry,
    selection,
    onEditText,
    onPickImage,
    onParts,
    onPartAction,
  });
  /*
   * The editable props, by identity-free reference.
   *
   * The editing effect cannot depend on the props OBJECT: the parent builds it
   * fresh on every render, so every render tore the editors down and put them
   * back. Invisible while typing, and fatal for the formatting bar — the
   * canvas re-measures its outline boxes on scroll, which is a render, which
   * closed the bar the moment anyone scrolled.
   *
   * So the effect keys on the props' CONTENT and reads the object from here.
   */
  const editableRef = useRef(editableProps);
  /** Where a click landed, waiting for the fields to become editable. */
  const pendingCaret = useRef<{ x: number; y: number } | null>(null);
  const editableKey = editableProps ? JSON.stringify(editableProps) : "";
  /* Same reasoning as editableKey: content, so a re-render is not a teardown. */
  const selectionKey = selection ? JSON.stringify(selection) : "";
  // Assigned in an effect rather than during render: writing a ref while
  // rendering is what React's own lint now rejects, and `selection` rides
  // along so attach() cannot paint an outline for a section that is no longer
  // the one selected.
  useEffect(() => {
    handlers.current = {
      onNavigate,
      onSelect,
      onGeometry,
      selection,
      onEditText,
      onPickImage,
      onParts,
      onPartAction,
    };
    // Declared before the editing effect, so it is assigned before that effect
    // reads it on the same commit.
    editableRef.current = editableProps;
  });

  /*
   * `yp-page` on <body> is what activates the theme's rules: every selector in
   * sections.css is prefixed with it to win specificity against WordPress's
   * inline layout CSS. Without the class the stylesheet matches nothing.
   */
  /*
   * Emitted as the presets WordPress itself would emit, rather than as the
   * theme's own --primary etc. Setting the preset means the whole cascade
   * behaves exactly as it does on the live site, including any rule that
   * reads a preset directly.
   *
   * Values are re-validated here because they are interpolated into a
   * stylesheet: this is the last gate before the browser parses them.
   */
  const paletteCss = Object.entries(colors ?? {})
    .filter(([slug, value]) => /^[a-z0-9-]+$/.test(slug) && HEX.test(value))
    .map(([slug, value]) => `--wp--preset--color--${slug}: ${value};`)
    .join("\n    ");

  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/api/theme/sections.css">
<style>
  html, body { margin: 0; padding: 0; }
  /*
   * The frame is sized to its content and the canvas around it does the
   * scrolling. Without this the frame becomes a second scroller the moment its
   * measured height lags the real one, and the wheel scrolls the preview
   * instead of the page — two scrollbars fighting over the same gesture.
   *
   * scrolling="no" on the element hides the scrollbar; this is what actually
   * stops the viewport scrolling. Body is left alone so its box still reports
   * the full content height for measuring.
   */
  html { overflow: hidden; }
  body { background: #fff; }
  :root {
    ${paletteCss}
    ${tokensToCss(designTokens ?? {})}
  }
</style>
</head><body class="yp-page" data-vibewp-preview>${html}</body></html>`;

  /*
   * WHAT THE IFRAME IS SHOWING, WHICH IS NOT ALWAYS WHAT THE SCHEMA SAYS.
   *
   * srcDoc is a document, not a diff: changing it reloads the frame from
   * scratch. That is right for a design swap or an AI edit, and completely
   * wrong for someone typing, because the canvas ALREADY shows what they
   * typed — they typed it into this very DOM.
   *
   * Reloading anyway cost two things, and both were reported as bugs:
   *
   *   - The click that committed the edit was destroyed along with the
   *     document, so clicking from a field straight onto the next section
   *     selected nothing. You had to click it twice.
   *   - The reload left the section still selected but no longer editable,
   *     because the editing effect re-ran while the frame was mid-load, found
   *     about:blank, and gave up. The outline said "editing" and nothing was.
   *
   * So a commit made here marks itself, and the resulting document is
   * accepted without being applied: the schema catches up, the canvas does
   * not flinch. Any change we did not cause still reloads normally.
   */
  const [liveDoc, setLiveDoc] = useState(doc);
  const selfEdit = useRef(false);
  useEffect(() => {
    if (doc === liveDoc) {
      // Nothing to apply, so no mark should survive to swallow a later change.
      selfEdit.current = false;
      return;
    }
    if (selfEdit.current) {
      selfEdit.current = false;
      return;
    }
    setLiveDoc(doc);
  }, [doc, liveDoc]);

  /*
   * Grow the iframe to fit its content.
   *
   * ─────────────────────────────────────────────────────────────────────
   * THE BUG THIS REPLACES, BECAUSE IT IS EASY TO REINTRODUCE
   *
   * The old version attached the observer when `readyState === "complete"`.
   * A fresh iframe already holds an about:blank document, and about:blank is
   * ALSO "complete" — so the observer was attached to about:blank's body,
   * which was then thrown away when srcDoc loaded. It watched a body from a
   * discarded document, never fired, and the frame kept its placeholder
   * height forever.
   *
   * It went unnoticed because a page was a single hero, roughly the height of
   * the placeholder. The moment a page had six sections the frame showed the
   * header, the top of the hero, and clipped the other 7,800 pixels.
   *
   * The marker attribute is the fix: it is the only thing that distinguishes
   * our document from the blank one, since both report "complete".
   * ─────────────────────────────────────────────────────────────────────
   */
  /*
   * The body of the editing effect below, lifted out so it can be re-run on load.
   *
   * Reads the selection from the handlers ref rather than closing over it, so
   * a re-run after a reload uses whatever is selected then.
   */
  const attachEditors = (contentDoc: Document, cleanups: Array<() => void>): void => {
    const chosen = handlers.current.selection;
    const section =
      chosen?.kind === "node"
        ? contentDoc.querySelector(`[data-vibewp-node="${chosen.index}"]`)
        : null;

    const props = editableRef.current;
    if (section && props) {
      /*
       * The formatting bar, mounted once for the whole document and moved to
       * whichever selection is live. One element rather than one per field:
       * a section can have thirty editable strings in it.
       */
      const toolbar = mountTextToolbar(contentDoc);
      const editable = new Set<Element>();

      /* Selection is a document-level fact, so the listeners are too. */
      const refreshToolbar = () => {
        const sel = contentDoc.getSelection();
        const anchor = sel?.anchorNode;
        const host =
          anchor && (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement);
        const field = host?.closest("[contenteditable]") ?? null;

        // Nothing selected, a caret rather than a range, or a selection that
        // has wandered outside the fields we made editable.
        if (!sel || sel.isCollapsed || !field || !editable.has(field)) {
          hideTextToolbar(contentDoc);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect.width && !rect.height) {
          hideTextToolbar(contentDoc);
          return;
        }
        placeTextToolbar(toolbar, rect, contentDoc);

        const active = activeTextCommands(contentDoc);
        toolbar.querySelectorAll<HTMLElement>("[data-command]").forEach((button) => {
          const command = button.dataset.command as TextCommand;
          button.setAttribute("aria-pressed", active.has(command) ? "true" : "false");
        });
      };

      /*
       * mousedown, not click. Pressing a button in the bar would otherwise
       * move focus out of the field, and the browser discards the selection
       * the command is supposed to act on before the command ever runs.
       */
      const onToolbarDown = (event: Event) => {
        const button = (event.target as Element | null)?.closest?.("[data-command]");
        if (!button) return;
        event.preventDefault();
        runTextCommand(contentDoc, (button as HTMLElement).dataset.command as TextCommand);
        refreshToolbar();
        /*
         * Deliberately NOT committing here.
         *
         * A commit re-renders the schema, which rebuilds the iframe's srcDoc,
         * which throws away the document the client is working in — caret,
         * selection and all. Doing that on every press meant bold worked once
         * and then italic had nothing left to act on.
         *
         * The formatting lives in the live DOM until the field is committed
         * the way typing already is: on blur, or on Enter. Clicking away is a
         * blur, so nothing can be lost by waiting.
         */
      };
      toolbar.addEventListener("mousedown", onToolbarDown);

      const onSelectionChange = () => refreshToolbar();
      contentDoc.addEventListener("selectionchange", onSelectionChange);
      contentDoc.defaultView?.addEventListener("scroll", onSelectionChange, { passive: true });

      cleanups.push(() => {
        toolbar.removeEventListener("mousedown", onToolbarDown);
        contentDoc.removeEventListener("selectionchange", onSelectionChange);
        contentDoc.defaultView?.removeEventListener("scroll", onSelectionChange);
        hideTextToolbar(contentDoc);
      });

      /** Path per field, so the toolbar can commit one it did not close over. */
      const pathOf = new WeakMap<Element, string>();
      /** What each field last sent up, so a commit can be a no-op. */
      const committed = new WeakMap<Element, string>();

      const commitField = (el: Element) => {
        const path = pathOf.get(el);
        if (!path) return;
        /*
         * Read through the same allow-list the server uses. A contenteditable
         * hands back whatever the engine felt like inserting, and a paste out
         * of a word processor brings a stylesheet with it.
         */
        const next = readRichTextDom(el, { links: false });
        // Empty would delete the copy; that is what the delete key is for.
        if (!next || next === committed.get(el)) return;
        committed.set(el, next);
        /*
         * The canvas is already correct — this text came out of it. Marking
         * the edit keeps the schema update from reloading the frame.
         */
        selfEdit.current = true;
        // Insurance: if no document ever arrives, the mark must not sit there
        // waiting to swallow an unrelated change.
        window.setTimeout(() => {
          selfEdit.current = false;
        }, 1000);
        handlers.current.onEditText?.(path, next);
      };

      for (const { el, path } of matchText(section, props)) {
        /*
         * "true", not "plaintext-only". plaintext-only strips every tag on
         * input, so bold was impossible by construction — the button ran, the
         * markup appeared, and the browser removed it again.
         */
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "true");
        editable.add(el);
        pathOf.set(el, path);

        const commit = () => commitField(el);
        const onBlur = (event: FocusEvent) => {
          // Moving focus to the toolbar is not leaving the field.
          if ((event.relatedTarget as Element | null)?.closest?.("#vibewp-text-toolbar")) return;
          hideTextToolbar(contentDoc);
          commit();
        };
        const onKeyDown = (event: KeyboardEvent) => {
          // Enter commits; a heading is not a paragraph and a stray newline in
          // one is never what was meant. Shift+Enter still breaks a line.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            (el as HTMLElement).blur();
          }
          // Escape abandons the edit rather than committing half a word.
          if (event.key === "Escape") {
            event.preventDefault();
            el.innerHTML = originalHtml.get(el) ?? el.innerHTML;
            (el as HTMLElement).blur();
          }
        };
        originalHtml.set(el, el.innerHTML);
        committed.set(el, readRichTextDom(el, { links: false }));

        el.addEventListener("blur", onBlur as EventListener);
        el.addEventListener("keydown", onKeyDown as EventListener);
        cleanups.push(() => {
          el.removeEventListener("blur", onBlur as EventListener);
          el.removeEventListener("keydown", onKeyDown as EventListener);
          /*
           * Last chance to save the work.
           *
           * blur is the only thing that commits a formatting change — unlike
           * typing, pressing Bold produces no keystroke — and blur is not
           * guaranteed: focus can move to another frame, or the section can be
           * deselected by something that never touched the field. Committing
           * here too means the worst case is a redundant write, which the
           * comparison above turns into nothing at all.
           */
          commitField(el);
          el.removeAttribute("contenteditable");
          el.removeAttribute("spellcheck");
        });
      }

      /*
       * ONE click to start typing, not two.
       *
       * A field only becomes editable after its section is selected, so the
       * click that selects a section lands on text that is not yet editable
       * and puts no caret anywhere. That made every edit a double click: one
       * to select the section, one to reach the words.
       *
       * The selecting click's coordinates are kept, and the caret is placed
       * from them here, on the first commit where the fields exist.
       */
      const point = pendingCaret.current;
      pendingCaret.current = null;
      /*
       * Unless words are already selected.
       *
       * Dragging across a section that is not selected yet selects the text
       * first and the section second, so this runs with a live range in hand.
       * Placing a caret would collapse it — the drag would select, and then
       * instantly unselect, which is what it did.
       */
      const existing = contentDoc.getSelection();
      const dragged = !!existing && existing.rangeCount > 0 && !existing.isCollapsed;
      if (point && !dragged) {
        const caret = caretRangeAt(contentDoc, point.x, point.y);
        const host = caret?.startContainer;
        const field = (host?.nodeType === 1 ? (host as Element) : host?.parentElement)?.closest(
          "[contenteditable]",
        );
        // A click on a section's padding resolves to no field, and should not
        // drag focus into the nearest paragraph.
        if (caret && field && editable.has(field)) {
          // preventScroll: focus() would otherwise jump the canvas, and the
          // thing just clicked is by definition already in view.
          (field as HTMLElement).focus({ preventScroll: true });
          const sel = contentDoc.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(caret);
        }
      }

      /*
       * Photographs, matched by src the way text is matched by its words.
       *
       * Same reasoning as text-map's: nothing is stamped into the markup, so
       * nothing can leak into the client's exported WordPress content. A
       * mismatch means a picture that will not open the library, never an
       * edit landing on the wrong one — and the operation re-checks the path
       * against the stored props before writing anyway.
       */
      /*
       * The parts present, in the order they appear. Matched on the class each
       * part wears, the same table the serializer reorders and hides by, so
       * the panel can never offer a control for something that is not there.
       */
      const found: string[] = [];
      for (const el of Array.from(section.querySelectorAll("[class*='__']"))) {
        for (const part of SECTION_PARTS) {
          const token = Array.from(el.classList).find((c) =>
            new RegExp(`^${part.match.source.replace(/\\b$/, "")}$`).test(c),
          );
          if (token && !part.except.includes(token) && !found.includes(part.key)) {
            found.push(part.key);
          }
        }
      }
      handlers.current.onParts?.(found);

      /*
       * A menu on each part, opened from the part.
       *
       * The element that carries a part's class is not always the one worth
       * outlining — a photo's class sits on its <figure>, its heading's on the
       * <h2> itself — so the class-bearing element is exactly the right target
       * in both cases, and no mapping table is needed.
       */
      const menu = mountPartMenu(contentDoc);
      const chip = mountPartChip(contentDoc);
      const dropLine = mountDropLine(contentDoc);
      const partEl = new Map<string, Element>();
      for (const el of Array.from(section.querySelectorAll("[class*='__']"))) {
        for (const part of SECTION_PARTS) {
          const token = Array.from(el.classList).find((c) =>
            new RegExp(`^${part.match.source.replace(/\\b$/, "")}$`).test(c),
          );
          if (token && !part.except.includes(token) && !partEl.has(part.key)) {
            partEl.set(part.key, el);
          }
        }
      }

      let openPart: string | null = null;
      const showMenu = (key: string) => {
        const el = partEl.get(key);
        if (!el) return;
        openPart = key;
        const props2 = editableRef.current ?? {};
        openPartMenu(
          menu,
          el.getBoundingClientRect(),
          {
            part: key,
            canMoveUp: found.indexOf(key) > 0,
            canMoveDown: found.indexOf(key) < found.length - 1,
            hiddenFrom: SCREENS.filter((sc) => props2[hideField(key, sc.key)] === true).map(
              (sc) => sc.key,
            ),
            isMedia: key === "media",
          },
          contentDoc,
        );
      };

      /**
       * Parts whose words come from the business record rather than the page.
       *
       * Found by looking for a {{token}} among the props the part renders
       * from — the same field names remove_part clears, so the two agree by
       * construction rather than by a second table.
       */
      const tokenParts = new Map<string, string>();
      for (const key of found) {
        for (const field of PART_FIELD_NAMES[key] ?? []) {
          const value = props[field];
          if (typeof value === "string" && /\{\{[a-z_]+\}\}/.test(value)) {
            tokenParts.set(key, "Business details");
          }
        }
      }

      /** Which part the chip is currently sitting on. */
      let chipPart: string | null = null;
      /** True between pointerdown on the grip and pointerup. */
      let dragging = false;

      /*
       * Hiding is DELAYED.
       *
       * Flush positioning removed the gap, but a pointer travelling between
       * two hover targets still produces a frame or two over neither, and any
       * one of them was enough to close the chip. A short grace period, and
       * any re-entry cancels it.
       */
      let hideTimer = 0;
      const cancelHide = () => {
        if (hideTimer) {
          contentDoc.defaultView?.clearTimeout(hideTimer);
          hideTimer = 0;
        }
      };
      const hideSoon = () => {
        cancelHide();
        hideTimer = contentDoc.defaultView?.setTimeout(() => {
          hideTimer = 0;
          hidePartChip(contentDoc);
          chipPart = null;
        }, 260) as unknown as number;
      };

      const swallowOnce = (event: Event) => {
        event.stopPropagation();
        contentDoc.removeEventListener("click", swallowOnce, true);
      };

      for (const [key, el] of partEl) {
        el.setAttribute("data-vibewp-part", key);
        const label = SECTION_PARTS.find((p) => p.key === key)?.label ?? key;

        /*
         * The chip on hover is the way IN. Right-click still works and is
         * faster once known, but it was the only way at first and the client's
         * report was "I'm not seeing anything" — which was accurate. A left
         * click on the part itself has to place a caret, so it cannot also
         * open a menu; the chip is a separate target sitting above the words.
         */
        const onEnter = () => {
          if (dragging || menu.getAttribute("data-open") === "1") return;
          cancelHide();
          chipPart = key;
          /*
           * A part whose words are a {{token}} is not the client's to type
           * over, and the chip says where the value does come from instead of
           * leaving them to guess why nothing happens.
           */
          showPartChip(
            chip,
            el.getBoundingClientRect(),
            label,
            contentDoc,
            tokenParts.get(key),
          );
        };
        const onContext = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          hidePartChip(contentDoc);
          showMenu(key);
        };
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("contextmenu", onContext);
        cleanups.push(() => {
          el.removeEventListener("mouseenter", onEnter);
          el.removeEventListener("contextmenu", onContext);
          el.removeAttribute("data-vibewp-part");
        });
      }

      /*
       * Hidden when the pointer leaves both the part and the chip. Checked on
       * the document rather than per element, because moving from a part onto
       * its own chip leaves the part — and hiding it there would make the
       * chip impossible to click.
       */
      const onMove = (event: Event) => {
        // The chip belongs to the drag while one is in progress.
        if (dragging) return;
        const target = event.target as Element | null;
        if (target?.closest?.(`#${PART_CHIP_ID}`)) {
          cancelHide();
          return;
        }
        if (target?.closest?.("[data-vibewp-part]")) return;
        if (menu.getAttribute("data-open") === "1") return;
        hideSoon();
      };
      contentDoc.addEventListener("mouseover", onMove);

      /*
       * DRAGGING A PART.
       *
       * Pointer events rather than HTML5 drag-and-drop. The native API wants
       * a draggable source and a drop target and gives you a ghost image you
       * cannot style; here the thing being dragged is a chip floating over a
       * page whose own elements are the targets, and the whole gesture happens
       * inside an iframe. Pointer events are fewer moving parts and behave the
       * same on a touchpad.
       *
       * WHY ONLY AMONG SIBLINGS
       *
       * applyPartOrder reorders parts that share a parent — the copy stack —
       * and cannot move a photo out of its own grid column into that stack.
       * Offering a drop that the engine will silently decline is worse than
       * not offering it, so the drag is bounded by what can actually happen.
       * Moving a photo from one side to the other is the column flip, which
       * is a different control.
       */
      const onGripDown = (event: PointerEvent) => {
        if (!(event.target as Element | null)?.closest?.("[data-chip-grip]")) return;
        if (!chipPart) return;
        event.preventDefault();
        event.stopPropagation();

        /*
         * Captured now, not read at the end. The hover handler was still
         * running during the drag and cleared chipPart the moment the pointer
         * crossed a gap between two parts, so the drop reported "on null" and
         * moved nothing.
         */
        const moving = chipPart;
        const source = partEl.get(chipPart);
        const parent = source?.parentElement;
        if (!source || !parent) return;

        // Siblings only, in document order.
        const siblings = found
          .map((key) => ({ key, el: partEl.get(key) }))
          .filter((x): x is { key: string; el: Element } => !!x.el && x.el.parentElement === parent);
        if (siblings.length < 2) return;

        chip.setAttribute("data-dragging", "1");
        dragging = true;
        /*
         * Where it will land: a sibling's key to go before, null for the end,
         * or NO_DROP when the pointer is not over a legal boundary. Three
         * states, so "before the first part" is not confused with "nowhere".
         */
        let dropBefore: string | null | typeof NO_DROP = NO_DROP;

        const onMovePointer = (move: PointerEvent) => {
          /*
           * The nearest BOUNDARY to the pointer, not "which element am I
           * over": between two parts is a gap belonging to neither, and a
           * drag that stops responding in the gaps feels broken.
           *
           * Gathered then reduced rather than tracked in a variable — an
           * assignment inside a callback is invisible to the type checker,
           * which narrowed the running best to `never`.
           */
          type Edge = { before: string | null; dist: number; rect: DOMRect; top: boolean };
          const from = siblings.findIndex((x) => x.key === chipPart);
          const edges: Edge[] = [];

          siblings.forEach(({ key, el }, i) => {
            const rect = el.getBoundingClientRect();
            const candidates: Array<[number, boolean, number, string | null]> = [
              [rect.top, true, i, key],
              [rect.bottom, false, i + 1, siblings[i + 1]?.key ?? null],
            ];
            for (const [edgeY, top, index, before] of candidates) {
              // A boundary that puts it back where it started is not a move.
              if (index === from || index === from + 1) continue;
              edges.push({ before, dist: Math.abs(move.clientY - edgeY), rect, top });
            }
          });

          const best = edges.reduce<Edge | null>(
            (winner, edge) => (!winner || edge.dist < winner.dist ? edge : winner),
            null,
          );

          if (!best) {
            hideDropLine(contentDoc);
            dropBefore = NO_DROP;
            return;
          }
          dropBefore = best.before;
          showDropLine(dropLine, best.rect, best.top, contentDoc);
        };

        const onUp = () => {
          contentDoc.removeEventListener("pointermove", onMovePointer);
          contentDoc.removeEventListener("pointerup", onUp);
          chip.removeAttribute("data-dragging");
          dragging = false;
          /*
           * A drag that starts on the chip and ends on the page makes the
           * browser fire a click on their common ancestor — <body> — which
           * the canvas reads as "clicked nothing" and deselects the section
           * the drag was for. One click is swallowed to prevent that.
           */
          contentDoc.addEventListener("click", swallowOnce, true);
          hideDropLine(contentDoc);
          hidePartChip(contentDoc);
          if (dropBefore === NO_DROP) return;

          const next = found.filter((k) => k !== moving);
          const at = dropBefore === null ? next.length : next.indexOf(dropBefore);
          next.splice(at < 0 ? next.length : at, 0, moving);
          if (next.join(",") === found.join(",")) return;
          handlers.current.onPartAction?.(`order:${next.join(",")}`, moving, found);
        };

        contentDoc.addEventListener("pointermove", onMovePointer);
        contentDoc.addEventListener("pointerup", onUp);
      };
      chip.addEventListener("pointerdown", onGripDown as EventListener);
      cleanups.push(() => {
        chip.removeEventListener("pointerdown", onGripDown as EventListener);
        hideDropLine(contentDoc);
      });

      const onChipDown = (event: Event) => {
        if (!(event.target as Element | null)?.closest?.("[data-chip-more]")) return;
        event.preventDefault();
        event.stopPropagation();
        if (!chipPart) return;
        /*
         * The chip is deliberately NOT hidden here.
         *
         * Hiding it in its own mousedown took it out of the layout before the
         * browser resolved the click, so the click's target became <body> —
         * which is not builder chrome, so the guard above let it through and
         * the section deselected. The chip was under the cursor; the click
         * was not on it.
         *
         * It is left alone and covered by the menu, and the hover handler
         * already declines to move it while a menu is open.
         */
        showMenu(chipPart);
      };
      chip.addEventListener("mousedown", onChipDown);

      cleanups.push(() => {
        cancelHide();
        contentDoc.removeEventListener("mouseover", onMove);
        contentDoc.removeEventListener("click", swallowOnce, true);
        chip.removeEventListener("mousedown", onChipDown);
        hidePartChip(contentDoc);
      });

      /*
       * On CLICK, not mousedown.
       *
       * A click's target is fixed when it is dispatched, so a handler may
       * hide its own element and the target still resolves to it. Acting on
       * mousedown and closing the menu there did the opposite: the menu left
       * the layout before the click was resolved, the click landed on <body>,
       * and the section deselected under a menu item that had just worked.
       *
       * stopPropagation as well, so the canvas's own click handler never sees
       * it at all rather than relying on the chrome guard to recognise it.
       */
      const onMenuDown = (event: Event) => {
        const button = (event.target as Element | null)?.closest?.("[data-action]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const action = (button as HTMLElement).dataset.action ?? "";
        if (action === "hide-open") {
          // A submenu, not an action: toggled here rather than on hover so it
          // works by touch and by keyboard as well as by pointer.
          const owner = button.closest(".vpm-hasSub");
          owner?.setAttribute("data-open", owner.getAttribute("data-open") === "1" ? "0" : "1");
          return;
        }
        if (!openPart) return;
        const part = openPart;
        closePartMenu(contentDoc);
        openPart = null;
        handlers.current.onPartAction?.(action, part, found);
      };
      menu.addEventListener("click", onMenuDown);

      const awayFromMenu = (event: Event) => {
        if (!(event.target as Element | null)?.closest?.(`#${PART_MENU_ID}`)) {
          closePartMenu(contentDoc);
          openPart = null;
        }
      };
      contentDoc.addEventListener("mousedown", awayFromMenu);
      cleanups.push(() => {
        menu.removeEventListener("click", onMenuDown);
        contentDoc.removeEventListener("mousedown", awayFromMenu);
        closePartMenu(contentDoc);
      });

      const seen = new Set<Element>();
      for (const { path, image } of imagePaths(props)) {
        const img = Array.from(section.querySelectorAll("img")).find(
          (el) => !seen.has(el) && el.getAttribute("src") === image.url,
        );
        if (!img) continue;
        seen.add(img);
        img.setAttribute("data-vibewp-pick", "1");
        const pick = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          handlers.current.onPickImage?.(path);
        };
        img.addEventListener("click", pick);
        cleanups.push(() => {
          img.removeEventListener("click", pick);
          img.removeAttribute("data-vibewp-pick");
        });
      }

      /*
       * A selection can predate the editor: dragging across a section that was
       * not selected yet selects the words first and the section second, so by
       * the time the bar exists its selectionchange has already been and gone.
       */
      refreshToolbar();
    }
  };

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    let observer: ResizeObserver | undefined;
    let cleanups: Array<() => void> = [];

    /*
     * Collapse to the placeholder before measuring the new document. Without
     * this the body of a short page is laid out inside a tall viewport, and
     * anything sized against the viewport reports the old page's height.
     */
    setHeight(MIN_HEIGHT);

    const attach = () => {
      const contentDoc = iframe.contentDocument;
      // Not ours yet — about:blank, or a document still being swapped in.
      if (!contentDoc?.body?.hasAttribute("data-vibewp-preview")) return;

      observer?.disconnect();
      cleanups.forEach((fn) => fn());
      cleanups = [];

      /*
       * Menu clicks inside the canvas.
       *
       * Delegated on the document rather than bound per link: the markup is
       * replaced wholesale on every edit, so per-link handlers would be thrown
       * away with it. preventDefault because the href is "#" — there is nothing
       * inside this frame to navigate to, and letting it through would jump the
       * frame to the top instead.
       */
      const onLinkClick = (event: MouseEvent) => {
        const el = event.target as Element | null;
        /*
         * Builder chrome painted into the page is not part of the page.
         *
         * Every one of these lives in <body>, outside any section, so a click
         * on it finds nothing under the cursor and deselects everything —
         * tearing down the editor the click was aimed at. It cost the
         * formatting bar its Bold button once; the part chip and its menu
         * arrived later and reintroduced the same fault, because the guard
         * named one overlay instead of the category.
         *
         * Named as a list so the next overlay is added here and not debugged.
         */
        if (el?.closest?.(CHROME_SELECTOR)) return;
        const link = el?.closest?.("[data-vibewp-slug]");
        const slug = link?.getAttribute("data-vibewp-slug");
        if (slug) {
          event.preventDefault();
          handlers.current.onNavigate?.(slug);
          return;
        }

        /*
         * Anything else is a click on a SECTION.
         *
         * preventDefault regardless of what was hit, because every button a
         * section renders defaults to href="#" and none of them were
         * intercepted before this. That was harmless only because the frame
         * cannot scroll; now that a click means "select this", letting a CTA
         * through would swallow it.
         */
        const section = el?.closest?.(SELECTABLE) as HTMLElement | null;
        if (el?.closest?.("a,button")) event.preventDefault();

        if (!section) {
          // Empty space between sections. Deselecting there is what makes the
          // outline feel like a selection rather than something stuck on.
          handlers.current.onSelect?.(null);
          return;
        }
        const index = section.getAttribute("data-vibewp-node");
        const slot = section.getAttribute("data-vibewp-chrome");
        const picked: CanvasSelection | null =
          index !== null
            ? { kind: "node", index: Number(index), role: roleUnder(el, section) }
            : slot === "header" || slot === "footer"
              ? { kind: "chrome", slot }
              : null;
        /*
         * Clicking inside the section that is already selected must not
         * re-select it. The parent builds a fresh selection object each time,
         * and that new identity tore the editors down and closed the
         * formatting bar — which is precisely the click that had just
         * finished selecting the words the bar was for.
         */
        const current = handlers.current.selection;
        if (picked && JSON.stringify(picked) !== JSON.stringify(current)) {
          /*
           * Where the caret should land, so one click both selects the
           * section and puts the cursor in the words that were clicked.
           * Applied once the fields below have been made editable.
           */
          pendingCaret.current = { x: event.clientX, y: event.clientY };
          handlers.current.onSelect?.(picked);
        }
      };
      contentDoc.addEventListener("click", onLinkClick);
      cleanups.push(() => contentDoc.removeEventListener("click", onLinkClick));

      const measure = () => {
        /*
         * BODY ONLY — never documentElement.
         *
         * html's scrollHeight is at least the viewport height, and the viewport
         * IS this iframe, whose height we are setting from the measurement. So
         * including it made the height a ratchet that could only grow: switching
         * from a long page to a short one left the frame at the long page's
         * height, and the About page rendered with thousands of pixels of blank
         * space under its footer.
         *
         * body is sized by its content, so it can report smaller than the frame.
         */
        const h = Math.max(
          contentDoc.body?.scrollHeight ?? 0,
          contentDoc.body?.offsetHeight ?? 0,
        );
        // React skips a re-render when the value is unchanged, so this is safe
        // to call as often as the observer fires.
        if (h > 0) setHeight(h);
        reportGeometry();
      };

      /*
       * Where every section is, for the parent's overlay.
       *
       * Reported from measure() rather than once on load, because the boxes
       * move whenever the frame reflows: a late-loading photograph, the chat
       * panel collapsing, the viewport toggle switching to mobile. A toolbar
       * pinned to a stale rect floats over the wrong section, which is worse
       * than no toolbar.
       */
      function reportGeometry() {
        const report = handlers.current.onGeometry;
        // Captured, because TypeScript cannot see that a nested function
        // declaration only ever runs after the null guard above.
        const scope = ref.current?.contentDocument;
        if (!report || !scope) return;
        const boxes: SectionBox[] = [];
        for (const el of Array.from(scope.querySelectorAll(SELECTABLE))) {
          const index = el.getAttribute("data-vibewp-node");
          const slot = el.getAttribute("data-vibewp-chrome");
          const selection: CanvasSelection | null =
            index !== null
              ? { kind: "node", index: Number(index) }
              : slot === "header" || slot === "footer"
                ? { kind: "chrome", slot }
                : null;
          if (!selection) continue;
          const rect = (el as HTMLElement).getBoundingClientRect();
          boxes.push({
            selection,
            // The frame never scrolls itself, so a client rect IS the offset
            // from the top of the document. If that ever changes, this needs
            // the scroll position added.
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          });
        }
        report(boxes);
      }

      /*
       * THE OBSERVER MUST BE CREATED INSIDE THE IFRAME'S OWN WINDOW.
       *
       * A ResizeObserver constructed in the parent realm and pointed at an
       * element in the iframe's document never fires — not even the initial
       * observation. Measured directly: `fired: 0`. So this had silently never
       * worked, and the height was only ever set by the one-shot measure()
       * below. Correct on load, frozen forever after: images landing late did
       * not grow it, and switching from a long page to a short one left the
       * frame at the long page's height with thousands of blank pixels under
       * the footer.
       */
      const RO = (iframe.contentWindow as (Window & typeof globalThis) | null)?.ResizeObserver;
      if (RO) {
        observer = new RO(measure);
        // Body only: html's height is viewport-bound, so observing it reports
        // the frame's own height back at us and the value can only grow.
        observer.observe(contentDoc.body);
      }

      /*
       * Images finish after the document does, and a photo without width and
       * height attributes occupies nothing until it lands. Captured, because
       * resource load events do not bubble.
       */
      contentDoc.addEventListener("load", measure, true);
      cleanups.push(() => contentDoc.removeEventListener("load", measure, true));

      // The frame reflows when the canvas changes width — collapsing the chat
      // panel, or the window resizing — and a reflow changes the height.
      const win = iframe.contentWindow;
      if (win) {
        win.addEventListener("resize", measure);
        cleanups.push(() => win.removeEventListener("resize", measure));
      }

      // Measure now rather than waiting for the first callback.
      measure();
      paintSelection(contentDoc, handlers.current.selection ?? null);
    };

    iframe.addEventListener("load", attach);
    attach();

    return () => {
      observer?.disconnect();
      cleanups.forEach((fn) => fn());
      iframe.removeEventListener("load", attach);
    };
  }, [liveDoc]);

  /*
   * Repainting the outline is its own effect.
   *
   * Selection changes constantly while the document does not, and folding it
   * into the attach effect above would rebuild every listener and remeasure
   * the frame each time the client clicked a different section.
   */
  useEffect(() => {
    const contentDoc = ref.current?.contentDocument;
    if (!contentDoc?.body?.hasAttribute("data-vibewp-preview")) return;
    paintSelection(contentDoc, selection ?? null);
  }, [selection, liveDoc]);

  /*
   * Type on the page.
   *
   * Only inside the SELECTED section: making the whole document editable
   * would mean every stray click landed a caret somewhere, and the point of
   * selecting a section first is that the client has said which part of the
   * page they are working on.
   *
   * contentEditable is put on and taken off rather than left on, because an
   * editable element swallows the click that would select something else.
   */
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    let cleanups: Array<() => void> = [];
    const teardown = () => {
      cleanups.forEach((fn) => fn());
      cleanups = [];
    };

    /*
     * Runs again when the frame reloads, for the same reason attach() does.
     *
     * A document change re-runs this effect immediately, but the new document
     * has not loaded yet — the frame is briefly back on about:blank, which has
     * no marker attribute, so setup found nothing and returned. Nothing ever
     * ran it again, so after any reload the selected section kept its outline
     * and lost its editors.
     */
    const setup = () => {
      teardown();
      const contentDoc = iframe.contentDocument;
      if (!contentDoc?.body?.hasAttribute("data-vibewp-preview")) return;
      attachEditors(contentDoc, cleanups);
    };

    iframe.addEventListener("load", setup);
    setup();
    return () => {
      iframe.removeEventListener("load", setup);
      teardown();
    };
  }, [selectionKey, liveDoc, editableKey]);


  return (
    <iframe
      ref={ref}
      // srcDoc rather than a src route: the markup is already in hand, and this
      // avoids a round trip on every keystroke-level content change.
      srcDoc={liveDoc}
      title="Site preview"
      className={className}
      /*
       * THE FRAME MUST NEVER SCROLL ITSELF.
       *
       * An iframe whose content is taller than its box becomes an independent
       * scroller, and the wheel then scrolls the INNER document rather than the
       * canvas around it — two scrollbars, and the page appearing not to move
       * when the pointer happens to be over the preview.
       *
       * It only takes a moment of the measured height lagging the real one — an
       * image finishing after the last measure, a width reflow — for that to
       * happen. Sizing alone cannot prevent it; refusing to scroll can.
       *
       * The canvas container is the one and only scroller.
       */
      scrolling="no"
      style={{ display: "block", width: "100%", height, border: 0 }}
    />
  );
}
