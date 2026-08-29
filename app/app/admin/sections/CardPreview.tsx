"use client";

import { useEffect, useRef, useState } from "react";

/** Desktop width to render at, then scale down into the card. */
const RENDER_WIDTH = 1280;

/**
 * A live thumbnail of one section, rendered from its own markup and the theme's
 * real stylesheet.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NOT A STORED IMAGE
 *
 * The cards first read a `previewImageUrl` column, which was null for every
 * section — so the whole library showed "No preview yet" and previews depended
 * on somebody uploading artwork by hand. Worse, a stored screenshot silently
 * goes stale: change the theme's spacing and every thumbnail is then a picture
 * of a layout that no longer exists.
 *
 * Rendering live costs one iframe per card and is always truthful. The frame is
 * given a real 1280px viewport and scaled down, so the thumbnail shows the
 * DESKTOP layout rather than the section's mobile breakpoint squeezed into a
 * card — which is what sizing the iframe to the card would produce.
 * ─────────────────────────────────────────────────────────────────────
 */
export function CardPreview({ html }: { html: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/api/theme/sections.css">
<style>
  html,body{margin:0;padding:0;background:#fff;overflow:hidden}
  /* A thumbnail wants the composition, not a scrollable page. */
  body{pointer-events:none}
</style>
</head><body class="yp-page">${html}</body></html>`;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setWidth(box.clientWidth));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? width / RENDER_WIDTH : 0;

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {scale > 0 && (
        <iframe
          srcDoc={doc}
          title=""
          aria-hidden="true"
          tabIndex={-1}
          /* Cards below the fold shouldn't each cost a render on page load. */
          loading="lazy"
          scrolling="no"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: RENDER_WIDTH,
            /* Tall enough to fill the card once scaled; the box clips the rest. */
            height: RENDER_WIDTH * 0.75,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
