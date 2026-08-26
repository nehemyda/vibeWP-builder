/**
 * Raw-SQL migration adding two-way sync state to site_pages. Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch12.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS wp_post_id integer;`;
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS synced_schema_json jsonb;`;
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;`;

  /*
   * Existing pages are left with a NULL base on purpose.
   *
   * Backfilling synced_schema_json with the current VibeWP schema would assert
   * that WordPress agrees with it — and for at least one page we know it does
   * not, because a heading was edited in wp-admin. That false base would make
   * the real edit look like an ordinary WordPress-side change and let a pull or
   * push proceed without a conflict prompt.
   *
   * A NULL base means "never synced", which the detector treats as needing a
   * first reconciliation. That is the honest starting point.
   */
  const [{ pages }] = await sql`
    SELECT count(*)::int AS pages FROM site_pages WHERE synced_schema_json IS NULL;
  `;
  console.log(
    `Migration complete. ${pages} page(s) have no sync base yet and will be ` +
      `reconciled on first sync rather than assumed in-sync.`,
  );

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
