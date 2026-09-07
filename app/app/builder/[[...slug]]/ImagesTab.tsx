"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteMediaAction,
  listMediaAction,
  setMediaAltAction,
  uploadMediaAction,
  type MediaAsset,
} from "@/app/actions/media";
import {
  generateImageAltAction,
  listImageAltAction,
  setImageAltAction,
  type ImagePlacement,
} from "@/app/actions/image-alt";
import styles from "./builder.module.css";

/**
 * Every picture on the site, in one list: upload, alt text, delete.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS ONE SCREEN AND NOT TWO
 *
 * It was two: a library of uploaded FILES, and a separate tab listing the
 * PLACEMENTS those files sit in. The distinction is real — a file can be used
 * in three sections, and a page can use a photograph that was never uploaded
 * because it came from a stock search — but as two screens it read as the same
 * thumbnails twice, and it was.
 *
 * So the list is one list, in the order that matters: what is ON the site
 * first, then what is in the library and not being used. A row says which it
 * is, because only the first kind ships.
 *
 * WHY ALT TEXT IS EDITED IN TWO PLACES BEHIND ONE FIELD
 *
 * A placement's alt lives on the page, and that is what the exported site
 * carries. An unused file's alt lives on the file, and travels with it into
 * whichever section later uses it. Same field, same words, two destinations —
 * which is invisible and correct, rather than two forms to learn.
 *
 * WHY GENERATION ONLY COVERS PLACEMENTS
 *
 * Describing a file nobody has placed spends a model call on a picture that
 * reaches no reader. It gets a description when it is placed, or when it is
 * typed here.
 * ─────────────────────────────────────────────────────────────────────
 */

type Row =
  | { kind: "placed"; key: string; placement: ImagePlacement }
  | { kind: "unused"; key: string; asset: MediaAsset };

export function ImagesTab({ siteId, busy }: { siteId: string; busy?: boolean }) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [placements, setPlacements] = useState<ImagePlacement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [a, p] = await Promise.all([listMediaAction(siteId), listImageAltAction(siteId)]);
    setAssets(a);
    setPlacements(p);
  };

  useEffect(() => {
    let live = true;
    Promise.all([listMediaAction(siteId), listImageAltAction(siteId)])
      .then(([a, p]) => {
        if (!live) return;
        setAssets(a);
        setPlacements(p);
      })
      .catch(() => live && setError("Couldn't load your images."));
    return () => {
      live = false;
    };
  }, [siteId]);

  /*
   * One at a time. A client dropping twenty photographs from a phone would
   * otherwise open twenty connections and time most of them out.
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
          // Cleared on success, so one oversized file does not leave a
          // failure standing over four that arrived perfectly well.
          setError(null);
          setAssets((prev) => [result.asset, ...(prev ?? []).filter((a) => a.id !== result.asset.id)]);
        }
      } catch {
        setError("That upload didn't finish.");
      }
      setUploading((n) => n - 1);
    }
  }

  const generate = async (scope: "missing" | "all") => {
    setConfirmAll(false);
    setNote(null);
    setError(null);
    setWorking(scope === "all" ? "Writing alt text for every picture…" : "Writing the missing alt text…");
    try {
      const result = await generateImageAltAction({ siteId, scope });
      if (result.ok) {
        setNote(result.message);
        await load();
      } else setError(result.message);
    } catch {
      setError("I couldn't reach the model. Nothing was changed.");
    } finally {
      setWorking(null);
    }
  };

  /* Placed first — those are the ones that ship — then the rest of the library. */
  const placedUrls = new Set((placements ?? []).map((p) => p.url));
  const rows: Row[] = [
    ...(placements ?? []).map((p): Row => ({ kind: "placed", key: `p:${p.pageId}:${p.path}`, placement: p })),
    ...(assets ?? [])
      .filter((a) => !placedUrls.has(a.url))
      .map((a): Row => ({ kind: "unused", key: `a:${a.id}`, asset: a })),
  ];
  const missingCount = (placements ?? []).filter((p) => p.needsAlt).length;
  const loaded = assets !== null && placements !== null;

  return (
    <div
      className={styles.imagesTab}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <header className={styles.seoHead}>
        <div>
          <h2 className={styles.seoTitle}>Images</h2>
          <p className={styles.seoLede}>
            Everything on your pages, and anything uploaded and not yet used. Alt text is what a
            screen reader says in place of a picture. <strong>Publish to apply changes.</strong>
          </p>
        </div>
        <div className={styles.seoActions}>
          <button
            type="button"
            className={styles.seoGenerateGhost}
            onClick={() => fileInput.current?.click()}
            disabled={uploading > 0}
          >
            {uploading > 0 ? `Uploading ${uploading}…` : "Upload images"}
          </button>
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
              disabled={!!working || rows.length === 0}
              onClick={() => setConfirmAll(true)}
              title="Rewrites the alt text on every picture, including any you wrote yourself"
            >
              Generate for all…
            </button>
          )}
        </div>
      </header>

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

      {error && <p className={styles.mediaError}>{error}</p>}
      {note && <p className={styles.seoNote}>{note}</p>}
      {!loaded && !error && <p className={styles.mediaHint}>Loading your images…</p>}

      {loaded && rows.length === 0 && (
        <div className={styles.mediaEmpty}>
          <p>No images yet.</p>
          <p className={styles.mediaHint}>
            Drop them here, or use Upload images. They stay in your library until you place them —
            only the ones on your pages are copied to WordPress when you publish.
          </p>
        </div>
      )}

      {loaded && rows.length > 0 && (
        <ul className={styles.altList}>
          {rows.map((row) => {
            const url = row.kind === "placed" ? row.placement.url : row.asset.url;
            const alt =
              row.kind === "placed"
                ? row.placement.needsAlt
                  ? ""
                  : row.placement.alt
                : (row.asset.alt ?? "");
            const where =
              row.kind === "placed"
                ? `${row.placement.sectionName} · ${row.placement.pageTitle}`
                : "In your library, not used on a page yet";

            return (
              <li key={row.key} className={styles.altRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.altThumb} src={url} alt="" loading="lazy" />
                <div className={styles.altFields}>
                  <span className={styles.altWhere}>{where}</span>
                  <AltField
                    key={`${row.key}:${alt}`}
                    value={alt}
                    disabled={busy}
                    onCommit={async (next) => {
                      if (row.kind === "placed") {
                        const result = await setImageAltAction({
                          siteId,
                          pageId: row.placement.pageId,
                          path: row.placement.path,
                          alt: next,
                        });
                        if (!result.ok) setError(result.message ?? "That didn't save.");
                      } else {
                        await setMediaAltAction({ siteId, assetId: row.asset.id, alt: next });
                      }
                      await load();
                    }}
                  />
                </div>
                {/*
                  Only an unused file can be removed here. A placed one is
                  still on a page: removing it from the library would leave a
                  hole in the middle of a page the client has not looked at.
                  Changing that picture is done on the page.
                */}
                {row.kind === "unused" && (
                  <button
                    type="button"
                    className={styles.mediaRemove}
                    title="Remove from your library"
                    aria-label={`Remove ${row.asset.filename}`}
                    onClick={() => {
                      setAssets((prev) => prev?.filter((a) => a.id !== row.asset.id) ?? prev);
                      void deleteMediaAction({ siteId, assetId: row.asset.id });
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dragging && <div className={styles.mediaDrop}>Drop to upload</div>}
    </div>
  );
}

/** One alt field, committed on blur. */
function AltField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void | Promise<void>;
}) {
  /*
   * Seeded once; the parent changes the key when the stored value changes, so
   * there is no effect to run at the wrong moment.
   */
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="text"
      className={styles.seoInput}
      value={draft}
      disabled={disabled}
      placeholder="What is in this picture?"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value.trim() && void onCommit(draft)}
    />
  );
}
