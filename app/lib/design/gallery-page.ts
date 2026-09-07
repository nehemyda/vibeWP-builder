/**
 * Narrowing and paging a gallery.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A FUNCTION AND NOT SIX LINES IN THE COMPONENT
 *
 * It was six lines in the component, and the interesting cases are the ones
 * you cannot see by looking at a grid of seven pictures: the page number left
 * pointing past the end after a delete, the search that narrows five pages to
 * one while you are standing on page four, the boundary where exactly
 * PER_PAGE items must not produce a second, empty page.
 *
 * Out here they can be run against fifty fixtures in a second, which is the
 * only way I am going to know they hold.
 *
 * THE ORDER MATTERS AND IS DELIBERATE
 *
 * Filter, then search, then page — so a page number always belongs to the
 * result you can see rather than to the library behind it. Paging first would
 * mean searching within page one.
 * ─────────────────────────────────────────────────────────────────────
 */

export type GalleryPage<T> = {
  /** The items to draw, already sliced. */
  rows: T[];
  /** Everything that survived the filter and the search, before paging. */
  matched: T[];
  /** Never below 1, so "page 1 of 1" is what an empty result reads as. */
  pageCount: number;
  /**
   * The page actually being shown.
   *
   * Not necessarily the one asked for: a request past the end is clamped
   * rather than honoured. An out-of-range slice renders an empty grid, which
   * reads as a bug rather than as the end of a list — and it is reachable
   * without doing anything odd, by deleting the last picture on the last page
   * or by typing one more letter into the search box.
   */
  page: number;
};

export function galleryPage<T>(
  all: T[],
  opts: {
    /** Applied first. */
    keep?: (row: T) => boolean;
    /** The raw contents of the search box. */
    query: string;
    /** Everything about a row a person could reasonably type. */
    searchable: (row: T) => string;
    page: number;
    perPage: number;
  },
): GalleryPage<T> {
  const { keep, query, searchable, page, perPage } = opts;

  /*
   * Every word must appear, in any field and in any order — so "hero bread"
   * finds the loaf on the hero without the client having to guess which field
   * holds which word, and without an exact phrase being the only thing that
   * works. The same rule the SEO panel's keyword check settled on, for the
   * same reason: an exact-phrase match mostly measures willingness to type
   * awkwardly.
   */
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const kept = keep ? all.filter(keep) : all;
  const matched = terms.length
    ? kept.filter((row) => {
        const hay = searchable(row).toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
    : kept;

  const pageCount = Math.max(1, Math.ceil(matched.length / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);

  return {
    rows: matched.slice((current - 1) * perPage, current * perPage),
    matched,
    pageCount,
    page: current,
  };
}
