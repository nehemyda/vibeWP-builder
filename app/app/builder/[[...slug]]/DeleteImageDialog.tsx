"use client";

import type { MediaAsset } from "@/app/actions/media";
import type { ImagePlacement } from "@/app/actions/image-alt";
import styles from "./builder.module.css";

/**
 * Asking before a picture leaves the library.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A DIALOG AND NOT THE INLINE CONFIRM USED ELSEWHERE
 *
 * The generate menu confirms in place, with two buttons where the command
 * was — right, because the only question there is "are you sure". This one
 * has something to TELL you: which pages keep the picture afterwards. A pair
 * of buttons has nowhere to put a list, and a client about to remove the
 * photograph from their own homepage should read where it is used before
 * deciding rather than after.
 *
 * WHAT IT MUST NOT IMPLY
 *
 * That the picture disappears from the site. It does not. The export walks
 * each page's schema by URL and never consults the library, so every page
 * keeps its photograph until someone changes it there. Saying so is the whole
 * point of the used variant — the alternative is a client who removes a
 * picture, sees it still on their homepage, and concludes the button is
 * broken.
 *
 * Its own file so it can be rendered with fixtures at /dev/canvas, which is
 * the only way to look at it without a logged-in session.
 * ─────────────────────────────────────────────────────────────────────
 */
export function DeleteImageDialog({
  asset,
  used,
  removing,
  onKeep,
  onRemove,
}: {
  asset: Pick<MediaAsset, "url" | "filename">;
  /** Every placement of this picture, so the dialog can name them. */
  used: Array<Pick<ImagePlacement, "pageId" | "path" | "sectionName" | "pageTitle">>;
  removing: boolean;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
  <div
    className={styles.confirmScrim}
    role="presentation"
    onMouseDown={() => !removing && onKeep()}
  >
    <div
      className={styles.confirmCard}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="img-del-title"
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !removing) onKeep();
      }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.confirmThumb} src={asset.url} alt="" />

      <strong id="img-del-title" className={styles.confirmTitle}>
        {used.length > 0
          ? `This picture is used on your site`
          : `Remove this picture from your library?`}
      </strong>
      <span className={styles.confirmName}>{asset.filename}</span>

      {used.length > 0 ? (
        <>
          <p className={styles.confirmBody}>
            It is on{" "}
            {used.length === 1 ? "1 place" : `${used.length} places`}:
          </p>
          <ul className={styles.confirmList}>
            {used.map((u) => (
              <li key={`${u.pageId}:${u.path}`}>
                {u.sectionName} <span>· {u.pageTitle}</span>
              </li>
            ))}
          </ul>
          {/*
            Said plainly, because the alternative is a client who removes
            a picture, sees it still on their homepage, and concludes the
            button is broken.
          */}
          <p className={styles.confirmBody}>
            Removing it here <strong>will not</strong> take it off those pages — each one
            keeps this picture until you change it on the page itself. What you lose is
            being able to place it somewhere new.
          </p>
        </>
      ) : (
        <p className={styles.confirmBody}>
          It isn&rsquo;t used on any page. You can upload it again later.
        </p>
      )}

      <div className={styles.confirmActions}>
        <button
          type="button"
          className={styles.confirmKeep}
          disabled={removing}
          onClick={onKeep}
        >
          Keep it
        </button>
        <button
          type="button"
          className={styles.confirmGo}
          disabled={removing}
          onClick={onRemove}
        >
          {removing ? "Removing…" : "Remove from library"}
        </button>
      </div>
    </div>
  </div>
  );
}
