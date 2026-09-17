/**
 * Raw-SQL migration: make a custom domain an address, not a note.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch33.ts
 *
 * WHY
 *
 * sites.domain was display-only — free text shown on a card, read by nothing.
 * Custom-domain routing resolves an incoming Host against it, which makes two
 * things true that were not before.
 *
 * It has to be NORMALISED: a Host header is lowercase with no scheme, port or
 * path, so "https://Acme.com/" typed into Settings would never match the
 * requests it was meant to catch.
 *
 * And it has to be UNIQUE: two sites claiming one domain is not a display
 * oddity any more, it is a question with no answer, decided by whichever row
 * the query happens to return first.
 *
 * Duplicates are reported rather than resolved. Which client keeps the domain
 * is a business decision, and picking one here would silently take a live
 * address away from somebody.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  /* Scheme, path, port and case all stripped, and anything left that is not a
     plausible hostname is cleared rather than kept as an address that can
     never match. */
  const normalised = await sql`
    UPDATE sites
    SET domain = regexp_replace(
                   regexp_replace(
                     regexp_replace(lower(btrim(domain)), '^https?://', ''),
                   '/.*$', ''),
                 ':[0-9]+$', '')
    WHERE domain IS NOT NULL
      AND domain <> regexp_replace(
                      regexp_replace(
                        regexp_replace(lower(btrim(domain)), '^https?://', ''),
                      '/.*$', ''),
                    ':[0-9]+$', '')`;

  const cleared = await sql`
    UPDATE sites SET domain = NULL
    WHERE domain IS NOT NULL AND domain !~ '^[a-z0-9-]+(\\.[a-z0-9-]+)+$'`;

  const dupes = await sql<{ domain: string; n: number }[]>`
    SELECT domain, count(*)::int AS n FROM sites
    WHERE domain IS NOT NULL AND deleted_at IS NULL
    GROUP BY domain HAVING count(*) > 1`;

  console.log(`domains normalised: ${normalised.count}`);
  console.log(`domains cleared as unusable: ${cleared.count}`);

  if (dupes.length > 0) {
    for (const d of dupes) console.log(`  WARN "${d.domain}" is claimed by ${d.n} sites`);
    console.log("unique index NOT created — resolve the duplicates above, then re-run");
  } else {
    /* Partial: the many NULLs are not an address and must not collide. */
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS sites_domain_key
        ON sites (domain) WHERE domain IS NOT NULL AND deleted_at IS NULL`;
    console.log("unique index on sites.domain present");
  }

  const live = await sql<{ smb_id: string; domain: string }[]>`
    SELECT smb_id, domain FROM sites WHERE domain IS NOT NULL AND deleted_at IS NULL ORDER BY domain`;
  console.log(`sites with a domain: ${live.length}`);
  for (const r of live) console.log(`  ${r.smb_id}  ${r.domain}`);

  await sql.end();
}
void main();
