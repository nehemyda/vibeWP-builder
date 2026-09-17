"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sitePages } from "@/lib/db/schema";
import { savePageSchemaAction } from "@/app/actions/pages";
import { createClient } from "@/lib/supabase/server";
import { canEditSite } from "@/app/actions/sites";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { describeBusiness, loadBusinessContext } from "@/lib/ai/business-context";
import { generateAltWithGemini, type AltKind, type AltSubject } from "@/lib/ai/generate-alt";
import { imagePaths, writeImage, type ImageValue } from "@/lib/design/image-map";
import { mediaAssets } from "@/lib/db/schema";
import { isNull } from "drizzle-orm";
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
  /** True when there is no title. Absent is the only "missing" here — a
   *  title has no placeholder, because nothing breaks without one. */
  needsTitle: boolean;
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
        /*
         * An EMPTY slot is not a picture.
         *
         * Clearing a photograph off a page leaves the key in place with an
         * empty url — that is how every section says "no picture here", and
         * it has to stay a recognisable image slot so a new photograph can be
         * dropped into it later: `set_image` guards itself with `readImage`,
         * so teaching `imagePaths` to skip empty urls would mean a picture
         * could be deleted and never replaced.
         *
         * So the slot is filtered HERE, by the one consumer that lists
         * pictures for a person to manage. Without this the Images tab drew a
         * card for the photograph it had just removed and handed React
         * `<img src="">`, which the browser answers by re-requesting the page.
         */
        if (!image.url.trim()) continue;

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
          needsTitle: !(image.title ?? "").trim(),
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

/**
 * Takes one photograph off a page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY CLEARING THE URL AND NOT DELETING A FIELD
 *
 * Every section already omits a part whose field is empty — the same property
 * `remove_part` relies on. I checked it rather than assumed it: all 19 image
 * placements across the 14 sections that have photographs were rendered with
 * the url cleared, and not one emitted an <img> with an empty src, an empty
 * CSS url(), or threw. So an empty url is the section's own way of saying
 * "no picture here", and it works per PLACEMENT — including `items.2.image`,
 * which `remove_part` cannot reach because it only knows top-level fields.
 *
 * WHY IT GOES THROUGH savePageSchemaAction
 *
 * That snapshots the page before overwriting, which is what undo restores.
 * Writing the schema directly — as the alt and title writes do, because they
 * are not destructive — would take a client's hero photograph away with no
 * way back.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function clearImagePlacementAction(opts: {
  siteId: string;
  pageId: string;
  /** "<nodeIndex>.<path within the node>" as listImageAltAction reports it. */
  path: string;
}): Promise<{ ok: boolean; message?: string }> {
  await assertAccess(opts.siteId);

  const page = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.id, opts.pageId), eq(sitePages.siteId, opts.siteId)),
  });
  if (!page) return { ok: false, message: "That page isn't there any more." };

  const schema = page.schemaJson as {
    nodes?: Array<{ type?: string; props?: Record<string, unknown> }>;
  };
  const nodes = [...(schema.nodes ?? [])];

  const dot = opts.path.indexOf(".");
  if (dot < 0) return { ok: false, message: "That isn't a picture on this page." };
  const nodeIndex = Number(opts.path.slice(0, dot));
  const inner = opts.path.slice(dot + 1);
  const node = nodes[nodeIndex];
  if (!node?.props) return { ok: false, message: "That picture isn't there any more." };

  const existing = imagePaths(node.props).find((p) => p.path === inner);
  if (!existing) return { ok: false, message: "That picture isn't there any more." };

  /*
   * Cleared, not deleted from the props. Leaving the key in place with an
   * empty url is what the renderers already treat as absent, and it means the
   * shape of a gallery's items array is untouched — removing an entry would
   * renumber every path after it, including ones the open canvas is holding.
   */
  nodes[nodeIndex] = {
    ...node,
    props: writeImage(node.props, inner, { url: "", alt: "", title: undefined }),
  };

  const def = getSectionByNodeType(node.type ?? "");
  await savePageSchemaAction({
    siteId: opts.siteId,
    slug: page.slug,
    schema: { ...schema, nodes },
    reason: `Removed a picture from the ${def?.name ?? "section"} on ${page.title}`,
  });

  return { ok: true };
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
  /**
   * Which field, or both.
   *
   * "both" is two model calls per batch, not one asking for two answers. The
   * prompts are genuinely different jobs — a sentence describing the picture
   * and a short label naming it — and merging them produced a title that was
   * the alt with words removed.
   */
  field: "alt" | "title" | "both";
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

  const wantAlt = opts.field === "alt" || opts.field === "both";
  const wantTitle = opts.field === "title" || opts.field === "both";

  /*
   * PLACEMENTS AND LIBRARY FILES TOGETHER.
   *
   * This used to cover placements only, on the reasoning that describing a
   * file nobody has placed spends a call on a picture no reader reaches. The
   * tab shows one list, so a command that quietly acted on two thirds of it
   * was the wrong call: a client looking at three cards with empty fields
   * pressed the button and was told nothing was written.
   */
  const placements = await listImageAltAction(opts.siteId);
  const library = await db
    .select({
      id: mediaAssets.id,
      url: mediaAssets.url,
      alt: mediaAssets.alt,
      title: mediaAssets.title,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.siteId, opts.siteId), isNull(mediaAssets.deletedAt)));

  const placedUrls = new Set(placements.map((p) => p.url));

  type Job = {
    url: string;
    context: string;
    needsAlt: boolean;
    needsTitle: boolean;
    write: { pageId: string; path: string } | { assetId: string };
  };

  const jobs: Job[] = [
    ...placements.map(
      (p): Job => ({
        url: p.url,
        context: `${p.sectionName} on the ${p.pageTitle} page`,
        needsAlt: p.needsAlt,
        needsTitle: p.needsTitle,
        write: { pageId: p.pageId, path: p.path },
      }),
    ),
    ...library
      .filter((a) => !placedUrls.has(a.url))
      .map(
        (a): Job => ({
          url: a.url,
          context: "in the library, not yet placed on a page",
          needsAlt: !(a.alt ?? "").trim(),
          needsTitle: !(a.title ?? "").trim(),
          write: { assetId: a.id },
        }),
      ),
  ];

  const targets =
    opts.scope === "all"
      ? jobs
      : jobs.filter((j) => (wantAlt && j.needsAlt) || (wantTitle && j.needsTitle));
  if (targets.length === 0) {
    return {
      ok: true,
      written: 0,
      message:
        opts.field === "title"
          ? "Every picture already has a title."
          : opts.field === "alt"
            ? "Every picture already has alt text."
            : "Every picture already has both.",
    };
  }

  /* One description per photograph, applied to every place it is used. */
  const byUrl = new Map<string, Job[]>();
  for (const job of targets) {
    const group = byUrl.get(job.url) ?? [];
    group.push(job);
    byUrl.set(job.url, group);
  }

  const describedAlt = new Map<string, string>();
  const describedTitle = new Map<string, string>();
  const urls = [...byUrl.keys()];
  const problems: string[] = [];
  /*
   * Counted, not swallowed. A picture whose URL has died was skipped in
   * silence, so a run where the only candidate was a dead stock photograph
   * reported "Nothing was written" and gave no reason at all.
   */
  let unreachable = 0;

  for (let i = 0; i < urls.length; i += BATCH) {
    const slice = urls.slice(i, i + BATCH);
    const subjects: AltSubject[] = [];

    for (const url of slice) {
      const fetched = await fetchImage(url);
      if (!fetched) {
        unreachable += 1;
        continue;
      }
      subjects.push({
        key: url,
        bytes: fetched.bytes,
        mimeType: fetched.mimeType,
        context: byUrl.get(url)![0].context,
      });
    }
    if (subjects.length === 0) continue;

    /*
     * The bytes are fetched once and reused for both prompts — two questions
     * about one download. A failure on titles does not lose the alt text that
     * already came back, and a failed batch does not sink the rest.
     */
    for (const kind of [wantAlt ? "alt" : null, wantTitle ? "title" : null].filter(
      (k): k is "alt" | "title" => !!k,
    )) {
      try {
        const answers = await generateAltWithGemini(
          describeBusiness(business),
          subjects,
          settings.geminiApiKey,
          kind,
        );
        const into = kind === "alt" ? describedAlt : describedTitle;
        for (const [key, value] of answers) into.set(key, value);
      } catch (err) {
        problems.push(err instanceof Error ? err.message : "a batch failed");
      }
    }
  }

  /*
   * Under "missing", only the side that WAS missing is written: a picture with
   * good alt and no title must not have its alt rewritten because titles were
   * asked for.
   */
  let written = 0;
  const pageWrites: Array<{ pageId: string; path: string; alt?: string; title?: string }> = [];

  for (const job of targets) {
    const altValue =
      wantAlt && describedAlt.get(job.url) && (opts.scope === "all" || job.needsAlt)
        ? describedAlt.get(job.url)
        : undefined;
    const titleValue =
      wantTitle && describedTitle.get(job.url) && (opts.scope === "all" || job.needsTitle)
        ? describedTitle.get(job.url)
        : undefined;
    if (altValue === undefined && titleValue === undefined) continue;

    if ("assetId" in job.write) {
      await db
        .update(mediaAssets)
        .set({
          ...(altValue !== undefined ? { alt: altValue } : {}),
          ...(titleValue !== undefined ? { title: titleValue } : {}),
        })
        .where(and(eq(mediaAssets.id, job.write.assetId), eq(mediaAssets.siteId, opts.siteId)));
      written += 1;
    } else {
      pageWrites.push({ ...job.write, alt: altValue, title: titleValue });
    }
  }
  written += await writeAlts(opts.siteId, pageWrites);

  /* Said plainly, because "nothing happened" is the least useful answer. */
  const notes: string[] = [];
  if (unreachable > 0) {
    notes.push(
      `${unreachable} picture${unreachable === 1 ? "" : "s"} couldn't be loaded to look at — the file may have moved or been taken down`,
    );
  }
  if (problems.length) notes.push(problems[0]);

  return {
    ok: true,
    written,
    message:
      written === 0
        ? notes.length
          ? `Nothing was written: ${notes.join("; ")}.`
          : "Nothing was written."
        : `Updated ${written} picture${written === 1 ? "" : "s"}. Publish to apply them.` +
          (notes.length ? ` ${notes.join("; ")}.` : ""),
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


/** Which picture, and where its words are kept. */
export type OneTarget =
  | { kind: "placed"; pageId: string; path: string }
  | { kind: "unused"; assetId: string };

export type OneResult = { ok: true; value: string } | { ok: false; message: string };

/**
 * Writes one field on one picture.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS BESIDE THE BATCH
 *
 * The batch is for a site that has just been built and has nothing described.
 * This is for the picture in front of you — you have looked at what the model
 * wrote, you disagree, and you want it to try again on that one. Sending the
 * whole site back through the model to redo a single description would cost
 * every other description its wording as well.
 *
 * It is also the honest place for a title. Generating titles for a whole site
 * at once is a lot of model calls for a tooltip; asked for one at a time, it
 * is a button next to the field.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function generateOneImageMetaAction(opts: {
  siteId: string;
  target: OneTarget;
  field: AltKind;
}): Promise<OneResult> {
  await assertAccess(opts.siteId);

  const settings = await getAiProviderSettings();
  if (settings.activeProvider !== "gemini" || !settings.geminiApiKey) {
    return { ok: false, message: "No AI provider is configured yet." };
  }
  const business = await loadBusinessContext(opts.siteId);
  if (!business) return { ok: false, message: "This site has no business details yet." };

  /*
   * The URL and the context come from wherever the picture actually lives,
   * looked up server-side. The browser says WHICH picture, never where to
   * fetch bytes from — otherwise this action would download and describe any
   * URL on the internet on request.
   */
  let url: string | null = null;
  let context = "a picture on the site";

  if (opts.target.kind === "placed") {
    const placements = await listImageAltAction(opts.siteId);
    const found = placements.find(
      (p) => p.pageId === (opts.target as { pageId: string }).pageId &&
        p.path === (opts.target as { path: string }).path,
    );
    if (!found) return { ok: false, message: "That picture isn't there any more." };
    url = found.url;
    context = `${found.sectionName} on the ${found.pageTitle} page`;
  } else {
    const asset = await db.query.mediaAssets.findFirst({
      where: and(
        eq(mediaAssets.id, opts.target.assetId),
        eq(mediaAssets.siteId, opts.siteId),
        isNull(mediaAssets.deletedAt),
      ),
    });
    if (!asset) return { ok: false, message: "That picture isn't in your library any more." };
    url = asset.url;
    context = "in the library, not yet placed on a page";
  }

  const fetched = await fetchImage(url);
  if (!fetched) {
    return { ok: false, message: "I couldn't load that picture to look at it." };
  }

  let value: string;
  try {
    const answers = await generateAltWithGemini(
      describeBusiness(business),
      [{ key: url, bytes: fetched.bytes, mimeType: fetched.mimeType, context }],
      settings.geminiApiKey,
      opts.field,
    );
    const written = answers.get(url);
    if (!written) return { ok: false, message: "The model didn't return anything usable." };
    value = written;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? `That didn't work: ${err.message}` : "That didn't work.",
    };
  }

  if (opts.target.kind === "placed") {
    const written = await writeAlts(opts.siteId, [
      {
        pageId: opts.target.pageId,
        path: opts.target.path,
        ...(opts.field === "alt" ? { alt: value } : { title: value }),
      },
    ]);
    if (written === 0) return { ok: false, message: "That picture isn't there any more." };
  } else {
    await db
      .update(mediaAssets)
      .set(opts.field === "alt" ? { alt: value } : { title: value })
      .where(and(eq(mediaAssets.id, opts.target.assetId), eq(mediaAssets.siteId, opts.siteId)));
  }

  return { ok: true, value };
}
