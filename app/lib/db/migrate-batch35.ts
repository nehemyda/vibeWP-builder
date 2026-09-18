/**
 * Raw-SQL migration: the plugin checklist.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch35.ts
 *
 * Creates the table only. The default stack is seeded separately by
 * seed-plugins.ts, for the same reason DEFAULT_PLANS is: a migration that
 * inserts policy re-inserts it on a database where someone deliberately
 * removed a row.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS platform_plugins (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      name text NOT NULL,
      purpose text,
      is_active boolean NOT NULL DEFAULT true,
      auto_activate boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;

  /* What the checklist an install already has, so an export that would change
     nothing makes no wp-cli calls at all — see the column's own note. */
  await sql`ALTER TABLE site_installations ADD COLUMN IF NOT EXISTS plugins_signature text`;

  const rows = await sql<{ slug: string; is_active: boolean }[]>`
    SELECT slug, is_active FROM platform_plugins ORDER BY sort_order`;
  console.log(`platform_plugins present — ${rows.length} row(s)`);
  for (const r of rows) console.log(`  ${r.slug}${r.is_active ? "" : " (inactive)"}`);
  if (rows.length === 0) console.log("  seed the default stack with: npx tsx lib/db/seed-plugins.ts");

  await sql.end();
}
void main();
