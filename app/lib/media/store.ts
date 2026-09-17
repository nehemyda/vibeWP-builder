import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where a Vibe site's images live.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A SITE NEEDS ITS OWN COPY AT ALL
 *
 * Generated content stores the Pexels CDN URL it was found at, and the canvas
 * loads it straight from there. That is fine for a preview and wrong for a
 * published website: every visitor to every client site would be fetching
 * photographs from a third party we do not control, under their terms, with
 * their availability. Export already solved this for WordPress by sideloading
 * into the media library — "an exported site has to be genuinely the client's
 * — portable" — and a Vibe site deserves the same answer.
 *
 * WHY AN INTERFACE WITH ONE IMPLEMENTATION
 *
 * Exactly the shape site_installations.driver established: "a hosted driver
 * can replace it later without anything above this file changing." Local disk
 * is right for now — the WordPress driver already writes whole installs to
 * ~/vibewp-sites, so this adds no constraint that is not already there. When
 * egress makes object storage worth it, that is a second implementation of
 * this interface, not a rewrite of every caller.
 *
 * WHY CONTENT-ADDRESSED
 *
 * The id is a hash of the bytes, so storing the same photograph twice is a
 * no-op and re-publishing is idempotent. It also makes every URL immutable,
 * which is what lets the route cache them forever — the alternative is a
 * random id plus a dedupe table plus a cache-busting scheme, to arrive at the
 * same place.
 * ─────────────────────────────────────────────────────────────────────
 */

export type StoredMedia = {
  /** Content hash plus extension, e.g. "3f2a…c1.webp". Unique per byte-string. */
  file: string;
  /** Path this is served at, relative to whichever host is serving the site. */
  url: string;
  contentType: string;
  bytes: number;
};

export interface MediaStore {
  put(opts: { siteId: string; data: Buffer; contentType: string }): Promise<StoredMedia>;
  /** Null when nothing is stored under that name. */
  read(siteId: string, file: string): Promise<{ data: Buffer; contentType: string } | null>;
  has(siteId: string, file: string): Promise<boolean>;
  remove(siteId: string, file: string): Promise<void>;
}

/**
 * Only formats a browser renders as an image, and that we are willing to
 * serve. SVG is deliberately absent: it can carry script, and this is served
 * from a host a client's visitors trust.
 */
const EXTENSION: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function isServableImage(contentType: string): boolean {
  return contentType.split(";")[0].trim().toLowerCase() in EXTENSION;
}

/** The content type a stored filename implies. Null if it is not one of ours. */
export function contentTypeOf(file: string): string | null {
  const ext = file.split(".").pop()?.toLowerCase();
  const found = Object.entries(EXTENSION).find(([, e]) => e === ext);
  return found ? found[0] : null;
}

/** A stored filename is a 32-char hex hash and a known extension. Nothing else. */
export const MEDIA_FILE = /^[0-9a-f]{32}\.(?:webp|jpg|png|gif|avif)$/;

/**
 * The root of the local store.
 *
 * Alongside the WordPress installs rather than inside the app: both are
 * client data that outlives a deploy, and putting either under the project
 * directory would mean a rebuild could delete a client's photographs.
 */
function mediaRoot(): string {
  return (
    process.env.VIBEWP_MEDIA_ROOT ??
    join(process.env.VIBEWP_SITES_ROOT ?? join(homedir(), "vibewp-sites"), "_media")
  );
}

function siteDir(siteId: string): string {
  /* siteId reaches this from a URL segment. Validated rather than trusted:
     a path separator here would be a directory traversal. */
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) throw new Error("Invalid site id for media path.");
  return join(mediaRoot(), siteId);
}

export const localMediaStore: MediaStore = {
  async put({ siteId, data, contentType }) {
    const type = contentType.split(";")[0].trim().toLowerCase();
    const ext = EXTENSION[type];
    if (!ext) throw new Error(`Refusing to store ${contentType}.`);

    const file = `${createHash("sha256").update(data).digest("hex").slice(0, 32)}.${ext}`;
    const dir = siteDir(siteId);
    await mkdir(dir, { recursive: true });

    /* Content-addressed, so an existing file with this name already holds
       exactly these bytes and rewriting it would be pure churn. */
    const path = join(dir, file);
    const already = await stat(path).catch(() => null);
    if (!already) await writeFile(path, data);

    return { file, url: mediaUrl(siteId, file), contentType: type, bytes: data.length };
  },

  async read(siteId, file) {
    if (!MEDIA_FILE.test(file)) return null;
    const type = contentTypeOf(file);
    if (!type) return null;
    const data = await readFile(join(siteDir(siteId), file)).catch(() => null);
    return data ? { data, contentType: type } : null;
  },

  async has(siteId, file) {
    if (!MEDIA_FILE.test(file)) return false;
    return Boolean(await stat(join(siteDir(siteId), file)).catch(() => null));
  },

  async remove(siteId, file) {
    if (!MEDIA_FILE.test(file)) return;
    await rm(join(siteDir(siteId), file), { force: true });
  },
};

/** Where a stored file is served. Relative, so it works on any host serving the site. */
export function mediaUrl(siteId: string, file: string): string {
  return `/media/${siteId}/${file}`;
}

/** The name a byte-string will be stored under, without storing it. */
export function mediaFileFor(data: Buffer, contentType: string): string | null {
  const ext = EXTENSION[contentType.split(";")[0].trim().toLowerCase()];
  if (!ext) return null;
  return `${createHash("sha256").update(data).digest("hex").slice(0, 32)}.${ext}`;
}
