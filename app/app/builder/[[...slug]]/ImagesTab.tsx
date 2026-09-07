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
  generateOneImageMetaAction,
  listImageAltAction,
  setImageMetaAction,
  type ImagePlacement,
  type OneTarget,
} from "@/app/actions/image-alt";
import styles from "./builder.module.css";

/**
 * Every picture on the site, as a grid: upload, alt text, title, delete.
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
 * WHY A GRID AND NOT ROWS
 *
 * A row per picture put one thumbnail beside a wide text field, so a screen
 * showed six pictures and a great deal of white. Pictures are found by
 * looking, so the grid shows four across and the fields sit under each one —
 * and a click opens the full photograph, because a 4-across thumbnail is for
 * recognising, not for judging.
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
  const [menuOpen, setMenuOpen] = useState(false);
  /*
   * Which destructive command is awaiting confirmation, or null.
   *
   * A key rather than a boolean, because there are now three "rewrite
   * everything" commands and a shared flag would confirm whichever was asked
   * for last.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /* The picture being looked at full size, or null. */
  const [viewing, setViewing] = useState<{ url: string; label: string } | null>(null);
  /*
   * Which pictures are listed. Chosen when the rows arrive rather than fixed
   * at "missing", so a site where everything is filled in opens on its
   * pictures instead of an empty screen — the same fault the alt tab had.
   */
  const [filter, setFilter] = useState<"missing" | "all" | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLSpanElement | null>(null);

  /* Clicking away closes the menu — the same shape the section menu uses. */
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirming(null);
      }
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menuOpen]);

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
        const anyMissing =
          p.some((x) => x.needsAlt || x.needsTitle) ||
          a.some((x) => !x.alt?.trim() || !x.title?.trim());
        setFilter(anyMissing ? "missing" : "all");
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

  const generate = async (scope: "missing" | "all", field: "alt" | "title" | "both") => {
    setMenuOpen(false);
    setConfirming(null);
    setNote(null);
    setError(null);
    const what = field === "both" ? "alt text and titles" : field === "alt" ? "alt text" : "titles";
    setWorking(scope === "all" ? `Rewriting ${what}…` : `Writing the missing ${what}…`);
    try {
      const result = await generateImageAltAction({ siteId, scope, field });
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

  /*
   * Counted across BOTH kinds, because generation acts on both. Counting only
   * placements is what made a command claim one candidate and then report
   * that nothing was written.
   */
  const placedUrlSet = new Set((placements ?? []).map((p) => p.url));
  const unusedAssets = (assets ?? []).filter((a) => !placedUrlSet.has(a.url));
  const missingAlt =
    (placements ?? []).filter((p) => p.needsAlt).length +
    unusedAssets.filter((a) => !a.alt?.trim()).length;
  const missingTitle =
    (placements ?? []).filter((p) => p.needsTitle).length +
    unusedAssets.filter((a) => !a.title?.trim()).length;
  /* Placed first — those are the ones that ship — then the rest of the library. */
  const allRows: Row[] = [
    ...(placements ?? []).map((p): Row => ({ kind: "placed", key: `p:${p.pageId}:${p.path}`, placement: p })),
    ...unusedAssets.map((a): Row => ({ kind: "unused", key: `a:${a.id}`, asset: a })),
  ];
  const isMissing = (r: Row) =>
    r.kind === "placed"
      ? r.placement.needsAlt || r.placement.needsTitle
      : !r.asset.alt?.trim() || !r.asset.title?.trim();
  const rows = filter === "missing" ? allRows.filter(isMissing) : allRows;
  const loaded = assets !== null && placements !== null;

  /*
   * The commands, grouped by field the way the reference groups them. Every
   * one is field × scope, so the menu is the whole matrix rather than a
   * selection of it — a client who wants only titles rewritten should not
   * have to work out that "rewrite all" would also redo their alt text.
   */
  const COMMANDS: Array<{
    group: string;
    items: Array<{ key: string; label: string; scope: "missing" | "all"; field: "alt" | "title" | "both"; count?: number }>;
  }> = [
    {
      group: "Alt text",
      items: [
        { key: "alt-missing", label: "Pictures missing alt text", scope: "missing", field: "alt", count: missingAlt },
        { key: "alt-all", label: "Rewrite every picture", scope: "all", field: "alt" },
      ],
    },
    {
      group: "Title",
      items: [
        { key: "title-missing", label: "Pictures missing a title", scope: "missing", field: "title", count: missingTitle },
        { key: "title-all", label: "Rewrite every picture", scope: "all", field: "title" },
      ],
    },
    {
      group: "Both",
      items: [
        { key: "both-missing", label: "Fill anything missing", scope: "missing", field: "both" },
        { key: "both-all", label: "Rewrite everything", scope: "all", field: "both" },
      ],
    },
  ];

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
          {/*
            Upload is the filled primary. Getting pictures in is the thing a
            client does first and most, and it had been the palest button on
            the row — a ghost beside two darker ones, which reads as the least
            important of the three.
          */}
          <button
            type="button"
            className={styles.seoGenerate}
            onClick={() => fileInput.current?.click()}
            disabled={uploading > 0}
          >
            {uploading > 0 ? `Uploading ${uploading}…` : "Upload images"}
          </button>

          <span className={styles.genWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.genBtn}
              disabled={!!working || rows.length === 0}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {working ?? "Generate with AI"}
              <span className={styles.genCaret} aria-hidden="true">
                ⌄
              </span>
            </button>

            {menuOpen && (
              <div className={styles.genMenu} role="menu">
                {COMMANDS.map((section) => (
                  <div key={section.group}>
                    <span className={styles.genGroup}>{section.group}</span>
                    {section.items.map((item) => {
                      const empty = item.count === 0;
                      /*
                       * A rewrite asks first, in place, because there is no
                       * undo on a description beyond typing it again. Filling
                       * blanks does not — it takes nothing away.
                       */
                      if (confirming === item.key) {
                        return (
                          <span key={item.key} className={styles.genConfirm}>
                            <button
                              type="button"
                              className={styles.genConfirmYes}
                              onClick={() => void generate(item.scope, item.field)}
                            >
                              Replace them
                            </button>
                            <button type="button" onClick={() => setConfirming(null)}>
                              Cancel
                            </button>
                          </span>
                        );
                      }
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="menuitem"
                          disabled={empty}
                          title={empty ? "Nothing is missing" : undefined}
                          onClick={() =>
                            item.scope === "all"
                              ? setConfirming(item.key)
                              : void generate(item.scope, item.field)
                          }
                        >
                          <span>{item.label}</span>
                          {item.count !== undefined && (
                            <span className={styles.genCount}>{item.count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </span>
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

      {loaded && allRows.length > 0 && (
        <div className={styles.seoFilters}>
          <button
            type="button"
            className={`${styles.seoFilter} ${filter === "missing" ? styles.seoFilterOn : ""}`}
            aria-pressed={filter === "missing"}
            onClick={() => setFilter("missing")}
          >
            Missing alt or title ({allRows.filter(isMissing).length})
          </button>
          <button
            type="button"
            className={`${styles.seoFilter} ${filter === "all" ? styles.seoFilterOn : ""}`}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All images ({allRows.length})
          </button>
        </div>
      )}

      {loaded && allRows.length > 0 && rows.length === 0 && (
        <p className={styles.mediaHint}>Every picture has alt text and a title.</p>
      )}

      {loaded && allRows.length === 0 && (
        <div className={styles.mediaEmpty}>
          <p>No images yet.</p>
          <p className={styles.mediaHint}>
            Drop them here, or use Upload images. They stay in your library until you place them —
            only the ones on your pages are copied to WordPress when you publish.
          </p>
        </div>
      )}

      {loaded && rows.length > 0 && (
        <ul className={styles.imageGrid}>
          {rows.map((row) => {
            const url = row.kind === "placed" ? row.placement.url : row.asset.url;
            const alt =
              row.kind === "placed"
                ? row.placement.needsAlt
                  ? ""
                  : row.placement.alt
                : (row.asset.alt ?? "");
            const title = row.kind === "placed" ? row.placement.title : (row.asset.title ?? "");
            const where =
              row.kind === "placed"
                ? `${row.placement.sectionName} · ${row.placement.pageTitle}`
                : "Not used on a page yet";

            const target: OneTarget =
              row.kind === "placed"
                ? { kind: "placed", pageId: row.placement.pageId, path: row.placement.path }
                : { kind: "unused", assetId: row.asset.id };

            const generateOne = async (field: "alt" | "title") => {
              setError(null);
              const result = await generateOneImageMetaAction({ siteId, target, field });
              if (!result.ok) setError(result.message);
              await load();
            };

            const commit = async (patch: { alt?: string; title?: string }) => {
              if (row.kind === "placed") {
                const result = await setImageMetaAction({
                  siteId,
                  pageId: row.placement.pageId,
                  path: row.placement.path,
                  ...patch,
                });
                if (!result.ok) setError(result.message ?? "That didn't save.");
              } else {
                await setMediaAltAction({ siteId, assetId: row.asset.id, ...patch });
              }
              await load();
            };

            return (
              <li key={row.key} className={styles.imageCard}>
                <button
                  type="button"
                  className={styles.imageThumbBtn}
                  title="View the full picture"
                  onClick={() => setViewing({ url, label: where })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" loading="lazy" />
                </button>

                <span className={styles.imageWhere}>{where}</span>

                <Field
                  key={`${row.key}:alt:${alt}`}
                  label="Alt text"
                  hint="What a screen reader says instead of the picture"
                  value={alt}
                  disabled={busy}
                  onCommit={(v) => void commit({ alt: v })}
                  onGenerate={() => generateOne("alt")}
                  generateHint="Write this from the picture"
                />
                <Field
                  key={`${row.key}:title:${title}`}
                  label="Title"
                  hint="Shown on hover. Not a second alt text."
                  value={title}
                  disabled={busy}
                  onCommit={(v) => void commit({ title: v })}
                  onGenerate={() => generateOne("title")}
                  generateHint="Name this from the picture"
                />

                {/*
                  Only an unused file can be removed here. A placed one is
                  still on a page: removing it from the library would leave a
                  hole in a page the client has not looked at. Changing that
                  picture is done on the page.
                */}
                {row.kind === "unused" && (
                  <button
                    type="button"
                    className={styles.imageRemove}
                    onClick={() => {
                      setAssets((prev) => prev?.filter((a) => a.id !== row.asset.id) ?? prev);
                      void deleteMediaAction({ siteId, assetId: row.asset.id });
                    }}
                  >
                    Remove from library
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        The lightbox. Its own overlay inside the dashboard rather than a second
        dialog: it is a bigger look at something already on screen, so it
        closes on anything — the backdrop, the button, Escape.
      */}
      {viewing && (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`Picture from ${viewing.label}`}
          onClick={() => setViewing(null)}
          onKeyDown={(e) => e.key === "Escape" && setViewing(null)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing.url} alt="" />
          <span className={styles.lightboxWhere}>{viewing.label}</span>
          <button type="button" className={styles.lightboxClose} aria-label="Close">
            ✕
          </button>
        </div>
      )}

      {dragging && <div className={styles.mediaDrop}>Drop to upload</div>}
    </div>
  );
}

/**
 * One labelled field, committed on blur, with its own generate button.
 *
 * The button sits INSIDE the input's right edge rather than beside it. Beside
 * it would cost the field a fifth of its width in a 228px card, and the thing
 * being generated is the field's own contents — so it belongs in the field,
 * the way a password reveal or a search clear does.
 */
function Field({
  label,
  hint,
  value,
  disabled,
  onCommit,
  onGenerate,
  generateHint,
}: {
  label: string;
  hint: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void | Promise<void>;
  onGenerate?: () => Promise<void>;
  generateHint?: string;
}) {
  /*
   * Seeded once; the parent changes the key when the stored value changes, so
   * there is no effect to run at the wrong moment.
   */
  const [draft, setDraft] = useState(value);
  const [thinking, setThinking] = useState(false);

  return (
    <label className={styles.imageField}>
      <span className={styles.imageFieldLabel} title={hint}>
        {label}
      </span>
      <span className={styles.imageInputWrap}>
        <input
          type="text"
          className={`${styles.seoInput} ${onGenerate ? styles.imageInputWithBtn : ""}`}
          value={thinking ? "" : draft}
          disabled={disabled || thinking}
          placeholder={thinking ? "Looking at the picture…" : hint}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== value.trim() && void onCommit(draft)}
        />
        {onGenerate && (
          <button
            type="button"
            className={styles.imageGenBtn}
            disabled={disabled || thinking}
            title={generateHint}
            aria-label={generateHint}
            /*
             * mousedown, not click. The button sits inside a focused input, so
             * a click would blur it first — and blur commits, which would save
             * the old text over whatever the model is about to write.
             */
            onMouseDown={async (e) => {
              e.preventDefault();
              setThinking(true);
              try {
                await onGenerate();
              } finally {
                setThinking(false);
              }
            }}
          >
            {thinking ? <span className={styles.imageGenSpin} aria-hidden="true" /> : "✦"}
          </button>
        )}
      </span>
    </label>
  );
}
