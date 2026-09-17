"use client";

import { useEffect, useRef, useState } from "react";
import { palettePresetCss } from "@/lib/render/page-document";

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
export function PreviewFrame({
  html,
  className,
  colors,
  onNavigate,
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
   * Called when a menu link inside the canvas is clicked, with that page's slug.
   *
   * The preview has no server behind it, so a link cannot navigate anywhere on
   * its own — the builder switches which page it is editing instead. That makes
   * the canvas menu behave the way the exported site's menu does, which is what
   * a client expects from something that looks exactly like their website.
   */
  onNavigate?: (slug: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  /*
   * `yp-page` on <body> is what activates the theme's rules: every selector in
   * sections.css is prefixed with it to win specificity against WordPress's
   * inline layout CSS. Without the class the stylesheet matches nothing.
   */
  /* Shared with the live renderer, so the canvas and a served page cannot
     disagree about a client's colours. See lib/render/page-document.ts. */
  const paletteCss = palettePresetCss(colors);

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
        if (!slug) return;
        event.preventDefault();
        onNavigate?.(slug);
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
      };

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
    };

    iframe.addEventListener("load", attach);
    attach();

    return () => {
      observer?.disconnect();
      cleanups.forEach((fn) => fn());
      iframe.removeEventListener("load", attach);
    };
  }, [doc, onNavigate]);

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
