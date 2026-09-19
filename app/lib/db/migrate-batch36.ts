/**
 * Raw-SQL migration: stop the checklist activating Wordfence.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch36.ts
 *
 * The seed cannot do this. seed-plugins.ts inserts with onConflictDoNothing,
 * which is right — an admin who edited a row should not have it rewritten
 * underneath them — but it means a correction to a DEFAULT never reaches a
 * database that already has the row. Every existing install still carries the
 * old value until something changes it, and that something is this.
 *
 * WHAT IT CORRECTS
 *
 * Wordfence calls dns_get_record() while serving a request. Where DNS is slow
 * or unreachable, that blocks until PHP's 30-second limit kills the request,
 * on every request. Measured on a real install: a 30s fatal with it active,
 * 0.55s with it off.
 *
 * And it did not merely slow a site down. Export asks the server for a page to
 * check it is healthy; the page never arrived, so export concluded the server
 * had never started and refused to publish, naming the port rather than the
 * plugin. One plugin activated by default took the publish path down.
 *
 * Installing it is still right. Switching it on for someone is not.
 *
 * DOES NOT TOUCH ANY WORDPRESS INSTALL. The checklist has never deactivated
 * anything on a site and does not start here — a plugin already running on a
 * client's site is theirs. This only changes what happens to the NEXT site.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  const updated = await sql<{ slug: string }[]>`
    UPDATE platform_plugins
       SET auto_activate = false,
           updated_at = now()
     WHERE slug = 'wordfence'
       AND auto_activate = true
    RETURNING slug`;

  console.log(
    updated.length
      ? "wordfence: auto_activate -> false"
      : "wordfence: already not auto-activated (or not on the checklist)",
  );

  const rows = await sql<{ slug: string; auto_activate: boolean; is_active: boolean }[]>`
    SELECT slug, auto_activate, is_active FROM platform_plugins ORDER BY sort_order`;
  console.log(`\nchecklist — ${rows.length} row(s):`);
  for (const r of rows) {
    console.log(
      `  ${r.slug.padEnd(16)} ${r.is_active ? "on checklist" : "off checklist"}  ${
        r.auto_activate ? "activate on install" : "install only"
      }`,
    );
  }

  await sql.end();
  process.exit(0);
}
void main();
