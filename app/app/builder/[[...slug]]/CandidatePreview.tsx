"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./builder.module.css";

/** Rendered at a desktop width and scaled down, never laid out narrow. */
const RENDER_WIDTH = 1100;
/** How much of a tall section a card shows before it fades out. */
const MAX_CARD_HEIGHT = 260;

/**
 * One design, drawn with the client's own content.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY AN IFRAME PER CARD, AND WHY RENDERED WIDE
 *
 * Sections are full-width designs, and sections.css decides their layout with
 * media queries that resolve against the VIEWPORT. Laying one out in a 380px
 * panel would fire the mobile breakpoints, so every card would show the
 * stacked phone layout — which is not the design the client is choosing
 * between. So each card renders at 1100px in its own iframe, with its own
 * viewport, and is scaled down by a transform. The same reasoning as the main
 * canvas, and the same reason WordPress iframes its own editor.
 *
 * MOUNTED LAZILY. Eleven heroes is eleven iframes, each loading the theme
 * stylesheet and a photograph. They mount as they scroll into view, so opening
 * the panel costs the two or three cards that are actually visible.
 * ─────────────────────────────────────────────────────────────────────
 */
export function CandidatePreview({
  html,
  colors,
  width,
  eager,
}: {
  /** Gutenberg markup for this one section, placeholders already substituted. */
  html: string;
  colors?: Record<string, string>;
  /** The card's width in the panel, which sets the scale factor. */
  width: number;
  /** Render immediately, without waiting to be scrolled towards. */
  eager?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(Boolean(eager));
  const [contentHeight, setContentHeight] = useState(0);

  /*
   * Mounted by measuring, NOT by IntersectionObserver.
   *
   * The observer version rendered nothing at all: ten cards on screen, and the
   * callback never fired once — reproduced with a hand-rolled observer on the
   * same elements to be sure it was not React. Whatever the cause in a given
   * embedding, a lazy-mount whose trigger can silently never arrive is the
   * wrong shape for this: the failure is a panel full of empty boxes, and it
   * looks exactly like the feature being broken.
   *
   * getBoundingClientRect always answers. So the first few cards render
   * eagerly, and the rest are checked on scroll — which is what the observer
   * was an optimisation of, and is not slow at this size.
   */
  useEffect(() => {
    if (visible) return;
    const el = holder.current;
    if (!el) return;

    const check = () => {
      const rect = el.getBoundingClientRect();
      const margin = 400;
      if (rect.top < window.innerHeight + margin && rect.bottom > -margin) setVisible(true);
    };
    check();

    // Whichever ancestor actually scrolls — the panel's list, not the window.
    const scroller = el.closest("[data-vibewp-scroller]") ?? window;
    scroller.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      scroller.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [visible]);

  /*
   * Measured from an effect, NOT from the iframe's onLoad.
   *
   * An iframe present in the first commit has already finished loading by the
   * time React attaches its handler, so onLoad never fired for it — the four
   * cards rendered eagerly, which are the only ones visible when the panel
   * opens, all sat at the placeholder height showing a 47px strip of a hero.
   * The lazily-mounted ones worked, which is what made it look like a timing
   * problem rather than the missed event it was.
   *
   * So: measure straight away, again on load, and twice more shortly after.
   * `load` on a srcDoc iframe fires before the theme stylesheet has applied
   * and before any photograph has landed, and only the largest measurement is
   * kept.
   */
  useEffect(() => {
    if (!visible) return;
    const el = frame.current;
    if (!el) return;

    const measure = () => {
      const body = el.contentDocument?.body;
      const h = Math.max(body?.scrollHeight ?? 0, body?.offsetHeight ?? 0);
      if (h > 0) setContentHeight((was) => (h > was ? h : was));
    };

    measure();
    el.addEventListener("load", measure);
    const timers = [window.setTimeout(measure, 250), window.setTimeout(measure, 900)];
    return () => {
      el.removeEventListener("load", measure);
      timers.forEach(window.clearTimeout);
    };
  }, [visible]);

  const scale = width > 0 ? width / RENDER_WIDTH : 1;
  const scaledHeight = contentHeight * scale;
  const cardHeight = scaledHeight > 0 ? Math.min(scaledHeight, MAX_CARD_HEIGHT) : 150;
  const cropped = scaledHeight > MAX_CARD_HEIGHT + 1;

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/api/theme/sections.css">
<style>
  html { overflow: hidden; }
  body { margin: 0; ${Object.entries(colors ?? {})
    .filter(([slug, value]) => /^[a-z0-9-]+$/.test(slug) && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value))
    .map(([slug, value]) => `--wp--preset--color--${slug}: ${value};`)
    .join(" ")} }
</style></head>
<body class="yp-page" data-vibewp-card>${html}</body></html>`;

  return (
    <div
      ref={holder}
      className={styles.cardViewport}
      style={{ height: cardHeight }}
      aria-hidden="true"
    >
      {visible && (
        <div
          className={styles.cardScaler}
          style={{ width: RENDER_WIDTH, transform: `scale(${scale})` }}
        >
          <iframe
            ref={frame}
            title=""
            tabIndex={-1}
            scrolling="no"
            srcDoc={doc}
            style={{
              width: RENDER_WIDTH,
              // Before measuring, tall enough that a section is not cut off
              // mid-layout while it settles.
              height: contentHeight || 900,
              border: 0,
              display: "block",
            }}
          />
        </div>
      )}
      {cropped && <span className={styles.cardFade} />}
    </div>
  );
}
