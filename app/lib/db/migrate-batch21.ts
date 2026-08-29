/**
 * Raw-SQL migration adding the hosting targets clients point DNS at.
 * Safe to re-run.
 * Run with: npx tsx lib/db/migrate-batch21.ts
 *
 * WHY THESE ARE STORED AND NOT HARDCODED
 *
 * The builder shows a client the A and CNAME records to enter at their
 * registrar. Those values must be the real ones for whichever server actually
 * hosts them, and there is exactly one honest source: whoever runs the
 * platform, typing them in. Guessing an IP, or leaving a plausible example in
 * the markup, points a real customer's domain at a machine that is not ours —
 * so where they are unset the UI says so rather than showing anything.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

  await sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hosting_ipv4 text`;
  await sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hosting_cname text`;

  const cols = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'platform_settings' AND column_name IN ('hosting_ipv4','hosting_cname')`;
  console.log(`added: ${cols.map((c) => c.column_name).join(", ") || "NONE"}`);
  await sql.end();
}

void main();
