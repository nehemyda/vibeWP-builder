"use client";

import type { MediaAsset } from "@/app/actions/media";
import type { ImagePlacement } from "@/app/actions/image-alt";
import styles from "./builder.module.css";

/**
 * Asking before a picture goes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE ICON, TWO MEANINGS, AND THE DIALOG IS WHERE THEY ARE TOLD APART
 *
 * Delete used to appear only on cards backed by an uploaded file, because
 * that was the only thing there was to delete. The grid does not read that
 * way: it is one list of every picture on the site, and a control that
 * appears on some of them looks broken rather than principled.
 *
 * The reason only some had a file is worth writing down — it is a gap, not a
 * design. Only a manual upload creates a media_assets row; a stock photograph
 * that generation put on a page never enters the library at all, even though
 * the column has been documented as "upload | stock | wordpress" since it was
 * added. So roughly half the grid is pictures the site uses and does not own.
 *
 * Until that is closed, delete means the thing the card is actually showing:
 *
 *   a placement          → take the photograph off that section
 *   a library file        → remove it from the library
 *
 * Which is one rule, not two: it removes the picture from where the card's
 * own subtitle says it is.
 *
 * WHAT EACH ONE COSTS, SAID OUT LOUD
 *
 * Taking a picture off a page changes the page, so the dialog says the
 * section keeps everything else and that it can be undone. Removing a library
 * file does NOT change any page — the export walks each page's schema by URL
 * and never consults the library — so the dialog says that instead, because a
 * client who removes a picture and still sees it on their homepage would
 * reasonably conclude the button is broken.
 *
 * Its own file so it can be rendered with fixtures at /dev/dialog, which is
 * the only way to look at it without a logged-in session.
 * ─────────────────────────────────────────────────────────────────────
 */

/** What the delete icon on a card is pointing at. */
export type DeleteTarget =
  | {
      kind: "placement";
      url: string;
      /** "Hero banner · Home", as the card's own subtitle reads. */
      where: string;
      /** True when the same file is in the library and will survive this. */
      alsoInLibrary: boolean;
    }
  | {
      kind: "library";
      asset: Pick<MediaAsset, "url" | "filename">;
      /** Every placement of this picture, so the dialog can name them. */
      used: Array<Pick<ImagePlacement, "pageId" | "path" | "sectionName" | "pageTitle">>;
    };

export function DeleteImageDialog({
  target,
  removing,
  onKeep,
  onRemove,
}: {
  target: DeleteTarget;
  removing: boolean;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const url = target.kind === "library" ? target.asset.url : target.url;

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
        <img className={styles.confirmThumb} src={url} alt="" />

        {target.kind === "placement" ? (
          <>
            <strong id="img-del-title" className={styles.confirmTitle}>
              Take this picture off the page?
            </strong>
            <span className={styles.confirmName}>{target.where}</span>
            <p className={styles.confirmBody}>
              The section keeps its heading, its words and its buttons — only the photograph
              goes. Undo on the canvas puts it back.
            </p>
            {target.alsoInLibrary && (
              <p className={styles.confirmBody}>
                The file stays in your library, so you can place it again.
              </p>
            )}
          </>
        ) : (
          <>
            <strong id="img-del-title" className={styles.confirmTitle}>
              {target.used.length > 0
                ? "This picture is used on your site"
                : "Remove this picture from your library?"}
            </strong>
            <span className={styles.confirmName}>{target.asset.filename}</span>

            {target.used.length > 0 ? (
              <>
                <p className={styles.confirmBody}>
                  It is on {target.used.length === 1 ? "1 place" : `${target.used.length} places`}:
                </p>
                <ul className={styles.confirmList}>
                  {target.used.map((u) => (
                    <li key={`${u.pageId}:${u.path}`}>
                      {u.sectionName} <span>· {u.pageTitle}</span>
                    </li>
                  ))}
                </ul>
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
          </>
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
            {removing
              ? "Removing…"
              : target.kind === "placement"
                ? "Remove from page"
                : "Remove from library"}
          </button>
        </div>
      </div>
    </div>
  );
}
