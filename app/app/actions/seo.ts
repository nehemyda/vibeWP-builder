"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sitePages } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { canEditSite } from "@/app/actions/sites";
import { DESC_LIMIT, DESC_SHORT, TITLE_LIMIT, TITLE_SHORT } from "@/lib/seo/limits";

/**
 * What search engines are told about each page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE VALUES ARE STORED HERE AND RENDERED BY THE CLIENT'S THEME
 *
 * inc/seo.php reads them from post meta, written on export. So a description
 * saved here does nothing until the site is published, which the panel says
 * rather than leaving to be discovered.
 *
 * NULL AND EMPTY ARE DIFFERENT
 *
 * Null means nobody has written one. Empty means somebody cleared it. The
 * generator needs that difference: "missing only" must fill the first and
 * leave the second alone, and cannot tell them apart from "".
 *
 * WHY LENGTHS ARE ADVICE AND NOT LIMITS
 *
 * 60 characters is where Google usually truncates a title, not a rule, and it
 * rewrites titles anyway a good share of the time. So a long title is flagged
 * and still saved — refusing it would be claiming a precision nobody has.
 * ─────────────────────────────────────────────────────────────────────
 */

export type PageSeo = {
  id: string;
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  noIndex: boolean;
  generated: boolean;
  /** Why this page wants attention, if it does. Empty when it is fine. */
  warnings: string[];
};

async function assertAccess(siteId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }
}

/** Every page's meta, with what is wrong with it. */
export async function listPageSeoAction(siteId: string): Promise<PageSeo[]> {
  await assertAccess(siteId);

  const rows = await db
    .select({
      id: sitePages.id,
      slug: sitePages.slug,
      title: sitePages.title,
      metaTitle: sitePages.metaTitle,
      metaDescription: sitePages.metaDescription,
      noIndex: sitePages.noIndex,
      metaGeneratedAt: sitePages.metaGeneratedAt,
    })
    .from(sitePages)
    .where(eq(sitePages.siteId, siteId));

  /*
   * Duplicates are found across the whole site, not per row, because that is
   * what makes them a problem: two pages competing for the same query is a
   * fact about the pair. Counted before the map so both ends get flagged.
   */
  const titleCounts = new Map<string, number>();
  const descCounts = new Map<string, number>();
  for (const row of rows) {
    const t = row.metaTitle?.trim();
    const d = row.metaDescription?.trim();
    if (t) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
    if (d) descCounts.set(d, (descCounts.get(d) ?? 0) + 1);
  }

  return rows
    .map((row) => {
      const warnings: string[] = [];
      const t = row.metaTitle?.trim() ?? "";
      const d = row.metaDescription?.trim() ?? "";

      if (t.length > TITLE_LIMIT) warnings.push(`Title is ${t.length} characters — Google shows about ${TITLE_LIMIT}`);
      if (t && t.length < TITLE_SHORT) warnings.push("Title is very short");
      if (d.length > DESC_LIMIT) warnings.push(`Description is ${d.length} characters — Google shows about ${DESC_LIMIT}`);
      if (d && d.length < DESC_SHORT) warnings.push("Description is very short");
      if (t && (titleCounts.get(t) ?? 0) > 1) warnings.push("Another page has the same title");
      if (d && (descCounts.get(d) ?? 0) > 1) warnings.push("Another page has the same description");

      return {
        id: row.id,
        slug: row.slug,
        title: row.title ?? row.slug,
        metaTitle: row.metaTitle,
        metaDescription: row.metaDescription,
        noIndex: row.noIndex,
        generated: !!row.metaGeneratedAt,
        warnings,
      };
    })
    // Home first, then alphabetical — the order a client thinks about pages.
    .sort((a, b) =>
      a.slug === "home" ? -1 : b.slug === "home" ? 1 : a.slug.localeCompare(b.slug),
    );
}

/**
 * Saves one page's meta.
 *
 * Trimmed, and an empty string is stored as an empty string rather than
 * collapsed to null: the client cleared it, and the generator has to be able
 * to tell that from never having been written.
 *
 * Writing by hand clears metaGeneratedAt, so the panel stops calling it
 * generated and a later regenerate knows these are the client's own words.
 */
export async function savePageSeoAction(opts: {
  siteId: string;
  pageId: string;
  metaTitle?: string;
  metaDescription?: string;
  noIndex?: boolean;
}): Promise<{ ok: boolean }> {
  await assertAccess(opts.siteId);

  const patch: Record<string, unknown> = {};
  if (opts.metaTitle !== undefined) {
    patch.metaTitle = opts.metaTitle.trim().slice(0, 300);
    patch.metaGeneratedAt = null;
  }
  if (opts.metaDescription !== undefined) {
    patch.metaDescription = opts.metaDescription.trim().slice(0, 600);
    patch.metaGeneratedAt = null;
  }
  if (opts.noIndex !== undefined) patch.noIndex = opts.noIndex;
  if (Object.keys(patch).length === 0) return { ok: true };

  await db
    .update(sitePages)
    .set(patch)
    // siteId in the WHERE, not just the id: one site must never be able to
    // write another's row even if an id leaked.
    .where(and(eq(sitePages.id, opts.pageId), eq(sitePages.siteId, opts.siteId)));

  return { ok: true };
}
