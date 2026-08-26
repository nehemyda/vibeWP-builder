"use client";

import { useEffect, useRef, useState } from "react";

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
}: {
  /** Gutenberg block markup from schemaToGutenberg() — the same string exported. */
  html: string;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(520);

  /*
   * `yp-page` on <body> is what activates the theme's rules: every selector in
   * sections.css is prefixed with it to win specificity against WordPress's
   * inline layout CSS. Without the class the stylesheet matches nothing.
   */
  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/api/theme/sections.css">
<style>
  html, body { margin: 0; padding: 0; }
  body { background: #fff; }
</style>
</head><body class="yp-page">${html}</body></html>`;

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    let observer: ResizeObserver | undefined;

    // The document has to exist before it can be measured, and srcDoc content
    // is not ready synchronously on first render.
    const attach = () => {
      const body = iframe.contentDocument?.body;
      if (!body) return;
      observer?.disconnect();
      // Only ever set height from the observer callback, which fires
      // asynchronously — measuring inline here would be a setState during the
      // effect, and would also read a pre-layout height.
      observer = new ResizeObserver(() => setHeight(body.scrollHeight));
      observer.observe(body);
    };

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();

    return () => {
      observer?.disconnect();
      iframe.removeEventListener("load", attach);
    };
  }, [doc]);

  return (
    <iframe
      ref={ref}
      // srcDoc rather than a src route: the markup is already in hand, and this
      // avoids a round trip on every keystroke-level content change.
      srcDoc={doc}
      title="Site preview"
      className={className}
      style={{ display: "block", width: "100%", height, border: 0 }}
    />
  );
}
