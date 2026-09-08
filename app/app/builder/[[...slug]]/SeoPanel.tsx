"use client";

import { useEffect, useState } from "react";
import {
  generatePageMetaAction,
  listPageSeoAction,
  savePageSeoAction,
  type PageSeo,
} from "@/app/actions/seo";
import { DESC_LIMIT, TITLE_LIMIT } from "@/lib/seo/limits";
import { galleryPage } from "@/lib/design/gallery-page";
import styles from "./builder.module.css";

/*
 * Twenty a page, the same count and the same reasoning as the Images tab:
 * enough that a site with a normal handful of pages never sees a pager at
 * all, and a bound so a site with a great many pages does not render them
 * all into one DOM at once.
 */
const PER_PAGE = 20;

/**
 * Titles and descriptions for every page, in one table.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A TABLE AND NOT A FIELD ON EACH PAGE
 *
 * Meta tags are written per page and judged across the site. Whether a title
 * is good depends on what the other eight say — two pages competing for the
 * same query is a fact about the pair, not about either one — so they have to
 * be readable together, and one at a time is how a site ends up with nine
 * titles that all begin with the business name.
 *
 * WHY THE COUNTS ARE ADVICE
 *
 * 60 and 160 are roughly where Google truncates, not rules, and it rewrites
 * titles a good share of the time anyway. So over-length is flagged in the
 * counter and still saved. Refusing it would claim a precision nobody has.
 *
 * WHY IT SAYS "PUBLISH TO APPLY"
 *
 * These values reach the live site through post meta written on export. Saved
 * here, they change nothing until the site is published — which is worth
 * saying once at the top rather than letting a client discover it by checking
 * their live page and finding the old description.
 * ─────────────────────────────────────────────────────────────────────
 */

type Filter = "missing" | "all" | "attention";

export function SeoPanel({ siteId }: { siteId: string }) {
  const [pages, setPages] = useState<PageSeo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("missing");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* Overwriting what the client typed asks first. Filling blanks does not. */
  const [confirmAll, setConfirmAll] = useState(false);
  /*
   * Which page of the FILTERED list is showing. Reset to 1 wherever the
   * filter changes — staying on page 3 of a tab that now has one page is the
   * classic way a filter appears to return nothing.
   */
  const [page, setPage] = useState(1);

  const generate = async (scope: "missing" | "all") => {
    setConfirmAll(false);
    setNote(null);
    setError(null);
    setWorking(scope === "all" ? "Rewriting every page…" : "Writing the missing ones…");
    try {
      const result = await generatePageMetaAction({ siteId, scope });
      if (result.ok) {
        setNote(result.message);
        setPages(await listPageSeoAction(siteId));
      } else {
        setError(result.message);
      }
    } catch {
      setError("I couldn't reach the model. Nothing was changed.");
    } finally {
      setWorking(null);
    }
  };

  useEffect(() => {
    let live = true;
    listPageSeoAction(siteId)
      .then((rows) => live && setPages(rows))
      .catch(() => live && setError("Couldn't load your pages."));
    return () => {
      live = false;
    };
  }, [siteId]);

  /*
   * Saved on blur, not on every keystroke. A meta description is written in
   * one go and a save per character would be a hundred writes for one
   * sentence — and would make the "generated" flag flicker off mid-word.
   */
  const save = async (page: PageSeo, patch: Partial<PageSeo>) => {
    setPages((prev) => prev?.map((p) => (p.id === page.id ? { ...p, ...patch } : p)) ?? prev);
    setSaving((prev) => new Set(prev).add(page.id));
    try {
      const result = await savePageSeoAction({
        siteId,
        pageId: page.id,
        metaTitle: patch.metaTitle ?? undefined,
        metaDescription: patch.metaDescription ?? undefined,
        focusKeyword: patch.focusKeyword ?? undefined,
        canonicalUrl: patch.canonicalUrl ?? undefined,
        noIndex: patch.noIndex,
      });
      // A refusal is shown rather than swallowed: a canonical the server
      // would not store must not look saved.
      if (!result.ok && result.message) setError(result.message);
      /*
       * Re-read afterwards, because the warnings are computed across the whole
       * site: fixing a duplicate title on this page also clears the warning on
       * the page it was duplicating, and that row is not the one being edited.
       */
      setPages(await listPageSeoAction(siteId));
    } catch {
      setError("That didn't save.");
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(page.id);
        return next;
      });
    }
  };

  const missing = (p: PageSeo) => !p.metaTitle?.trim() || !p.metaDescription?.trim();
  const missingCount = (pages ?? []).filter(missing).length;
  const attentionCount = (pages ?? []).filter((p) => p.warnings.length > 0).length;

  /*
   * galleryPage does the filtering and the paging in one step — the same
   * function the Images tab uses, so the two panels page the same way rather
   * than two implementations that could quietly drift apart. There is no
   * search box here, so query is always empty and the search half of it is
   * simply never exercised.
   */
  const {
    rows: shown,
    matched,
    pageCount,
    page: current,
  } = galleryPage(pages ?? [], {
    keep: filter === "all" ? undefined : filter === "attention" ? (p) => p.warnings.length > 0 : missing,
    query: "",
    searchable: () => "",
    page,
    perPage: PER_PAGE,
  });

  return (
    <div className={styles.seoWrap}>
      <header className={styles.seoHead}>
        <div>
          <h2 className={styles.seoTitle}>Page SEO</h2>
          <p className={styles.seoLede}>
            The title and description search engines show for each page.{" "}
            <strong>Publish to apply them</strong> — they reach your live site when the site is
            published.
          </p>
        </div>

        {/*
          Two commands, and the difference is on the buttons rather than in a
          tooltip: one fills blanks, the other replaces what you wrote.
        */}
        <div className={styles.seoActions}>
          <button
            type="button"
            className={styles.seoGenerate}
            disabled={!!working}
            onClick={() => void generate("missing")}
          >
            {working ?? "Write the missing ones"}
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
              title="Rewrites every page, including anything you have typed"
            >
              Rewrite all pages…
            </button>
          )}
        </div>
      </header>

      {error && <p className={styles.mediaError}>{error}</p>}
      {note && <p className={styles.seoNote}>{note}</p>}
      {/* Not while an error is showing: "it failed" and "still loading" at once
          is two contradictory answers to the same question. */}
      {pages === null && !error && <p className={styles.mediaHint}>Loading your pages…</p>}

      {pages && (
        <>
          <div className={styles.seoFilters}>
            {(
              [
                ["missing", `Missing (${missingCount})`],
                ["attention", `Needs attention (${attentionCount})`],
                ["all", `All pages (${pages.length})`],
              ] as Array<[Filter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`${styles.seoFilter} ${filter === key ? styles.seoFilterOn : ""}`}
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {shown.length === 0 && (
            <p className={styles.mediaHint}>
              {filter === "missing"
                ? "Every page has a title and a description."
                : filter === "attention"
                  ? "Nothing needs attention."
                  : "No pages yet."}
            </p>
          )}

          {/*
            Column headers for the wide layout only — builder.module.css hides
            this entirely below 1080px, where each page is still a stack of
            labelled fields. aria-hidden because the labels a screen reader
            needs are on each field itself (see seoFieldLabel); without this a
            wide-screen user would hear every heading twice, once here and
            once per row.
          */}
          {shown.length > 0 && (
            <div className={styles.seoTableHead} aria-hidden="true">
              <span>Page</span>
              <span>Focus keyword</span>
              <span>Title</span>
              <span>Description</span>
              <span>Canonical URL</span>
              <span>Hide from search engines</span>
            </div>
          )}

          <ul className={styles.seoList}>
            {shown.map((page) => (
              <li key={page.id} className={styles.seoRow}>
                <div className={styles.seoPage}>
                  <strong>{page.title}</strong>
                  <span className={styles.seoSlug}>/{page.slug === "home" ? "" : page.slug}</span>
                  {page.generated && <span className={styles.seoBadge}>Written by AI</span>}
                  {saving.has(page.id) && <span className={styles.seoBadge}>Saving…</span>}
                </div>

                {/*
                  The keyword comes FIRST, because it is what the two fields
                  below are written for. Read the other way round it looks like
                  a tag you add afterwards.
                */}
                <Field
                  key={`kw:${page.focusKeyword ?? ""}`}
                  label="Focus keyword"
                  limit={60}
                  value={page.focusKeyword ?? ""}
                  placeholder="e.g. celebration cakes bath"
                  onCommit={(v) => void save(page, { focusKeyword: v })}
                />
                <Field
                  key={`title:${page.metaTitle ?? ""}`}
                  label="Title"
                  limit={TITLE_LIMIT}
                  value={page.metaTitle ?? ""}
                  placeholder="e.g. Sourdough & Celebration Cakes in Bath"
                  onCommit={(v) => void save(page, { metaTitle: v })}
                />
                <Field
                  key={`desc:${page.metaDescription ?? ""}`}
                  label="Description"
                  limit={DESC_LIMIT}
                  multiline
                  value={page.metaDescription ?? ""}
                  placeholder="One sentence a person would click on."
                  onCommit={(v) => void save(page, { metaDescription: v })}
                />

                <Field
                  key={`canon:${page.canonicalUrl ?? ""}`}
                  label="Canonical URL"
                  limit={500}
                  value={page.canonicalUrl ?? ""}
                  placeholder="Leave empty unless this page copies another URL"
                  onCommit={(v) => void save(page, { canonicalUrl: v })}
                />

                <label className={styles.seoNoIndex}>
                  <input
                    type="checkbox"
                    checked={page.noIndex}
                    onChange={(e) => void save(page, { noIndex: e.target.checked })}
                  />
                  {/*
                    Visible below 1080px, where this is the only place the
                    words appear; hidden the same way seoFieldLabel is above
                    that, once the column header says it instead.
                  */}
                  <span className={styles.seoNoIndexText}>Hide from search engines</span>
                </label>

                {page.warnings.length > 0 && (
                  <ul className={styles.seoWarnings}>
                    {page.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {/*
            The pager. Same shape and the same classes as the Images tab's —
            one visual language for "there are more of these than fit on
            screen" rather than two.
          */}
          {matched.length > 0 && (
            <div className={styles.pager}>
              <span className={styles.pagerCount}>
                {matched.length <= PER_PAGE
                  ? `${matched.length} page${matched.length === 1 ? "" : "s"}`
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
        </>
      )}
    </div>
  );
}

/**
 * One field with a live count.
 *
 * Local state while typing, committed on blur. Controlled straight from the
 * server value would fight the caret on every keystroke, and committing on
 * every keystroke would be a write per character.
 */
function Field({
  label,
  value,
  limit,
  placeholder,
  multiline,
  onCommit,
}: {
  label: string;
  value: string;
  limit: number;
  placeholder: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  /*
   * The draft is seeded once and never synchronised by an effect.
   *
   * When the stored value changes under us — a save, or a generate filling
   * every page at once — the parent gives this field a new key, so it
   * remounts and re-seeds. That is the same result with no effect to run at
   * the wrong moment, and no setState during render for the linter to object
   * to. Safe because a save only happens on blur, so nobody is mid-word.
   */
  const [draft, setDraft] = useState(value);

  const over = draft.trim().length > limit;
  const props = {
    value: draft,
    placeholder,
    className: styles.seoInput,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: () => draft.trim() !== value.trim() && onCommit(draft),
  };

  return (
    <label className={styles.seoField}>
      <span className={styles.seoFieldHead}>
        <span className={styles.seoFieldLabel}>{label}</span>
        <span className={over ? styles.seoCountOver : styles.seoCount}>
          {draft.trim().length}/{limit}
        </span>
      </span>
      {/*
        3 rows, not 2 — the wide table layout gives description a narrower
        column than the field had at full width, so the same sentence wraps
        onto more lines. 2 clipped the tail of an ordinary description behind
        a scrollbar with no visual sign anything was hidden; 3 fits nearly all
        of them, and resize:vertical (on .seoInput) is there for the rest.
      */}
      {multiline ? <textarea rows={3} {...props} /> : <input type="text" {...props} />}
    </label>
  );
}
