/**
 * Adds page_revisions — a snapshot taken before every page overwrite, so a
 * mistaken prompt can be undone.
 * Safe to re-run. Run with: npx tsx lib/db/migrate-batch15.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS page_revisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES site_pages(id),
      schema_json jsonb NOT NULL,
      reason text,
      created_by_user_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  // History is always read newest-first for one page.
  await sql`
    CREATE INDEX IF NOT EXISTS page_revisions_page_id_created_at_idx
      ON page_revisions (page_id, created_at DESC);
  `;

  // site_pages gained a title, and slug must be unique per site so page
  // upserts can key on it safely.
  await sql`ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS title text;`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS site_pages_site_id_slug_key
      ON site_pages (site_id, slug);
  `;

  console.log("Migration complete.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
