/**
 * Adds site_transfers — the history of a site moving between agencies.
 * Safe to re-run. Run with: npx tsx lib/db/migrate-batch13.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS site_transfers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id),
      from_agency_id uuid REFERENCES agencies(id),
      to_agency_id uuid REFERENCES agencies(id),
      transferred_by_user_id uuid REFERENCES profiles(id),
      previous_custom_price_monthly_cents integer,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  // Reading a site's history is the only query shape this table serves.
  await sql`
    CREATE INDEX IF NOT EXISTS site_transfers_site_id_created_at_idx
      ON site_transfers (site_id, created_at DESC);
  `;

  console.log("Migration complete.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
