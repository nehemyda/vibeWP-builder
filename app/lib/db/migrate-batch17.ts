/**
 * Raw-SQL migration giving each site its own header and footer.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch17.ts
 *
 * WHY ON `sites` AND NOT `site_pages`
 *
 * A header appears once, site-wide, and every page pulls it in through the
 * theme's template parts. Storing it per page would let two pages disagree
 * about the navigation, and editing it would mean editing every page —
 * which is exactly the trap schemaToGutenberg() already refuses to fall into
 * by declining to write header/footer sections into page content.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS header_schema_json jsonb`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS footer_schema_json jsonb`;

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM information_schema.columns
    WHERE table_name = 'sites'
      AND column_name IN ('header_schema_json', 'footer_schema_json')`;

  console.log(`sites: ${count}/2 chrome columns present`);
  await sql.end();
}

void main();
