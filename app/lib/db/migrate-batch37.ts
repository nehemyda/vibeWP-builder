/**
 * Raw-SQL migration: say what these plugins actually do once installed.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch37.ts
 *
 * WHY THE TEXT WAS WRONG
 *
 * Checked on a real install, with both plugins active:
 *
 *   UpdraftPlus   — no backup interval, no destination, an empty updraft
 *                   folder, one cleanup cron. It backs up nothing, ever.
 *   W3 Total Cache — pgcache, dbcache, objectcache and minify all false. Only
 *                   browsercache is on, and that needs Apache or nginx rewrite
 *                   rules, which the local driver's PHP server ignores. A
 *                   tagline changed by hand appeared on the very next request,
 *                   so nothing is being cached at all.
 *
 * Neither is broken and neither is Wordfence — no site was harmed. But the
 * purpose column is what an admin reads to decide what belongs on the
 * checklist, and it promised backups and page caching that installing does not
 * deliver. The plan this was built from said the screen must state that
 * installing is not configuring; the rows then quietly said otherwise.
 *
 * WHY THIS ONLY TOUCHES UNEDITED ROWS
 *
 * purpose is admin-editable. Correcting our own default is right; overwriting
 * a sentence somebody wrote themselves is not, and this cannot tell the two
 * apart except by matching the old default exactly. A row that has been edited
 * keeps what it says.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

/** [slug, the default we shipped, what it should have said] */
const CORRECTIONS: Array<[string, string, string]> = [
  [
    "updraftplus",
    "Scheduled backups a client controls. The free tier covers local and manual restore; the paid one adds remote destinations.",
    "Backups a client controls, once they set a schedule. Activating it schedules NOTHING — " +
      "verified on a real install: no backup interval, no destination, an empty updraft folder " +
      "and a single cleanup job. Until someone configures it, this site has no backups.",
  ],
  [
    "w3-total-cache",
    "Page caching. Stands in for WP Rocket, which is paid and cannot be installed from a slug.",
    "Stands in for WP Rocket, which is paid and cannot be installed from a slug. Activating it " +
      "caches NOTHING — verified on a real install: page, database, object and minify cache all " +
      "off, leaving only browser-cache rules that need Apache or nginx and do nothing under the " +
      "local driver's PHP server. It is a plugin waiting to be configured, not a speed-up.",
  ],
  [
    "wordfence",
    "Firewall and malware scanning on a site we hand over and stop watching.",
    "Firewall and malware scanning on a site we hand over and stop watching. " +
      "INSTALLED BUT NOT ACTIVATED — switch it on once the site is on real hosting " +
      "and someone is going to configure it.",
  ],
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  for (const [slug, oldText, newText] of CORRECTIONS) {
    const updated = await sql<{ slug: string }[]>`
      UPDATE platform_plugins
         SET purpose = ${newText}, updated_at = now()
       WHERE slug = ${slug}
         AND purpose = ${oldText}
      RETURNING slug`;
    console.log(
      updated.length ? `  ${slug.padEnd(16)} corrected` : `  ${slug.padEnd(16)} left alone (already corrected, edited, or absent)`,
    );
  }

  const rows = await sql<{ slug: string; purpose: string | null }[]>`
    SELECT slug, purpose FROM platform_plugins ORDER BY sort_order`;
  console.log(`\nchecklist — ${rows.length} row(s):`);
  for (const r of rows) console.log(`  ${r.slug.padEnd(16)} ${(r.purpose ?? "").slice(0, 72)}…`);

  await sql.end();
  process.exit(0);
}
void main();
