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
        The toolbar and the pager, at a count the real site will not reach for
        a while — 47 pictures, which is the first count where three pages, a
        clamp and a narrowing search all exist at once.
      */}
      <h2 style={{ font: "700 14px/1.3 system-ui", margin: "18px 0 0" }}>Toolbar and pager</h2>
      <div style={{ width: "min(900px, 100%)" }}>
        <div className={styles.imageTools}>
          <div className={styles.seoFilters}>
            <button type="button" className={`${styles.seoFilter} ${styles.seoFilterOn}`}>
              Missing alt or title (12)
            </button>
            <button type="button" className={styles.seoFilter}>
              All images (47)
            </button>
          </div>
          <label className={styles.imageSearch}>
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M7.2 12.4A5.2 5.2 0 1 0 7.2 2a5.2 5.2 0 0 0 0 10.4ZM11 11l3 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              defaultValue="bread"
              placeholder="Search name, alt, title or page"
            />
            <button type="button" className={styles.imageSearchClear} aria-label="Clear">
              ✕
            </button>
          </label>
        </div>

        <div className={styles.pager}>
          <span className={styles.pagerCount}>Showing 21–40 of 47</span>
          <div className={styles.pagerBtns}>
            <button type="button" className={styles.pagerBtn}>
              ‹ Previous
            </button>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.pagerNum} ${n === 2 ? styles.pagerNumOn : ""}`}
              >
                {n}
              </button>
            ))}
            <button type="button" className={styles.pagerBtn}>
              Next ›
            </button>
          </div>
        </div>
      </div>

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

      {/*
        The SEO table's layout, at realistic content lengths.

        A static rebuild of SeoPanel's markup rather than the panel itself —
        it authenticates against the real database and this route has no
        session. The CSS under test lives entirely in builder.module.css, so
        matching class names is enough to see whether the grid, the zebra
        stripes, the hidden field labels and the header row actually hold up
        against nine pages of real-length copy, at both the wide and the
        narrow breakpoint.
      */}
      <h2 style={{ font: "700 14px/1.3 system-ui", margin: "18px 0 0" }}>SEO table</h2>
      <div className={styles.seoWrap} style={{ width: "min(1400px, 100%)" }}>
        <div className={styles.seoTableHead} aria-hidden="true">
          <span>Page</span>
          <span>Focus keyword</span>
          <span>Title</span>
          <span>Description</span>
          <span>Canonical URL</span>
          <span>Hide from search engines</span>
        </div>
        <ul className={styles.seoList}>
          {[
            {
              title: "Home",
              slug: "",
              badge: "Written by AI",
              kw: "celebration cakes bath",
              t: "Sunrise Bakery Test | Artisan Sourdough & Cakes in Bath",
              d: "Crafting long-fermented sourdough, pastries, and custom cakes fresh daily from 4 AM on Market Street, Bath. Everything made on-site until sold out.",
              canon: "",
              warnings: [] as string[],
            },
            {
              title: "About",
              slug: "about",
              badge: "Written by AI",
              kw: "",
              t: "Our Story: Fresh Sourdough & Cakes Baked Daily in Bath",
              d: "Every morning from 4am, our small team at Sunrise Bakery Bath bakes fresh sourdough, pastries, and custom cakes on site. Learn our story and passion here.",
              canon: "",
              warnings: ["Same title as Home", "No focus keyword set"],
            },
            {
              title: "Quote",
              slug: "quote",
              badge: null,
              kw: "custom cake quote bath",
              t: "Get a Quote",
              d: "",
              canon: "",
              warnings: ["No description set"],
            },
            {
              title: "Menu & Pricing",
              slug: "menu-and-pricing",
              badge: "Written by AI",
              kw: "sourdough prices bath",
              t: "Menu & Pricing — Sunrise Bakery Bath",
              d: "See our daily sourdough loaves, pastries and celebration cake prices. Order ahead for collection from our Market Street bakery in Bath.",
              canon: "https://sunrisebakery.example.com/menu",
              warnings: [],
            },
          ].map((p, i) => (
            <li key={i} className={styles.seoRow}>
              <div className={styles.seoPage}>
                <strong>{p.title}</strong>
                <span className={styles.seoSlug}>/{p.slug}</span>
                {p.badge && <span className={styles.seoBadge}>{p.badge}</span>}
                {i === 2 && <span className={styles.seoBadge}>Saving…</span>}
              </div>

              {[
                { label: "Focus keyword", limit: 60, value: p.kw, placeholder: "e.g. celebration cakes bath" },
                { label: "Title", limit: 60, value: p.t, placeholder: "e.g. Sourdough & Celebration Cakes in Bath" },
                { label: "Description", limit: 160, value: p.d, placeholder: "One sentence a person would click on.", multiline: true },
                { label: "Canonical URL", limit: 500, value: p.canon, placeholder: "Leave empty unless this page copies another URL" },
              ].map((f) => (
                <label key={f.label} className={styles.seoField}>
                  <span className={styles.seoFieldHead}>
                    <span className={styles.seoFieldLabel}>{f.label}</span>
                    <span className={styles.seoCount}>
                      {f.value.length}/{f.limit}
                    </span>
                  </span>
                  {f.multiline ? (
                    <textarea rows={3} className={styles.seoInput} defaultValue={f.value} placeholder={f.placeholder} />
                  ) : (
                    <input type="text" className={styles.seoInput} defaultValue={f.value} placeholder={f.placeholder} />
                  )}
                </label>
              ))}

              <label className={styles.seoNoIndex}>
                <input type="checkbox" readOnly checked={false} />
                <span className={styles.seoNoIndexText}>Hide from search engines</span>
              </label>

              {p.warnings.length > 0 && (
                <ul className={styles.seoWarnings}>
                  {p.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className={styles.pager}>
          <span className={styles.pagerCount}>Showing 1–20 of 34</span>
          <div className={styles.pagerBtns}>
            <button type="button" className={styles.pagerBtn} disabled>
              ‹ Previous
            </button>
            {[1, 2].map((n) => (
              <button key={n} type="button" className={`${styles.pagerNum} ${n === 1 ? styles.pagerNumOn : ""}`}>
                {n}
              </button>
            ))}
            <button type="button" className={styles.pagerBtn}>
              Next ›
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
