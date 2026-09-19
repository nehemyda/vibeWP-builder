/**
 * Mirrors the site-media bucket to disk, and reconciles it against the rows
 * that point into it.
 *
 * Run with: npx tsx lib/db/backup-media.ts
 *   --dry-run   report what would be fetched, download nothing
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE BYTES DO NOT GO IN THE REPO
 *
 * backup-db.ts writes into backups/ because backup.sh commits and pushes it,
 * and that is right for rows: they are small, they diff, and an identical
 * dump produces an identical file so a scheduled run commits nothing.
 *
 * Images are none of those things. They are binary, they never diff usefully,
 * and git keeps every version of every one of them for the life of the
 * repository. 1.6MB today is not the argument — this grows with every client
 * upload, and a repo is the one store you cannot prune.
 *
 * So the mirror goes OUTSIDE the repo, and its job is to be a directory that
 * whatever already backs up this machine will pick up. It does not invent a
 * second off-site destination; it makes the bytes available to the first one.
 *
 * WHY MIRRORING IS SAFE TO REPEAT
 *
 * A storage path is <siteId>/<checksum>.<ext> — content-addressed, by the same
 * checksum putSiteMedia dedupes on. A name therefore cannot come to mean
 * different bytes, so a file already on disk never needs fetching again and
 * "skip what is present" is exactly right rather than merely fast.
 *
 * WHY IT NEVER DELETES
 *
 * An object removed from the bucket stays in the mirror. A backup that
 * deletes what the source has lost is not a backup — it is a second copy of
 * the accident, arriving just too late to help.
 * ─────────────────────────────────────────────────────────────────────
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/media/store";
import { db } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";

/**
 * Where the mirror lives.
 *
 * Beside the WordPress installs rather than inside the repo, because those are
 * the other thing on this machine that is a site's data and not its source.
 */
const OUT_DIR =
  process.env.VIBEWP_MEDIA_BACKUP_DIR ?? join(homedir(), "vibewp-backups", "media");

const DRY_RUN = process.argv.includes("--dry-run");

type StoredObject = { path: string; size: number };

/** Every object in the bucket. Paths are one level of prefix, then files. */
async function listBucket(admin: ReturnType<typeof createAdminClient>): Promise<StoredObject[]> {
  const out: StoredObject[] = [];

  const { data: prefixes, error } = await admin.storage.from(BUCKET).list("", { limit: 1000 });
  if (error) throw new Error(`could not list ${BUCKET}: ${error.message}`);

  for (const prefix of prefixes ?? []) {
    /* A bucket entry with no id is a folder; one with an id is a file at the
       root, which this layout does not produce but which should not be
       silently skipped if it ever appears. */
    if (prefix.id) {
      out.push({ path: prefix.name, size: (prefix.metadata as { size?: number })?.size ?? 0 });
      continue;
    }

    let page = 0;
    for (;;) {
      const { data: files, error: inner } = await admin.storage
        .from(BUCKET)
        .list(prefix.name, { limit: 1000, offset: page * 1000 });
      if (inner) throw new Error(`could not list ${prefix.name}: ${inner.message}`);
      if (!files?.length) break;

      for (const f of files) {
        out.push({
          path: `${prefix.name}/${f.name}`,
          size: (f.metadata as { size?: number })?.size ?? 0,
        });
      }
      if (files.length < 1000) break;
      page += 1;
    }
  }

  return out;
}

async function main() {
  const admin = createAdminClient();

  const objects = await listBucket(admin);
  const rows = await db.select().from(mediaAssets);

  const inBucket = new Map(objects.map((o) => [o.path, o]));
  const inDatabase = new Map(rows.map((r) => [r.storagePath, r]));

  let fetched = 0;
  let skipped = 0;
  let bytes = 0;
  const failed: string[] = [];

  for (const obj of objects) {
    const dest = join(OUT_DIR, obj.path);

    /* Present and the right size is enough: the name is the checksum of the
       contents, so a matching file cannot be a different image. Size is
       checked anyway because a truncated download would otherwise look done. */
    if (existsSync(dest) && (obj.size === 0 || statSync(dest).size === obj.size)) {
      skipped += 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  would fetch  ${obj.path}`);
      fetched += 1;
      continue;
    }

    const { data, error } = await admin.storage.from(BUCKET).download(obj.path);
    if (error || !data) {
      failed.push(`${obj.path}: ${error?.message ?? "no data"}`);
      continue;
    }

    mkdirSync(dirname(dest), { recursive: true });
    const buf = Buffer.from(await data.arrayBuffer());
    writeFileSync(dest, buf);
    fetched += 1;
    bytes += buf.length;
  }

  /*
   * Both directions, because each is a different defect and neither announces
   * itself. A row with no object is a live page with a broken image. An object
   * with no row is storage nothing references, which only ever grows.
   */
  const missingObjects = rows.filter((r) => !inBucket.has(r.storagePath));
  const orphanObjects = objects.filter((o) => !inDatabase.has(o.path));

  console.log(
    `${DRY_RUN ? "[dry run] " : ""}media: ${fetched} fetched, ${skipped} already held` +
      (bytes ? `, ${(bytes / 1024 / 1024).toFixed(2)} MB` : "") +
      ` -> ${OUT_DIR}`,
  );

  if (missingObjects.length) {
    console.log(`  ${missingObjects.length} row(s) point at an object the bucket does not have:`);
    for (const r of missingObjects.slice(0, 10)) console.log(`    ${r.storagePath}`);
  }
  if (orphanObjects.length) {
    console.log(`  ${orphanObjects.length} object(s) no row refers to:`);
    for (const o of orphanObjects.slice(0, 10)) console.log(`    ${o.path}`);
  }

  if (failed.length) {
    console.error(`  ${failed.length} download(s) FAILED:`);
    for (const f of failed) console.error(`    ${f}`);
    /* A failed download is a failed backup, and backup.sh must not commit as
       though the media were safe. Orphans and missing rows are reported and
       do NOT fail the run — they are facts about the data, not about whether
       this copy succeeded. */
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
