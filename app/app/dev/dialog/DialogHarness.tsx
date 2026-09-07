"use client";

import { useState } from "react";
import {
  DeleteImageDialog,
  type DeleteTarget,
} from "@/app/builder/[[...slug]]/DeleteImageDialog";
import styles from "@/app/builder/[[...slug]]/builder.module.css";

/*
 * A 1×1 PNG as a data URI: the thumbnail's job here is to prove its box is
 * the right size and shape, and a real photograph would make the dialog's
 * proportions depend on a network fetch.
 */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mM8w/CfAQAFBQIB1BQ8VAAAAABJRU5ErkJggg==";

const USED = [
  { pageId: "p1", path: "0.image", sectionName: "Hero banner", pageTitle: "Home" },
  { pageId: "p2", path: "3.items.1.image", sectionName: "Gallery", pageTitle: "About" },
  { pageId: "p2", path: "5.image", sectionName: "Call to action", pageTitle: "About" },
];

const ASSET = { url: PIXEL, filename: "freshly-baked-sourdough-loaves.webp" };

/*
 * Two stand-in photographs, chosen to be the two cases the delete chip has to
 * survive: a near-white sky, where a light control disappears, and a near-black
 * shadow, where a dark one does. A real photograph would test whichever of the
 * two it happened to have in its top-right corner.
 */
const swatch = (top: string, bottom: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="240" height="180" fill="url(#g)"/></svg>`,
  )}`;

const PALE = swatch("#ffffff", "#dfe6ee");
const DARK = swatch("#14171c", "#3a4350");

/* Every state the dialog has, named the way the code names them. */
const CASES = {
  "library · used on 3 pages": { kind: "library", asset: ASSET, used: USED },
  "library · not used": { kind: "library", asset: ASSET, used: [] },
  "placement · also a library file": {
    kind: "placement",
    url: PIXEL,
    where: "Hero banner · Home",
    alsoInLibrary: true,
  },
  "placement · stock, not in the library": {
    kind: "placement",
    url: PIXEL,
    where: "Gallery · About",
    alsoInLibrary: false,
  },
} satisfies Record<string, DeleteTarget>;

export function DialogHarness() {
  const [show, setShow] = useState<keyof typeof CASES | null>("library · used on 3 pages");
  const [removing, setRemoving] = useState(false);

  return (
    <main style={{ padding: 24, display: "grid", gap: 8, justifyItems: "start" }}>
      <h1 style={{ font: "700 16px/1.3 system-ui", margin: 0 }}>Delete confirmation</h1>
      {(Object.keys(CASES) as Array<keyof typeof CASES>).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            setRemoving(false);
            setShow(k);
          }}
        >
          {k}
        </button>
      ))}
      <label style={{ font: "500 13px/1.4 system-ui" }}>
        <input type="checkbox" checked={removing} onChange={(e) => setRemoving(e.target.checked)} />{" "}
        mid-removal
      </label>
      {/*
        The delete chip in position, over both extremes. The markup mirrors the
        card's thumbnail wrapper in ImagesTab — the part whose geometry and
        contrast are the question; the text fields below it are unchanged.
      */}
      <h2 style={{ font: "700 14px/1.3 system-ui", margin: "18px 0 0" }}>
        Delete chip, on the picture
      </h2>
      <ul className={styles.imageGrid} style={{ width: "min(760px, 100%)" }}>
        {[
          { url: PALE, where: "Hero banner · Home", placed: true },
          { url: DARK, where: "Gallery · About", placed: true },
          { url: PALE, where: "Not used on a page yet", placed: false },
        ].map((c, i) => (
          <li key={i} className={styles.imageCard}>
            <span className={styles.imageThumbWrap}>
              <button type="button" className={styles.imageThumbBtn}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt="" />
              </button>
              <button
                type="button"
                className={styles.imageDelete}
                title={c.placed ? "Take off the page" : "Remove from library"}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path
                    d="M6.5 2.5h3M3 4.5h10M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2M7 7v4M9 7v4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
            <span className={styles.imageWhere}>{c.where}</span>
          </li>
        ))}
      </ul>

      {show && (
        <DeleteImageDialog
          target={CASES[show]}
          removing={removing}
          onKeep={() => setShow(null)}
          onRemove={() => setRemoving(true)}
        />
      )}
    </main>
  );
}
