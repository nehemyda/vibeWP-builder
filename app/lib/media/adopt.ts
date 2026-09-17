import { getSectionByNodeType } from "@/lib/sections";
import { ALLOWED, findSiteMediaByBytes, putSiteMedia } from "./store";
import type { FieldSpec } from "@/lib/sections/types";

/**
 * Takes a site's photographs into our own store.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE SECTION REGISTRY DRIVES THIS
 *
 * Images do not live at one known key. A section declares them: a top-level
 * field of type "image", whose NAME is whatever that section called it, and
 * list fields whose entries declare one. Export's own sideloader reads
 * `node.props.image` and so silently misses every gallery and every card
 * grid — a bug this deliberately does not copy.
 *
 * Asking the definition what its image fields are means a new section with a
 * new field name is handled the day it is added, with no second list to keep
 * in step.
 * ─────────────────────────────────────────────────────────────────────
 */

/** The shape sections store an image in — see SectionImage in lib/sections/shared.ts. */
type ImageValue = { url?: string; alt?: string; sourceUrl?: string; [k: string]: unknown };

const MAX_BYTES = 8_000_000;

/**
 * Fetches one remote image into the store and returns its new URL.
 *
 * Null on any failure, and every caller treats that as "leave the original
 * alone". A hero pointing at Pexels is worse than one pointing at our own
 * disk, and far better than a publish that fails over a photograph.
 */
async function adoptUrl(siteId: string, url: string, alt?: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED.has(contentType)) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;

    /*
     * Recorded as "stock", which is what it is. The column has always allowed
     * it and nothing had ever written it — the gallery can filter on it, and a
     * credit belongs to a stock photograph and not to a client's own upload.
     *
     * The alt travels with it: the section already has one written for this
     * picture, and the library asking for it again would be asking twice.
     */
    const stored = await putSiteMedia({
      siteId,
      bytes,
      contentType,
      filename: `stock.${ALLOWED.get(contentType)}`,
      source: "stock",
      alt: alt?.trim() || null,
    });
    return stored.ok ? stored.asset.url : null;
  } catch {
    return null;
  }
}

/**
 * Worth fetching: a remote address that is not already the site's own library.
 *
 * Matched on the bucket path rather than the host, because the public URL's
 * origin is Supabase's and varies by project — the path does not.
 */
function isRemote(url: string | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url) && !url.includes("/site-media/");
}

async function adoptImageValue(
  siteId: string,
  value: unknown,
  useSourceFallback: boolean,
): Promise<{ changed: boolean; value: unknown }> {
  const img = value as ImageValue | undefined;
  if (!img || typeof img !== "object") return { changed: false, value };

  const alt = typeof img.alt === "string" ? img.alt : undefined;

  /*
   * The current address first, the original second.
   *
   * Coming back FROM WordPress, img.url points at that install's media
   * library and is the better copy — the client may have replaced the
   * photograph in wp-admin, and that is the one their site shows. But the
   * install may already be stopped, and sourceUrl survives an export because
   * writeImage merges rather than replaces. So: prefer what the site is
   * actually showing, fall back to where it came from, and only then give up.
   */
  const candidates = [img.url, useSourceFallback ? img.sourceUrl : undefined]
    .filter((u): u is string => isRemote(u));
  if (candidates.length === 0) return { changed: false, value };

  let url: string | null = null;
  for (const candidate of candidates) {
    url = await adoptUrl(siteId, candidate, alt);
    if (url) break;
  }
  if (!url) return { changed: false, value };

  /*
   * `id` is dropped deliberately: it describes a WordPress attachment, and
   * carrying a stale attachment id on a URL that is no longer WordPress's
   * would be a lie the next export could act on.
   *
   * `sourceUrl` is KEPT, which is the difference between a store whose loss
   * costs a client their photographs and one whose loss costs a re-fetch.
   * Once adopted, the original address is nowhere else — the schema held the
   * only copy of it. Same reasoning as the _vibewp_source_url meta the
   * WordPress sideloader writes, and it makes provenance visible besides.
   */
  const next: ImageValue = { ...img, url, sourceUrl: img.url };
  delete next.id;
  return { changed: true, value: next };
}

/**
 * A page schema whose images are all served by us.
 *
 * Returns the original object untouched when nothing moved, so a caller can
 * skip a database write it does not need.
 */
export async function adoptSchemaImages(
  siteId: string,
  schema: unknown,
  /**
   * Try the image's sourceUrl when its current address cannot be fetched.
   *
   * Off for publishing, where the current address IS the source. On for a
   * downgrade, where it points at a WordPress that may already be stopped.
   */
  opts: { useSourceFallback?: boolean } = {},
): Promise<{ changed: boolean; schema: unknown }> {
  const useSourceFallback = opts.useSourceFallback ?? false;
  const nodes = (schema as { nodes?: Array<Record<string, unknown>> })?.nodes;
  if (!Array.isArray(nodes)) return { changed: false, schema };

  let changed = false;

  const rewritten = await Promise.all(
    nodes.map(async (node) => {
      const section = getSectionByNodeType(node?.type as string | undefined);
      const props = node?.props as Record<string, unknown> | undefined;
      if (!section || !props) return node;

      const next: Record<string, unknown> = { ...props };

      const fields = section.fields as Record<string, FieldSpec>;
      for (const [fieldName, spec] of Object.entries(fields)) {
        if (spec.type === "image") {
          const r = await adoptImageValue(siteId, next[fieldName], useSourceFallback);
          if (r.changed) {
            next[fieldName] = r.value;
            changed = true;
          }
          continue;
        }

        if (spec.type !== "list" || !spec.of) continue;
        const imageKeys = Object.entries(spec.of)
          .filter(([, s]) => s.type === "image")
          .map(([k]) => k);
        if (imageKeys.length === 0) continue;

        const items = next[fieldName];
        if (!Array.isArray(items)) continue;

        next[fieldName] = await Promise.all(
          items.map(async (item) => {
            if (!item || typeof item !== "object") return item;
            const entry = { ...(item as Record<string, unknown>) };
            for (const key of imageKeys) {
              const r = await adoptImageValue(siteId, entry[key], useSourceFallback);
              if (r.changed) {
                entry[key] = r.value;
                changed = true;
              }
            }
            return entry;
          }),
        );
      }

      return { ...node, props: next };
    }),
  );

  return changed ? { changed, schema: { ...(schema as object), nodes: rewritten } } : { changed, schema };
}

/** The decoded bytes of a stored logo data URL, or null if it is not one. */
function decodeLogo(dataUrl: string): { bytes: Buffer; contentType: string } | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) return null;
  return { contentType: m[1], bytes: Buffer.from(m[2], "base64") };
}

/**
 * The logo, served as a file rather than inlined into every page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE STORED VALUE STAYS A DATA URL
 *
 * business_profiles.logo_url is read by two other things that need the bytes,
 * not an address: the builder canvas, which has no site host to fetch from,
 * and setSiteLogo(), which decodes it to a temp file for `wp media import`.
 * Rewriting the column would break a WordPress export to fix a Vibe page.
 *
 * So the data URL remains the source of truth and this is a projection of it.
 * Content-addressed, so the same logo always yields the same URL and the
 * renderer can work out the address without anything being recorded.
 *
 * It matters because a 400KB logo is about 533KB of base64 on EVERY page of
 * the site, uncacheable, ahead of the content.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function adoptLogo(
  siteId: string,
  dataUrl: string | null | undefined,
): Promise<string | null> {
  if (!dataUrl) return null;
  const decoded = decodeLogo(dataUrl);
  if (!decoded) return null;

  const stored = await putSiteMedia({
    siteId,
    bytes: decoded.bytes,
    contentType: decoded.contentType,
    filename: `logo.${ALLOWED.get(decoded.contentType) ?? "png"}`,
    /* The client did upload this — in intake, before a library existed to
       put it in. */
    source: "upload",
    alt: null,
  });
  return stored.ok ? stored.asset.url : null;
}

/**
 * Where a logo IS served, if it has been taken in — without taking it in.
 *
 * Used when rendering, which must not write. Falls back to null so the caller
 * can serve the data URL, which is always correct if larger: a logo changed
 * since the last publish has no asset yet, and a broken image would be worse
 * than a heavy one.
 */
export async function storedLogoUrl(
  siteId: string,
  dataUrl: string | null | undefined,
): Promise<string | null> {
  if (!dataUrl) return null;
  const decoded = decodeLogo(dataUrl);
  if (!decoded) return null;

  return (await findSiteMediaByBytes(siteId, decoded.bytes))?.url ?? null;
}
