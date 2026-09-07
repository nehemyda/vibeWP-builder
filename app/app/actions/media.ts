"use server";

import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canEditSite } from "@/app/actions/sites";

/**
 * The site's own image library.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR
 *
 * A client's photographs, kept by us, so they can put one on a page before
 * their WordPress site exists — which it does not, for the first several
 * minutes of every build. That is the whole reason the library cannot simply
 * BE the WordPress media library: there is nothing to upload to yet.
 *
 * On export, the images the page actually uses are copied into their media
 * library. Only those: an upload that was never placed is ours to hold, not
 * something to push into a client's site.
 *
 * WHY THE BUCKET IS PUBLIC-READ
 *
 * These files are served directly into the client's live website. A signed
 * URL would expire and take the page's photographs with it. Nothing private
 * is stored here, and the path carries a random segment so one site's library
 * cannot be enumerated from another's URL.
 *
 * EVERY FUNCTION HERE CHECKS canEditSite FIRST. There is no RLS on these
 * tables yet, so this is the tenant boundary, not a second line of defence.
 * ─────────────────────────────────────────────────────────────────────
 */

const BUCKET = "site-media";

/** 10 MB. A photograph larger than this is one nobody meant to upload. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * What a browser may send.
 *
 * Checked against the file's declared type AND its magic bytes below: a
 * declared type is chosen by the client, and this bucket is served straight
 * into a live website.
 */
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
]);

export type MediaAsset = {
  id: string;
  url: string;
  filename: string;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  source: string;
  photographer: string | null;
  photographerUrl: string | null;
  createdAt: string;
};

export type UploadResult =
  | { ok: true; asset: MediaAsset; duplicate: boolean }
  | { ok: false; error: string };

async function assertAccess(siteId: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }
  return user.id;
}

const shape = (row: typeof mediaAssets.$inferSelect): MediaAsset => ({
  id: row.id,
  url: row.url,
  filename: row.filename,
  alt: row.alt,
  title: row.title,
  width: row.width,
  height: row.height,
  byteSize: row.byteSize,
  source: row.source,
  photographer: row.photographer,
  photographerUrl: row.photographerUrl,
  createdAt: row.createdAt.toISOString(),
});

/** Everything in this site's library, newest first. */
export async function listMediaAction(siteId: string): Promise<MediaAsset[]> {
  await assertAccess(siteId);
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.siteId, siteId), isNull(mediaAssets.deletedAt)))
    .orderBy(desc(mediaAssets.createdAt));
  return rows.map(shape);
}

/**
 * Stores one uploaded file.
 *
 * Takes a FormData rather than a base64 string: a 10 MB photograph becomes
 * ~13 MB of base64 in a JSON body, and Next's server-action body limit is
 * 1 MB by default. FormData streams the bytes as bytes.
 */
export async function uploadMediaAction(form: FormData): Promise<UploadResult> {
  const siteId = String(form.get("siteId") ?? "");
  const file = form.get("file");
  if (!siteId || !(file instanceof File)) return { ok: false, error: "No file was sent." };

  const userId = await assertAccess(siteId);

  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `That image is ${mb(file.size)}. The limit is ${mb(MAX_BYTES)}.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  /*
   * The declared type is a claim by the browser; the magic bytes are not.
   * Anything served from a public bucket into a live website is checked
   * against what the file actually is.
   */
  const actual = sniff(bytes);
  if (!actual) return { ok: false, error: "That doesn't look like an image file." };
  if (!ALLOWED.has(actual)) return { ok: false, error: "That image format isn't supported." };

  const checksum = createHash("sha256").update(bytes).digest("hex");

  /*
   * The same picture uploaded twice is the most ordinary thing a client does,
   * usually by dragging the same file in again. Returning the existing asset
   * is kinder than either an error or a second copy — and the unique index
   * would refuse the insert anyway.
   */
  const existing = await db.query.mediaAssets.findFirst({
    where: and(
      eq(mediaAssets.siteId, siteId),
      eq(mediaAssets.checksum, checksum),
      isNull(mediaAssets.deletedAt),
    ),
  });
  if (existing) return { ok: true, asset: shape(existing), duplicate: true };

  const ext = ALLOWED.get(actual)!;
  // A random segment, so one site's library cannot be walked from a URL.
  const path = `${siteId}/${checksum.slice(0, 16)}.${ext}`;

  const admin = createAdminClient();
  const { error: putError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: actual, upsert: true });
  if (putError) return { ok: false, error: `That upload didn't finish: ${putError.message}` };

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  const size = readSize(bytes, actual);

  const [row] = await db
    .insert(mediaAssets)
    .values({
      siteId,
      storagePath: path,
      url: publicUrl,
      filename: safeName(file.name, ext),
      mimeType: actual,
      byteSize: bytes.byteLength,
      width: size?.width,
      height: size?.height,
      /*
       * No alt yet, deliberately. Inventing one from the filename would put
       * "IMG_4821" into a screen reader; the gallery asks for it instead.
       */
      alt: null,
      title: null,
      source: "upload",
      checksum,
      createdBy: userId,
    })
    .returning();

  return { ok: true, asset: shape(row), duplicate: false };
}

/**
 * Sets the alt text and/or the title on one asset.
 *
 * Only the fields named are written, so saving one cannot blank the other —
 * which is what a single "write the asset" call invites.
 */
export async function setMediaAltAction(opts: {
  siteId: string;
  assetId: string;
  alt?: string;
  title?: string;
}): Promise<{ ok: boolean }> {
  await assertAccess(opts.siteId);
  const patch: Record<string, string | null> = {};
  if (opts.alt !== undefined) patch.alt = opts.alt.trim().slice(0, 300) || null;
  if (opts.title !== undefined) patch.title = opts.title.trim().slice(0, 300) || null;
  if (Object.keys(patch).length === 0) return { ok: true };

  await db
    .update(mediaAssets)
    .set(patch)
    // siteId in the WHERE, not just the id: the id alone would let one site
    // edit another's row if it ever leaked.
    .where(and(eq(mediaAssets.id, opts.assetId), eq(mediaAssets.siteId, opts.siteId)));
  return { ok: true };
}

/**
 * Removes an asset from the library.
 *
 * Soft, and the file stays in the bucket. A page may still point at it, and a
 * client who deletes a photograph from the library has not asked for a broken
 * image in the middle of their homepage.
 */
export async function deleteMediaAction(opts: {
  siteId: string;
  assetId: string;
}): Promise<{ ok: boolean }> {
  await assertAccess(opts.siteId);
  await db
    .update(mediaAssets)
    .set({ deletedAt: new Date() })
    .where(and(eq(mediaAssets.id, opts.assetId), eq(mediaAssets.siteId, opts.siteId)));
  return { ok: true };
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** A filename safe to show and to store, keeping the real extension. */
function safeName(name: string, ext: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w \-.]+/g, "")
    .trim()
    .slice(0, 80);
  return `${base || "image"}.${ext}`;
}

/** The real type, from the file's first bytes. */
function sniff(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (b.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  if (b.subarray(4, 8).toString("latin1") === "ftyp" && b.subarray(8, 12).toString("latin1").startsWith("avif"))
    return "image/avif";
  return null;
}

/**
 * Pixel dimensions, read from the header.
 *
 * Enough to reserve space in the grid so thumbnails do not jump as they load,
 * and to fill width/height on the exported <img>. Returns undefined rather
 * than guessing when a format's header is not one this understands — a
 * missing size costs a reflow, a wrong one costs a distorted photograph.
 */
function readSize(b: Buffer, mime: string): { width: number; height: number } | undefined {
  try {
    if (mime === "image/png") {
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
    if (mime === "image/gif") {
      return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    }
    if (mime === "image/jpeg") {
      // Walk the segment chain to the frame header, which carries the size.
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = b[i + 1];
        // SOF0..SOF15, excluding the four that are not frame headers.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        i += 2 + b.readUInt16BE(i + 2);
      }
      return undefined;
    }
    if (mime === "image/webp" && b.subarray(12, 16).toString("latin1") === "VP8X") {
      return {
        width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
        height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
      };
    }
  } catch {
    // A truncated or unusual header. The grid copes without a size.
  }
  return undefined;
}
