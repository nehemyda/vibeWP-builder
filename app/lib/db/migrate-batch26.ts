/**
 * Raw-SQL migration: the site's own media library.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch26.ts
 *
 * WHY A TABLE AND NOT JUST THE STORAGE BUCKET
 *
 * The files live in Supabase Storage, and a bucket can be listed — so a table
 * looks like a second copy of the same truth. It is not. Listing a bucket
 * gives names and sizes; the gallery needs the alt text, the dimensions (so
 * the grid can reserve space before a thumbnail loads), where a photograph
 * came from, and whether it arrived from the client's WordPress rather than
 * from us. None of that fits in a filename, and a listing cannot be filtered
 * or ordered without reading every object.
 *
 * WHY SCOPED TO A SITE
 *
 * "Only what is in the site moves to WordPress" is the promise, and a shared
 * library across an agency's twenty clients would make that impossible to
 * reason about — one client's photograph would be one click from another
 * client's page. A site is also the unit that gets exported, transferred and
 * deleted, so the images follow it.
 *
 * WHY A CHECKSUM
 *
 * Uploading the same file twice is the most ordinary thing a client does, and
 * a gallery that fills with duplicates of one logo stops being usable. The
 * hash is of the bytes, so it catches a re-upload under a different name.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS media_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      /* The object's path inside the bucket. Unique per site by construction. */
      storage_path text NOT NULL,
      /* Resolved once and stored: every thumbnail in the grid reads it. */
      url text NOT NULL,
      filename text NOT NULL,
      mime_type text NOT NULL,
      byte_size integer NOT NULL,
      width integer,
      height integer,
      /* Written by the client, and what the exported site's alt attribute uses. */
      alt text,
      /*
       * How it got here: "upload" from the client, "stock" from the photo
       * search, "wordpress" pulled back from their own media library. Drives
       * both the filter in the gallery and whether a credit is shown.
       */
      source text NOT NULL DEFAULT 'upload',
      photographer text,
      photographer_url text,
      /* sha-256 of the bytes, for catching a re-upload of the same file. */
      checksum text,
      created_by uuid REFERENCES profiles(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )
  `;

  /* The gallery lists one site's live assets, newest first — every query. */
  await sql`
    CREATE INDEX IF NOT EXISTS media_assets_site_created_idx
      ON media_assets (site_id, created_at DESC)
      WHERE deleted_at IS NULL
  `;

  /*
   * One row per file per site. Partial, so a deleted asset does not block
   * re-uploading the same picture later.
   */
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_assets_site_checksum_idx
      ON media_assets (site_id, checksum)
      WHERE deleted_at IS NULL AND checksum IS NOT NULL
  `;

  console.log("media_assets ready");
  await sql.end();
}

main();
