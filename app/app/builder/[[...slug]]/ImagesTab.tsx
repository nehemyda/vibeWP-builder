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
  clearImagePlacementAction,
  generateImageAltAction,
  generateOneImageMetaAction,
  listImageAltAction,
  setImageMetaAction,
  type ImagePlacement,
  type OneTarget,
} from "@/app/actions/image-alt";
import { DeleteImageDialog, type DeleteTarget } from "./DeleteImageDialog";
import { galleryPage } from "@/lib/design/gallery-page";
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
 * WHY DELETING IS A LIBRARY OPERATION AND NOT A PAGE ONE
 *
 * Removing a picture here removes it from the LIBRARY. It does not take it
 * off a page that uses it, and the confirmation says so rather than implying
 * otherwise: the export walks each page's own schema by URL and never
 * consults the library, so a page keeps its photograph until someone changes
 * it on the page.
 *
 * Cascading would be the other choice and it is the wrong one — most sections
 * are not valid without their photograph, so "delete this file" would quietly
 * become "break the hero on two pages".
 * ─────────────────────────────────────────────────────────────────────
 */

/*
 * Twenty a page — five rows of the four-across grid.
 *
 * Paged in the browser, not the database: the tab counts need the whole set
 * anyway, and listImageAltAction has to walk every page's schema to find the
 * placements at all, so there is no query to paginate. That holds while a
 * site's pictures number in the hundreds; a library in the thousands would
 * need the fetch itself to page, and this is the line to revisit.
 */
const PER_PAGE = 20;

type Row =
  | { kind: "placed"; key: string; placement: ImagePlacement }
  | { kind: "unused"; key: string; asset: MediaAsset };

export function ImagesTab({
  siteId,
  busy,
  onPagesChanged,
}: {
  siteId: string;
  busy?: boolean;
  /**
   * Called after this panel changes a PAGE, so the canvas underneath can
   * repaint. Alt and title writes change a page too, but invisibly; taking a
   * photograph off one does not.
   */
  onPagesChanged?: () => void | Promise<void>;
}) {
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
  /*
   * What is typed in the search box, and which page of results is showing.
   *
   * Both narrow the SAME list the filter tabs narrow, and paging is applied
   * last — so the page number belongs to the filtered, searched result and not
   * to the library. Which is why every control that changes the result resets
   * it to 1: staying on page 5 of a set that now has two pages is the classic
   * way a search box appears to return nothing.
   */
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  /*
   * The picture awaiting a delete confirmation, and what deleting it means.
   *
   * Everything the dialog needs is computed when it opens rather than fetched
   * then: the placements and the library are both already loaded, and a
   * dialog that has to go to the server before it can say what you are about
   * to do is a dialog people click through.
   */
  const [deleting, setDeleting] = useState<
    | { target: DeleteTarget; run: () => Promise<{ ok: boolean; message?: string }>; label: string }
    | null
  >(null);
  const [removing, setRemoving] = useState(false);
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
  /*
   * Library file by URL, so a PLACED card can offer removal too.
   *
   * It could not before: the grid split rows into placed and unused, and only
   * the unused branch drew the button — so a picture that had been uploaded
   * AND used had no way to be removed at all, which is the gap this closes.
   * A placed card with no entry here is a stock photograph that was never in
   * the library, and there is nothing to remove.
   */
  const assetByUrl = new Map((assets ?? []).map((a) => [a.url, a] as const));
  const missingAlt =
    (placements ?? []).filter((p) => p.needsAlt).length +
    unusedAssets.filter((a) => !a.alt?.trim()).length;
  const missingTitle =
    (placements ?? []).filter((p) => p.needsTitle).length +
    unusedAssets.filter((a) => !a.title?.trim()).length;
  /*
   * Confirmed removal.
   *
   * The dialog carries its own action, so this does not have to know which of
   * the two kinds it is running — and cannot get them the wrong way round.
   *
   * Awaited, unlike the fire-and-forget it replaces: that removed the card
   * from the screen and then dropped any failure on the floor, so a delete
   * the server refused looked exactly like one it accepted until the next
   * reload put the picture back.
   */
  const confirmDelete = async () => {
    if (!deleting) return;
    const { run, label } = deleting;
    setRemoving(true);
    setError(null);
    try {
      const result = await run();
      setDeleting(null);
      if (result.ok) setNote(label);
      else setError(result.message ?? "That didn't work. Nothing was changed.");
      await load();
    } catch {
      setError("That didn't work. Nothing was changed.");
      setDeleting(null);
    } finally {
      setRemoving(false);
    }
  };

  /*
   * What the delete icon on this card does.
   *
   * ONE rule: it removes the picture from where the card's own subtitle says
   * it is. A placement card is a photograph on a page, so it comes off that
   * page; a library card is a file, so it leaves the library. Deciding it here
   * rather than at the button keeps the choice, the confirmation copy and the
   * action that runs in one place — three things that must agree.
   */
  const deleteFor = (row: Row, libraryFile: MediaAsset | undefined) => {
    if (row.kind === "placed") {
      const p = row.placement;
      return {
        target: {
          kind: "placement" as const,
          url: p.url,
          where: `${p.sectionName} · ${p.pageTitle}`,
          alsoInLibrary: Boolean(libraryFile),
        },
        run: async () => {
          const result = await clearImagePlacementAction({
            siteId,
            pageId: p.pageId,
            path: p.path,
          });
          /* Only on success — a refused write left the page as it was. */
          if (result.ok) await onPagesChanged?.();
          return result;
        },
        label: `Took the picture off the ${p.sectionName} on ${p.pageTitle}. Publish to apply it.`,
      };
    }
    return {
      target: {
        kind: "library" as const,
        asset: row.asset,
        used: (placements ?? []).filter((x) => x.url === row.asset.url),
      },
      run: () => deleteMediaAction({ siteId, assetId: row.asset.id }),
      label: `Removed “${row.asset.filename}” from your library.`,
    };
  };

  /* Placed first — those are the ones that ship — then the rest of the library. */
  const allRows: Row[] = [
    ...(placements ?? []).map((p): Row => ({ kind: "placed", key: `p:${p.pageId}:${p.path}`, placement: p })),
    ...unusedAssets.map((a): Row => ({ kind: "unused", key: `a:${a.id}`, asset: a })),
  ];
  const isMissing = (r: Row) =>
    r.kind === "placed"
      ? r.placement.needsAlt || r.placement.needsTitle
      : !r.asset.alt?.trim() || !r.asset.title?.trim();

  /*
   * Everything a person can see on a card is searchable, because that is what
   * they will type: the file's name, the words they wrote in either field, and
   * where it sits. Searching filenames alone would miss every stock photograph
   * on the site — those have no filename a client has ever seen.
   */
  const searchable = (r: Row) =>
    (r.kind === "placed"
      ? [r.placement.alt, r.placement.title, r.placement.sectionName, r.placement.pageTitle]
      : [r.asset.filename, r.asset.alt, r.asset.title]
    )
      .filter(Boolean)
      .join(" ");

  const {
    rows,
    matched,
    pageCount,
    page: current,
  } = galleryPage(allRows, {
    keep: filter === "missing" ? isMissing : undefined,
    query,
    searchable,
    page,
    perPage: PER_PAGE,
  });
  const searching = query.trim().length > 0;
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
        <div className={styles.imageTools}>
          <div className={styles.seoFilters}>
            <button
              type="button"
              className={`${styles.seoFilter} ${filter === "missing" ? styles.seoFilterOn : ""}`}
              aria-pressed={filter === "missing"}
              onClick={() => {
                setFilter("missing");
                setPage(1);
              }}
            >
              Missing alt or title ({allRows.filter(isMissing).length})
            </button>
            <button
              type="button"
              className={`${styles.seoFilter} ${filter === "all" ? styles.seoFilterOn : ""}`}
              aria-pressed={filter === "all"}
              onClick={() => {
                setFilter("all");
                setPage(1);
              }}
            >
              All images ({allRows.length})
            </button>
          </div>

          {/*
            Search sits with the filters because it does the same job — it
            narrows the same list — and putting it above the grid instead
            would read as a second, separate control over something else.
          */}
          <label className={styles.imageSearch}>
            <span className={styles.srOnly}>Search your pictures</span>
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
              value={query}
              placeholder="Search name, alt, title or page"
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            {query && (
              <button
                type="button"
                className={styles.imageSearchClear}
                aria-label="Clear the search"
                onClick={() => {
                  setQuery("");
                  setPage(1);
                }}
              >
                ✕
              </button>
            )}
          </label>
        </div>
      )}

      {/*
        Three different empty results, said three different ways. One message
        for all of them would tell a client searching for "bread" that every
        picture has alt text, which is both untrue and unhelpful.
      */}
      {loaded && allRows.length > 0 && matched.length === 0 && (
        <p className={styles.mediaHint}>
          {searching ? (
            <>
              Nothing matches “{query.trim()}”
              {filter === "missing" ? " among the pictures missing alt text or a title" : ""}.
            </>
          ) : (
            "Every picture has alt text and a title."
          )}
        </p>
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

            /*
             * The library file behind this card, if there is one. A placed row
             * is matched by URL because a placement stores the URL, not an
             * asset id.
             */
            const libraryFile = row.kind === "unused" ? row.asset : assetByUrl.get(url);

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
                {/*
                  The thumbnail and the delete icon share a wrapper so the icon
                  anchors to the PICTURE rather than to the card's padding box.
                  Positioning it against the card meant guessing an offset that
                  a change to the padding would silently break.
                */}
                <span className={styles.imageThumbWrap}>
                  <button
                    type="button"
                    className={styles.imageThumbBtn}
                    title="View the full picture"
                    onClick={() => setViewing({ url, label: where })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" loading="lazy" />
                  </button>

                  {/*
                    On EVERY card, because the grid is one list and a control
                    that appears on some of them reads as broken. What it
                    removes depends on what the card is, and the dialog says
                    which — see DeleteImageDialog.

                    Always visible, never hover-only: the section menu's ⋯
                    shipped faint and the report was that it could not be
                    seen. A control behind a hover is the same fault with an
                    extra step, and on a touch screen there is no hover at all.
                  */}
                  <button
                    type="button"
                    className={styles.imageDelete}
                    disabled={busy || removing}
                    aria-label={
                      row.kind === "placed"
                        ? `Take this picture off ${where}`
                        : "Remove this picture from your library"
                    }
                    title={row.kind === "placed" ? "Take off the page" : "Remove from library"}
                    onClick={() => setDeleting(deleteFor(row, libraryFile))}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      {/* A bin: lid, body, two staves. Drawn rather than a
                          glyph, so it cannot land on a font that lacks it. */}
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

              </li>
            );
          })}
        </ul>
      )}

      {/*
        The pager.

        The arrows appear only when there is more than one page, because a
        pager over a single page is furniture. The count line stays whenever
        anything is listed — "Showing 1–20 of 47" is what tells you a pager
        exists at all, before you have scrolled far enough to see it.
      */}
      {loaded && matched.length > 0 && (
        <div className={styles.pager}>
          <span className={styles.pagerCount}>
            {matched.length <= PER_PAGE
              ? `${matched.length} picture${matched.length === 1 ? "" : "s"}`
              : `Showing ${(current - 1) * PER_PAGE + 1}–${Math.min(
                  current * PER_PAGE,
                  matched.length,
                )} of ${matched.length}`}
          </span>

          {pageCount > 1 && (
            <div className={styles.pagerBtns}>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                ‹ Previous
              </button>
              {/*
                Numbered, because "the third page" is a place a client comes
                back to. Capped at nine so a large library cannot push the row
                wider than the panel; past that the arrows and a position
                carry it.
              */}
              {pageCount <= 9 ? (
                Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.pagerNum} ${n === current ? styles.pagerNumOn : ""}`}
                    aria-current={n === current ? "page" : undefined}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))
              ) : (
                <span className={styles.pagerAt}>
                  {current} / {pageCount}
                </span>
              )}
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={current >= pageCount}
                onClick={() => setPage(current + 1)}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}

      {deleting && (
        <DeleteImageDialog
          target={deleting.target}
          removing={removing}
          onKeep={() => setDeleting(null)}
          onRemove={() => void confirmDelete()}
        />
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
