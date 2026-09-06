"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteMediaAction,
  listMediaAction,
  setMediaAltAction,
  uploadMediaAction,
  type MediaAsset,
} from "@/app/actions/media";
import styles from "./builder.module.css";

/**
 * The site's image library, as a panel.
 *
 * ─────────────────────────────────────────────────────────────────────
 * OPENED FOR A PURPOSE, NOT BROWSED
 *
 * It is opened by clicking a photograph on the page, so it always knows which
 * placement it is filling. That is what lets choosing be a single click:
 * there is no "insert where?" step, because the answer was the thing clicked.
 *
 * It can also be opened with nothing selected, to upload and tidy up. Then
 * choosing does nothing and the tiles say so by not offering it.
 *
 * WHY THE GRID IS FIXED-RATIO
 *
 * Photographs arrive in every shape a phone can produce. A masonry grid of
 * them is a wall of noise to scan; equal squares with the picture cropped to
 * fill are what make it possible to find one at a glance. The full shape is
 * still visible on the tile that is hovered, via the filename and dimensions.
 *
 * ALT TEXT IS ASKED FOR HERE, ONCE
 *
 * Not invented from the filename — "IMG_4821" read aloud is worse than
 * silence — and not asked for again at every placement. It belongs to the
 * photograph, so it lives on the asset and travels with it into whichever
 * section uses it.
 * ─────────────────────────────────────────────────────────────────────
 */
export function MediaPanel({
  siteId,
  target,
  onChoose,
  onClose,
  busy,
}: {
  siteId: string;
  /** What is being replaced. Null when the library was opened on its own. */
  target: { label: string; path: string } | null;
  onChoose: (asset: MediaAsset) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    listMediaAction(siteId)
      .then((rows) => live && setAssets(rows))
      .catch(() => live && setError("Couldn't load your images."));
    return () => {
      live = false;
    };
  }, [siteId]);

  /*
   * Uploads run one at a time rather than all at once. A client dropping
   * twenty photographs from a phone would otherwise open twenty connections
   * and time most of them out; sequential is slower to finish and far more
   * likely to finish at all.
   */
  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      setError("Those files aren't images.");
      return;
    }
    setError(null);
    setUploading(list.length);
    for (const file of list) {
      const form = new FormData();
      form.set("siteId", siteId);
      form.set("file", file);
      try {
        const result = await uploadMediaAction(form);
        if (!result.ok) setError(result.error);
        else {
          setAssets((prev) => {
            const rest = (prev ?? []).filter((a) => a.id !== result.asset.id);
            return [result.asset, ...rest];
          });
        }
      } catch {
        setError("That upload didn't finish.");
      }
      setUploading((n) => n - 1);
    }
  }

  const canChoose = !!target;

  return (
    <aside
      className={styles.mediaPanel}
      aria-label="Images"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Only when the pointer has genuinely left the panel, not when it
        // crosses from the panel onto a tile inside it.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <header className={styles.mediaHead}>
        <div>
          <strong>Images</strong>
          {target && <span className={styles.mediaTargetName}>Replacing in {target.label}</span>}
        </div>
        <button type="button" className={styles.mediaClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className={styles.mediaActions}>
        <button
          type="button"
          className={styles.mediaUpload}
          onClick={() => fileInput.current?.click()}
          disabled={uploading > 0}
        >
          {uploading > 0 ? `Uploading ${uploading}…` : "Upload images"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            // Cleared so choosing the same file again still fires a change.
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className={styles.mediaError}>{error}</p>}

      {assets === null && <p className={styles.mediaHint}>Loading your images…</p>}

      {assets?.length === 0 && (
        <div className={styles.mediaEmpty}>
          <p>No images yet.</p>
          <p className={styles.mediaHint}>
            Drop them here, or use the button above. They stay in your library until you place
            them — only the ones on your pages are copied to WordPress when you publish.
          </p>
        </div>
      )}

      {!!assets?.length && (
        <ul className={styles.mediaGrid}>
          {assets.map((asset) => (
            <li key={asset.id} className={styles.mediaTile}>
              <button
                type="button"
                className={styles.mediaTileBtn}
                disabled={!canChoose || busy}
                title={canChoose ? `Use ${asset.filename}` : asset.filename}
                onClick={() => canChoose && onChoose(asset)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url} alt={asset.alt ?? ""} loading="lazy" />
                {canChoose && <span className={styles.mediaUse}>Use this</span>}
              </button>

              <div className={styles.mediaMeta}>
                {editingAlt === asset.id ? (
                  <input
                    className={styles.mediaAltInput}
                    defaultValue={asset.alt ?? ""}
                    placeholder="Describe this picture"
                    autoFocus
                    onBlur={(e) => {
                      const alt = e.target.value;
                      setEditingAlt(null);
                      if (alt === (asset.alt ?? "")) return;
                      setAssets(
                        (prev) => prev?.map((a) => (a.id === asset.id ? { ...a, alt } : a)) ?? prev,
                      );
                      void setMediaAltAction({ siteId, assetId: asset.id, alt });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingAlt(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={`${styles.mediaAlt} ${asset.alt ? "" : styles.mediaAltMissing}`}
                    onClick={() => setEditingAlt(asset.id)}
                    title="Alt text — what a screen reader reads out"
                  >
                    {asset.alt || "Add a description"}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.mediaRemove}
                  title="Remove from library"
                  aria-label={`Remove ${asset.filename}`}
                  onClick={() => {
                    setAssets((prev) => prev?.filter((a) => a.id !== asset.id) ?? prev);
                    void deleteMediaAction({ siteId, assetId: asset.id });
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dragging && <div className={styles.mediaDrop}>Drop to upload</div>}
    </aside>
  );
}
