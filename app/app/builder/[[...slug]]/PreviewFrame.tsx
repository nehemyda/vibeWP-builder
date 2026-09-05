"use client";

import { useEffect, useRef, useState } from "react";
import { tokensToCss, type DesignTokens } from "@/lib/design/tokens";
import { ELEMENT_ROLES } from "@/lib/design/element-style";

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
  const handlers = useRef({ onNavigate, onSelect, onGeometry, selection });
  // Assigned in an effect rather than during render: writing a ref while
  // rendering is what React's own lint now rejects, and `selection` rides
  // along so attach() cannot paint an outline for a section that is no longer
  // the one selected.
  useEffect(() => {
    handlers.current = { onNavigate, onSelect, onGeometry, selection };
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
        if (picked) handlers.current.onSelect?.(picked);
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
  }, [doc]);

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
  }, [selection, doc]);

  return (
    <iframe
      ref={ref}
      // srcDoc rather than a src route: the markup is already in hand, and this
      // avoids a round trip on every keystroke-level content change.
      srcDoc={doc}
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
