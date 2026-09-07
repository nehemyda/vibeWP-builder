"use client";

import { useEffect, useState } from "react";
import {
  generateImageAltAction,
  listImageAltAction,
  setImageAltAction,
  type ImagePlacement,
} from "@/app/actions/image-alt";
import styles from "./builder.module.css";

/**
 * Alt text for every photograph placed on the site.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE PICTURE IS SHOWN NEXT TO THE FIELD
 *
 * Alt text describes an image, so the image has to be in front of you while
 * you write it. A list of filenames with text boxes beside them is a form
 * nobody can fill in correctly — and it is how a bakery ends up telling
 * screen-reader users that a photograph of a swimming pool is a sourdough
 * loaf, which is a real thing found on a real site while building this.
 *
 * WHY "NEEDS ALT TEXT" INCLUDES SOME THAT HAVE SOME
 *
 * requireAlt() writes "Photograph of this business" rather than let an image
 * export with an empty alt attribute. That is right for the markup and it
 * means a client would never discover the problem: every image appears
 * described, and a screen reader reads the same eleven words every time. The
 * placeholder is counted as missing, because it is not a description.
 * ─────────────────────────────────────────────────────────────────────
 */

type Filter = "missing" | "all";

export function AltPanel({ siteId }: { siteId: string }) {
  const [rows, setRows] = useState<ImagePlacement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /*
   * Starts on "missing" only when something IS missing.
   *
   * Defaulting to it always meant a site with every picture described opened
   * on an empty screen beside a disabled button — which reads as a broken
   * feature rather than a finished job. Decided when the rows arrive, not
   * before.
   */
  const [filter, setFilter] = useState<Filter | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const reload = async () => setRows(await listImageAltAction(siteId));

  useEffect(() => {
    let live = true;
    listImageAltAction(siteId)
      .then((r) => {
        if (!live) return;
        setRows(r);
        setFilter(r.some((x) => x.needsAlt) ? "missing" : "all");
      })
      .catch(() => live && setError("Couldn't load your images."));
    return () => {
      live = false;
    };
  }, [siteId]);

  const generate = async (scope: "missing" | "all") => {
    setConfirmAll(false);
    setNote(null);
    setError(null);
    setWorking(scope === "all" ? "Describing every picture…" : "Describing the missing ones…");
    try {
      const result = await generateImageAltAction({ siteId, scope });
      if (result.ok) {
        setNote(result.message);
        await reload();
      } else setError(result.message);
    } catch {
      setError("I couldn't reach the model. Nothing was changed.");
    } finally {
      setWorking(null);
    }
  };

  const missingCount = (rows ?? []).filter((r) => r.needsAlt).length;
  const shown = (rows ?? []).filter((r) => (filter === "missing" ? r.needsAlt : true));

  return (
    <div className={styles.seoWrap}>
      <header className={styles.seoHead}>
        <div>
          <h2 className={styles.seoTitle}>Image alt text</h2>
          <p className={styles.seoLede}>
            What someone using a screen reader hears in place of each picture, and what search
            engines read. <strong>Publish to apply them.</strong>
          </p>
        </div>
        <div className={styles.seoActions}>
          <button
            type="button"
            className={styles.seoGenerate}
            disabled={!!working || missingCount === 0}
            onClick={() => void generate("missing")}
          >
            {working ??
              (missingCount === 0
                ? "Nothing is missing alt text"
                : `Generate the missing ${missingCount}`)}
          </button>
          {confirmAll ? (
            <span className={styles.seoConfirm}>
              <button
                type="button"
                className={styles.seoConfirmYes}
                disabled={!!working}
                onClick={() => void generate("all")}
              >
                Replace all
              </button>
              <button type="button" onClick={() => setConfirmAll(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={styles.seoGenerateGhost}
              disabled={!!working}
              onClick={() => setConfirmAll(true)}
              title="Rewrites the alt text on every picture, including any you wrote yourself"
            >
              Generate for all images…
            </button>
          )}
        </div>
      </header>

      {error && <p className={styles.mediaError}>{error}</p>}
      {note && <p className={styles.seoNote}>{note}</p>}
      {rows === null && !error && <p className={styles.mediaHint}>Loading your images…</p>}

      {rows && (
        <>
          <div className={styles.seoFilters}>
            <button
              type="button"
              className={`${styles.seoFilter} ${filter === "missing" ? styles.seoFilterOn : ""}`}
              aria-pressed={filter === "missing"}
              onClick={() => setFilter("missing")}
            >
              Needs alt text ({missingCount})
            </button>
            <button
              type="button"
              className={`${styles.seoFilter} ${filter === "all" ? styles.seoFilterOn : ""}`}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All images ({rows.length})
            </button>
          </div>

          {shown.length === 0 && (
            <p className={styles.mediaHint}>
              {filter === "missing"
                ? "Every picture on your site has alt text."
                : "No pictures on your pages yet. Place one and it will appear here."}
            </p>
          )}

          <ul className={styles.altList}>
            {shown.map((row) => (
              <li key={`${row.pageId}:${row.path}`} className={styles.altRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.altThumb} src={row.url} alt="" loading="lazy" />
                <div className={styles.altFields}>
                  <span className={styles.altWhere}>
                    {row.sectionName} · {row.pageTitle}
                  </span>
                  <AltField
                    key={`${row.pageId}:${row.path}:${row.alt}`}
                    value={row.needsAlt ? "" : row.alt}
                    onCommit={async (alt) => {
                      const result = await setImageAltAction({
                        siteId,
                        pageId: row.pageId,
                        path: row.path,
                        alt,
                      });
                      if (!result.ok) setError(result.message ?? "That didn't save.");
                      await reload();
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** One description, committed on blur. */
function AltField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void | Promise<void>;
}) {
  /*
   * Seeded once; the parent changes the key when the stored value changes, so
   * there is no effect to run at the wrong moment. Same reasoning as the SEO
   * table's fields.
   */
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="text"
      className={styles.seoInput}
      value={draft}
      placeholder="What is in this picture?"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value.trim() && void onCommit(draft)}
    />
  );
}
