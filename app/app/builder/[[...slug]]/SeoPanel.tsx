"use client";

import { useEffect, useState } from "react";
import { listPageSeoAction, savePageSeoAction, type PageSeo } from "@/app/actions/seo";
import { DESC_LIMIT, TITLE_LIMIT } from "@/lib/seo/limits";
import styles from "./builder.module.css";

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
      await savePageSeoAction({
        siteId,
        pageId: page.id,
        metaTitle: patch.metaTitle ?? undefined,
        metaDescription: patch.metaDescription ?? undefined,
        noIndex: patch.noIndex,
      });
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
  const shown = (pages ?? []).filter((p) =>
    filter === "all" ? true : filter === "attention" ? p.warnings.length > 0 : missing(p),
  );
  const missingCount = (pages ?? []).filter(missing).length;
  const attentionCount = (pages ?? []).filter((p) => p.warnings.length > 0).length;

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
      </header>

      {error && <p className={styles.mediaError}>{error}</p>}
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
                onClick={() => setFilter(key)}
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

          <ul className={styles.seoList}>
            {shown.map((page) => (
              <li key={page.id} className={styles.seoRow}>
                <div className={styles.seoPage}>
                  <strong>{page.title}</strong>
                  <span className={styles.seoSlug}>/{page.slug === "home" ? "" : page.slug}</span>
                  {page.generated && <span className={styles.seoBadge}>Written by AI</span>}
                  {saving.has(page.id) && <span className={styles.seoBadge}>Saving…</span>}
                </div>

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

                <label className={styles.seoNoIndex}>
                  <input
                    type="checkbox"
                    checked={page.noIndex}
                    onChange={(e) => void save(page, { noIndex: e.target.checked })}
                  />
                  <span>Hide from search engines</span>
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
        <span>{label}</span>
        <span className={over ? styles.seoCountOver : styles.seoCount}>
          {draft.trim().length}/{limit}
        </span>
      </span>
      {multiline ? <textarea rows={2} {...props} /> : <input type="text" {...props} />}
    </label>
  );
}
