/**
 * Drops unused business_profiles columns (Customer ID, Market, Salesperson,
 * Additional salespeople, Call tracking number, Lists) — not needed for
 * agencies or SMBs. Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch10.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE business_profiles DROP COLUMN IF EXISTS customer_id;`;
  await sql`ALTER TABLE business_profiles DROP COLUMN IF EXISTS market;`;
  await sql`ALTER TABLE business_profiles DROP COLUMN IF EXISTS salesperson;`;
  await sql`ALTER TABLE business_profiles DROP COLUMN IF EXISTS additional_salespeople;`;
  await sql`ALTER TABLE business_profiles DROP COLUMN IF EXISTS call_tracking_number;`;
  await sql`ALTER TABLE business_profiles DROP COLUMN IF EXISTS lists;`;

  console.log("Migration complete.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
