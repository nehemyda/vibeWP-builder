/**
 * Raw-SQL migration for the batch-8 nav/profile/settings/sections/site-delete
 * changes. Safe to re-run. Run with: npx tsx lib/db/migrate-batch8.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_at timestamptz;`;

  await sql`
    CREATE TABLE IF NOT EXISTS sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text NOT NULL UNIQUE,
      name text NOT NULL,
      description text,
      category text NOT NULL DEFAULT 'General',
      component_type text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  console.log("Migration complete.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
