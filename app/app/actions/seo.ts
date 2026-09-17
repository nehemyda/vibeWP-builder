"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sitePages } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { canEditSite } from "@/app/actions/sites";
import { DESC_LIMIT, DESC_SHORT, TITLE_LIMIT, TITLE_SHORT } from "@/lib/seo/limits";
import { loadBusinessContext } from "@/lib/ai/business-context";
import { generateMetaWithGemini, type MetaSubject } from "@/lib/ai/generate-meta";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { textPaths } from "@/lib/design/text-map";
import { getSectionByNodeType } from "@/lib/sections";
import { isOptionField } from "@/lib/sections/types";

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

/**
 * Whether a field covers a focus keyword.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EVERY WORD, AND NOT THE EXACT PHRASE
 *
 * Checked as an exact substring first, and the measurement is what changed
 * it. Across four generated pages the keyword landed in 4 of 4 titles and 1
 * of 4 descriptions — and the one that passed did so because its keyword was
 * itself clumsy ("contact sunrise bakery bath"). The three that "failed" said
 * things like "bespoke wedding cakes … in Bath", which is better English than
 * "offers wedding cakes bath" would ever be.
 *
 * So an exact-phrase rule does not measure relevance; it measures how willing
 * someone is to write badly. A warning that nags a client into stilted copy is
 * worse than no warning, because they will obey it.
 *
 * Every word present, in any order, catches the thing actually worth catching:
 * a description that is not about the keyword at all.
 * ─────────────────────────────────────────────────────────────────────
 */
function covers(text: string, keyword: string): boolean {
  const haystack = text.toLowerCase();
  return keyword
    .split(/\s+/)
    // Two letters or fewer is "in", "of", "a" — noise either way.
    .filter((word) => word.length > 2)
    .every((word) => haystack.includes(word));
}

export type PageSeo = {
  id: string;
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  canonicalUrl: string | null;
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
      focusKeyword: sitePages.focusKeyword,
      canonicalUrl: sitePages.canonicalUrl,
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
  /*
   * Two pages targeting one phrase is the fault worth catching most: they
   * compete with each other and the site loses to itself.
   */
  const keywordCounts = new Map<string, number>();
  for (const row of rows) {
    const t = row.metaTitle?.trim();
    const d = row.metaDescription?.trim();
    const k = row.focusKeyword?.trim().toLowerCase();
    if (t) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
    if (d) descCounts.set(d, (descCounts.get(d) ?? 0) + 1);
    if (k) keywordCounts.set(k, (keywordCounts.get(k) ?? 0) + 1);
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

      /*
       * The focus keyword is only useful if the words it names are actually
       * in what a search engine reads. A keyword nobody wrote to is a note to
       * self, and this is the check that turns it into a control.
       */
      const k = row.focusKeyword?.trim().toLowerCase();
      if (k) {
        if (t && !covers(t, k)) warnings.push(`"${k}" isn't in the title`);
        if (d && !covers(d, k)) warnings.push(`"${k}" isn't in the description`);
        if ((keywordCounts.get(k) ?? 0) > 1) {
          warnings.push(`Another page targets "${k}" — they will compete`);
        }
      }

      /*
       * A canonical pointing somewhere else tells search engines not to index
       * this page at all. Legitimate, and much too quiet to leave unsaid.
       */
      const canon = row.canonicalUrl?.trim();
      if (canon && !/^https?:\/\//i.test(canon)) {
        warnings.push("The canonical URL needs to start with http:// or https://");
      }

      return {
        id: row.id,
        slug: row.slug,
        title: row.title ?? row.slug,
        metaTitle: row.metaTitle,
        metaDescription: row.metaDescription,
        focusKeyword: row.focusKeyword,
        canonicalUrl: row.canonicalUrl,
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
  focusKeyword?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}): Promise<{ ok: boolean; message?: string }> {
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
  if (opts.focusKeyword !== undefined) {
    // Lower-cased, because the checks compare against it and "Boiler Repair"
    // matching "boiler repair" is not something to make the client think about.
    patch.focusKeyword = opts.focusKeyword.trim().toLowerCase().slice(0, 120) || null;
  }
  if (opts.canonicalUrl !== undefined) {
    const url = opts.canonicalUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, message: "A canonical URL has to start with http:// or https://" };
    }
    patch.canonicalUrl = url.slice(0, 500) || null;
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


/**
 * The words on a page, in the order they appear, for the model to read.
 *
 * PER NODE, then joined. An earlier version merged every section's props into
 * one object first, which meant later sections overwrote earlier ones by key —
 * so the home page's excerpt began with a line from its contact section and
 * most of the page was simply absent.
 *
 * Option fields are dropped. They are strings too, so "default" and "large"
 * were being handed to the model as if they were copy.
 */
function pageExcerpt(schema: unknown): string {
  const nodes = (schema as { nodes?: Array<{ type?: string; props?: Record<string, unknown> }> })
    ?.nodes;
  if (!Array.isArray(nodes)) return "";

  const words: string[] = [];
  for (const node of nodes) {
    const def = getSectionByNodeType(node.type);
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.props ?? {})) {
      const spec = def?.fields?.[key];
      if (spec && isOptionField(spec)) continue;
      copy[key] = value;
    }
    for (const found of textPaths(copy)) words.push(found.value);
    if (words.join(" · ").length > 700) break;
  }
  return words.join(" · ").slice(0, 700);
}

export type GenerateScope = "missing" | "all";

export type GenerateResult =
  | { ok: true; written: number; skipped: number; message: string }
  | { ok: false; message: string };

/**
 * Writes meta tags for the site's pages.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "MISSING" AND "ALL" ARE GENUINELY DIFFERENT, AND THE DIFFERENCE IS THE POINT
 *
 * "missing" fills only what nobody has written. A field the client CLEARED is
 * left alone — they cleared it deliberately, and that is why null and empty
 * are stored differently.
 *
 * "all" overwrites, including what the client typed. Destructive, so the
 * button says so; there is no undo on a meta description beyond retyping it.
 *
 * ONE CALL FOR THE WHOLE SET
 *
 * So the model can tell the pages apart. See generate-meta.ts — a title that
 * differentiates is a property of the set, not of one page, and nine separate
 * calls is how a site gets nine titles that all begin with the business name.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function generatePageMetaAction(opts: {
  siteId: string;
  scope: GenerateScope;
}): Promise<GenerateResult> {
  await assertAccess(opts.siteId);

  const settings = await getAiProviderSettings();
  if (settings.activeProvider !== "gemini" || !settings.geminiApiKey) {
    return { ok: false, message: "No AI provider is configured, so I can't write these yet." };
  }

  const business = await loadBusinessContext(opts.siteId);
  if (!business) {
    return {
      ok: false,
      message: "This site has no business details yet — they are what the descriptions are written from.",
    };
  }

  const rows = await db
    .select({
      id: sitePages.id,
      slug: sitePages.slug,
      title: sitePages.title,
      schemaJson: sitePages.schemaJson,
      metaTitle: sitePages.metaTitle,
      metaDescription: sitePages.metaDescription,
      focusKeyword: sitePages.focusKeyword,
    })
    .from(sitePages)
    .where(eq(sitePages.siteId, opts.siteId));

  /*
   * Null means nobody wrote one; empty means someone cleared it. Only the
   * first is "missing" — overwriting the second would undo a decision.
   */
  const needs = (r: (typeof rows)[number]) =>
    r.metaTitle === null || r.metaDescription === null;

  const subjects = (opts.scope === "all" ? rows : rows.filter(needs)).map(
    (r): MetaSubject => ({
      slug: r.slug,
      name: r.title ?? r.slug,
      /*
       * The words actually on the page, so a description is written from the
       * content rather than from the slug. "services" tells the model nothing;
       * the headings under it say what the business does there.
       */
      excerpt: pageExcerpt(r.schemaJson),
      /*
       * A keyword the client set is a constraint. Passed in so the model
       * writes to it rather than picking its own — and never overwritten
       * below, whichever scope was chosen.
       */
      focusKeyword: r.focusKeyword ?? undefined,
    }),
  );

  if (subjects.length === 0) {
    return { ok: true, written: 0, skipped: rows.length, message: "Every page already has both." };
  }

  let written: MetaResultRow[];
  try {
    written = await generateMetaWithGemini(business, subjects, settings.geminiApiKey);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? `That didn't work: ${err.message}` : "That didn't work.",
    };
  }

  const bySlug = new Map(written.map((w) => [w.slug, w]));
  let count = 0;
  const now = new Date();

  for (const row of rows) {
    const result = bySlug.get(row.slug);
    if (!result) continue;

    /*
     * Even under "all", a field is only written if this run produced something
     * for it. A model that returned an empty description must not blank a good
     * one the client already had.
     */
    const patch: Record<string, unknown> = { metaGeneratedAt: now };
    /*
     * The keyword is filled in when absent and left alone when present, under
     * BOTH scopes. "Rewrite all" replaces the copy, not the target it was
     * written for — that is the client's decision about the page.
     */
    if (result.focusKeyword && !row.focusKeyword) patch.focusKeyword = result.focusKeyword;
    if (result.title) {
      if (opts.scope === "all" || row.metaTitle === null) patch.metaTitle = result.title;
    }
    if (result.description) {
      if (opts.scope === "all" || row.metaDescription === null) patch.metaDescription = result.description;
    }
    if (Object.keys(patch).length === 1) continue;

    await db
      .update(sitePages)
      .set(patch)
      .where(and(eq(sitePages.id, row.id), eq(sitePages.siteId, opts.siteId)));
    count += 1;
  }

  return {
    ok: true,
    written: count,
    skipped: rows.length - count,
    message:
      count === 0
        ? "Nothing was written — the model returned no usable copy."
        : `Wrote meta tags for ${count} page${count === 1 ? "" : "s"}. Publish to apply them.`,
  };
}

type MetaResultRow = {
  slug: string;
  focusKeyword: string;
  title: string;
  description: string;
};
