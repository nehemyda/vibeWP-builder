import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Putting bytes into the site's media library.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT INSIDE app/actions/media.ts
 *
 * That module is "use server", and every function in it opens with
 * canEditSite — correctly, because it is reached from a browser and is the
 * tenant boundary. Publishing reaches the library too, from a server action
 * that has ALREADY established access, and it holds bytes rather than a
 * FormData from a file input.
 *
 * Passing the upload through an action would mean either faking a FormData or
 * checking the same permission twice; writing the bucket call a second time in
 * the publish path would mean two places deciding what a stored image is. So
 * the storage core lives here, the action wraps it with the checks a browser
 * upload needs, and the publish path calls it directly.
 * ─────────────────────────────────────────────────────────────────────
 */

export const BUCKET = "site-media";

/**
 * What may be stored. A declared type is a claim; callers that receive one
 * from outside must sniff the bytes before reaching this.
 */
export const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
]);

export type StoredAsset = typeof mediaAssets.$inferSelect;

export type PutResult =
  | { ok: true; asset: StoredAsset; duplicate: boolean }
  | { ok: false; error: string };

/**
 * Stores one image and records it, or returns the copy already held.
 *
 * Deduped on a checksum of the bytes, because the same picture arriving twice
 * is the most ordinary thing that happens here — a client dragging the same
 * file in again, or a re-publish walking the same page. Returning the existing
 * asset is kinder than an error and honest about there being one file.
 */
export async function putSiteMedia(opts: {
  siteId: string;
  bytes: Buffer;
  /** Must already be verified against the bytes when it came from outside. */
  contentType: string;
  filename: string;
  /** How it got here: "upload", "stock", "wordpress". Drives the gallery filter. */
  source: string;
  alt?: string | null;
  width?: number;
  height?: number;
  createdBy?: string | null;
}): Promise<PutResult> {
  const { siteId, bytes, contentType, filename, source, alt, width, height, createdBy } = opts;

  const ext = ALLOWED.get(contentType);
  if (!ext) return { ok: false, error: "That image format isn't supported." };
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };

  const checksum = createHash("sha256").update(bytes).digest("hex");

  const existing = await db.query.mediaAssets.findFirst({
    where: and(
      eq(mediaAssets.siteId, siteId),
      eq(mediaAssets.checksum, checksum),
      isNull(mediaAssets.deletedAt),
    ),
  });
  if (existing) return { ok: true, asset: existing, duplicate: true };

  // A random segment, so one site's library cannot be walked from a URL.
  const path = `${siteId}/${checksum.slice(0, 16)}.${ext}`;

  const admin = createAdminClient();
  const { error: putError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (putError) return { ok: false, error: `That upload didn't finish: ${putError.message}` };

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  const [row] = await db
    .insert(mediaAssets)
    .values({
      siteId,
      storagePath: path,
      url: publicUrl,
      filename,
      mimeType: contentType,
      byteSize: bytes.byteLength,
      width,
      height,
      alt: alt ?? null,
      title: null,
      source,
      checksum,
      createdBy: createdBy ?? null,
    })
    .returning();

  return { ok: true, asset: row, duplicate: false };
}

/**
 * The asset already held for these exact bytes, if any.
 *
 * Read-only, for the renderer: serving a page must not write to a client's
 * library as a side effect of somebody looking at it.
 */
export async function findSiteMediaByBytes(
  siteId: string,
  bytes: Buffer,
): Promise<StoredAsset | undefined> {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return db.query.mediaAssets.findFirst({
    where: and(
      eq(mediaAssets.siteId, siteId),
      eq(mediaAssets.checksum, checksum),
      isNull(mediaAssets.deletedAt),
    ),
  });
}
