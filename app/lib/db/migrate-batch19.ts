/**
 * Raw-SQL migration adding the business logo.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch19.ts
 *
 * WHY THE IMAGE ITSELF, NOT A LINK TO ONE
 *
 * Stored as a data URL in this column rather than in object storage. A logo is
 * a handful of kilobytes, there is exactly one per site, and it must survive
 * being read on the server (for export) and in the browser (for the preview)
 * with no bucket to provision, no signed URLs and no second thing to back up.
 *
 * The upload path caps the size, which is what keeps that decision reasonable —
 * see LOGO_MAX_BYTES in app/actions/intake.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS logo_url text`;

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM information_schema.columns
    WHERE table_name = 'business_profiles' AND column_name = 'logo_url'`;

  console.log(`business_profiles.logo_url present: ${count === "1" ? "yes" : "NO"}`);
  await sql.end();
}

void main();
