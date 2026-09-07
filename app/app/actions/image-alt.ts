"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sitePages } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { canEditSite } from "@/app/actions/sites";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { describeBusiness, loadBusinessContext } from "@/lib/ai/business-context";
import { generateAltWithGemini, type AltSubject } from "@/lib/ai/generate-alt";
import { imagePaths, writeImage, type ImageValue } from "@/lib/design/image-map";
import { getSectionByNodeType } from "@/lib/sections";

/**
 * Alt text for every photograph on the site.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT THE LIBRARY'S ALT FIELD
 *
 * The media library holds an alt for each FILE, which travels with it into a
 * placement. This is the alt actually on each <img> in each page, and the two
 * are not the same list: a file can sit in three sections, and a page can use
 * a photograph that was never in the library because it came from a stock
 * search.
 *
 * What ships is what is on the page, so that is what this counts and fixes.
 *
 * WHY IT COUNTS HONESTLY
 *
 * requireAlt() falls back to "Photograph of this business" so that no image
 * can ever export with an empty alt attribute. Good for the markup, and it
 * means a client inspecting their site would find every image "described" and
 * never learn otherwise. A screen-reader user would hear the same eleven
 * words eleven times.
 *
 * So the fallback is treated as MISSING here. It is a placeholder that
 * happens to be well-formed, not a description.
 * ─────────────────────────────────────────────────────────────────────
 */

/** What requireAlt() writes when nothing better exists. Not a description. */
const PLACEHOLDER = "Photograph of this business";

/** How many pictures go to the model at once. */
const BATCH = 6;

/** A photograph larger than this is not downloaded to describe it. */
const MAX_FETCH_BYTES = 8 * 1024 * 1024;

export type ImagePlacement = {
  pageId: string;
  pageSlug: string;
  pageTitle: string;
  /** Dotted path within the page's node props, e.g. "items.2.image". */
  path: string;
  nodeIndex: number;
  sectionName: string;
  url: string;
  alt: string;
  /** The tooltip, carried by core's own block attribute. Not a second alt. */
  title: string;
  /** True when the alt is absent or the placeholder. */
  needsAlt: boolean;
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

const isPlaceholder = (alt: string) => !alt.trim() || alt.trim() === PLACEHOLDER;

/** Every photograph placed on any page, with where it sits. */
export async function listImageAltAction(siteId: string): Promise<ImagePlacement[]> {
  await assertAccess(siteId);

  const rows = await db
    .select({
      id: sitePages.id,
      slug: sitePages.slug,
      title: sitePages.title,
      schemaJson: sitePages.schemaJson,
    })
    .from(sitePages)
    .where(eq(sitePages.siteId, siteId));

  const out: ImagePlacement[] = [];
  for (const row of rows) {
    const nodes =
      (row.schemaJson as { nodes?: Array<{ type?: string; props?: Record<string, unknown> }> })
        ?.nodes ?? [];
    nodes.forEach((node, nodeIndex) => {
      for (const { path, image } of imagePaths(node.props)) {
        const alt = image.alt ?? "";
        out.push({
          pageId: row.id,
          pageSlug: row.slug,
          pageTitle: row.title ?? row.slug,
          path: `${nodeIndex}.${path}`,
          nodeIndex,
          sectionName: getSectionByNodeType(node.type)?.name ?? node.type ?? "Section",
          url: image.url,
          alt,
          title: image.title ?? "",
          needsAlt: isPlaceholder(alt),
        });
      }
    });
  }

  // Home first, then by page, then in the order they appear on it.
  return out.sort((a, b) =>
    a.pageSlug === b.pageSlug
      ? a.nodeIndex - b.nodeIndex
      : a.pageSlug === "home"
        ? -1
        : b.pageSlug === "home"
          ? 1
          : a.pageSlug.localeCompare(b.pageSlug),
  );
}

/**
 * Writes one placement's alt text, or its title, or both.
 *
 * One action for both because they are one form: a client filling in a
 * picture's details should not care that one field is what replaces the image
 * and the other is a tooltip.
 */
export async function setImageMetaAction(opts: {
  siteId: string;
  pageId: string;
  /** "<nodeIndex>.<path within the node>" as listImageAltAction reports it. */
  path: string;
  alt?: string;
  title?: string;
}): Promise<{ ok: boolean; message?: string }> {
  await assertAccess(opts.siteId);
  const written = await writeAlts(opts.siteId, [
    { pageId: opts.pageId, path: opts.path, alt: opts.alt, title: opts.title },
  ]);
  return written > 0 ? { ok: true } : { ok: false, message: "That picture isn't there any more." };
}

export type AltGenerateResult =
  | { ok: true; written: number; message: string }
  | { ok: false; message: string };

/**
 * Describes the pictures that have no description.
 *
 * Scope "missing" covers anything absent or still wearing the placeholder;
 * "all" re-describes everything, including alt a client wrote by hand, so the
 * button that triggers it asks first.
 *
 * ONE MODEL CALL PER DISTINCT PICTURE, not per placement. The same photograph
 * used in a hero and a gallery is the same photograph, and describing it twice
 * would spend twice as much to produce two descriptions of one thing that then
 * differ from each other.
 */
export async function generateImageAltAction(opts: {
  siteId: string;
  scope: "missing" | "all";
}): Promise<AltGenerateResult> {
  await assertAccess(opts.siteId);

  const settings = await getAiProviderSettings();
  if (settings.activeProvider !== "gemini" || !settings.geminiApiKey) {
    return { ok: false, message: "No AI provider is configured, so I can't describe these yet." };
  }
  const business = await loadBusinessContext(opts.siteId);
  if (!business) {
    return { ok: false, message: "This site has no business details yet." };
  }

  const all = await listImageAltAction(opts.siteId);
  const targets = opts.scope === "all" ? all : all.filter((p) => p.needsAlt);
  if (targets.length === 0) {
    return { ok: true, written: 0, message: "Every picture already has a description." };
  }

  /* Grouped by URL: one description per photograph, applied to each placement. */
  const byUrl = new Map<string, ImagePlacement[]>();
  for (const placement of targets) {
    const group = byUrl.get(placement.url) ?? [];
    group.push(placement);
    byUrl.set(placement.url, group);
  }

  const described = new Map<string, string>();
  const urls = [...byUrl.keys()];
  const problems: string[] = [];

  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const subjects: AltSubject[] = [];

    for (const url of slice) {
      const fetched = await fetchImage(url);
      if (!fetched) continue;
      const where = byUrl.get(url)![0];
      subjects.push({
        key: url,
        bytes: fetched.bytes,
        mimeType: fetched.mimeType,
        context: `${where.sectionName} on the ${where.pageTitle} page`,
      });
    }
    if (subjects.length === 0) continue;

    try {
      const answers = await generateAltWithGemini(
        describeBusiness(business),
        subjects,
        settings.geminiApiKey,
      );
      for (const [key, alt] of answers) described.set(key, alt);
    } catch (err) {
      /*
       * A failed batch does not sink the rest. Six unreadable photographs
       * should not cost a client the twelve that were fine.
       */
      problems.push(err instanceof Error ? err.message : "a batch failed");
    }
  }

  const writes = targets
    .filter((p) => described.has(p.url))
    .map((p) => ({ pageId: p.pageId, path: p.path, alt: described.get(p.url)! }));
  const written = await writeAlts(opts.siteId, writes);

  return {
    ok: true,
    written,
    message:
      written === 0
        ? `Nothing was described${problems.length ? `: ${problems[0]}` : "."}`
        : `Described ${written} picture${written === 1 ? "" : "s"}. Publish to apply them.` +
          (problems.length ? ` Some were skipped: ${problems[0]}` : ""),
  };
}

/**
 * Applies alt text to placements, one page at a time.
 *
 * Grouped per page so a page's schema is read and written once however many
 * of its pictures changed — twelve separate updates to one row would be
 * twelve chances for two of them to overwrite each other.
 */
async function writeAlts(
  siteId: string,
  writes: Array<{ pageId: string; path: string; alt?: string; title?: string }>,
): Promise<number> {
  if (writes.length === 0) return 0;

  const byPage = new Map<string, typeof writes>();
  for (const write of writes) {
    const group = byPage.get(write.pageId) ?? [];
    group.push(write);
    byPage.set(write.pageId, group);
  }

  let count = 0;
  for (const [pageId, pageWrites] of byPage) {
    const page = await db.query.sitePages.findFirst({
      where: and(eq(sitePages.id, pageId), eq(sitePages.siteId, siteId)),
    });
    if (!page) continue;

    const schema = page.schemaJson as {
      nodes?: Array<{ type?: string; props?: Record<string, unknown> }>;
    };
    const nodes = [...(schema.nodes ?? [])];
    let touched = 0;

    for (const write of pageWrites) {
      const dot = write.path.indexOf(".");
      const nodeIndex = Number(write.path.slice(0, dot));
      const inner = write.path.slice(dot + 1);
      const node = nodes[nodeIndex];
      if (!node?.props) continue;

      const existing = imagePaths(node.props).find((p) => p.path === inner);
      if (!existing) continue;

      /*
       * Merged onto the image that is there, so the URL, the dimensions and
       * any stock credit survive — only the description changes.
       */
      /*
       * Only the fields this write names. Passing undefined for the other
       * would erase a title while saving an alt, which is what a single
       * "write the image" function invites if it takes a whole value.
       */
      const next: ImageValue = { ...existing.image };
      if (write.alt !== undefined) next.alt = write.alt.trim().slice(0, 300);
      if (write.title !== undefined) next.title = write.title.trim().slice(0, 300) || undefined;
      nodes[nodeIndex] = { ...node, props: writeImage(node.props, inner, next) };
      touched += 1;
    }

    if (touched === 0) continue;
    await db
      .update(sitePages)
      .set({ schemaJson: { ...schema, nodes } })
      .where(and(eq(sitePages.id, pageId), eq(sitePages.siteId, siteId)));
    count += touched;
  }
  return count;
}

/**
 * Downloads a photograph so the model can look at it.
 *
 * Bounded, and failure is not fatal: an image behind a URL that has gone away
 * is skipped and the rest are still described. A stock photograph's host is
 * not something a client's alt text should depend on.
 */
async function fetchImage(url: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;

    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;

    const size = Number(response.headers.get("content-length") ?? 0);
    if (size > MAX_FETCH_BYTES) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_FETCH_BYTES) return null;
    return { bytes, mimeType: type };
  } catch {
    return null;
  }
}
