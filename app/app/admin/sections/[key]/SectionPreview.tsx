"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WIDTHS = { desktop: 1280, tablet: 768, mobile: 390 } as const;
type Size = keyof typeof WIDTHS;

/**
 * Renders one section exactly as an exported site would.
 *
 * Same approach as the builder canvas: an iframe loading the theme's real
 * sections.css, with `yp-page` on the body to activate it. An iframe rather
 * than a div because the theme's breakpoints resolve against a viewport.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT RENDERS WIDE AND SCALES DOWN
 *
 * The settings panel leaves this column about 660px. The theme collapses the
 * hero to one column below 880px — so a naive iframe sized to its container
 * showed the MOBILE layout while the "Desktop" button was selected. The button
 * was lying, which is exactly the failure this whole preview exists to avoid.
 *
 * So the iframe is given a real 1280px viewport and visually scaled to fit.
 * The breakpoints fire against 1280, meaning the layout is genuinely the
 * desktop one; only its display size is reduced.
 * ─────────────────────────────────────────────────────────────────────
 */
export function SectionPreview({ html }: { html: string }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState<Size>("desktop");
  const [contentHeight, setContentHeight] = useState(600);
  const [available, setAvailable] = useState(0);

  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/api/theme/sections.css">
<style>html,body{margin:0;padding:0}body{background:#fff}</style>
</head><body class="yp-page">${html}</body></html>`;

  // How much room the column actually gives us, which sets the scale factor.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const ro = new ResizeObserver(() => setAvailable(shell.clientWidth));
    ro.observe(shell);
    return () => ro.disconnect();
  }, []);

  const attach = useCallback(() => {
    const body = frameRef.current?.contentDocument?.body;
    if (!body) return undefined;
    const ro = new ResizeObserver(() => setContentHeight(body.scrollHeight));
    ro.observe(body);
    return ro;
  }, []);

  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe) return;
    let ro: ResizeObserver | undefined;
    const onLoad = () => {
      ro?.disconnect();
      ro = attach();
    };
    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") ro = attach();
    return () => {
      ro?.disconnect();
      iframe.removeEventListener("load", onLoad);
    };
  }, [doc, attach]);

  const target = WIDTHS[size];
  // Never scale up — a 390px mobile frame should stay 390px, not stretch.
  const scale = available > 0 ? Math.min(1, available / target) : 1;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.3rem", paddingBottom: "0.7rem" }}>
        {(Object.keys(WIDTHS) as Size[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSize(s)}
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              padding: "0.3rem 0.6rem",
              borderRadius: 8,
              cursor: "pointer",
              border: "1px solid var(--line)",
              background: size === s ? "var(--ink)" : "transparent",
              color: size === s ? "#fff" : "var(--muted)",
              textTransform: "capitalize",
            }}
          >
            {s}
          </button>
        ))}
        <span style={{ fontSize: "0.74rem", color: "var(--faint)", alignSelf: "center", marginLeft: "auto" }}>
          {target}px{scale < 1 ? ` · shown at ${Math.round(scale * 100)}%` : ""}
        </span>
      </div>

      <div
        ref={shellRef}
        style={{
          background: "#efece7",
          padding: 12,
          borderRadius: 10,
          display: "flex",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Reserves the SCALED height, so the panel doesn't leave a gap under a shrunk frame. */}
        <div style={{ width: target * scale, height: contentHeight * scale, position: "relative" }}>
          <iframe
            ref={frameRef}
            srcDoc={doc}
            title="Section preview"
            style={{
              width: target,
              height: contentHeight,
              border: 0,
              background: "#fff",
              borderRadius: 8 / scale,
              display: "block",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </div>
  );
}
