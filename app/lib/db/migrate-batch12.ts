/**
 * Adds agency reseller pricing: a per-agency plan price list, plus a
 * per-client price override on sites.
 * Safe to re-run. Run with: npx tsx lib/db/migrate-batch12.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS agency_plan_prices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id uuid NOT NULL REFERENCES agencies(id),
      plan_key text NOT NULL,
      price_monthly_cents integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT agency_plan_prices_agency_plan_key UNIQUE (agency_id, plan_key)
    );
  `;

  await sql`
    ALTER TABLE sites ADD COLUMN IF NOT EXISTS custom_price_monthly_cents integer;
  `;

  console.log("Migration complete.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
